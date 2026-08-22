"""Signup / login / logout / me / preferences — cookie session auth."""

import os
import re
import secrets
from datetime import UTC, datetime, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from pydantic import BaseModel, field_validator
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.cache import (
    delete_key,
    delete_session,
    foryou_key,
    foryou_version,
    get_session_user_id,
    set_session,
)
from app.countries import SUPPORTED_COUNTRIES
from app.db import get_db
from app.models import PasswordResetToken, User, UserSession
from app.ratelimit import rate_limit_auth, rate_limit_password_reset
from pipeline.topics import CATEGORY_PROMPTS

router = APIRouter(prefix="/api", tags=["auth"])

SESSION_COOKIE = "session"
SESSION_MAX_AGE = 30 * 86400
RESET_TOKEN_MAX_AGE = 3600
IS_PRODUCTION = os.getenv("ENV") == "production"
hasher = PasswordHasher()

# RFC-ish email pattern - rejects addresses without a proper local@domain.tld structure
_EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")


class SignupRequest(BaseModel):
    email: str
    password: str
    display_name: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        if not _EMAIL_RE.match(v):
            raise ValueError("invalid email address")
        return v.lower()  # normalize to case-insensitive lookup


class LoginRequest(BaseModel):
    email: str
    password: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    password: str


class PreferencesRequest(BaseModel):
    display_name: str | None = None
    favourite_category: str | None = None
    categories: list[str] = []
    bias_pref: str = "balanced"
    keywords: list[str] = []
    countries: list[str] = []


class Me(BaseModel):
    id: int
    email: str
    display_name: str
    favourite_category: str | None
    categories: list[str]
    bias_pref: str
    keywords: list[str]
    countries: list[str]


def _me(user: User) -> Me:
    return Me(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        favourite_category=user.favourite_category,
        categories=user.categories or [],
        bias_pref=user.bias_pref,
        keywords=user.keywords or [],
        countries=user.countries or [],
    )


def _create_session(db: Session, user: User) -> str:
    token = secrets.token_hex(32)
    db.add(
        UserSession(
            token=token,
            user_id=user.id,
            expires_at=datetime.now(UTC) + timedelta(seconds=SESSION_MAX_AGE),
        )
    )
    db.commit()
    set_session(token, user.id, SESSION_MAX_AGE)
    return token


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        httponly=True,
        samesite="lax",
        secure=IS_PRODUCTION,
        max_age=SESSION_MAX_AGE,
        path="/",
    )


def current_user(
    response: Response,
    session: str | None = Cookie(None, alias=SESSION_COOKIE),
    db: Session = Depends(get_db),
) -> User:
    if not session:
        raise HTTPException(401, "not authenticated")

    # Fast path: check Redis cache first
    user_id = get_session_user_id(session)
    if user_id is not None:
        user = db.get(User, user_id)
        if user:
            return user

    # Slow path: fall back to PostgreSQL
    row = db.execute(
        select(UserSession).where(UserSession.token == session)
    ).scalar_one_or_none()
    if not row or row.expires_at < datetime.now(UTC):
        raise HTTPException(401, "not authenticated")
    user = db.get(User, row.user_id)
    if not user:
        raise HTTPException(401, "not authenticated")

    # Populate Redis cache so next request uses the fast path
    set_session(session, user.id, int((row.expires_at - datetime.now(UTC)).total_seconds()))
    return user


@router.post("/auth/signup", response_model=Me, dependencies=[Depends(rate_limit_auth)])
def signup(req: SignupRequest, response: Response, db: Session = Depends(get_db)):
    # Email is already validated and lowercased by the Pydantic field_validator above
    if len(req.password) < 8:
        raise HTTPException(400, "password too short")
    user = User(
        email=req.email,
        password_hash=hasher.hash(req.password),
        display_name=req.display_name.strip() or req.email.split("@")[0],
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "email already registered")
    db.refresh(user)
    token = _create_session(db, user)
    _set_session_cookie(response, token)
    return _me(user)


@router.post("/auth/login", response_model=Me, dependencies=[Depends(rate_limit_auth)])
def login(req: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = db.execute(
        select(User).where(User.email == req.email)
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(401, "invalid email or password")
    try:
        hasher.verify(user.password_hash, req.password)
    except VerifyMismatchError:
        raise HTTPException(401, "invalid email or password")
    token = _create_session(db, user)
    _set_session_cookie(response, token)
    return _me(user)


@router.post("/auth/logout")
def logout(
    response: Response,
    session: str | None = Cookie(None, alias=SESSION_COOKIE),
    db: Session = Depends(get_db),
):
    if session:
        delete_session(session)
        row = db.execute(
            select(UserSession).where(UserSession.token == session)
        ).scalar_one_or_none()
        if row:
            db.delete(row)
            db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}


@router.post("/auth/forgot-password", dependencies=[Depends(rate_limit_password_reset)])
def forgot_password(req: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.execute(
        select(User).where(User.email == req.email.lower())
    ).scalar_one_or_none()
    # Always return the same generic response whether or not the email is
    # registered, so this endpoint can't be used to enumerate accounts.
    if user:
        db.execute(delete(PasswordResetToken).where(PasswordResetToken.user_id == user.id))
        token = secrets.token_urlsafe(32)
        db.add(
            PasswordResetToken(
                token=token,
                user_id=user.id,
                expires_at=datetime.now(UTC) + timedelta(seconds=RESET_TOKEN_MAX_AGE),
            )
        )
        db.commit()
        # ponytail: dev-mode stub - no email provider is configured yet, so
        # the reset link goes to the server console instead of an inbox.
        # Swap this print for a real email send when a provider is chosen.
        frontend_origin = os.getenv("FRONTEND_ORIGIN", "").split(",")[0] or "http://localhost:5173"
        print(f"[DEV] password reset link for {user.email}: {frontend_origin}/reset-password?token={token}")
    return {"ok": True}


@router.post("/auth/reset-password", dependencies=[Depends(rate_limit_password_reset)])
def reset_password(req: ResetPasswordRequest, db: Session = Depends(get_db)):
    if len(req.password) < 8:
        raise HTTPException(400, "password too short")
    row = db.execute(
        select(PasswordResetToken).where(PasswordResetToken.token == req.token)
    ).scalar_one_or_none()
    if not row or row.expires_at < datetime.now(UTC):
        raise HTTPException(400, "invalid or expired reset link")
    user = db.get(User, row.user_id)
    if not user:
        raise HTTPException(400, "invalid or expired reset link")
    user.password_hash = hasher.hash(req.password)
    db.execute(delete(PasswordResetToken).where(PasswordResetToken.user_id == user.id))
    # a reset is a good moment to invalidate any sessions from before the
    # password change (e.g. a session an attacker held onto) - current_user()
    # checks the Redis-cached session first, so the DB row alone isn't enough
    old_sessions = db.execute(
        select(UserSession).where(UserSession.user_id == user.id)
    ).scalars().all()
    for s in old_sessions:
        delete_session(s.token)
    db.execute(delete(UserSession).where(UserSession.user_id == user.id))
    db.commit()
    return {"ok": True}


@router.get("/me", response_model=Me)
def me(user: User = Depends(current_user)):
    return _me(user)


@router.put("/me/preferences", response_model=Me)
def put_preferences(
    req: PreferencesRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    valid_categories = set(CATEGORY_PROMPTS)
    if not set(req.categories) <= valid_categories:
        raise HTTPException(400, "unknown category")
    if req.favourite_category and req.favourite_category not in req.categories:
        raise HTTPException(400, "favourite_category must be in categories")
    if req.bias_pref not in {"balanced", "everything", "challenge"}:
        raise HTTPException(400, "invalid bias_pref")
    if len(req.keywords) > 20 or any(len(k) > 64 for k in req.keywords):
        raise HTTPException(400, "too many or too long keywords")
    if not set(req.countries) <= set(SUPPORTED_COUNTRIES):
        raise HTTPException(400, "unknown country")

    if req.display_name:
        user.display_name = req.display_name.strip()
    user.favourite_category = req.favourite_category
    user.categories = req.categories
    user.bias_pref = req.bias_pref
    user.keywords = req.keywords
    # no ingestion triggered here - the scheduler picks up newly selected
    # countries on its next hourly cycle (pipeline/scheduler.py); the API
    # stays read-only, no enrichment on the request path
    user.countries = req.countries
    db.commit()
    db.refresh(user)
    delete_key(f"{foryou_key(user.id)}:v{foryou_version()}")
    return _me(user)

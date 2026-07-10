"""Signup / login / logout / me / preferences — cookie session auth."""

import os
import secrets
import time
from collections import defaultdict
from datetime import UTC, datetime, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.countries import SUPPORTED_COUNTRIES
from app.db import get_db
from app.models import User, UserSession
from pipeline.topics import CATEGORY_PROMPTS

router = APIRouter(prefix="/api", tags=["auth"])

SESSION_COOKIE = "session"
SESSION_MAX_AGE = 30 * 86400
IS_PRODUCTION = os.getenv("ENV") == "production"
hasher = PasswordHasher()

# In-process fixed-window limiter: 10 attempts/min/IP on login+signup. Good
# enough for this single-instance deployment; a multi-worker/replica setup
# would need a shared store (e.g. Redis) instead.
RATE_LIMIT = 10
RATE_WINDOW_SECONDS = 60
_attempts: dict[str, list[float]] = defaultdict(list)


def rate_limit(request: Request) -> None:
    key = request.client.host if request.client else "unknown"
    now = time.monotonic()
    window = _attempts[key] = [t for t in _attempts[key] if now - t < RATE_WINDOW_SECONDS]
    if len(window) >= RATE_LIMIT:
        raise HTTPException(429, "too many attempts, try again shortly")
    window.append(now)


class SignupRequest(BaseModel):
    email: str
    password: str
    display_name: str


class LoginRequest(BaseModel):
    email: str
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
    row = db.execute(
        select(UserSession).where(UserSession.token == session)
    ).scalar_one_or_none()
    if not row or row.expires_at < datetime.now(UTC):
        raise HTTPException(401, "not authenticated")
    user = db.get(User, row.user_id)
    if not user:
        raise HTTPException(401, "not authenticated")
    return user


@router.post("/auth/signup", response_model=Me, dependencies=[Depends(rate_limit)])
def signup(req: SignupRequest, response: Response, db: Session = Depends(get_db)):
    if "@" not in req.email or len(req.password) < 8:
        raise HTTPException(400, "invalid email or password too short")
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


@router.post("/auth/login", response_model=Me, dependencies=[Depends(rate_limit)])
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
        row = db.execute(
            select(UserSession).where(UserSession.token == session)
        ).scalar_one_or_none()
        if row:
            db.delete(row)
            db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")
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
    return _me(user)

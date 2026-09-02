from datetime import UTC, date, datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Computed,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

EMBEDDING_DIM = 384  # all-MiniLM-L6-v2


class Base(DeclarativeBase):
    pass


class Outlet(Base):
    __tablename__ = "outlets"

    id: Mapped[int] = mapped_column(primary_key=True)
    domain: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str | None] = mapped_column(String(255))
    country: Mapped[str | None] = mapped_column(String(2))
    # nightly aggregate of article bias_score, -1 (left) .. +1 (right)
    mean_bias: Mapped[float | None] = mapped_column(Float)

    articles: Mapped[list["Article"]] = relationship(back_populates="outlet")


class Story(Base):
    __tablename__ = "stories"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(Text)
    category: Mapped[str | None] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(
        String(16), default="active"
    )  # active | fading | dead
    first_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    summary: Mapped[str | None] = mapped_column(Text)
    death_risk: Mapped[float | None] = mapped_column(Float)  # XGBoost score, 0..1
    bias_explanation: Mapped[dict | None] = mapped_column(JSONB)  # selection record, see pipeline/explain.py
    # lowercased title + article entities/themes, kept current by pipeline/metrics.py
    # so /api/foryou can match user keywords without loading every article per request
    keyword_haystack: Mapped[str | None] = mapped_column(Text)
    # ISO-2 codes mentioned by >=30% of this story's articles (pipeline/metrics.py);
    # separate from any article's outlet.country (published-from vs. about)
    about_countries: Mapped[list | None] = mapped_column(JSONB)
    agent_headline: Mapped[str | None] = mapped_column(Text)
    coherence_score: Mapped[float | None] = mapped_column(Float)
    milestones: Mapped[list | None] = mapped_column(JSONB)

    articles: Mapped[list["Article"]] = relationship(back_populates="story")
    daily_metrics: Mapped[list["StoryDailyMetric"]] = relationship(
        back_populates="story"
    )
    feedback: Mapped[list["StoryFeedback"]] = relationship(back_populates="story")


class Article(Base):
    __tablename__ = "articles"

    id: Mapped[int] = mapped_column(primary_key=True)
    url: Mapped[str] = mapped_column(Text, unique=True, index=True)
    title: Mapped[str | None] = mapped_column(Text)
    content: Mapped[str | None] = mapped_column(Text)  # full text when fetched
    image_url: Mapped[str | None] = mapped_column(Text)  # og:image, scraped alongside content
    source: Mapped[str] = mapped_column(String(16))  # gdelt | rss | newsapi
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )

    outlet_id: Mapped[int] = mapped_column(ForeignKey("outlets.id"), index=True)
    story_id: Mapped[int | None] = mapped_column(ForeignKey("stories.id"), index=True)

    # GDELT V2Tone average tone, kept raw for comparison with our own sentiment
    gdelt_tone: Mapped[float | None] = mapped_column(Float)
    themes: Mapped[list | None] = mapped_column(JSONB)  # GDELT GKG themes

    # NLP pipeline outputs (null until processed)
    sentiment: Mapped[float | None] = mapped_column(Float)  # -1 .. +1
    bias_label: Mapped[str | None] = mapped_column(String(8))  # left | center | right
    bias_score: Mapped[float | None] = mapped_column(Float)  # -1 (left) .. +1 (right)
    bias_probs: Mapped[dict | None] = mapped_column(JSONB)   # {left, center, right} softmax probs; max() = confidence
    bias_explanation: Mapped[dict | None] = mapped_column(JSONB)  # SHAP payload, see pipeline/explain.py
    entities: Mapped[dict | None] = mapped_column(JSONB)  # spaCy NER output
    embedding: Mapped[list[float] | None] = mapped_column(Vector(EMBEDDING_DIM))
    # ISO-2 codes of countries this article's content is about (GKG V2Locations,
    # falling back to spaCy GPE entities); distinct from outlet.country (published-from)
    mentioned_countries: Mapped[list | None] = mapped_column(JSONB)
    # PostgreSQL-maintained multilingual-safe lexical document. ``simple`` is
    # deliberate: the archive is not limited to English.
    search_document: Mapped[object | None] = mapped_column(
        TSVECTOR,
        Computed(
            "to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, ''))",
            persisted=True,
        ),
    )

    outlet: Mapped[Outlet] = relationship(back_populates="articles")
    story: Mapped[Story | None] = relationship(back_populates="articles")


class StoryDailyMetric(Base):
    __tablename__ = "story_daily_metrics"
    __table_args__ = (UniqueConstraint("story_id", "day"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    story_id: Mapped[int] = mapped_column(ForeignKey("stories.id"), index=True)
    day: Mapped[date] = mapped_column(Date)

    article_count: Mapped[int] = mapped_column(Integer, default=0)
    unique_outlets: Mapped[int] = mapped_column(Integer, default=0)
    sentiment_mean: Mapped[float | None] = mapped_column(Float)
    drift_score: Mapped[float | None] = mapped_column(Float)  # weekly centroid delta
    bias_left_share: Mapped[float | None] = mapped_column(Float)
    bias_center_share: Mapped[float | None] = mapped_column(Float)
    bias_right_share: Mapped[float | None] = mapped_column(Float)

    story: Mapped[Story] = relationship(back_populates="daily_metrics")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(120))

    favourite_category: Mapped[str | None] = mapped_column(String(64))
    categories: Mapped[list | None] = mapped_column(JSONB, default=list)
    bias_pref: Mapped[str] = mapped_column(String(16), default="balanced")  # balanced | everything | challenge
    keywords: Mapped[list | None] = mapped_column(JSONB, default=list)
    countries: Mapped[list | None] = mapped_column(JSONB, default=list)  # ISO-2 codes
    # per-category ranking nudge from the For You 3-dot menu, -2..+2, see pipeline/scheduler
    category_weights: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )

    sessions: Mapped[list["UserSession"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    story_feedback: Mapped[list["StoryFeedback"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    chat_sessions: Mapped[list["ChatSession"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    password_reset_tokens: Mapped[list["PasswordResetToken"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class UserSession(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship(back_populates="sessions")


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship(back_populates="password_reset_tokens")


class StoryFeedback(Base):
    """A user's 'more/less like this' click on a For You card (main.py score_story
    excludes 'less' stories and nudges User.category_weights toward the direction)."""

    __tablename__ = "story_feedback"
    __table_args__ = (UniqueConstraint("user_id", "story_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    story_id: Mapped[int] = mapped_column(ForeignKey("stories.id"), index=True)
    direction: Mapped[str] = mapped_column(String(8))  # more | less
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )

    user: Mapped[User] = relationship(back_populates="story_feedback")
    story: Mapped[Story] = relationship(back_populates="feedback")


class ChatSession(Base):
    """A saved assistant conversation, owned by exactly one user."""

    __tablename__ = "chat_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    story_id: Mapped[int | None] = mapped_column(ForeignKey("stories.id"), index=True)
    title: Mapped[str] = mapped_column(String(200), default="New conversation")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC), index=True,
    )

    user: Mapped[User] = relationship(back_populates="chat_sessions")
    story: Mapped[Story | None] = relationship()
    messages: Mapped[list["ChatMessage"]] = relationship(
        back_populates="session", cascade="all, delete-orphan",
        order_by="ChatMessage.position",
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    __table_args__ = (UniqueConstraint("session_id", "position"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("chat_sessions.id"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    role: Mapped[str] = mapped_column(String(16))  # user | assistant
    content: Mapped[str] = mapped_column(Text)
    citations: Mapped[list | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )

    session: Mapped[ChatSession] = relationship(back_populates="messages")

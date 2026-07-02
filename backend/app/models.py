from datetime import UTC, date, datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
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

    articles: Mapped[list["Article"]] = relationship(back_populates="story")
    daily_metrics: Mapped[list["StoryDailyMetric"]] = relationship(
        back_populates="story"
    )


class Article(Base):
    __tablename__ = "articles"

    id: Mapped[int] = mapped_column(primary_key=True)
    url: Mapped[str] = mapped_column(Text, unique=True, index=True)
    title: Mapped[str | None] = mapped_column(Text)
    content: Mapped[str | None] = mapped_column(Text)  # full text when fetched
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
    entities: Mapped[dict | None] = mapped_column(JSONB)  # spaCy NER output
    embedding: Mapped[list[float] | None] = mapped_column(Vector(EMBEDDING_DIM))

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

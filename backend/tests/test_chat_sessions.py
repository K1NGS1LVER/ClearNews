from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db import SessionLocal
from app.main import app
from app.models import User


def _client() -> tuple[TestClient, str]:
    client = TestClient(app)
    email = f"chat-{uuid4().hex}@test.local"
    response = client.post("/api/auth/signup", json={
        "email": email, "password": "correcthorse", "display_name": "Chat Test",
    })
    assert response.status_code == 200
    return client, email


def _cleanup(*emails: str) -> None:
    with SessionLocal() as db:
        for email in emails:
            user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
            if user:
                db.delete(user)
        db.commit()


def test_chat_session_owner_boundary_and_stream_persistence(monkeypatch):
    import agent.chat as chat

    async def fake_stream(_messages, _story_id):
        yield {"type": "token", "content": "A grounded answer [web:1]."}
        yield {"type": "sources", "sources": [{
            "citation_id": "web:1", "source_type": "web", "url": "https://example.test",
            "title": "Live result", "outlet": "web", "snippet": "untrusted text",
        }]}

    monkeypatch.setattr(chat, "stream_chat", fake_stream)
    owner, owner_email = _client()
    other, other_email = _client()
    try:
        created = owner.post("/api/chat/sessions", json={}).json()
        session_id = created["id"]
        assert other.get(f"/api/chat/sessions/{session_id}").status_code == 404

        response = owner.post("/api/chat", json={"session_id": session_id, "content": "What changed?"})
        assert response.status_code == 200
        stored = owner.get(f"/api/chat/sessions/{session_id}").json()
        assert [(m["role"], m["content"]) for m in stored["messages"]] == [
            ("user", "What changed?"), ("assistant", "A grounded answer [web:1]."),
        ]
        assert stored["messages"][1]["citations"][0]["source_type"] == "web"
    finally:
        _cleanup(owner_email, other_email)

"""ClearNews chat agent: LangGraph ReAct agent over Groq.

Two grounding modes:
- per-story (story_id set): tools limited to that story's articles + its arc
- global: whole-corpus semantic search + story listing

The agent must cite retrieved articles as [article_id]; the API layer turns
tool outputs into a citation map for the frontend.
"""

import json
import os
from functools import lru_cache

from langchain_core.messages import AIMessageChunk, ToolMessage
from langgraph.prebuilt import create_react_agent

from agent.tools import get_story_arc, list_stories, make_search_story, search_corpus

MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
SUGGEST_MODEL = os.getenv("SUGGEST_MODEL", "llama-3.1-8b-instant")

# Cap the ReAct tool loop. When retrieval turns up nothing on-topic, the model
# keeps re-searching instead of answering; without a cap it runs to LangGraph's
# default of 25 super-steps and raises GraphRecursionError. ~6 tool rounds is
# plenty for legitimate multi-hop questions (real ones answer in 2).
RECURSION_LIMIT = int(os.getenv("CHAT_RECURSION_LIMIT", "12"))

# Shown whenever the agent finishes (or gives up) without producing any answer
# text — the two no-match failure modes: a runaway loop hitting the recursion
# cap, or a completion whose final message is empty.
NO_COVERAGE_MESSAGE = (
    "I couldn't find enough relevant coverage to answer that. "
    "Try rephrasing, or ask about a story from the feed."
)

SYSTEM = """You are the ClearNews research assistant. You answer questions
about news stories using ONLY what your tools return: article search,
story lifecycle data (coverage volume, sentiment, narrative drift, and
left/center/right coverage shares).

Rules:
- Ground every factual claim in retrieved articles and cite them inline as
  [article_id], e.g. "Coverage spiked after the strikes [123][456]."
- When asked to summarize, cover: what happened, how coverage evolved
  (volume, sentiment, framing drift, political lean), and what remains
  unresolved.
- If the tools return nothing relevant, say so plainly. Never invent
  articles, outlets, or citation ids.
- Call ONLY the tools provided in this request. There is no open_file,
  browser, or web search - article search tools are your only data access.
- Keep answers compact and analytical. Write plain prose: the UI renders
  raw text, so no markdown headings, bold, or bullet syntax.
- Answer after at most 2 rounds of tool calls. Never repeat a similar search -
  if a search already returned results, work with those instead of re-querying."""


@lru_cache(maxsize=1)
def _llm():
    from langchain_groq import ChatGroq

    return ChatGroq(model=MODEL, temperature=0.2, reasoning_effort="low")


@lru_cache(maxsize=1)
def _suggest_llm():
    from langchain_groq import ChatGroq

    return ChatGroq(model=SUGGEST_MODEL, temperature=0.2)


def build_agent(story_id: int | None):
    if story_id is not None:
        tools = [make_search_story(story_id), get_story_arc]
        prompt = (
            SYSTEM
            + f"\n\nYou are chatting inside story {story_id}. Use search_story "
            f"for content questions and get_story_arc({story_id}) for coverage "
            "analytics."
        )
    else:
        tools = [search_corpus, list_stories, get_story_arc]
        prompt = (
            SYSTEM
            + "\n\nYour tools are search_corpus (whole-archive search), "
            "list_stories (biggest tracked stories) and get_story_arc "
            "(a story's coverage lifecycle)."
        )
    return create_react_agent(_llm(), tools, prompt=prompt)


def _collect_sources(messages) -> list[dict]:
    """Pull every article the agent retrieved out of its tool messages."""
    sources: dict[int, dict] = {}
    for msg in messages:
        if not isinstance(msg, ToolMessage):
            continue
        try:
            payload = json.loads(msg.content) if isinstance(msg.content, str) else msg.content
        except (json.JSONDecodeError, TypeError):
            continue
        items = payload if isinstance(payload, list) else [payload]
        for item in items:
            if isinstance(item, dict) and "article_id" in item and "url" in item:
                sources[item["article_id"]] = item
    return list(sources.values())


async def _stream_once(agent, state):
    tool_messages = []
    async for msg, _meta in agent.astream(
        state, {"recursion_limit": RECURSION_LIMIT}, stream_mode="messages"
    ):
        if isinstance(msg, AIMessageChunk) and msg.content:
            yield {"type": "token", "content": msg.content}
        elif isinstance(msg, ToolMessage):
            tool_messages.append(msg)

    yield {"type": "sources", "sources": _collect_sources(tool_messages)}


async def stream_chat(messages: list[dict], story_id: int | None, retries: int = 1):
    """Yield SSE-ready events: token deltas, then citations.

    The model occasionally hallucinates a tool name that is not in the
    request ("attempted to call tool ... which was not in request.tools"
    from Groq). That is stochastic, so retry once with a clean stream;
    if it happens again, end the stream with an error event instead of
    blowing up the HTTP response mid-SSE.

    Separately, a query with no on-topic coverage sends the model into a
    runaway search loop; RECURSION_LIMIT turns that into GraphRecursionError,
    which we surface as a plain "nothing relevant" message rather than letting
    the SSE stream hang and die.
    """
    from groq import APIError
    from langgraph.errors import GraphRecursionError

    agent = build_agent(story_id)
    state = {"messages": [(m["role"], m["content"]) for m in messages]}

    for attempt in range(retries + 1):
        emitted = False
        try:
            async for event in _stream_once(agent, state):
                # after tokens reached the client a retry would duplicate
                # the answer, so only retry on failures before first output
                emitted = emitted or event["type"] == "token"
                yield event
            # the model can also stop with an empty final message (no tokens,
            # just tool calls) — same no-answer outcome as a runaway loop.
            if not emitted:
                yield {"type": "error", "message": NO_COVERAGE_MESSAGE}
            return
        except GraphRecursionError:
            print("chat agent hit recursion limit (runaway tool loop)")
            if emitted:
                message = "The answer was cut short. Please try again."
            else:
                message = NO_COVERAGE_MESSAGE
            yield {"type": "error", "message": message}
            return
        except APIError as exc:
            if emitted or attempt == retries:
                exc_str = str(exc)
                if "rate_limit" in exc_str or "too large" in exc_str.lower():
                    message = (
                        "Hit the free-tier rate limit on the model provider. "
                        "Wait a minute and try again."
                    )
                elif "not in request.tools" in exc_str or (
                    "tool" in exc_str.lower() and "not in request" in exc_str.lower()
                ):
                    message = "The model produced an invalid tool call. Please try again."
                else:
                    message = "The model provider returned an error. Please try again."
                yield {"type": "error", "message": message}
                print(f"chat agent APIError (attempt {attempt + 1}): {exc}")
                return


def suggest_questions(context: str) -> list[str]:
    """Three follow-up questions for the given story/answer context."""
    resp = _suggest_llm().invoke(
        [
            (
                "system",
                "Suggest exactly 3 short, distinct follow-up questions a reader "
                "might ask next. Return them as a JSON array of strings, nothing else.",
            ),
            ("user", context[:6000]),
        ]
    )
    try:
        questions = json.loads(resp.content)
        return [q for q in questions if isinstance(q, str)][:3]
    except (json.JSONDecodeError, TypeError):
        return []

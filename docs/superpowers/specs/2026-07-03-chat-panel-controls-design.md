# ChatPanel: full-height, wider sidebar, clear + stop controls

## Problem

`/chat` renders `ChatPanel` at a fixed `h-[28rem]` inside a centered card, leaving most of the viewport empty below it.
The per-story `StoryAsk` sidebar is fixed at 340px, cramped for reading cited sources.
There is no way to clear chat history or cancel a query once sent.

## Scope

`ChatPanel` is shared by both `/chat` (archive-wide) and `StoryAsk` (per-story sidebar/sheet).
All four changes land in `ChatPanel` (plus a small layout change in `Chat.tsx`), so both surfaces get them together.

## Changes

**1. Full-height chat page**
`Chat.tsx`'s wrapper and card stretch to fill the viewport below the sticky header, passing the existing `fill` prop into `ChatPanel` (already used by `StoryAsk`). Exact height offset tuned live in-browser against real header/mobile-nav dimensions, not hardcoded from a guess.

**2. Wider sidebar**
`StoryAsk`'s desktop panel width goes from 340px to ~440px (both the fixed panel and its layout spacer). Adjusted visually in-browser.

**3. Clear history**
A small "CLEAR" text button inside `ChatPanel`, top-right above the message list, shown only when `messages.length > 0`, disabled while a query is in flight. Confirms via native `window.confirm()` (no custom modal). Resets `messages` and `suggested`.

**4. Stop in-flight query**
`ChatPanel` holds an `AbortController` ref for the current request. While `busy`, the existing Send button becomes a Stop button (same slot) that calls `.abort()`. On `AbortError`: keep any partial streamed content already shown; if no tokens arrived yet, drop the empty placeholder bubble instead of showing an error. Backend needs no changes - it's a pure async-generator chain (`backend/app/main.py` `chat()` -> `stream_chat()`), so once the client stops pulling the stream, the agent stops being driven forward.

## Out of scope

- Persisting chat history across reloads (still in-memory only).
- Server-side cancellation of an already-dispatched LLM call.
- Multiple/named chat threads.

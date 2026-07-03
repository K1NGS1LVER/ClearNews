# ChatPanel Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `/chat` page fill the viewport, widen the `StoryAsk` sidebar, and add clear-history / stop-query controls to the shared `ChatPanel`.

**Architecture:** Three independent, additive edits to existing files - no new components, no new dependencies. `ChatPanel` gains an `AbortController` ref and a clear-history handler; `Chat.tsx` and `StoryAsk.tsx` get layout-only changes.

**Tech Stack:** React 19 + TypeScript, Tailwind utility classes + inline style objects (existing codebase convention - CSS custom properties for color/font, no CSS modules), Vite, pnpm.

## Global Constraints

- No new npm dependencies.
- This frontend has no test framework installed (`frontend/package.json` has no `vitest`/`jest`, no `*.test.*` files exist) - verification is `tsc -b`, `pnpm lint`, and manual browser check via the dev server, matching existing project convention. Do not introduce a test framework as part of this plan.
- Colors/fonts must use the existing CSS custom properties (`var(--ink)`, `var(--font-mono)`, etc.) - no new hardcoded hex values.
- Follow existing inline-style + Tailwind-utility mixing pattern already used in these three files.

---

### Task 1: Full-height `/chat` page

**Files:**
- Modify: `frontend/src/pages/Chat.tsx`

**Interfaces:**
- Consumes: `ChatPanel`'s existing `fill?: boolean` prop (`frontend/src/components/ChatPanel.tsx:54`) - when `true`, `ChatPanel` renders `h-full` instead of a fixed `h-[28rem]` (`ChatPanel.tsx:141`). No changes needed to `ChatPanel` for this task.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Replace `Chat.tsx` with a viewport-filling layout**

Replace the full contents of `frontend/src/pages/Chat.tsx`:

```tsx
import ChatPanel from "../components/ChatPanel";

export default function Chat() {
  return (
    <div className="mx-auto flex h-[calc(100dvh-96px)] max-w-3xl flex-col px-4 pb-4 pt-2 sm:px-8">
      <h1 className="mb-3 shrink-0" style={{ fontFamily: "var(--font-serif)", fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>
        Ask about the archive
      </h1>
      <div className="min-h-0 flex-1 rounded-[10px] border p-5" style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}>
        <ChatPanel fill />
      </div>
    </div>
  );
}
```

`min-h-0` on the card is required - without it a flex child won't shrink below its content size, so `ChatPanel`'s internal `overflow-y-auto` message list won't get a bounded height to scroll within, and the whole page will scroll instead of just the message list.

The `96px` offset is a starting estimate for the sticky header's rendered height (`frontend/src/App.tsx:49-99`) - it gets tuned in Step 3 against the real measurement.

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify and tune in the browser**

Run: `cd frontend && pnpm dev` (leave running), open the app, navigate to `/chat`.

Check:
- The card fills essentially the whole viewport below the header, not ~28rem.
- No visible outer-page scrollbar; only the message list inside the card scrolls once messages overflow it (send a few messages, or temporarily add dummy messages, to confirm).
- Resize the window narrower (mobile width) and confirm the card still fits above the fixed bottom tab bar (`App.tsx:113-142`) with no overlap.

If there's a gap or overlap, use browser devtools to read the sticky header's actual rendered height and adjust the `96` in `h-[calc(100dvh-96px)]` (and if mobile needs a different value because of the bottom tab bar, split into `h-[calc(100dvh-96px)] md:h-[calc(100dvh-<desktop-value>px)]`).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Chat.tsx
git commit -m "feat(chat): make /chat page fill viewport height"
```

---

### Task 2: Widen the `StoryAsk` sidebar

**Files:**
- Modify: `frontend/src/components/StoryAsk.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Bump the sidebar width from 340px to 440px**

In `frontend/src/components/StoryAsk.tsx`, there are two occurrences of `340` to change - the layout spacer and the panel itself.

Change:
```tsx
      {/* desktop layout spacer */}
      <div
        className="hidden shrink-0 md:block"
        style={{ width: open ? 340 : 0, transition: "width .38s cubic-bezier(.4,0,.2,1)" }}
        aria-hidden
      />
```
to:
```tsx
      {/* desktop layout spacer */}
      <div
        className="hidden shrink-0 md:block"
        style={{ width: open ? 440 : 0, transition: "width .38s cubic-bezier(.4,0,.2,1)" }}
        aria-hidden
      />
```

Change:
```tsx
        className={`fixed inset-0 z-30 flex flex-col overflow-hidden transition-transform duration-[400ms] ease-[cubic-bezier(.16,1,.3,1)] md:inset-auto md:top-0 md:right-0 md:bottom-0 md:w-[340px] md:border-l md:[border-color:var(--border)] ${
```
to:
```tsx
        className={`fixed inset-0 z-30 flex flex-col overflow-hidden transition-transform duration-[400ms] ease-[cubic-bezier(.16,1,.3,1)] md:inset-auto md:top-0 md:right-0 md:bottom-0 md:w-[440px] md:border-l md:[border-color:var(--border)] ${
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify in the browser**

With `pnpm dev` running, open a story page (`/story/:id`), click the "✦ Ask" FAB, confirm the desktop sidebar opens at the new width, source citation lines (outlet/title/bias label) have more breathing room and don't truncate more aggressively than before. Confirm the page content spacer pushes over by the same amount (no overlap, no gap).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/StoryAsk.tsx
git commit -m "feat(story): widen the Ask sidebar to 440px"
```

---

### Task 3: Clear-history and stop-query controls in `ChatPanel`

**Files:**
- Modify: `frontend/src/components/ChatPanel.tsx`

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: nothing consumed by later tasks - this is the last task.

- [ ] **Step 1: Add an `AbortController` ref and wire it into the fetch call**

In `frontend/src/components/ChatPanel.tsx`, add `useRef` is already imported (line 1: `useEffect, useRef, useState`). Add a new ref alongside `scrollRef`:

```tsx
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
```

In `send()`, create a controller before the `fetch` call and pass its signal:

```tsx
  async function send(text: string) {
    if (!text.trim() || busy) return;
    const history = [...messages, { role: "user" as const, content: text }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          messages: history.map(({ role, content }) => ({ role, content })),
          story_id: storyId ?? null,
        }),
      });
```

- [ ] **Step 2: Distinguish user-initiated abort from real errors in the `catch` block**

Replace the existing `catch`/`finally`:

```tsx
    } catch {
      setMessages((ms) => [
        ...ms.slice(0, -1),
        { role: "assistant", content: "Something went wrong. Is the agent configured (GROQ_API_KEY)?" },
      ]);
    } finally {
      setBusy(false);
    }
```

with:

```tsx
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setMessages((ms) => {
          const last = ms[ms.length - 1];
          return last?.role === "assistant" && !last.content ? ms.slice(0, -1) : ms;
        });
      } else {
        setMessages((ms) => [
          ...ms.slice(0, -1),
          { role: "assistant", content: "Something went wrong. Is the agent configured (GROQ_API_KEY)?" },
        ]);
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
```

- [ ] **Step 3: Add `stop` and `clearHistory` handlers**

Add these two functions right after `send()`:

```tsx
  function stop() {
    abortRef.current?.abort();
  }

  function clearHistory() {
    if (!window.confirm("Clear this conversation?")) return;
    setMessages([]);
    setSuggested([]);
  }
```

- [ ] **Step 4: Add the CLEAR button above the message list**

In the JSX, immediately before the `<div ref={scrollRef} ...>` line, add:

```tsx
      {messages.length > 0 && (
        <div className="mb-1 flex shrink-0 justify-end">
          <button
            onClick={clearHistory}
            disabled={busy}
            className="cursor-pointer hover:underline disabled:cursor-not-allowed disabled:opacity-40"
            style={{ fontFamily: "var(--font-mono)", fontSize: "9.5px", letterSpacing: "0.08em", color: "var(--ink-muted)" }}
          >
            CLEAR
          </button>
        </div>
      )}
      <div ref={scrollRef} className="flex-1 overflow-y-auto pr-1">
```

- [ ] **Step 5: Turn the Send button into a Stop button while busy**

Replace the submit button:

```tsx
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40"
          style={{ background: "var(--ink)", color: "var(--surface-1)" }}
        >
          Send
        </button>
```

with:

```tsx
        <button
          type={busy ? "button" : "submit"}
          onClick={busy ? stop : undefined}
          disabled={!busy && !input.trim()}
          className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40"
          style={{ background: "var(--ink)", color: "var(--surface-1)" }}
        >
          {busy ? "Stop" : "Send"}
        </button>
```

- [ ] **Step 6: Typecheck**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 7: Verify in the browser**

With `pnpm dev` running:
- On `/chat`, send a question, confirm the Send button becomes a Stop button while streaming, click Stop mid-stream, confirm the assistant bubble keeps whatever partial text had streamed in and the button reverts to Send with no error message shown.
- Send another question and click Stop immediately (before any tokens arrive) - confirm the empty assistant bubble disappears entirely instead of leaving a blank bubble.
- After a couple of exchanges, confirm a CLEAR control appears, click it, confirm the native browser confirm dialog appears, accept it, confirm the thread empties and the suggested-questions row clears.
- Repeat the CLEAR + Stop checks inside a story's `StoryAsk` sidebar (not just `/chat`) to confirm both surfaces share the fix, per the shared-component design.
- Confirm CLEAR is disabled (greyed, not clickable) while a query is in flight.

- [ ] **Step 8: Lint**

Run: `cd frontend && pnpm lint`
Expected: no new errors introduced in `ChatPanel.tsx`.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/ChatPanel.tsx
git commit -m "feat(chat): add clear-history and stop-query controls"
```

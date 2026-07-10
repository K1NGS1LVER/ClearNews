import { useEffect, useRef, useState } from "react";
import { postStoryFeedback } from "../api";

/** 3-dot "more/less like this" menu for a For You card. The wrapping div's
    onClick stops propagation so a click anywhere in the menu (button or
    backdrop) doesn't fall through to the card's <Link> and navigate. */
export default function StoryMenu({
  storyId,
  onLess,
}: {
  storyId: number;
  onLess?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  async function send(direction: "more" | "less") {
    if (pending) return;
    setPending(true);
    setOpen(false);
    if (direction === "less") onLess?.(); // optimistic - card disappears immediately
    try {
      await postStoryFeedback(storyId, direction);
    } catch {
      // best-effort signal; not worth surfacing a toast for this
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-sm leading-none"
        style={{ background: "var(--surface-1)", color: "var(--ink-muted)" }}
        aria-label="Story options"
      >
        ⋯
      </button>
      {open && (
        <div
          className="absolute right-0 z-10 mt-1 w-48 overflow-hidden rounded-lg shadow-lg"
          style={{ border: "1px solid var(--input-border)", background: "var(--surface-1)" }}
        >
          <button
            type="button"
            onClick={() => send("more")}
            className="block w-full cursor-pointer px-3.5 py-2 text-left text-sm hover:bg-black/[0.03]"
            style={{ color: "var(--ink)" }}
          >
            Show me more like this
          </button>
          <button
            type="button"
            onClick={() => send("less")}
            className="block w-full cursor-pointer px-3.5 py-2 text-left text-sm hover:bg-black/[0.03]"
            style={{ color: "var(--ink)" }}
          >
            Show me less of this
          </button>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import ChatPanel from "./ChatPanel";
import { withErrorBoundary } from "./ErrorBoundary";

const mono = { fontFamily: "var(--font-outlier)" } as const;
const display = { fontFamily: "var(--font-display)" } as const;

function AskHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex items-center gap-2.5 px-5 pt-4 pb-2">
      <span style={{ ...display, fontSize: "var(--text-lg)", fontWeight: 600, color: "var(--color-ink)" }}>Ask about this story</span>
      <button
        onClick={onClose}
        aria-label="Close"
        className="ml-auto flex h-10 w-10 items-center justify-center rounded-full text-xl cursor-pointer transition-colors hover:bg-black/[0.04]"
        style={{ color: "var(--color-muted)" }}
      >
        ×
      </button>
    </div>
  );
}

function ScopeLabel({ articleCount }: { articleCount?: number }) {
  return (
    <span className="block px-5 pb-3" style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.06em", color: "var(--color-muted)" }}>
      {articleCount !== undefined ? `SCOPED TO THIS STORY · ${articleCount} ARTICLES` : "SCOPED TO THIS STORY"}
    </span>
  );
}

/** Floating "Ask about this story": a FAB that reveals one panel, always
    fixed (immune to document scroll position) - a full-screen sheet
    sliding up on mobile, a right-edge sidebar sliding in on desktop. One
    ChatPanel instance is shared between both layouts (only the wrapper's
    geometry changes at the md: breakpoint), so the thread survives
    close/reopen and even a resize across the breakpoint. A separate,
    invisible flex spacer (desktop only) reserves the sidebar's width so
    the page content narrows/pushes over instead of being covered. */
function StoryAsk({
  storyId,
  articleCount,
  children,
}: {
  storyId: number;
  articleCount?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex">
      <div className="min-w-0 flex-1">{children}</div>

      {/* desktop layout spacer */}
      <div
        className="hidden shrink-0 md:block"
        style={{ width: open ? 440 : 0, transition: "width .38s cubic-bezier(.4,0,.2,1)" }}
        aria-hidden
      />

      {/* the panel itself: mobile sheet (slides up) <-> desktop sidebar (slides in from the right) */}
      <div
        className={`fixed inset-0 z-30 flex flex-col overflow-hidden transition-transform duration-[400ms] ease-[cubic-bezier(.16,1,.3,1)] md:inset-auto md:top-0 md:right-0 md:bottom-0 md:w-[440px] md:border-l ${
          open ? "translate-y-0 md:translate-x-0" : "translate-y-full md:translate-x-full"
        }`}
        style={{
          background: "var(--color-paper)",
          borderLeftColor: "var(--color-rule)",
          borderLeftWidth: "1px",
          borderLeftStyle: "solid",
        }}
      >
        <span
          className="absolute top-2 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full md:hidden"
          style={{ background: "var(--color-rule)" }}
          aria-hidden
        />
        <div className="pt-4 md:pt-0">
          <AskHeader onClose={() => setOpen(false)} />
        </div>
        <ScopeLabel articleCount={articleCount} />
        <div className="min-h-0 flex-1 px-5 pb-5">
          <ChatPanel storyId={storyId} fill />
        </div>
      </div>

      {/* floating action button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`fixed right-5 bottom-20 z-20 flex items-center gap-2 rounded-md px-4 py-3 text-sm font-semibold shadow-lg transition-[opacity,transform] duration-200 hover:scale-105 active:scale-95 md:right-6 md:bottom-6 ${
          open ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
        style={{
          background: "var(--color-ink)",
          color: "var(--color-paper)",
          borderRadius: "var(--radius-input)",
          padding: "var(--space-sm) var(--space-lg)",
          fontSize: "var(--text-sm)",
          fontFamily: "var(--font-body)",
          fontWeight: 500,
          boxShadow: "inset 0 1px 0 var(--glint), 0 0 0 1px var(--color-rule), 0 3px 0 var(--color-rule)",
        }}
        onMouseDown={(e) => { e.currentTarget.style.transform = "translateY(1px)"; }}
        onMouseUp={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
        aria-label="Ask about this story"
      >
        <span>✦</span>Ask
      </button>
    </div>
  );
}

export default withErrorBoundary(StoryAsk, "StoryAsk");

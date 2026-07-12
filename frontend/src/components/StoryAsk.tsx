import { useState } from "react";
import ChatPanel from "./ChatPanel";
import { withErrorBoundary } from "./ErrorBoundary";

const mono = { fontFamily: "var(--font-mono)" } as const;
const serif = { fontFamily: "var(--font-serif)" } as const;

function AskHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex items-center gap-2.5 px-5 pt-[18px] pb-1">
      <span style={{ ...serif, fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>Ask about this story</span>
      <button
        onClick={onClose}
        aria-label="Close"
        className="ml-auto flex h-[26px] w-[26px] items-center justify-center rounded-full text-base hover:bg-black/[0.06]"
        style={{ color: "var(--ink-2)" }}
      >
        ×
      </button>
    </div>
  );
}

function ScopeLabel({ articleCount }: { articleCount?: number }) {
  return (
    <span className="block px-5 pb-3" style={{ ...mono, fontSize: "9.5px", letterSpacing: "0.06em", color: "var(--ink-muted)" }}>
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
        className={`fixed inset-0 z-30 flex flex-col overflow-hidden transition-transform duration-[400ms] ease-[cubic-bezier(.16,1,.3,1)] md:inset-auto md:top-0 md:right-0 md:bottom-0 md:w-[440px] md:border-l md:[border-color:var(--border)] ${
          open ? "translate-y-0 md:translate-x-0" : "translate-y-full md:translate-x-full"
        }`}
        style={{
          background: "var(--glass)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        <span
          className="absolute top-2 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full md:hidden"
          style={{ background: "var(--input-border)" }}
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
        className={`fixed right-5 bottom-20 z-20 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold shadow-lg transition-[opacity,transform] duration-200 hover:scale-105 active:scale-95 md:right-6 md:bottom-6 ${
          open ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
        style={{ background: "var(--navpill)", color: "var(--navpill-ink)" }}
        aria-label="Ask about this story"
      >
        <span>✦</span>Ask
      </button>
    </div>
  );
}

export default withErrorBoundary(StoryAsk, "StoryAsk");

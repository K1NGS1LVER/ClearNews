import { Link } from "react-router-dom";
import { useTheme } from "../theme";

const mono = { fontFamily: "var(--font-mono)" } as const;
const serif = { fontFamily: "var(--font-serif)" } as const;

const tickerItems = [
  { dot: "var(--series-drift)", text: "RAIL CONTRACT TALKS — lean drift L +0.14 over 48H" },
  { dot: "var(--status-fading)", text: "AQUIFER PERMITS — status ACTIVE → FADING" },
  { dot: "var(--status-active)", text: "OFFSHORE WIND — 148 articles · 36 outlets · day 14" },
  { dot: "var(--bias-left)", text: "PHONE BAN ROLLOUT — sentiment −0.21 this week" },
  { dot: "var(--status-dead)", text: "GRID STORAGE CREDIT — last article 9 days ago" },
];

function Ticker() {
  const row = (key: string) => (
    <div key={key} className="flex gap-11 px-[22px] py-[7px]" style={{ ...mono, fontSize: 10, letterSpacing: "0.06em", color: "var(--ink-muted)" }}>
      {tickerItems.map((item, i) => (
        <span key={i}>
          <span style={{ color: item.dot }}>◆</span> {item.text}
        </span>
      ))}
    </div>
  );
  return (
    <div style={{ borderBottom: "1px solid var(--border)", overflow: "hidden", background: "var(--surface-1)" }}>
      <div
        className="cn-anim flex w-max whitespace-nowrap"
        style={{ animation: "cn-tick 42s linear infinite" }}
      >
        {row("a")}
        {row("b")}
      </div>
    </div>
  );
}

const heroBars: [number, number, number][] = [
  [1, 6, 1],
  [2, 10, 2],
  [4, 14, 4],
  [6, 18, 6],
  [10, 22, 10],
  [14, 22, 14],
  [14, 18, 14],
  [20, 20, 20],
  [26, 20, 26],
  [24, 16, 26],
  [34, 16, 34],
  [38, 14, 40],
  [36, 12, 38],
  [44, 12, 44],
];

function TrackedStoryCard() {
  return (
    <div
      className="cn-anim flex flex-1 flex-col gap-4 rounded-[10px] p-6 shadow-[0_1px_3px_rgba(0,0,0,.06)]"
      style={{
        flex: "1 1 420px",
        minWidth: 320,
        maxWidth: 520,
        background: "var(--surface-1)",
        border: "1px solid var(--border)",
        animation: "cn-fadeup .6s cubic-bezier(.2,.7,.3,1) .12s both",
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1"
          style={{ background: "var(--chip-center-bg)", ...mono, fontSize: 9.5, letterSpacing: "0.1em", color: "var(--ink-2)" }}
        >
          <span className="inline-block h-[7px] w-[7px] rounded-full" style={{ background: "var(--status-active)" }} />
          ACTIVE
        </span>
        <div className="flex-1" />
        <span style={{ ...mono, fontSize: 9.5, letterSpacing: "0.1em", color: "var(--ink-muted)" }}>DAY 14</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span style={{ ...serif, fontSize: 21, fontWeight: 700, lineHeight: 1.25, letterSpacing: "-0.01em" }}>
          Offshore wind permits stall as coastal towns push back
        </span>
        <span style={{ ...mono, fontSize: 10.5, letterSpacing: "0.05em", color: "var(--ink-muted)" }}>
          148 ARTICLES · 36 OUTLETS · FIRST SEEN JUN 20
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span style={{ ...mono, fontSize: 9.5, letterSpacing: "0.1em", color: "var(--ink-muted)" }}>DAILY VOLUME × LEAN</span>
        <div className="flex h-[120px] items-end gap-1">
          {heroBars.map(([red, grey, blue], i) => (
            <div
              key={i}
              className="cn-anim flex flex-1 flex-col justify-end overflow-hidden rounded-t"
              style={{ transformOrigin: "bottom", animation: `cn-grow .7s cubic-bezier(.2,.7,.3,1) ${0.2 + i * 0.05}s both` }}
            >
              <div style={{ height: red, background: "var(--bias-right)" }} />
              <div style={{ height: grey, background: "var(--grid)" }} />
              <div style={{ height: blue, background: "var(--bias-left)" }} />
            </div>
          ))}
        </div>
        <div className="flex justify-between pt-1" style={{ borderTop: "1px solid var(--grid)" }}>
          <span style={{ ...mono, fontSize: 9, color: "var(--ink-muted)" }}>JUN 20</span>
          <span style={{ ...mono, fontSize: 9, color: "var(--ink-muted)" }}>TODAY</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span style={{ ...mono, fontSize: 9.5, letterSpacing: "0.1em", color: "var(--ink-muted)" }}>LEAN DISTRIBUTION</span>
        {[
          { label: "DAY 1", left: 18, center: 64, right: 18 },
          { label: "TODAY", left: 44, center: 12, right: 44 },
        ].map((row) => (
          <div key={row.label} className="flex items-center gap-2.5">
            <span style={{ ...mono, fontSize: 9, color: "var(--ink-muted)", width: 38 }}>{row.label}</span>
            <div className="flex h-2 flex-1 overflow-hidden rounded-full">
              <div style={{ width: `${row.left}%`, background: "var(--bias-left)" }} />
              <div style={{ width: `${row.center}%`, background: "var(--grid)" }} />
              <div style={{ width: `${row.right}%`, background: "var(--bias-right)" }} />
            </div>
          </div>
        ))}
      </div>

      <span style={{ ...mono, fontSize: 9.5, lineHeight: 1.5, letterSpacing: "0.04em", color: "var(--ink-muted)" }}>
        A PATTERN CLEARNEWS FLAGS: COVERAGE BORN NEUTRAL, POLARIZED BY WEEK TWO.
      </span>
    </div>
  );
}

function Hero() {
  return (
    <section className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-14 px-8 pb-[72px] pt-[76px]">
      <div className="cn-anim flex min-w-[320px] flex-1 flex-col gap-5" style={{ flex: "1 1 440px", animation: "cn-fadeup .6s cubic-bezier(.2,.7,.3,1) both" }}>
        <span style={{ ...mono, fontSize: 11, letterSpacing: "0.14em", color: "var(--ink-muted)" }}>
          NEWS, TRACKED OVER ITS WHOLE LIFE
        </span>
        <h1 style={{ ...serif, fontSize: "clamp(42px,5vw,62px)", fontWeight: 700, lineHeight: 1.04, letterSpacing: "-0.02em" }}>
          Every story has a life. Read it whole.
        </h1>
        <p className="max-w-[480px]" style={{ fontSize: 17, lineHeight: 1.6, color: "var(--ink-2)" }}>
          A headline is one frame of a moving picture. ClearNews follows coverage across 2,000+ outlets — how a
          story is born, how its framing drifts left or right, and when it quietly dies — updated every 15 minutes.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/stories"
            className="inline-flex h-11 items-center rounded-lg px-[22px] text-[15px] font-semibold transition-opacity duration-150 hover:opacity-85 active:scale-[0.97]"
            style={{ background: "var(--navpill)", color: "var(--navpill-ink)" }}
          >
            Start reading
          </Link>
          <a
            href="#lifecycle"
            className="inline-flex h-11 items-center rounded-lg px-3.5 text-[15px] font-semibold transition-colors hover:bg-[var(--chip-center-bg)] hover:underline"
            style={{ color: "var(--ink)", textUnderlineOffset: 3 }}
          >
            How it works ↓
          </a>
        </div>
        <span style={{ ...mono, fontSize: 10, letterSpacing: "0.1em", color: "var(--ink-muted)" }}>
          FREE · NO ACCOUNT NEEDED
        </span>
      </div>
      <TrackedStoryCard />
    </section>
  );
}

function LifecycleCards() {
  const cardShell = "flex flex-col gap-3.5 rounded-[10px] p-[22px]";
  const cardStyle = { background: "var(--surface-1)", border: "1px solid var(--border)" } as const;
  const statusChip = (color: string, label: string) => (
    <span
      className="mb-2 inline-flex items-center gap-1.5 self-start rounded-lg px-2.5 py-1"
      style={{ background: "var(--chip-center-bg)", ...mono, fontSize: 9.5, letterSpacing: "0.1em", color: "var(--ink-2)" }}
    >
      <span className="inline-block h-[7px] w-[7px] rounded-full" style={{ background: color }} />
      {label}
    </span>
  );

  return (
    <section id="lifecycle" style={{ borderTop: "1px solid var(--border)", scrollMarginTop: 70 }}>
      <div className="mx-auto flex max-w-[1120px] flex-col gap-9 px-8 py-[72px]">
        <div className="flex max-w-[640px] flex-col gap-3.5">
          <span style={{ ...mono, fontSize: 11, letterSpacing: "0.14em", color: "var(--ink-muted)" }}>THE LIFECYCLE</span>
          <h2 style={{ ...serif, fontSize: 36, fontWeight: 700, letterSpacing: "-0.015em", lineHeight: 1.1 }}>
            Born. Drifting. Faded.
          </h2>
          <p style={{ fontSize: 16, lineHeight: 1.6, color: "var(--ink-2)" }}>
            ClearNews treats a story as a living record, not a stream of disconnected articles. Coverage is
            clustered as it appears, re-scored every day, and closed out when it stops — so the shape of the story
            is something you can actually see.
          </p>
        </div>

        <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          <div className={cardShell} style={cardStyle}>
            <div className="flex h-[84px] items-end gap-1.5" style={{ borderBottom: "1px solid var(--grid)" }}>
              {[8, 16, 28, 44, 64].map((h, i) => (
                <div key={i} className="w-[18px] rounded-t" style={{ height: h, background: "var(--bias-left)", opacity: 0.85 }} />
              ))}
              <div className="flex-1" />
              {statusChip("var(--status-active)", "ACTIVE")}
            </div>
            <span style={{ ...serif, fontSize: 20, fontWeight: 700 }}>Born</span>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-2)" }}>
              The moment coverage clusters into a story, a record opens: who published first, how fast it spread,
              and what the opening frame was.
            </p>
            <span
              style={{ ...mono, fontSize: 10, lineHeight: 1.6, letterSpacing: "0.03em", color: "var(--ink-muted)", borderTop: "1px solid var(--grid)", paddingTop: 12 }}
            >
              ◆ "GRID STORAGE CREDIT CLEARS COMMITTEE" — DETECTED 08:12 · 9 OUTLETS IN THE FIRST HOUR
            </span>
          </div>

          <div className={cardShell} style={cardStyle}>
            <div className="flex h-[84px] flex-col justify-center gap-2">
              {[
                { d: "D1", l: 20, c: 60, r: 20 },
                { d: "D3", l: 30, c: 44, r: 26 },
                { d: "D5", l: 38, c: 30, r: 32 },
                { d: "D7", l: 44, c: 18, r: 38 },
              ].map((row) => (
                <div key={row.d} className="flex items-center gap-2">
                  <span style={{ ...mono, fontSize: 9, color: "var(--ink-muted)", width: 20 }}>{row.d}</span>
                  <div className="flex h-[7px] flex-1 overflow-hidden rounded-full">
                    <div style={{ width: `${row.l}%`, background: "var(--bias-left)" }} />
                    <div style={{ width: `${row.c}%`, background: "var(--grid)" }} />
                    <div style={{ width: `${row.r}%`, background: "var(--bias-right)" }} />
                  </div>
                </div>
              ))}
            </div>
            <span style={{ ...serif, fontSize: 20, fontWeight: 700 }}>Drifting</span>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-2)" }}>
              Every article is re-scored daily. When framing or lean moves, the story's drift index climbs — and
              you can see exactly which outlets moved it.
            </p>
            <span
              style={{ ...mono, fontSize: 10, lineHeight: 1.6, letterSpacing: "0.03em", color: "var(--ink-muted)", borderTop: "1px solid var(--grid)", paddingTop: 12 }}
            >
              ◆ "RAIL CONTRACT TALKS" — LEAN DRIFTED L +0.14 IN 48 HOURS
            </span>
          </div>

          <div className={cardShell} style={cardStyle}>
            <div className="flex h-[84px] items-end gap-1.5" style={{ borderBottom: "1px solid var(--grid)" }}>
              {[56, 36, 20, 9, 3].map((h, i) => (
                <div key={i} className="w-[18px] rounded-t" style={{ height: h, background: "var(--grid)" }} />
              ))}
              <div className="flex-1" />
              {statusChip("var(--status-dead)", "DEAD")}
            </div>
            <span style={{ ...serif, fontSize: 20, fontWeight: 700 }}>Faded</span>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-2)" }}>
              Stories rarely end — they just stop. ClearNews marks the last article, the final frame, and what was
              left unresolved.
            </p>
            <span
              style={{ ...mono, fontSize: 10, lineHeight: 1.6, letterSpacing: "0.03em", color: "var(--ink-muted)", borderTop: "1px solid var(--grid)", paddingTop: 12 }}
            >
              ◆ "AQUIFER PERMITS FOR DATACENTERS" — LAST ARTICLE 9 DAYS AGO
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

const biasStories = [
  { title: "Rail contract talks resume after weekend walkout", meta: "62 ARTICLES · 21 OUTLETS · DAY 6 · ACTIVE", l: 38, c: 34, r: 28 },
  { title: "Aquifer permits for AI datacenters face state review", meta: "41 ARTICLES · 17 OUTLETS · DAY 11 · FADING", l: 24, c: 52, r: 24 },
  { title: "School phone ban rollout, one year in", meta: "87 ARTICLES · 29 OUTLETS · DAY 19 · ACTIVE", l: 30, c: 22, r: 48 },
];

function BiasSection() {
  return (
    <section id="bias" style={{ borderTop: "1px solid var(--border)", scrollMarginTop: 70 }}>
      <div className="mx-auto flex max-w-[1120px] flex-col gap-8 px-8 py-[72px]">
        <div className="flex max-w-[640px] flex-col gap-3.5">
          <span style={{ ...mono, fontSize: 11, letterSpacing: "0.14em", color: "var(--ink-muted)" }}>LEAN, MEASURED</span>
          <h2 style={{ ...serif, fontSize: 36, fontWeight: 700, letterSpacing: "-0.015em", lineHeight: 1.1 }}>
            See the lean before you read a word.
          </h2>
          <p style={{ fontSize: 16, lineHeight: 1.6, color: "var(--ink-2)" }}>
            Every article is scored left, center, or right by a language model reading the text itself — no outlet
            blacklists, no vibes. Each story shows its full distribution, so "balanced coverage" becomes something
            you can check, not something you're told.
          </p>
          <div className="flex items-center gap-4.5">
            {[
              { color: "var(--bias-left)", label: "LEFT" },
              { color: "var(--grid)", label: "CENTER", border: true },
              { color: "var(--bias-right)", label: "RIGHT" },
            ].map((l) => (
              <span key={l.label} className="inline-flex items-center gap-1.5" style={{ ...mono, fontSize: 10, letterSpacing: "0.08em", color: "var(--ink-muted)" }}>
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: l.color, border: l.border ? "1px solid var(--border)" : undefined }}
                />
                {l.label}
              </span>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-[10px]" style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}>
          {biasStories.map((s, i) => (
            <div
              key={s.title}
              className="flex flex-wrap items-center gap-6 p-5 transition-colors hover:bg-[var(--chip-center-bg)]"
              style={{ borderTop: i === 0 ? undefined : "1px solid var(--border)", cursor: "pointer" }}
            >
              <div className="flex flex-1 flex-col gap-1" style={{ flex: "1 1 380px" }}>
                <span style={{ ...serif, fontSize: 20, fontWeight: 600, lineHeight: 1.3, letterSpacing: "-0.01em" }}>{s.title}</span>
                <span style={{ ...mono, fontSize: 10, letterSpacing: "0.06em", color: "var(--ink-muted)" }}>{s.meta}</span>
              </div>
              <div className="flex flex-col gap-1.5" style={{ flex: "0 0 220px" }}>
                <div className="flex h-2 overflow-hidden rounded-full">
                  <div style={{ width: `${s.l}%`, background: "var(--bias-left)" }} />
                  <div style={{ width: `${s.c}%`, background: "var(--grid)" }} />
                  <div style={{ width: `${s.r}%`, background: "var(--bias-right)" }} />
                </div>
                <span style={{ ...mono, fontSize: 9, letterSpacing: "0.06em", color: "var(--ink-muted)" }}>
                  {s.l} L · {s.c} C · {s.r} R
                </span>
              </div>
            </div>
          ))}
        </div>
        <span style={{ ...mono, fontSize: 9.5, letterSpacing: "0.08em", color: "var(--ink-muted)" }}>
          STORIES SHOWN ARE ILLUSTRATIVE
        </span>
      </div>
    </section>
  );
}

function CtaBand() {
  return (
    <section className="mx-auto max-w-[1120px] px-8 pb-[72px]">
      <div
        className="flex flex-col items-center gap-4.5 rounded-xl p-14 text-center"
        style={{ background: "var(--ink)", color: "var(--page)" }}
      >
        <h2 style={{ ...serif, fontSize: 34, fontWeight: 700, letterSpacing: "-0.015em" }}>Stop reading snapshots.</h2>
        <p className="max-w-[460px]" style={{ fontSize: 15, lineHeight: 1.6, opacity: 0.75 }}>
          The feed is open — no account needed. Sign up when you want to follow stories and ask questions with
          cited answers.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            to="/stories"
            className="inline-flex h-11 items-center rounded-lg px-[22px] text-[15px] font-semibold transition-opacity hover:opacity-85 active:scale-[0.97]"
            style={{ background: "var(--page)", color: "var(--ink)" }}
          >
            Start reading
          </Link>
          <Link
            to="/signup"
            className="inline-flex h-11 items-center rounded-lg px-[22px] text-[15px] font-semibold transition-colors hover:bg-white/10 active:scale-[0.97]"
            style={{ border: "1.5px solid var(--page)", color: "var(--page)" }}
          >
            Create a free account
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer style={{ borderTop: "1px solid var(--border)" }}>
      <div className="mx-auto flex flex-wrap items-center gap-5 px-8 py-[26px]">
        <span style={{ ...serif, fontSize: 15, fontWeight: 700 }}>ClearNews</span>
        <div className="flex gap-1">
          {["METHODOLOGY", "SOURCES", "CONTACT"].map((label) => (
            <a
              key={label}
              href="#"
              className="rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--chip-center-bg)]"
              style={{ ...mono, fontSize: 10, letterSpacing: "0.08em", color: "var(--ink-muted)", textDecoration: "none" }}
            >
              {label}
            </a>
          ))}
        </div>
        <div className="flex-1" />
        <span style={{ ...mono, fontSize: 10, letterSpacing: "0.08em", color: "var(--ink-muted)" }}>© 2026 CLEARNEWS</span>
      </div>
    </footer>
  );
}

export default function Landing() {
  const [theme, toggleTheme] = useTheme();

  return (
    <div style={{ minHeight: "100vh", background: "var(--page)", color: "var(--ink)" }}>
      <header
        className="sticky top-0 z-10"
        style={{
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          background: "var(--glass)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="mx-auto flex max-w-[1120px] items-center gap-6 px-8 py-3">
          <span style={{ ...serif, fontSize: 19, fontWeight: 700, letterSpacing: "-0.01em" }}>ClearNews</span>
          <nav className="hidden items-center gap-1.5 sm:flex">
            <a
              href="#lifecycle"
              className="rounded-lg px-2.5 py-1.5 transition-colors hover:bg-[var(--chip-center-bg)]"
              style={{ ...mono, fontSize: 10.5, letterSpacing: "0.08em", color: "var(--ink-2)", textDecoration: "none" }}
            >
              THE LIFECYCLE
            </a>
            <a
              href="#bias"
              className="rounded-lg px-2.5 py-1.5 transition-colors hover:bg-[var(--chip-center-bg)]"
              style={{ ...mono, fontSize: 10.5, letterSpacing: "0.08em", color: "var(--ink-2)", textDecoration: "none" }}
            >
              LEAN &amp; DRIFT
            </a>
          </nav>
          <div className="flex-1" />
          <button
            onClick={toggleTheme}
            className="cursor-pointer rounded-lg px-2.5 py-2 transition-colors hover:bg-[var(--chip-center-bg)]"
            style={{ ...mono, fontSize: 10.5, letterSpacing: "0.08em", color: "var(--ink-2)", background: "transparent", border: "none" }}
          >
            {theme === "dark" ? "☀ LIGHT" : "☾ DARK"}
          </button>
          <Link
            to="/login"
            className="rounded-lg px-3 text-[13.5px] font-semibold transition-colors hover:bg-[var(--chip-center-bg)] hover:underline"
            style={{ height: 34, display: "inline-flex", alignItems: "center", color: "var(--ink)", textUnderlineOffset: 3 }}
          >
            Log in
          </Link>
          <Link
            to="/signup"
            className="rounded-lg px-4 text-[13.5px] font-semibold transition-opacity hover:opacity-85"
            style={{ height: 34, display: "inline-flex", alignItems: "center", background: "var(--navpill)", color: "var(--navpill-ink)" }}
          >
            Sign up
          </Link>
        </div>
      </header>

      <Ticker />
      <Hero />
      <LifecycleCards />
      <BiasSection />
      <CtaBand />
      <Footer />
    </div>
  );
}

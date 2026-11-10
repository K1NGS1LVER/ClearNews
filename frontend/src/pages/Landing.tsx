import { Link } from "react-router-dom";
import { Nav } from "../components/Nav";

const mono = { fontFamily: "var(--font-outlier)" } as const;
const display = { fontFamily: "var(--font-display)" } as const;

const HERO_SCREENSHOT = "/screenshots/clearnews-stories.png";
const DEMO_SCREENSHOT = "/screenshots/clearnews-story.png";
const PHONE_SCREENSHOT = "/screenshots/clearnews-story-phone.png";

/* Focus and active state helpers for Hallmark Floor 26a & Reflex 26b */
const focusStyle = {
  outline: "2px solid var(--color-focus)",
  outlineOffset: "2px",
} as const;

const pressSpringStyle = {
  transform: "translateY(3px)",
  transition: "transform var(--dur-micro) var(--ease-out)",
} as const;

const pressSpringMicroStyle = {
  transform: "translateY(2px)",
  transition: "transform var(--dur-micro) var(--ease-out)",
} as const;

function Hero() {
  return (
    <section style={{ paddingTop: "var(--space-3xl)", paddingBottom: "var(--space-3xl)" }}>
      <div className="container" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3xl)", alignItems: "center" }}>
        <div>
          <span style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.12em", color: "var(--color-accent)", textTransform: "uppercase" }}>
            News, tracked over its whole life
          </span>
          <h1 style={{ ...display, fontSize: "var(--text-display)", fontWeight: 700, lineHeight: 1.02, letterSpacing: "-0.03em", color: "var(--color-ink)", marginTop: "var(--space-lg)", marginBottom: "var(--space-lg)", maxWidth: "20ch" }}>
            Every story has a life. Read fully.
          </h1>
          <p style={{ fontSize: "var(--text-lg)", lineHeight: 1.5, color: "var(--color-ink-2)", maxWidth: "52ch", marginBottom: "var(--space-2xl)" }}>
            A headline is one frame. ClearNews shows the whole story.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-md)", alignItems: "center" }}>
            <Link
              to="/stories"
              style={{
                ...mono,
                fontSize: "var(--text-md)",
                fontWeight: 500,
                padding: "var(--space-sm) var(--space-xl)",
                borderRadius: "var(--radius-input)",
                background: "var(--color-ink)",
                color: "var(--color-paper)",
                textDecoration: "none",
                transition: "transform var(--dur-micro) var(--ease-out), box-shadow var(--dur-micro) var(--ease-out)",
                boxShadow: "inset 0 1px 0 var(--glint), 0 0 0 1px var(--color-rule), 0 3px 0 var(--color-rule)",
              }}
              onMouseDown={(e) => Object.assign(e.currentTarget.style, pressSpringStyle)}
              onMouseUp={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
              onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)}
              onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}
            >
              Start reading free
            </Link>
            <Link
              to="/stories"
              style={{
                ...mono,
                fontSize: "var(--text-md)",
                fontWeight: 500,
                padding: "var(--space-sm) var(--space-xl)",
                borderRadius: "var(--radius-input)",
                border: "1px solid var(--color-rule)",
                background: "transparent",
                color: "var(--color-ink)",
                textDecoration: "none",
                transition: "transform var(--dur-micro) var(--ease-out), background var(--dur-micro) var(--ease-out)",
              }}
              onMouseDown={(e) => Object.assign(e.currentTarget.style, pressSpringMicroStyle)}
              onMouseUp={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
              onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)}
              onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}
            >
              Explore stories
            </Link>
          </div>
          <p style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.08em", color: "var(--color-muted)", marginTop: "var(--space-xl)" }}>
            NO ACCOUNT NEEDED  /  UPDATED EVERY 15 MINUTES  /  GDELT-POWERED
          </p>
        </div>
        <div data-slot="hero" data-alt="ClearNews story feed showing live story cards with bias bars, drift charts, and volume timelines" style={{ aspectRatio: "16/9", borderRadius: "var(--radius-card)", overflow: "hidden", background: "linear-gradient(160deg, var(--color-paper-2), var(--color-paper-3))", position: "relative" }}>
          <img
            src={HERO_SCREENSHOT}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            fetchPriority="high"
          />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 60%, color-mix(in oklab, var(--color-ink) 8%, transparent))", pointerEvents: "none" }} />
        </div>
      </div>
    </section>
  );
}

function ProductAtWork() {
  return (
    <section style={{ paddingTop: "var(--section-gap)", paddingBottom: "var(--section-gap)", background: "var(--color-paper-2)" }}>
      <div className="container">
        <div style={{ maxWidth: "40ch", marginBottom: "var(--space-2xl)" }}>
          <h2 style={{ ...display, fontSize: "var(--text-section)", fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.02em", color: "var(--color-ink)", marginBottom: "var(--space-md)" }}>
            The product at work
          </h2>
          <p style={{ fontSize: "var(--text-lead)", lineHeight: 1.45, color: "var(--color-ink-2)" }}>
            A living feed of stories: each card shows volume, lean, drift, and fade risk at a glance.
          </p>
        </div>
        <div data-slot="demo-1" data-alt="Story detail page with bias distribution, sentiment timeline, drift map, and outlet breakdown" style={{ aspectRatio: "16/9", borderRadius: "var(--radius-card)", overflow: "hidden", background: "linear-gradient(160deg, var(--color-paper-2), var(--color-paper-3))", position: "relative", boxShadow: "var(--shadow-lift)" }}>
          <img
            src={DEMO_SCREENSHOT}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            loading="lazy"
          />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 60%, color-mix(in oklab, var(--color-ink) 8%, transparent))", pointerEvents: "none" }} />
        </div>
        <p style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.08em", color: "var(--color-muted)", marginTop: "var(--space-md)", textAlign: "center" }}>
          Captured from the local ClearNews story view
        </p>
      </div>
    </section>
  );
}

function Features() {
  const features = [
    {
      title: "Bias measured, not assumed",
      description: "Every article scored left, center, right by a language model reading the text — no outlet blacklists, no vibes. Each story shows its full distribution.",
      icon: "◆",
      accent: "var(--bias-left)",
    },
    {
      title: "Drift tracked daily",
      description: "Framing shifts are quantified as a drift index. See exactly which outlets moved a story left or right, and by how much, over the story's life.",
      icon: "◈",
      accent: "var(--series-drift)",
    },
    {
      title: "Fade risk predicted",
      description: "An XGBoost model trained on 30-day-old stories predicts the probability coverage dies in the next 30 days — so you know when to pay attention.",
      icon: "◇",
      accent: "var(--status-fading)",
    },
    {
      title: "Narrative milestones",
      description: "Agent-detected timeline events mark when the story's frame shifted: a new claim, a retracted report, a policy change — each with its narrative shift note.",
      icon: "◆",
      accent: "var(--series-sentiment)",
    },
  ];

  return (
    <section style={{ paddingTop: "var(--section-gap)", paddingBottom: "var(--section-gap)" }}>
      <div className="container">
        <div style={{ maxWidth: "40ch", marginBottom: "var(--space-2xl)" }}>
          <h2 style={{ ...display, fontSize: "var(--text-section)", fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.02em", color: "var(--color-ink)", marginBottom: "var(--space-md)" }}>
            What you see in every story
          </h2>
          <p style={{ fontSize: "var(--text-lead)", lineHeight: 1.45, color: "var(--color-ink-2)" }}>
            Four lenses on the same coverage: not summaries, but the data behind them.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "var(--gap-columns)" }}>
          {features.map((f) => (
            <article
              key={f.title}
              style={{
                padding: "var(--space-xl)",
                background: "var(--color-paper)",
                border: "1px solid var(--color-rule)",
                borderRadius: "var(--radius-card)",
                boxShadow: "var(--shadow-card)",
                transition: "transform var(--dur-short) var(--ease-out), box-shadow var(--dur-short) var(--ease-out), border-color var(--dur-short) var(--ease-out)",
                position: "relative",
                overflow: "hidden",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-4px)";
                e.currentTarget.style.boxShadow = "var(--shadow-lift)";
                e.currentTarget.style.borderColor = "var(--color-accent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "var(--shadow-card)";
                e.currentTarget.style.borderColor = "var(--color-rule)";
              }}
            >
              <div style={{ width: 40, height: 40, borderRadius: "var(--radius-input)", background: f.accent, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "var(--space-lg)" }}>
                <span style={{ fontSize: 20, color: "var(--color-accent-ink)" }}>{f.icon}</span>
              </div>
              <h3 style={{ ...display, fontSize: "var(--text-title)", fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.01em", color: "var(--color-ink)", marginBottom: "var(--space-md)", maxWidth: "40ch" }}>
                {f.title}
              </h3>
              <p style={{ fontSize: "var(--text-md)", lineHeight: 1.6, color: "var(--color-ink-2)" }}>
                {f.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function BeforeAfter() {
  return (
    <section style={{ paddingTop: "var(--section-gap)", paddingBottom: "var(--section-gap)", background: "var(--color-paper-2)" }}>
      <div className="container" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3xl)", alignItems: "center" }}>
        <div>
          <span style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.12em", color: "var(--color-accent)", textTransform: "uppercase" }}>
            Before vs. After
          </span>
          <h2 style={{ ...display, fontSize: "var(--text-section)", fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.02em", color: "var(--color-ink)", marginTop: "var(--space-lg)", marginBottom: "var(--space-lg)", maxWidth: "30ch" }}>
            Stop reading snapshots. Start reading the whole story.
          </h2>
          <p style={{ fontSize: "var(--text-lg)", lineHeight: 1.5, color: "var(--color-ink-2)", marginBottom: "var(--space-xl)", maxWidth: "52ch" }}>
            Traditional feeds show you the latest article. ClearNews shows you the story&rsquo;s entire arc &mdash; from the first report through every framing shift to the final article.
          </p>
          <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
            {[
              { before: "One headline, no context", after: "Full lifecycle: Born → Drifting → Faded" },
              { before: "Outlet reputation as proxy for bias", after: "Per-article bias scored by language model" },
              { before: "Story dies when you stop scrolling", after: "Fade risk predicted, last article marked" },
              { before: "Search gives you a list of links", after: "Search returns stories with drift timelines" },
            ].map((item, i) => (
              <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-lg)", padding: "var(--space-md)", background: "var(--color-paper)", borderRadius: "var(--radius-card)", border: "1px solid var(--color-rule)" }}>
                <div style={{ flex: 1 }}>
                  <span style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.08em", color: "var(--bias-right)", textTransform: "uppercase" }}>BEFORE</span>
                  <p style={{ fontSize: "var(--text-md)", fontWeight: 500, color: "var(--color-ink)", marginTop: "var(--space-xs)" }}>{item.before}</p>
                </div>
                <span style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.1em", color: "var(--color-muted)", alignSelf: "center", margin: "0 var(--space-sm)" }}>→</span>
                <div style={{ flex: 1 }}>
                  <span style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.08em", color: "var(--color-accent)", textTransform: "uppercase" }}>AFTER</span>
                  <p style={{ fontSize: "var(--text-md)", fontWeight: 500, color: "var(--color-ink)", marginTop: "var(--space-xs)" }}>{item.after}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div data-slot="demo-2" data-alt="Side-by-side comparison: traditional feed vs ClearNews story card" style={{ aspectRatio: "4/3", borderRadius: "var(--radius-card)", overflow: "hidden", background: "linear-gradient(160deg, var(--color-paper-2), var(--color-paper-3))", position: "relative", boxShadow: "var(--shadow-lift)" }}>
          <img
            src={PHONE_SCREENSHOT}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            loading="lazy"
          />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 60%, color-mix(in oklab, var(--color-ink) 8%, transparent))", pointerEvents: "none" }} />
        </div>
      </div>
    </section>
  );
}

function Platforms() {
  return (
    <section style={{ paddingTop: "var(--section-gap)", paddingBottom: "var(--section-gap)" }}>
      <div className="container" style={{ textAlign: "center", maxWidth: "60ch", margin: "0 auto" }}>
        <h2 style={{ ...display, fontSize: "var(--text-section)", fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.02em", color: "var(--color-ink)", marginBottom: "var(--space-md)" }}>
          Read anywhere
          <br />
          <span style={{ fontSize: "var(--text-lead)", fontWeight: 400, color: "var(--color-ink-2)" }}>
            Web, mobile, or API: the feed is open.
          </span>
        </h2>
        <p style={{ fontSize: "var(--text-lg)", lineHeight: 1.5, color: "var(--color-ink-2)", marginBottom: "var(--space-2xl)", maxWidth: "52ch", marginLeft: "auto", marginRight: "auto" }}>
          No account needed to browse. Sign up to follow stories, get drift alerts, and ask questions with cited answers.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "var(--space-md)", marginBottom: "var(--space-2xl)" }}>
          <Link
            to="/stories"
            style={{
              ...mono,
              fontSize: "var(--text-md)",
              fontWeight: 500,
              padding: "var(--space-sm) var(--space-xl)",
              borderRadius: "var(--radius-input)",
              background: "var(--color-ink)",
              color: "var(--color-paper)",
              textDecoration: "none",
              transition: "transform var(--dur-micro) var(--ease-out), box-shadow var(--dur-micro) var(--ease-out)",
              boxShadow: "inset 0 1px 0 var(--glint), 0 0 0 1px var(--color-rule), 0 3px 0 var(--color-rule)",
            }}
            onMouseDown={(e) => Object.assign(e.currentTarget.style, pressSpringStyle)}
            onMouseUp={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
            onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)}
            onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}
          >
            Open web feed
          </Link>
          <Link
            to="/signup"
            style={{
              ...mono,
              fontSize: "var(--text-md)",
              fontWeight: 500,
              padding: "var(--space-sm) var(--space-xl)",
              borderRadius: "var(--radius-input)",
              border: "1px solid var(--color-rule)",
              background: "transparent",
              color: "var(--color-ink)",
              textDecoration: "none",
              transition: "transform var(--dur-micro) var(--ease-out), background var(--dur-micro) var(--ease-out)",
            }}
            onMouseDown={(e) => Object.assign(e.currentTarget.style, pressSpringMicroStyle)}
            onMouseUp={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
            onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)}
            onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}
          >
            Create free account
          </Link>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: "var(--space-xl)", flexWrap: "wrap", opacity: 0.6 }}>
          <span style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.08em", color: "var(--color-muted)" }}>API access coming</span>
          <span style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.08em", color: "var(--color-muted)" }}>RSS feeds</span>
          <span style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.08em", color: "var(--color-muted)" }}>Email digests</span>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer style={{ paddingTop: "var(--space-3xl)", paddingBottom: "var(--space-2xl)", background: "var(--color-paper-2)", borderTop: "1px solid var(--color-rule)" }}>
      <div className="container" style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "var(--space-3xl)" }}>
        <div>
          <span style={{ ...display, fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--color-ink)" }}>
            ClearNews
          </span>
          <p style={{ fontSize: "var(--text-md)", lineHeight: 1.6, color: "var(--color-ink-2)", marginTop: "var(--space-lg)", maxWidth: "40ch" }}>
            News tracked over its whole life. Built on GDELT. Updated every 15 minutes.
          </p>
          <div style={{ marginTop: "var(--space-xl)", display: "flex", gap: "var(--space-lg)" }}>
            <a href="#" style={{ ...mono, fontSize: "var(--text-sm)", letterSpacing: "0.06em", color: "var(--color-muted)", textDecoration: "none", transition: "color var(--dur-micro) var(--ease-out)" }} onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)} onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}>Methodology</a>
            <a href="#" style={{ ...mono, fontSize: "var(--text-sm)", letterSpacing: "0.06em", color: "var(--color-muted)", textDecoration: "none", transition: "color var(--dur-micro) var(--ease-out)" }} onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)} onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}>Sources</a>
            <a href="#" style={{ ...mono, fontSize: "var(--text-sm)", letterSpacing: "0.06em", color: "var(--color-muted)", textDecoration: "none", transition: "color var(--dur-micro) var(--ease-out)" }} onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)} onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}>Contact</a>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-xl)" }}>
          <nav>
            <h4 style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.12em", color: "var(--color-accent)", textTransform: "uppercase", marginBottom: "var(--space-md)" }}>Product</h4>
            <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
              <li><Link to="/stories" style={{ ...mono, fontSize: "var(--text-sm)", color: "var(--color-ink-2)", textDecoration: "none", transition: "color var(--dur-micro) var(--ease-out)" }} onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)} onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}>All Stories</Link></li>
              <li><Link to="/search" style={{ ...mono, fontSize: "var(--text-sm)", color: "var(--color-ink-2)", textDecoration: "none", transition: "color var(--dur-micro) var(--ease-out)" }} onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)} onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}>Search</Link></li>
              <li><Link to="/analytics" style={{ ...mono, fontSize: "var(--text-sm)", color: "var(--color-ink-2)", textDecoration: "none", transition: "color var(--dur-micro) var(--ease-out)" }} onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)} onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}>Analytics</Link></li>
              <li><Link to="/chat" style={{ ...mono, fontSize: "var(--text-sm)", color: "var(--color-ink-2)", textDecoration: "none", transition: "color var(--dur-micro) var(--ease-out)" }} onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)} onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}>Ask AI</Link></li>
            </ul>
          </nav>
          <nav>
            <h4 style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.12em", color: "var(--color-accent)", textTransform: "uppercase", marginBottom: "var(--space-md)" }}>Account</h4>
            <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
              <li><Link to="/login" style={{ ...mono, fontSize: "var(--text-sm)", color: "var(--color-ink-2)", textDecoration: "none", transition: "color var(--dur-micro) var(--ease-out)" }} onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)} onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}>Log in</Link></li>
              <li><Link to="/signup" style={{ ...mono, fontSize: "var(--text-sm)", color: "var(--color-ink-2)", textDecoration: "none", transition: "color var(--dur-micro) var(--ease-out)" }} onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)} onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}>Sign up</Link></li>
              <li><Link to="/forgot-password" style={{ ...mono, fontSize: "var(--text-sm)", color: "var(--color-ink-2)", textDecoration: "none", transition: "color var(--dur-micro) var(--ease-out)" }} onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)} onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}>Reset password</Link></li>
            </ul>
          </nav>
          <nav>
            <h4 style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.12em", color: "var(--color-accent)", textTransform: "uppercase", marginBottom: "var(--space-md)" }}>Legal</h4>
            <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
              <li><a href="#" style={{ ...mono, fontSize: "var(--text-sm)", color: "var(--color-ink-2)", textDecoration: "none", transition: "color var(--dur-micro) var(--ease-out)" }} onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)} onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}>Privacy</a></li>
              <li><a href="#" style={{ ...mono, fontSize: "var(--text-sm)", color: "var(--color-ink-2)", textDecoration: "none", transition: "color var(--dur-micro) var(--ease-out)" }} onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)} onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}>Terms</a></li>
            </ul>
          </nav>
        </div>
      </div>
      <div className="container" style={{ marginTop: "var(--space-3xl)", paddingTop: "var(--space-xl)", borderTop: "1px solid var(--color-rule)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--space-md)" }}>
        <span style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.08em", color: "var(--color-muted)" }}>
          © 2026 CLEARNEWS  /  GDELT DATA  /  UPDATED EVERY 15 MIN
        </span>
        <span style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.08em", color: "var(--color-muted)" }}>
          Photographs: Wikimedia Commons (CC0/CC BY)
        </span>
      </div>
    </footer>
  );
}

export default function Landing() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--color-paper)", color: "var(--color-ink)" }}>
      <Nav />
      <main>
        <Hero />
        <ProductAtWork />
        <Features />
        <BeforeAfter />
        <Platforms />
      </main>
      <Footer />
      <script
        dangerouslySetInnerHTML={{
          __html: `
            window.hallmarkSlots = (m) => { for (const [k, v] of Object.entries(m)) { const s = document.querySelector('[data-slot="' + k + '"]'); if (!s) continue; const im = new Image(); im.src = typeof v === 'string' ? v : v.src; im.alt = (typeof v === 'object' && v.alt) || s.dataset.alt || ''; s.querySelectorAll(':scope > img').forEach((o) => o.remove()); s.prepend(im); } };
            document.querySelectorAll('[data-slot] img').forEach((i) => { if (i.complete && !i.naturalWidth) i.remove(); else i.addEventListener('error', () => i.remove(), { once: true }); });
          `,
        }}
      />
    </div>
  );
}
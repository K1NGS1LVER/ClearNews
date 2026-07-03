import { useEffect, useState } from "react";
import { Link, NavLink, Route, Routes } from "react-router-dom";
import Analytics from "./pages/Analytics";
import Article from "./pages/Article";
import Chat from "./pages/Chat";
import Feed from "./pages/Feed";
import Latest from "./pages/Latest";
import Search from "./pages/Search";
import Story from "./pages/Story";

type Theme = "light" | "dark";

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))];
}

const navItems = [
  { to: "/", label: "Stories", icon: "●", end: true },
  { to: "/latest", label: "Latest", icon: "≡", end: false },
  { to: "/search", label: "Search", icon: "⌕", end: false },
  { to: "/analytics", label: "Data", icon: "◔", end: false },
  { to: "/chat", label: "Ask", icon: "✦", end: false },
];

const pillStyle = ({ isActive }: { isActive: boolean }) => ({
  padding: "5px 11px",
  borderRadius: 8,
  fontWeight: isActive ? 600 : 400,
  background: isActive ? "var(--navpill)" : "transparent",
  color: isActive ? "var(--navpill-ink)" : "var(--ink-2)",
});

export default function App() {
  const [theme, toggleTheme] = useTheme();

  return (
    <>
      <header
        className="sticky top-0 z-10"
        style={{
          padding: "16px 20px 30px",
          marginBottom: -14,
          background: "var(--glass)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          maskImage: "linear-gradient(to bottom, black 0%, black 42%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 42%, transparent 100%)",
        }}
      >
        <div className="mx-auto flex max-w-4xl items-center gap-4">
          <Link
            to="/"
            style={{ fontFamily: "var(--font-serif)", fontWeight: 700, fontSize: 19, letterSpacing: "-0.01em", color: "var(--ink)" }}
          >
            ClearNews
          </Link>
          <span
            className="hidden sm:inline"
            style={{ fontFamily: "var(--font-mono)", fontSize: "9.5px", letterSpacing: "0.08em", color: "var(--ink-muted)" }}
          >
            LIFECYCLE &amp; DRIFT
          </span>
          <nav className="ml-auto hidden items-center gap-0.5 text-sm md:flex">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} style={pillStyle}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <button
            onClick={toggleTheme}
            className="ml-2 cursor-pointer md:ml-2"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.06em",
              fontWeight: 600,
              padding: "6px 11px",
              borderRadius: 8,
              border: "1px solid var(--hair)",
              background: "var(--surface-1)",
              color: "var(--ink)",
            }}
          >
            {theme === "dark" ? "☀ LIGHT" : "☾ DARK"}
          </button>
        </div>
      </header>

      <main className="pb-16 md:pb-0">
        <Routes>
          <Route path="/" element={<Feed />} />
          <Route path="/story/:id" element={<Story />} />
          <Route path="/article/:id" element={<Article />} />
          <Route path="/latest" element={<Latest />} />
          <Route path="/search" element={<Search />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/chat" element={<Chat />} />
        </Routes>
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-10 flex justify-around md:hidden"
        style={{
          padding: "11px 8px 14px",
          background: "var(--glass)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          maskImage: "linear-gradient(to top, black 0%, black 55%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to top, black 0%, black 55%, transparent 100%)",
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          letterSpacing: "0.04em",
        }}
      >
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className="flex flex-col items-center gap-0.5"
            style={({ isActive }) => ({
              color: isActive ? "var(--ink)" : "var(--ink-muted)",
              fontWeight: isActive ? 600 : 400,
            })}
          >
            <span style={{ fontSize: 13 }}>{item.icon}</span>
            {item.label.toUpperCase()}
          </NavLink>
        ))}
      </nav>
    </>
  );
}

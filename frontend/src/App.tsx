import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { logout } from "./api";
import { useMe } from "./auth";
import Analytics from "./pages/Analytics";
import Article from "./pages/Article";
import Chat from "./pages/Chat";
import Feed from "./pages/Feed";
import Loading from "./components/Loading";
import ForYou from "./pages/ForYou";
import Landing from "./pages/Landing";
import Latest from "./pages/Latest";
import Login from "./pages/Login";
import Search from "./pages/Search";
import Signup from "./pages/Signup";
import Story from "./pages/Story";
import Welcome from "./pages/Welcome";
import { useTheme } from "./theme";

const baseNavItems = [
  { to: "/stories", label: "Stories", icon: "●", end: true },
  { to: "/latest", label: "Latest", icon: "≡", end: false },
  { to: "/search", label: "Search", icon: "⌕", end: false },
  { to: "/analytics", label: "Data", icon: "◔", end: false },
  { to: "/chat", label: "Ask", icon: "✦", end: false },
];

const forYouItem = { to: "/foryou", label: "For You", icon: "★", end: false };

const pillStyle = ({ isActive }: { isActive: boolean }) => ({
  padding: "5px 11px",
  borderRadius: 8,
  fontWeight: isActive ? 600 : 400,
  background: isActive ? "var(--navpill)" : "transparent",
  color: isActive ? "var(--navpill-ink)" : "var(--ink-2)",
});

/** Signed-in users land on their personalized feed; signed-out users see the landing page. */
function Root() {
  const { data: me, isLoading } = useMe();
  if (isLoading) return <Loading />;
  if (me) return <Navigate to="/foryou" replace />;
  return <Landing />;
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useMe();
  if (isLoading) return <Loading />;
  if (!me) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const { pathname } = useLocation();
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const hideShell = pathname === "/" && !me;
  if (hideShell) {
    return (
      <Routes>
        <Route path="/" element={<Root />} />
      </Routes>
    );
  }

  async function onLogout() {
    await logout();
    await queryClient.invalidateQueries({ queryKey: ["me"] });
    navigate("/");
  }

  const navItems = me ? [forYouItem, ...baseNavItems] : baseNavItems;

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
          {me ? (
            <div className="ml-2 hidden items-center gap-2 md:flex">
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold"
                style={{ background: "var(--navpill)", color: "var(--navpill-ink)" }}
                title={me.display_name}
              >
                {me.display_name.charAt(0).toUpperCase()}
              </span>
              <button
                onClick={onLogout}
                className="cursor-pointer"
                style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em", color: "var(--ink-muted)" }}
              >
                LOG OUT
              </button>
            </div>
          ) : (
            <div className="ml-2 hidden items-center gap-2 md:flex">
              <Link to="/login" style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>
                Log in
              </Link>
              <Link
                to="/signup"
                className="rounded-lg px-3 py-1.5 text-sm font-semibold"
                style={{ background: "var(--navpill)", color: "var(--navpill-ink)" }}
              >
                Sign up
              </Link>
            </div>
          )}
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
          <Route path="/" element={<Root />} />
          <Route path="/stories" element={<Feed />} />
          <Route path="/story/:id" element={<Story />} />
          <Route path="/article/:id" element={<Article />} />
          <Route path="/latest" element={<Latest />} />
          <Route path="/search" element={<Search />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route
            path="/welcome"
            element={
              <RequireAuth>
                <Welcome />
              </RequireAuth>
            }
          />
          <Route
            path="/foryou"
            element={
              <RequireAuth>
                <ForYou />
              </RequireAuth>
            }
          />
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

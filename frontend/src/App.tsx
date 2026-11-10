import { type ReactNode } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useMe } from "./auth";
import { PageErrorBoundary } from "./components/ErrorBoundary";
import Analytics from "./pages/Analytics";
import Article from "./pages/Article";
import Chat from "./pages/Chat";
import Feed from "./pages/Feed";
import Loading from "./components/Loading";
import ForgotPassword from "./pages/ForgotPassword";
import ForYou from "./pages/ForYou";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import Search from "./pages/Search";
import Signup from "./pages/Signup";
import Story from "./pages/Story";
import Welcome from "./pages/Welcome";
import { Nav } from "./components/Nav";

const baseNavItems = [
  { to: "/stories", label: "Stories", icon: "●", end: true },
  { to: "/search", label: "Search", icon: "⌕", end: false },
  { to: "/analytics", label: "Data", icon: "◔", end: false },
  { to: "/chat", label: "Ask", icon: "✦", end: false },
];

const forYouItem = { to: "/foryou", label: "For You", icon: "★", end: false };

function page(name: string, element: ReactNode, resetKey: string) {
  return (
    <PageErrorBoundary name={name} resetKey={resetKey}>
      {element}
    </PageErrorBoundary>
  );
}

function Root() {
  const { data: me, isLoading } = useMe();
  if (isLoading) return <Loading />;
  if (me) return <Navigate to="/foryou" replace />;
  return <Landing />;
}

function NotFound() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col items-start gap-3 px-4 py-16 sm:px-8">
      <span style={{ fontFamily: "var(--font-outlier)", fontSize: 11, letterSpacing: "0.06em", color: "var(--color-muted)" }}>
        404
      </span>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: "var(--color-ink)" }}>
        Page not found
      </h1>
      <Link to="/" style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink)" }}>
        ← Back home
      </Link>
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useMe();
  if (isLoading) return <Loading />;
  if (!me) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function MobileNav({ me }: { me: { display_name: string } | null | undefined }) {
  const navItems = me ? [forYouItem, ...baseNavItems] : baseNavItems;
  const location = useLocation();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-10 flex justify-around md:hidden"
      style={{
        padding: "var(--space-sm) var(--space-md)",
        background: "var(--color-paper)",
        borderTop: "1px solid var(--color-rule)",
        boxShadow: "0 -4px 20px rgba(0,0,0,0.08)",
        fontFamily: "var(--font-outlier)",
        fontSize: 9,
        letterSpacing: "0.04em",
      }}
    >
      {navItems.map((item) => {
        const isActive = location.pathname === item.to || (item.to !== "/stories" && location.pathname.startsWith(item.to));
        return (
          <Link
            key={item.to}
            to={item.to}
            className="flex flex-col items-center gap-0.5"
            style={{
              color: isActive ? "var(--color-ink)" : "var(--color-muted)",
              fontWeight: isActive ? 600 : 400,
              textDecoration: "none",
              padding: "var(--space-xs)",
              borderRadius: "var(--radius-input)",
              background: isActive ? "var(--chip-center-bg)" : "transparent",
              transition: "color var(--dur-micro) var(--ease-out), background var(--dur-micro) var(--ease-out)",
            }}
          >
            <span style={{ fontSize: 13 }}>{item.icon}</span>
            {item.label.toUpperCase()}
          </Link>
        );
      })}
    </nav>
  );
}

export default function App() {
  const { data: me } = useMe();
  const { pathname } = useLocation();

  const hideShell = pathname === "/" && !me;
  if (hideShell) {
    return (
      <Routes>
        <Route path="/" element={page("Home", <Root />, pathname)} />
      </Routes>
    );
  }

  return (
    <>
      <Nav />
      <main style={{ paddingBottom: "var(--space-2xl)" }}>
        <Routes>
          <Route path="/" element={page("Home", <Root />, pathname)} />
          <Route path="/stories" element={page("Stories", <Feed />, pathname)} />
          <Route path="/story/:id" element={page("Story", <Story />, pathname)} />
          <Route path="/article/:id" element={page("Article", <Article />, pathname)} />
          <Route path="/search" element={page("Search", <Search />, pathname)} />
          <Route path="/analytics" element={page("Analytics", <Analytics />, pathname)} />
          <Route path="/chat" element={page("Chat", <Chat />, pathname)} />
          <Route path="/login" element={page("Login", <Login />, pathname)} />
          <Route path="/signup" element={page("Signup", <Signup />, pathname)} />
          <Route path="/forgot-password" element={page("ForgotPassword", <ForgotPassword />, pathname)} />
          <Route path="/reset-password" element={page("ResetPassword", <ResetPassword />, pathname)} />
          <Route
            path="/welcome"
            element={page(
              "Welcome",
              <RequireAuth>
                <Welcome />
              </RequireAuth>,
              pathname,
            )}
          />
          <Route
            path="/foryou"
            element={page(
              "For You",
              <RequireAuth>
                <ForYou />
              </RequireAuth>,
              pathname,
            )}
          />
          <Route path="*" element={page("NotFound", <NotFound />, pathname)} />
        </Routes>
      </main>
      <MobileNav me={me} />
    </>
  );
}
import { Link, NavLink, Route, Routes } from "react-router-dom";
import Analytics from "./pages/Analytics";
import Chat from "./pages/Chat";
import Feed from "./pages/Feed";
import Search from "./pages/Search";
import Story from "./pages/Story";

export default function App() {
  return (
    <>
      <header
        className="sticky top-0 z-10 border-b"
        style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
      >
        <div className="mx-auto flex max-w-4xl items-center gap-6 px-4 py-3">
          <Link to="/" className="text-lg font-bold tracking-tight">
            ClearNews
          </Link>
          <span className="text-xs" style={{ color: "var(--ink-muted)" }}>
            news story lifecycle &amp; narrative drift
          </span>
          <nav className="ml-auto flex gap-4 text-sm">
            <NavLink to="/" style={({ isActive }) => ({ fontWeight: isActive ? 600 : 400 })}>
              Feed
            </NavLink>
            <NavLink to="/search" style={({ isActive }) => ({ fontWeight: isActive ? 600 : 400 })}>
              Search
            </NavLink>
            <NavLink to="/analytics" style={({ isActive }) => ({ fontWeight: isActive ? 600 : 400 })}>
              Analytics
            </NavLink>
            <NavLink to="/chat" style={({ isActive }) => ({ fontWeight: isActive ? 600 : 400 })}>
              Ask
            </NavLink>
          </nav>
        </div>
      </header>
      <Routes>
        <Route path="/" element={<Feed />} />
        <Route path="/story/:id" element={<Story />} />
        <Route path="/search" element={<Search />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/chat" element={<Chat />} />
      </Routes>
    </>
  );
}

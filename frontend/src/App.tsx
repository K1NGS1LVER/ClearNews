import { Link, Route, Routes } from "react-router-dom";
import Feed from "./pages/Feed";
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
        </div>
      </header>
      <Routes>
        <Route path="/" element={<Feed />} />
        <Route path="/story/:id" element={<Story />} />
      </Routes>
    </>
  );
}

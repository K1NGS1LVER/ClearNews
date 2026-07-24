import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { resetPassword } from "../api";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await resetPassword(token, password);
      navigate("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setPending(false);
    }
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-sm px-4 pb-8 pt-10 sm:px-8">
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--ink)" }}>
          Invalid reset link
        </h1>
        <p className="mt-3 text-sm" style={{ color: "var(--ink-2)" }}>
          This link is missing its token. Request a new one below.
        </p>
        <Link to="/forgot-password" className="mt-5 inline-block text-sm font-medium underline" style={{ color: "var(--ink)" }}>
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm px-4 pb-8 pt-10 sm:px-8">
      <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--ink)" }}>
        Choose a new password
      </h1>
      <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit}>
        <label className="flex flex-col gap-1.5">
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.08em", color: "var(--ink-muted)" }}>
            NEW PASSWORD
          </span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg px-3.5 py-2.5 text-sm outline-none"
            style={{ border: "1px solid var(--input-border)", background: "var(--surface-1)", color: "var(--ink)" }}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.08em", color: "var(--ink-muted)" }}>
            CONFIRM PASSWORD
          </span>
          <input
            type="password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="rounded-lg px-3.5 py-2.5 text-sm outline-none"
            style={{ border: "1px solid var(--input-border)", background: "var(--surface-1)", color: "var(--ink)" }}
          />
        </label>
        {error && <p className="text-sm" style={{ color: "var(--bias-right)" }}>{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="mt-1 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-40"
          style={{ background: "var(--navpill)", color: "var(--navpill-ink)" }}
        >
          {pending ? "Saving…" : "Save new password"}
        </button>
      </form>
    </div>
  );
}

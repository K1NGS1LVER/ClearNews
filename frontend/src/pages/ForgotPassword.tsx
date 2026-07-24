import { useState } from "react";
import { Link } from "react-router-dom";
import { forgotPassword } from "../api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm px-4 pb-8 pt-10 sm:px-8">
      <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--ink)" }}>
        Reset your password
      </h1>

      {sent ? (
        <p className="mt-6 text-sm" style={{ color: "var(--ink-2)" }}>
          If an account exists for {email}, a reset link is on its way. Check your inbox.
        </p>
      ) : (
        <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit}>
          <label className="flex flex-col gap-1.5">
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.08em", color: "var(--ink-muted)" }}>
              EMAIL
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
            {pending ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}

      <p className="mt-5 text-sm" style={{ color: "var(--ink-muted)" }}>
        <Link to="/login" className="font-medium underline" style={{ color: "var(--ink)" }}>
          Back to log in
        </Link>
      </p>
    </div>
  );
}

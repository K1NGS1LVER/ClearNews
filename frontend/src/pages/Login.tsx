import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login } from "../api";

const mono = { fontFamily: "var(--font-outlier)" } as const;
const display = { fontFamily: "var(--font-display)" } as const;

const focusStyle = {
  outline: "2px solid var(--color-focus)",
  outlineOffset: "2px",
} as const;

const pressSpringStyle = {
  transform: "translateY(3px)",
  transition: "transform var(--dur-micro) var(--ease-out)",
} as const;

function InputField({ value, onChange, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      value={value}
      onChange={onChange}
      {...props}
      style={{
        background: "var(--color-paper)",
        border: "1.5px solid var(--color-rule)",
        borderRadius: "var(--radius-input)",
        fontSize: "var(--text-sm)",
        fontFamily: "var(--font-body)",
        color: "var(--color-ink)",
        padding: "var(--space-sm) var(--space-md)",
      }}
      onFocus={(e) => { Object.assign(e.currentTarget.style, focusStyle); e.currentTarget.style.borderColor = "var(--color-ink)"; }}
      onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; e.currentTarget.style.borderColor = "var(--color-rule)"; }}
    />
  );
}

function PrimaryButton({ children, onClick, disabled, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      {...props}
      style={{
        ...mono,
        fontSize: "var(--text-sm)",
        fontWeight: 500,
        padding: "var(--space-sm) var(--space-xl)",
        borderRadius: "var(--radius-input)",
        background: "var(--color-ink)",
        color: "var(--color-paper)",
        border: "none",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
        transition: "transform var(--dur-micro) var(--ease-out), box-shadow var(--dur-micro) var(--ease-out)",
        boxShadow: "inset 0 1px 0 var(--glint), 0 0 0 1px var(--color-rule), 0 3px 0 var(--color-rule)",
      }}
      onMouseDown={(e) => { if (!disabled) Object.assign(e.currentTarget.style, pressSpringStyle); }}
      onMouseUp={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
      onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)}
      onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}
    >
      {children}
    </button>
  );
}

function LinkButton({ children, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...props}
      style={{
        ...mono,
        fontSize: "var(--text-sm)",
        fontWeight: 500,
        color: "var(--color-muted)",
        background: "transparent",
        border: "none",
        cursor: "pointer",
        textDecoration: "underline",
        textDecorationStyle: "dotted",
        transition: "color var(--dur-micro) var(--ease-out)",
      }}
      onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)}
      onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}
    >
      {children}
    </button>
  );
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await login(email, password);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      navigate("/foryou");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-paper)", color: "var(--color-ink)", display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--space-2xl) var(--space-md)" }}>
      <div className="container" style={{ maxWidth: "400px", width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: "var(--space-xl)" }}>
          <h1 style={{ ...display, fontSize: "var(--text-section)", fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.02em", color: "var(--color-ink)", marginBottom: "var(--space-md)" }}>
            Log in
          </h1>
          <p style={{ fontSize: "var(--text-base)", color: "var(--color-muted)" }}>
            Welcome back to ClearNews
          </p>
        </div>

        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)" }}>
            <span style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.08em", color: "var(--color-muted)" }}>
              EMAIL
            </span>
            <InputField type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)" }}>
            <span style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.08em", color: "var(--color-muted)" }}>
              PASSWORD
            </span>
            <InputField type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div style={{ textAlign: "right" }}>
            <LinkButton onClick={() => navigate("/forgot-password")}>
              Forgot password?
            </LinkButton>
          </div>
          {error && <p style={{ fontSize: "var(--text-sm)", color: "var(--bias-right)" }}>{error}</p>}
          <PrimaryButton type="submit" disabled={pending} onClick={() => {}}>
            {pending ? "Logging in…" : "LOG IN"}
          </PrimaryButton>
        </form>

        <p style={{ marginTop: "var(--space-xl)", textAlign: "center", fontSize: "var(--text-sm)", color: "var(--color-muted)" }}>
          No account?{" "}
          <Link to="/signup" style={{ fontWeight: 500, color: "var(--color-ink)", textDecoration: "none", borderBottom: "1px solid currentColor", textDecorationSkipInk: "none", transition: "opacity var(--dur-micro) var(--ease-out)" }}>
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
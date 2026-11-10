import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "../theme";
import { useMe } from "../auth";
import { useQueryClient } from "@tanstack/react-query";
import { logout } from "../api";

const mono = { fontFamily: "var(--font-outlier)" } as const;
const display = { fontFamily: "var(--font-display)" } as const;

const baseNavItems = [
  { to: "/stories", label: "Stories", end: true },
  { to: "/search", label: "Search", end: false },
  { to: "/analytics", label: "Data", end: false },
  { to: "/chat", label: "Ask", end: false },
];

const forYouItem = { to: "/foryou", label: "For You", end: false };

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

export function Nav() {
  const [theme, toggleTheme] = useTheme();
  const { data: me } = useMe();
  const location = useLocation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const navItems = me ? [forYouItem, ...baseNavItems] : baseNavItems;

  const handleLogout = async () => {
    await logout();
    await queryClient.invalidateQueries({ queryKey: ["me"] });
    navigate("/");
  };

  return (
    <nav
      className="container"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: 72,
        paddingTop: "var(--space-md)",
        paddingBottom: "var(--space-md)",
      }}
    >
      <Link
        to="/"
        style={{
          ...display,
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: "var(--color-ink)",
          textDecoration: "none",
        }}
      >
        ClearNews
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-lg)" }}>
        <nav style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
          {navItems.map((item) => {
            const isActive = location.pathname === item.to || (item.to !== "/stories" && location.pathname.startsWith(item.to));
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                style={{
                  ...mono,
                  fontSize: "var(--text-sm)",
                  letterSpacing: "0.06em",
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? "var(--color-ink)" : "var(--color-muted)",
                  textDecoration: "none",
                  padding: "var(--space-xs) var(--space-sm)",
                  borderRadius: "var(--radius-input)",
                  transition: "color var(--dur-micro) var(--ease-out), background var(--dur-micro) var(--ease-out)",
                  background: isActive ? "var(--chip-center-bg)" : "transparent",
                }}
                onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)}
                onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}
              >
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <button
          onClick={toggleTheme}
          style={{
            ...mono,
            fontSize: "var(--text-xs)",
            letterSpacing: "0.08em",
            fontWeight: 500,
            padding: "var(--space-xs) var(--space-sm)",
            borderRadius: "var(--radius-input)",
            border: "1px solid var(--color-rule)",
            background: "transparent",
            color: "var(--color-ink)",
            cursor: "pointer",
            transition: "transform var(--dur-micro) var(--ease-out), background var(--dur-micro) var(--ease-out)",
          }}
          onMouseDown={(e) => Object.assign(e.currentTarget.style, pressSpringMicroStyle)}
          onMouseUp={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
          onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)}
          onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}
        >
          {theme === "dark" ? "☀ LIGHT" : "☾ DARK"}
        </button>

        {me ? (
          <button
            onClick={handleLogout}
            style={{
              ...mono,
              fontSize: "var(--text-xs)",
              letterSpacing: "0.08em",
              fontWeight: 500,
              padding: "var(--space-xs) var(--space-sm)",
              borderRadius: "var(--radius-input)",
              border: "1px solid var(--color-rule)",
              background: "transparent",
              color: "var(--color-ink)",
              cursor: "pointer",
              transition: "transform var(--dur-micro) var(--ease-out), background var(--dur-micro) var(--ease-out)",
            }}
            onMouseDown={(e) => Object.assign(e.currentTarget.style, pressSpringMicroStyle)}
            onMouseUp={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
            onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)}
            onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}
          >
            LOG OUT
          </button>
        ) : (
          <>
            <Link
              to="/login"
              style={{
                ...mono,
                fontSize: "var(--text-sm)",
                letterSpacing: "0.06em",
                fontWeight: 500,
                color: "var(--color-muted)",
                textDecoration: "none",
                padding: "var(--space-xs) var(--space-sm)",
                borderRadius: "var(--radius-input)",
                transition: "color var(--dur-micro) var(--ease-out)",
              }}
              onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)}
              onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}
            >
              Log in
            </Link>
            <Link
              to="/signup"
              style={{
                ...mono,
                fontSize: "var(--text-sm)",
                letterSpacing: "0.06em",
                fontWeight: 500,
                padding: "var(--space-xs) var(--space-lg)",
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
              Start free
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
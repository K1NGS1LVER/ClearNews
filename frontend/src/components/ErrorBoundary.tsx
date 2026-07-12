import { Component, type ComponentType, type ErrorInfo, type ReactNode } from "react";

type BoundaryKind = "page" | "component";

type ErrorBoundaryProps = {
  children: ReactNode;
  name?: string;
  kind?: BoundaryKind;
  resetKey?: string | number;
};

type ErrorBoundaryState = {
  error: Error | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Error boundary caught ${this.props.name ?? "a render error"}`, error, info);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <ErrorFallback
        error={this.state.error}
        kind={this.props.kind ?? "component"}
        name={this.props.name}
        onReset={this.reset}
      />
    );
  }
}

function ErrorFallback({
  error,
  kind,
  name,
  onReset,
}: {
  error: Error;
  kind: BoundaryKind;
  name?: string;
  onReset: () => void;
}) {
  const title = kind === "page" ? "This page hit a problem." : "This section hit a problem.";
  const label = name ? `${name} failed to render.` : "A render error stopped this view.";
  const compact = kind === "component";

  return (
    <div className={compact ? "rounded-lg border p-4" : "mx-auto max-w-4xl px-4 py-12 sm:px-8"}>
      <div
        className={compact ? "" : "rounded-xl border p-6"}
        style={{ background: "var(--surface-1)", borderColor: "var(--border)", color: "var(--ink)" }}
        role="alert"
      >
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.08em",
            color: "var(--bias-right)",
          }}
        >
          RENDER ERROR
        </p>
        <h2
          className="mt-1"
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: compact ? 17 : 24,
            fontWeight: 700,
            color: "var(--ink)",
          }}
        >
          {title}
        </h2>
        <p className="mt-2 text-sm" style={{ color: "var(--ink-2)" }}>
          {label}
        </p>
        <p className="mt-2 break-words text-xs" style={{ color: "var(--ink-muted)" }}>
          {error.message}
        </p>
        <button
          type="button"
          onClick={onReset}
          className="mt-4 rounded-lg px-3 py-1.5 text-sm font-semibold hover:opacity-80"
          style={{ background: "var(--navpill)", color: "var(--navpill-ink)" }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export function PageErrorBoundary({
  children,
  name,
  resetKey,
}: {
  children: ReactNode;
  name: string;
  resetKey?: string | number;
}) {
  return (
    <ErrorBoundary name={name} kind="page" resetKey={resetKey}>
      {children}
    </ErrorBoundary>
  );
}

export function ComponentErrorBoundary({ children, name }: { children: ReactNode; name: string }) {
  return (
    <ErrorBoundary name={name} kind="component">
      {children}
    </ErrorBoundary>
  );
}

export function withErrorBoundary<P extends object>(Wrapped: ComponentType<P>, name = Wrapped.displayName ?? Wrapped.name) {
  function ComponentWithErrorBoundary(props: P) {
    return (
      <ComponentErrorBoundary name={name}>
        <Wrapped {...props} />
      </ComponentErrorBoundary>
    );
  }

  ComponentWithErrorBoundary.displayName = `withErrorBoundary(${name})`;
  return ComponentWithErrorBoundary;
}

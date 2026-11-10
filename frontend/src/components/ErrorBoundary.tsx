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

  const mono = { fontFamily: "var(--font-outlier)" } as const;
  const body = { fontFamily: "var(--font-body)" } as const;
  const display = { fontFamily: "var(--font-display)" } as const;

  return (
    <div className={compact ? "rounded-md border p-4" : "mx-auto max-w-3xl px-4 py-12 sm:px-8"}>
      <div
        className={compact ? "" : "rounded-lg border p-6"}
        style={{ background: "var(--color-paper)", borderColor: "var(--color-rule)", color: "var(--color-ink)", borderRadius: "var(--radius-card)" }}
        role="alert"
      >
        <p style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.08em", color: "var(--bias-right)" }}>
          RENDER ERROR
        </p>
        <h2 className="mt-1" style={{ ...display, fontSize: compact ? "var(--text-lg)" : "var(--text-2xl)", fontWeight: 700, color: "var(--color-ink)" }}>
          {title}
        </h2>
        <p className="mt-2" style={{ ...body, fontSize: "var(--text-sm)", color: "var(--color-ink-2)" }}>
          {label}
        </p>
        <p className="mt-2 break-words" style={{ ...mono, fontSize: "var(--text-xs)", color: "var(--color-muted)" }}>
          {error.message}
        </p>
        <button
          type="button"
          onClick={onReset}
          className="mt-4 inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold cursor-pointer transition-[background,color] hover:opacity-80 active:scale-[0.98]"
          style={{
            background: "var(--color-ink)",
            color: "var(--color-paper)",
            borderRadius: "var(--radius-input)",
            padding: "var(--space-sm) var(--space-lg)",
            fontSize: "var(--text-sm)",
            fontFamily: "var(--font-body)",
            fontWeight: 500,
            boxShadow: "inset 0 1px 0 var(--glint), 0 0 0 1px var(--color-rule), 0 3px 0 var(--color-rule)",
          }}
          onMouseDown={(e) => { e.currentTarget.style.transform = "translateY(1px)"; }}
          onMouseUp={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
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

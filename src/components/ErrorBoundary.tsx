"use client";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorState } from "./ui";
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("The Gathering render error", error, info.componentStack);
  }
  render() {
    if (this.state.failed)
      return (
        <main className="page">
          <ErrorState onRetry={() => window.location.reload()} />
        </main>
      );
    return this.props.children;
  }
}

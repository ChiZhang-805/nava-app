import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface ErrorBoundaryState {
  error: Error | null;
}

export default class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("NAVA runtime error", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="app-screen centered-screen">
        <div className="brand-mark warn">
          <AlertTriangle size={28} />
        </div>
        <h1>页面出现异常</h1>
        <p className="muted">{this.state.error.message || "请刷新后重试。"}</p>
        <button className="action-button" type="button" onClick={() => window.location.reload()}>
          <RotateCcw size={18} />
          <span>重新加载</span>
        </button>
      </main>
    );
  }
}


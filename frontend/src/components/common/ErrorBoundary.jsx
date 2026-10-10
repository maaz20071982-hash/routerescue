import React from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("RouteRescue ErrorBoundary caught an error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // Ignore storage clear errors
    }
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#f8fafc",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
            padding: "24px",
            boxSizing: "border-box"
          }}
        >
          <div
            style={{
              maxWidth: "540px",
              width: "100%",
              backgroundColor: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              boxShadow: "0 10px 25px -5px rgba(15, 23, 42, 0.1)",
              padding: "32px",
              textAlign: "center"
            }}
          >
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                backgroundColor: "#fef2f2",
                color: "#dc2626",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "20px"
              }}
            >
              <AlertTriangle size={32} />
            </div>

            <h1
              style={{
                fontSize: "20px",
                fontWeight: 700,
                color: "#0f172a",
                margin: "0 0 8px 0"
              }}
            >
              RouteRescue View Encountered an Issue
            </h1>

            <p
              style={{
                fontSize: "14px",
                color: "#475569",
                lineHeight: 1.6,
                margin: "0 0 20px 0"
              }}
            >
              An unexpected display error occurred while rendering the coordination interface.
              The application state can be refreshed immediately below.
            </p>

            {this.state.error && (
              <div
                style={{
                  backgroundColor: "#f1f5f9",
                  borderRadius: "6px",
                  padding: "12px 16px",
                  textAlign: "left",
                  fontSize: "12px",
                  fontFamily: "monospace",
                  color: "#991b1b",
                  marginBottom: "24px",
                  overflowX: "auto",
                  border: "1px solid #cbd5e1",
                  maxHeight: "120px"
                }}
              >
                {this.state.error.toString()}
              </div>
            )}

            <div
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "center",
                flexWrap: "wrap"
              }}
            >
              <button
                onClick={this.handleReload}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 20px",
                  backgroundColor: "#0f2942",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "6px",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                <RefreshCw size={16} />
                Reload Application
              </button>

              <button
                onClick={this.handleReset}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 20px",
                  backgroundColor: "#ffffff",
                  color: "#0f2942",
                  border: "1px solid #cbd5e1",
                  borderRadius: "6px",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: "pointer"
                }}
              >
                <Home size={16} />
                Reset Application State
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from "react";

import "./AppErrorBoundary.css";

type AppErrorBoundaryProps = {
  children:
    ReactNode;
};

type AppErrorBoundaryState = {
  hasError:
    boolean;

  message:
    string;
};

export default class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state:
    AppErrorBoundaryState =
    {
      hasError:
        false,

      message:
        "",
    };

  static getDerivedStateFromError(
    error:
      Error,
  ): AppErrorBoundaryState {
    return {
      hasError:
        true,

      message:
        error.message,
    };
  }

  componentDidCatch(
    error:
      Error,
    info:
      ErrorInfo,
  ) {
    console.error(
      "Flamingo application error:",
      error,
      info.componentStack,
    );
  }

  private reload =
    () => {
      window.location.reload();
    };

  private resetLocalUi =
    () => {
      const confirmed =
        window.confirm(
          "Reset only Flamingo UI layout preferences? Music library and performance history will not be deleted.",
        );

      if (!confirmed) {
        return;
      }

      localStorage.removeItem(
        "flamingo-dj-track-column-order",
      );

      localStorage.removeItem(
        "flamingo-dj-track-column-widths",
      );

      window.location.reload();
    };

  render() {
    if (
      !this.state.hasError
    ) {
      return this.props.children;
    }

    return (
      <main className="app-error-boundary">
        <section>
          <span>
            FLAMINGO RECOVERY
          </span>

          <h1>
            Flamingo encountered an application error
          </h1>

          <p>
            Your browser data has not been automatically deleted.
            Reload first. If the problem is related to the table
            layout, you can reset only the UI layout preferences.
          </p>

          <code>
            {this.state.message ||
              "Unknown application error"}
          </code>

          <div>
            <button
              type="button"
              onClick={
                this.reload
              }
            >
              Reload App
            </button>

            <button
              type="button"
              onClick={
                this.resetLocalUi
              }
            >
              Reset UI Layout
            </button>
          </div>
        </section>
      </main>
    );
  }
}

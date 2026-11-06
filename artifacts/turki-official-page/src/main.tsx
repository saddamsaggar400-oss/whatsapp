import { createRoot } from "react-dom/client";

import App from "./App";
import {
  ErrorBoundary,
  type ErrorFallbackProps,
} from "@/components/error-boundary";

function ChatFallback({ resetError }: ErrorFallbackProps) {
  return (
    <div className="boot-screen" dir="rtl">
      <h1>تعذّر عرض المحادثة</h1>
      <p>حاول فتحها مجددًا.</p>
      <button className="primary-button" onClick={resetError}>
        إعادة المحاولة
      </button>
    </div>
  );
}

createRoot(document.getElementById("root")!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary FallbackComponent={ChatFallback}>
    <App />
  </ErrorBoundary>,
);

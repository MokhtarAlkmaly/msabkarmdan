import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Register service worker after React app is mounted
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    import('./registerSW');
  });
}

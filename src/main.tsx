const DEV_SW_CLEANUP_MARKER = "ramadan-competition-dev-sw-cleaned";

const clearDevServiceWorker = async () => {
  if (!import.meta.env.DEV || !("serviceWorker" in navigator)) return;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));

    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }

    if (navigator.serviceWorker.controller && sessionStorage.getItem(DEV_SW_CLEANUP_MARKER) !== "1") {
      sessionStorage.setItem(DEV_SW_CLEANUP_MARKER, "1");
      window.location.reload();
      await new Promise(() => undefined);
    }
  } catch (error) {
    console.warn("تعذر تنظيف كاش التطوير", error);
  }
};

const mountApp = async () => {
  const [{ StrictMode }, { createRoot }, { default: App }] = await Promise.all([
    import("react"),
    import("react-dom/client"),
    import("./App.tsx"),
    import("./index.css"),
  ]);

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );

  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      import("./registerSW");
    });
  }
};

clearDevServiceWorker().then(mountApp);

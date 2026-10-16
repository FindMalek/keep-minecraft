import { type MouseEvent, useSyncExternalStore } from "react";

const NAVIGATE = "keep:navigate";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener(NAVIGATE, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(NAVIGATE, onChange);
  };
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
}

/** Click handler for in-app links; leaves cmd/ctrl-click to the browser. */
export function navigate(event: MouseEvent<HTMLAnchorElement>): void {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
  event.preventDefault();
  const href = event.currentTarget.getAttribute("href");
  if (!href || href === window.location.pathname) return;
  window.history.pushState(null, "", href);
  window.dispatchEvent(new Event(NAVIGATE));
  window.scrollTo(0, 0);
}

import { useEffect, useRef } from "react";

/**
 * Re-runs `callback` on an interval so a view reflects other people's changes
 * without the user reloading — a farmer sees a claim get confirmed, a trader
 * sees a newly submitted claim.
 *
 * Skips a tick while the tab is hidden (no point polling a background tab) and
 * fires once immediately on becoming visible again, so returning to the tab
 * shows current data rather than up-to-interval-stale data.
 *
 * `enabled` is how callers pause polling — e.g. while a dialog is open, so a
 * refresh cannot pull the row out from under someone mid-edit.
 */
export function usePolling(callback: () => void, intervalMs: number, enabled = true) {
  // Kept in a ref so a caller passing an inline arrow doesn't restart the
  // interval on every render.
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      if (document.visibilityState === "visible") callbackRef.current();
    };
    const id = setInterval(tick, intervalMs);

    const onVisible = () => {
      if (document.visibilityState === "visible") callbackRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, enabled]);
}

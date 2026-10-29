import { useCallback, useRef, useState } from "react";

/**
 * Tracks which child rows are mid-action (dialog open, confirm in flight) so
 * a parent can pause polling while ANY of them is — a refresh must not pull a
 * card out from under someone editing it.
 *
 * `handlerFor(id)` returns the same function for the same id across renders,
 * so a child's `useEffect([busy, onBusyChange])` doesn't re-fire every render.
 */
export function useBusyTracker() {
  const busyIds = useRef(new Set<string>());
  const handlers = useRef(new Map<string, (busy: boolean) => void>());
  const [anyBusy, setAnyBusy] = useState(false);

  const handlerFor = useCallback((id: string) => {
    let handler = handlers.current.get(id);
    if (!handler) {
      handler = (busy: boolean) => {
        if (busy) busyIds.current.add(id);
        else busyIds.current.delete(id);
        setAnyBusy(busyIds.current.size > 0);
      };
      handlers.current.set(id, handler);
    }
    return handler;
  }, []);

  return { anyBusy, handlerFor };
}

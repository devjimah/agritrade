/**
 * "full": the whole trader desk. "lite": a single voice-first chat screen for
 * traders who don't read or write comfortably. Chosen once per device on the
 * welcome screen and switchable from either version's menu.
 */
export type AppMode = "full" | "lite";

const MODE_KEY = "agritrade_app_mode";
/** Fallback when storage is blocked, so the choice still holds until reload. */
let memoryMode: AppMode | null = null;

/** Phones and small tablets get the welcome screen; desktops go straight to the full desk. */
const SMALL_SCREEN_QUERY = "(max-width: 1023px)";

export function getAppMode(): AppMode | null {
  try {
    const raw = localStorage.getItem(MODE_KEY);
    return raw === "full" || raw === "lite" ? raw : memoryMode;
  } catch {
    return memoryMode;
  }
}

export function setAppMode(mode: AppMode) {
  memoryMode = mode;
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Blocked storage: memoryMode keeps the choice for this visit.
  }
}

export function isSmallScreen(): boolean {
  return typeof window !== "undefined" && window.matchMedia(SMALL_SCREEN_QUERY).matches;
}

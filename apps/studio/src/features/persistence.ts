// localStorage persistence for Studio scenarios
// Auto-save on changes, auto-load on startup

const STORAGE_KEY = "orgchart_studio_state";

export interface PersistedState {
  scenarios: unknown[];
  activeScenarioId: string | null;
  layoutDirection: string;
  lang: string;
}

/** Save state to localStorage */
export function saveState(state: PersistedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage full or unavailable — silently fail
  }
}

/** Load state from localStorage */
export function loadState(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.scenarios)) {
      return parsed as PersistedState;
    }
    return null;
  } catch {
    return null;
  }
}

/** Clear saved state */
export function clearState(): void {
  localStorage.removeItem(STORAGE_KEY);
}

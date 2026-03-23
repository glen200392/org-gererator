// localStorage persistence for Studio scenarios
// Auto-save on changes, auto-load on startup

const STORAGE_KEY = "orgchart_studio_state";
const SCHEMA_VERSION = 1;

export interface PersistedState {
  version?: number;
  scenarios: unknown[];
  activeScenarioId: string | null;
  layoutDirection: string;
  lang: string;
}

/** Save state to localStorage (includes schema version for future migration) */
export function saveState(state: PersistedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, version: SCHEMA_VERSION }));
  } catch {
    // localStorage full or unavailable — silently fail
  }
}

/** Load state from localStorage. Returns null if missing, corrupt, or incompatible version. */
export function loadState(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.scenarios)) return null;
    // Version check — discard data from incompatible future versions
    if (parsed.version !== undefined && parsed.version > SCHEMA_VERSION) {
      return null;
    }
    return parsed as PersistedState;
  } catch {
    return null;
  }
}

/** Clear saved state */
export function clearState(): void {
  localStorage.removeItem(STORAGE_KEY);
}

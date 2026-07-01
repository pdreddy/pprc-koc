import { create } from 'zustand';

/**
 * Central app store — replaces 10+ props drilled from Shell to every page.
 * Shell writes via setters; pages read via selectors (only re-render on
 * the slice of state they actually use).
 */
const useAppStore = create((set) => ({
  // ── Data ──────────────────────────────────────────────────────────────
  teams: {},
  matches: [],
  adminConfig: { password: '', users: {} },
  schedule: {},
  lineupSubmissionMeta: {},
  ownLineupSubmissions: {},
  revealedScheduleSubmissions: {},
  revealedLineups: {},
  settings: {},
  loaded: false,
  lastRefreshed: 0,

  // ── Setters (called by Shell's Firebase onValue callbacks) ────────────
  setTeams:   (teams)   => set({ teams }),
  setMatches: (matches) => set({ matches }),
  setAdminConfig: (updater) =>
    set((s) => ({ adminConfig: typeof updater === 'function' ? updater(s.adminConfig) : updater })),
  setSchedule: (schedule) => set({ schedule }),
  setLineupSubmissionMeta: (lineupSubmissionMeta) => set({ lineupSubmissionMeta }),
  setOwnLineupSubmissions: (ownLineupSubmissions) => set({ ownLineupSubmissions }),
  setRevealedScheduleSubmissions: (updater) =>
    set((s) => ({
      revealedScheduleSubmissions:
        typeof updater === 'function' ? updater(s.revealedScheduleSubmissions) : updater,
    })),
  setRevealedLineups: (revealedLineups) => set({ revealedLineups }),
  setSettings: (settings) => set({ settings }),
  setLoaded:   (loaded)   => set({ loaded }),
  setLastRefreshed: (lastRefreshed) => set({ lastRefreshed }),
  touchLastRefreshed: () => set({ lastRefreshed: Date.now() }),
}));

export default useAppStore;

// ── Selectors ─────────────────────────────────────────────────────────────
// Import these in page components to avoid subscribing to the entire store.
// e.g.  const teams = useAppStore(selectTeams);
export const selectTeams    = (s) => s.teams;
export const selectMatches  = (s) => s.matches;
export const selectSchedule = (s) => s.schedule;
export const selectSettings = (s) => s.settings;
export const selectLoaded   = (s) => s.loaded;
export const selectAdminConfig = (s) => s.adminConfig;
export const selectLineupSubmissionMeta = (s) => s.lineupSubmissionMeta;
export const selectRevealedScheduleSubmissions = (s) => s.revealedScheduleSubmissions;
export const selectRevealedLineups = (s) => s.revealedLineups;
export const selectLastRefreshed = (s) => s.lastRefreshed;

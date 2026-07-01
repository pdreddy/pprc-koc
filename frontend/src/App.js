import React, { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, startTransition } from 'react';
import useAppStore from './store/appStore';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { onValue, ref, set, get, update } from 'firebase/database';
import { db, ensureAuth, PATHS } from './firebase';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ROLES, hasRole } from './utils/roles';
import { buildInitialTeams, canonicalizeTeamsData, canonicalTeamIdentityUpdates, DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_USERS, normalizeAdminUsername } from './data/initialTeams';
import { buildUtrRatingsTable } from './data/utrRatings';
import { sortByGroupOrder } from './data/auctionTeams';
import { auctionPlayerRatingUpdates, buildAuctionPlayerRatingsTable } from './data/auctionPlayers';
import { buildScheduleFor8x2, KOC3_SCHEDULE_VERSION } from './utils/roundRobin';
import { DEFAULT_ELIGIBILITY_RULES, normalizeEligibilityRules } from './utils/eligibilityRules';

import BottomNav from './components/BottomNav';
import AppHeader from './components/Header';
import { writeAuditLog } from './services/AuditService';

const pageImports = {
  Home:      () => import('./pages/Home'),
  Teams:     () => import('./pages/Teams'),
  Standings: () => import('./pages/Standings'),
  History:   () => import('./pages/History'),
  Login:     () => import('./pages/Login'),
  Admin:     () => import('./pages/Admin'),
  ScoreEntry:() => import('./pages/ScoreEntry'),
  Rules:     () => import('./pages/Rules'),
  Schedule:  () => import('./pages/Schedule'),
  Matchups:  () => import('./pages/Matchups'),
  More:      () => import('./pages/More'),
  AuditLogs: () => import('./pages/AuditLogs'),
};

const Home       = lazy(pageImports.Home);
const Teams      = lazy(pageImports.Teams);
const Standings  = lazy(pageImports.Standings);
const History    = lazy(pageImports.History);
const Login      = lazy(pageImports.Login);
const Admin      = lazy(pageImports.Admin);
const ScoreEntry = lazy(pageImports.ScoreEntry);
const Rules      = lazy(pageImports.Rules);
const Schedule   = lazy(pageImports.Schedule);
const Matchups   = lazy(pageImports.Matchups);
const More       = lazy(pageImports.More);
const AuditLogs  = lazy(pageImports.AuditLogs);

// Prefetch all route chunks during browser idle time after first paint
// so subsequent navigations are instant (chunk already in cache)
if (typeof requestIdleCallback !== 'undefined') {
  requestIdleCallback(() => {
    Object.values(pageImports).forEach((imp) => imp().catch(() => {}));
  }, { timeout: 4000 });
} else {
  setTimeout(() => {
    Object.values(pageImports).forEach((imp) => imp().catch(() => {}));
  }, 2000);
}

function firebaseObjectToList(data, source) {
  if (!data) return [];
  const node = data.matches || data.matchResults || data.results || data;
  if (Array.isArray(node)) {
    return node.filter(Boolean).map((m, idx) => ({ id: m.id || `${source}-${idx}`, source, ...m }));
  }
  if (typeof node === 'object') {
    const direct = Object.entries(node).map(([id, m]) => ({ id, source, ...(m || {}) }));
    const hasMatchShape = direct.some(m => m.lines || m.t1 || m.t2 || m.t1Id || m.t2Id || m.winnerId || m.win);
    if (hasMatchShape) return direct;
    return Object.entries(node).flatMap(([groupId, child]) =>
      firebaseObjectToList(child, source).map(m => ({ ...m, id: `${groupId}-${m.id}` }))
    );
  }
  return [];
}

// Thin chrome wrapper — only re-renders on pathname change
function ChromeWrapper({ children }) {
  const location = useLocation();
  const hideChrome = location.pathname === '/login';
  return (
    <div className="app-shell">
      <RouteProgress />
      <ActivityAudit />
      {!hideChrome && <AppHeader />}
      {children}
      {!hideChrome && <BottomNav />}
    </div>
  );
}

function Shell() {
  const { session, refreshTeamSession } = useAuth();

  // Read from Zustand store (each selector is stable — only re-renders when that slice changes)
  const teams                      = useAppStore(s => s.teams);
  const matches                    = useAppStore(s => s.matches);
  const adminConfig                = useAppStore(s => s.adminConfig);
  const schedule                   = useAppStore(s => s.schedule);
  const lineupSubmissionMeta       = useAppStore(s => s.lineupSubmissionMeta);
  const ownLineupSubmissions       = useAppStore(s => s.ownLineupSubmissions);
  const revealedScheduleSubmissions= useAppStore(s => s.revealedScheduleSubmissions);
  const revealedLineups            = useAppStore(s => s.revealedLineups);
  const lastRefreshed              = useAppStore(s => s.lastRefreshed);
  const settings                   = useAppStore(s => s.settings);
  const loaded                     = useAppStore(s => s.loaded);
  const connectionError            = useAppStore(s => s.connectionError);

  // Write to Zustand store
  const setTeams                       = useAppStore(s => s.setTeams);
  const setMatches                     = useAppStore(s => s.setMatches);
  const setAdminConfig                 = useAppStore(s => s.setAdminConfig);
  const setSchedule                    = useAppStore(s => s.setSchedule);
  const setLineupSubmissionMeta        = useAppStore(s => s.setLineupSubmissionMeta);
  const setOwnLineupSubmissions        = useAppStore(s => s.setOwnLineupSubmissions);
  const setRevealedScheduleSubmissions = useAppStore(s => s.setRevealedScheduleSubmissions);
  const setRevealedLineups             = useAppStore(s => s.setRevealedLineups);
  const setLastRefreshed               = useAppStore(s => s.setLastRefreshed);
  const setSettings                    = useAppStore(s => s.setSettings);
  const setLoaded                      = useAppStore(s => s.setLoaded);
  const touchLastRefreshed             = useAppStore(s => s.touchLastRefreshed);
  const setConnectionError             = useAppStore(s => s.setConnectionError);

  const visibleLineupSubmissions = useMemo(() => {
    const merged = Object.fromEntries(Object.entries(lineupSubmissionMeta || {}).map(([scheduleId, submissions]) => [scheduleId, { ...(submissions || {}) }]));
    Object.entries(revealedScheduleSubmissions || {}).forEach(([scheduleId, submissions]) => {
      if (!submissions) return;
      merged[scheduleId] = { ...(merged[scheduleId] || {}), ...submissions };
    });
    Object.entries(ownLineupSubmissions || {}).forEach(([scheduleId, submission]) => {
      if (!submission || !session?.teamId) return;
      merged[scheduleId] = { ...(merged[scheduleId] || {}), [session.teamId]: submission };
    });
    return merged;
  }, [lineupSubmissionMeta, revealedScheduleSubmissions, ownLineupSubmissions, session?.teamId]);

  // Defer heavy props — nav clicks paint the chrome immediately, data updates follow
  const deferredMatches        = useDeferredValue(matches);
  const deferredSchedule       = useDeferredValue(schedule);
  const deferredLineups        = useDeferredValue(visibleLineupSubmissions);
  const deferredRevealedLineups= useDeferredValue(revealedLineups);
  const deferredTeams          = useDeferredValue(teams);


  const syncSavedMatch = useCallback((record) => {
    if (!record?.id) return;
    useAppStore.setState(s => {
      const next = [record, ...s.matches.filter(m => m.id !== record.id)];
      next.sort((a, b) => (b.ts || 0) - (a.ts || 0));
      return { matches: next };
    });
  }, []);

  const syncDeletedMatch = useCallback((matchId) => {
    if (!matchId) return;
    useAppStore.setState(s => ({ matches: s.matches.filter(m => m.id !== matchId) }));
  }, []);

  // One-time seeding on mount — does not need to re-run when session changes
  useEffect(() => {
    (async () => {
      try {
        await ensureAuth();

        // Fetch all independent paths in parallel — reduces startup from 6 serial RTTs to 2
        const [tSnap, aSnap, auSnap, settingsSnap, rSnap, sSnap] = await Promise.all([
          get(ref(db, PATHS.teams)),
          get(ref(db, PATHS.admin)),
          get(ref(db, PATHS.adminUsers)),
          get(ref(db, PATHS.settings)),
          get(ref(db, PATHS.playerRatings)),
          get(ref(db, PATHS.schedule)),
        ]);

        // Teams — seed or migrate
        let teamsData;
        if (!tSnap.exists()) {
          teamsData = buildInitialTeams();
          await set(ref(db, PATHS.teams), teamsData);
        } else {
          teamsData = tSnap.val() || {};
          const updates = {};
          const sortedIds = Object.keys(teamsData).sort((a, b) => (teamsData[a].gradient || 0) - (teamsData[b].gradient || 0));
          sortedIds.forEach((tid, idx) => {
            if (!teamsData[tid].group) {
              const g = idx < 8 ? 'A' : 'B';
              updates[`${tid}/group`] = g;
              teamsData[tid].group = g;
            }
          });
          Object.assign(updates, canonicalTeamIdentityUpdates(teamsData));
          if (Object.keys(updates).length > 0) {
            Object.entries(updates).forEach(([path, value]) => {
              const [teamId, field] = path.split('/');
              if (teamId && field && teamsData[teamId]) teamsData[teamId][field] = value;
            });
            await update(ref(db, PATHS.teams), updates);
          }
        }

        // Admin password
        if (!aSnap.exists()) {
          await set(ref(db, PATHS.admin), { password: DEFAULT_ADMIN_PASSWORD });
        }

        // Admin users
        const adminUsers = auSnap.val() || {};
        const existingAdminUsers = Object.keys(adminUsers).reduce((lookup, username) => {
          lookup[normalizeAdminUsername(username)] = true;
          return lookup;
        }, {});
        const missingAdminUsers = Object.entries(DEFAULT_ADMIN_USERS).reduce((updates, [username, user]) => {
          if (!existingAdminUsers[username]) updates[username] = user;
          return updates;
        }, {});
        if (Object.keys(missingAdminUsers).length > 0) {
          await update(ref(db, PATHS.adminUsers), missingAdminUsers);
        }

        // Settings
        if (!settingsSnap.exists()) {
          await set(ref(db, PATHS.settings), { eligibilityRules: DEFAULT_ELIGIBILITY_RULES });
        }

        // Player ratings
        if (!rSnap.exists()) {
          await set(ref(db, PATHS.playerRatings), { ...buildUtrRatingsTable(), ...buildAuctionPlayerRatingsTable() });
        } else {
          await update(ref(db, PATHS.playerRatings), auctionPlayerRatingUpdates());
        }

        // Schedule — seed if missing or stale
        const scheduleData = sSnap.val() || {};
        const scheduleMatches = Object.values(scheduleData).filter(item => item?.type !== 'buffer');
        const shouldSeedSchedule = !sSnap.exists() || scheduleMatches.length === 0 || scheduleMatches.some(item => item?.scheduleVersion !== KOC3_SCHEDULE_VERSION);
        if (shouldSeedSchedule) {
          const list = Object.values(buildInitialTeams()).map(canonical => ({
            ...canonical,
            ...(teamsData[canonical.id] || {}),
            group: canonical.group,
            groupOrder: canonical.groupOrder
          }));
          const groupA = list.filter(t => (t.group || 'A') === 'A').sort(sortByGroupOrder);
          const groupB = list.filter(t => t.group === 'B').sort(sortByGroupOrder);
          if (groupA.length === 8 && groupB.length === 8) {
            const fixtures = buildScheduleFor8x2(groupA, groupB);
            await set(ref(db, PATHS.schedule), fixtures);
          }
        }
      } catch (e) {
        console.error('Seed failed', e);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Public data subscriptions — stable for the lifetime of the app; session changes must not tear these down
  useEffect(() => {
    // Surfaces read failures (e.g. Firebase Auth misconfigured, so rules reject
    // unauthenticated reads) as a visible banner instead of an infinite silent spinner.
    const onSubscriptionError = (error) => {
      console.error('Failed to read from database', error);
      setConnectionError(
        error?.code === 'PERMISSION_DENIED'
          ? 'Unable to load data: access was denied. This app requires Firebase Anonymous Authentication to be enabled for this project.'
          : 'Unable to load data. Please check your connection and try again.'
      );
    };
    ensureAuth();
    const unsubT = onValue(ref(db, PATHS.teams), (snap) => {
      startTransition(() => {
        setTeams(canonicalizeTeamsData(snap.val() || {}));
        setLoaded(true);
        setConnectionError(null);
      });
    }, onSubscriptionError);
    const unsubM = onValue(ref(db, PATHS.matches), (snap) => {
      const data = snap.val() || {};
      const list = Object.entries(data).map(([id, m]) => ({ id, ...m }));
      list.sort((a, b) => (b.ts || 0) - (a.ts || 0));
      startTransition(() => setMatches(list));
    }, onSubscriptionError);
    // admin/adminUsers require a superAdmin custom claim that nothing in this app
    // currently mints on the anonymous auth token, so permission-denied here is the
    // expected outcome for every session — do not surface it as a connection error.
    const unsubA = onValue(ref(db, PATHS.admin), (snap) => {
      startTransition(() => setAdminConfig(prev => ({ ...prev, ...(snap.val() || { password: '' }) })));
    });
    const unsubAU = onValue(ref(db, PATHS.adminUsers), (snap) => {
      startTransition(() => setAdminConfig(prev => ({ ...prev, users: snap.val() || {} })));
    });
    const unsubS = onValue(ref(db, PATHS.schedule), (snap) => {
      startTransition(() => setSchedule(snap.val() || {}));
    }, onSubscriptionError);
    const unsubLineups = onValue(ref(db, PATHS.lineupSubmissionMeta), (snap) => {
      startTransition(() => {
        setLineupSubmissionMeta(snap.val() || {});
        touchLastRefreshed();
      });
    });
    const unsubRevealedLineups = onValue(ref(db, PATHS.revealedLineups), (snap) => {
      startTransition(() => {
        setRevealedLineups(snap.val() || {});
        touchLastRefreshed();
      });
    });
    const unsubSettings = onValue(ref(db, PATHS.settings), (snap) => {
      const value = snap.val() || {};
      startTransition(() => setSettings({ ...value, eligibilityRules: normalizeEligibilityRules(value.eligibilityRules) }));
    });
    return () => { unsubT(); unsubM(); unsubA(); unsubAU(); unsubS(); unsubLineups(); unsubRevealedLineups(); unsubSettings(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps




  useEffect(() => {
    const revealedIds = Object.values(revealedLineups || {}).map(row => row?.scheduleId).filter(Boolean);
    const lockedIds = Object.entries(lineupSubmissionMeta || {})
      .filter(([, submissions]) => Object.values(submissions || {}).filter(submission => submission?.lockedAt || submission?.revealedAt || submission?.revealId).length >= 2)
      .map(([scheduleId]) => scheduleId);
    const scheduleIds = Array.from(new Set([...revealedIds, ...lockedIds]));
    if (!scheduleIds.length) {
      setRevealedScheduleSubmissions({});
      return undefined;
    }
    setRevealedScheduleSubmissions(prev => Object.fromEntries(Object.entries(prev || {}).filter(([scheduleId]) => scheduleIds.includes(scheduleId))));
    const unsubs = scheduleIds.map(scheduleId => onValue(ref(db, `${PATHS.lineupSubmissions}/${scheduleId}`), (snap) => {
      setRevealedScheduleSubmissions(prev => ({ ...prev, [scheduleId]: snap.val() || null }));
      touchLastRefreshed();
    }, () => {
      setRevealedScheduleSubmissions(prev => ({ ...prev, [scheduleId]: null }));
    }));
    return () => unsubs.forEach(unsub => unsub());
  }, [revealedLineups, lineupSubmissionMeta]);

  useEffect(() => {
    if (!session?.teamId) {
      setOwnLineupSubmissions({});
      return undefined;
    }
    const scheduleIds = Object.values(schedule || {}).filter(item => item?.id && item?.type !== 'buffer').map(item => item.id);
    if (scheduleIds.length === 0) {
      setOwnLineupSubmissions({});
      return undefined;
    }
    const unsubs = scheduleIds.map(scheduleId => onValue(ref(db, `${PATHS.lineupSubmissions}/${scheduleId}/${session.teamId}`), (snap) => {
      setOwnLineupSubmissions(prev => ({ ...prev, [scheduleId]: snap.val() || null }));
      touchLastRefreshed();
    }));
    return () => unsubs.forEach(unsub => unsub());
  }, [schedule, session?.teamId]);

  useEffect(() => {
    if (session?.role !== ROLES.CAPTAIN || !session.teamId) return;
    const currentTeam = teams?.[session.teamId];
    if (currentTeam?.name && currentTeam.name !== session.teamName) {
      refreshTeamSession(session.teamId, currentTeam.name);
    }
  }, [teams, session?.role, session?.teamId, session?.teamName, refreshTeamSession]);

  const handleRefresh = useCallback(() => touchLastRefreshed(), [touchLastRefreshed]);

  return (
    <ChromeWrapper>
      {connectionError && <div className="error-box" role="alert" data-testid="connection-error-banner">{connectionError}</div>}
      {!loaded && !connectionError && <PageSpinner />}
      <Suspense fallback={<PageSpinner />}>
        <Routes>
          <Route path="/" element={<Home teams={deferredTeams} schedule={deferredSchedule} matches={deferredMatches} eligibilityRules={settings.eligibilityRules} lineupSubmissions={deferredLineups} revealedLineups={deferredRevealedLineups} lastRefreshed={lastRefreshed} onRefresh={handleRefresh} />} />
          <Route path="/teams" element={<Teams teams={deferredTeams} loaded={loaded} />} />
          <Route path="/schedule" element={<Schedule teams={deferredTeams} schedule={deferredSchedule} matches={deferredMatches} lineupSubmissions={deferredLineups} revealedLineups={deferredRevealedLineups} />} />
          <Route path="/standings" element={<Standings teams={deferredTeams} matches={deferredMatches} />} />
          <Route path="/matchups" element={<Matchups matches={deferredMatches} teams={deferredTeams} />} />
          <Route path="/ptl" element={<Navigate to="/more" replace />} />
          <Route path="/history" element={<History matches={deferredMatches} teams={deferredTeams} onMatchDeleted={syncDeletedMatch} />} />
          <Route path="/rules" element={<Rules />} />
          <Route path="/more" element={<More />} />
          <Route path="/login" element={<Login teams={deferredTeams} adminConfig={adminConfig} />} />
          <Route path="/score" element={
            <ProtectedTeam>
              <ScoreEntry teams={deferredTeams} schedule={deferredSchedule} lineupSubmissions={deferredLineups} revealedLineups={deferredRevealedLineups} matches={deferredMatches} eligibilityRules={settings.eligibilityRules} onScoreSaved={syncSavedMatch} />
            </ProtectedTeam>
          } />
          <Route path="/audit" element={
            <ProtectedRoles allowed={[ROLES.SUPER_ADMIN]} next="/audit">
              <AuditLogs />
            </ProtectedRoles>
          } />
          <Route path="/admin" element={
            <ProtectedAdmin>
              <Admin teams={deferredTeams} adminConfig={adminConfig} matches={deferredMatches} schedule={deferredSchedule} lineupSubmissions={deferredLineups} revealedLineups={deferredRevealedLineups} settings={settings} />
            </ProtectedAdmin>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ChromeWrapper>
  );
}

function NavProgressBar() {
  return (
    <div className="nav-progress" aria-hidden="true">
      <div className="nav-progress-bar">
        <span className="nav-progress-ball">🎾</span>
      </div>
    </div>
  );
}

function RouteProgress() {
  const location = useLocation();
  const [active, setActive] = useState(false);
  const timerRef = useRef(null);
  useEffect(() => {
    setActive(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setActive(false), 500);
    return () => clearTimeout(timerRef.current);
  }, [location.pathname]);
  if (!active) return null;
  return <NavProgressBar />;
}

function TennisBallSpinner() {
  return (
    <div className="tbs-wrap" aria-label="Loading" role="status">
      <svg className="tbs-svg" viewBox="0 0 120 160" xmlns="http://www.w3.org/2000/svg">
        {/* Shadow under ball that squishes on bounce */}
        <ellipse className="tbs-shadow" cx="60" cy="148" rx="18" ry="5" />
        {/* Racket group — swings from pivot at handle bottom */}
        <g className="tbs-racket" style={{ transformOrigin: '85px 148px' }}>
          {/* Handle */}
          <rect x="81" y="118" width="8" height="32" rx="4" fill="#8B6914" />
          {/* Grip tape */}
          <rect x="81" y="128" width="8" height="4" rx="2" fill="#5a4010" opacity="0.6" />
          <rect x="81" y="136" width="8" height="4" rx="2" fill="#5a4010" opacity="0.6" />
          {/* Racket head frame */}
          <ellipse cx="85" cy="96" rx="22" ry="26" fill="none" stroke="#C8960C" strokeWidth="5" />
          {/* Strings horizontal */}
          {[-18,-10,-2,6,14].map(y => (
            <line key={y} x1="64" y1={96+y} x2="106" y2={96+y} stroke="#f0d060" strokeWidth="1" opacity="0.7" />
          ))}
          {/* Strings vertical */}
          {[-14,-7,0,7,14].map(x => (
            <line key={x} x1={85+x} y1="72" x2={85+x} y2="120" stroke="#f0d060" strokeWidth="1" opacity="0.7" />
          ))}
        </g>
        {/* Tennis ball — bounces up/down */}
        <g className="tbs-ball">
          <circle cx="40" cy="60" r="18" fill="#c8e63c" />
          <path d="M24 54 Q40 44 56 54" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M24 66 Q40 76 56 66" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      </svg>
      <p className="tbs-label">Loading…</p>
    </div>
  );
}

function PageSpinner() {
  return (
    <>
      <NavProgressBar />
      <div className="page-spinner" aria-label="Loading page">
        <TennisBallSpinner />
      </div>
    </>
  );
}

function ActivityAudit() {
  const location = useLocation();
  const { session } = useAuth();
  const lastEvent = useRef('');

  useEffect(() => {
    if (hasRole(session, [ROLES.GUEST])) return;
    const path = `${location.pathname}${location.search || ''}`;
    const actor = session?.teamId || session?.userId || session?.role || 'unknown';
    const eventKey = `${actor}:${path}`;
    if (lastEvent.current === eventKey) return;
    lastEvent.current = eventKey;
    writeAuditLog({
      actionType: hasRole(session, [ROLES.CAPTAIN]) ? 'Captain Page View' : 'Admin Page View',
      session,
      targetType: 'route',
      targetId: path
    }).catch(error => console.error('Activity audit failed', error));
  }, [location.pathname, location.search, session]);

  return null;
}

function ProtectedRoles({ allowed, next, children }) {
  const { session } = useAuth();
  if (!hasRole(session, allowed)) {
    return <Navigate to="/login" replace state={{ next }} />;
  }
  return children;
}

function ProtectedTeam({ children }) {
  const { session } = useAuth();
  if (!hasRole(session, [ROLES.CAPTAIN, ROLES.ADMIN, ROLES.SUPER_ADMIN])) {
    return <Navigate to="/login" replace state={{ next: '/score' }} />;
  }
  return children;
}

function ProtectedAdmin({ children }) {
  const { session } = useAuth();
  if (!hasRole(session, [ROLES.ADMIN, ROLES.SUPER_ADMIN])) {
    return <Navigate to="/login" replace state={{ next: '/admin' }} />;
  }
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}

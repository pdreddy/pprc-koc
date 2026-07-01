export const ROLES = {
  GUEST: 'GUEST',
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  CAPTAIN: 'CAPTAIN'
};

export const LEGACY_ROLE_MAP = {
  guest: ROLES.GUEST,
  admin: ROLES.SUPER_ADMIN,
  team: ROLES.CAPTAIN
};

export function normalizeRole(role) {
  return LEGACY_ROLE_MAP[role] || role || ROLES.GUEST;
}

export function hasRole(session, allowedRoles) {
  const role = normalizeRole(session?.role);
  return allowedRoles.includes(role);
}

// Both SUPER_ADMIN and ADMIN can access admin panel and score entry
export function isAdminRole(session) {
  return hasRole(session, [ROLES.SUPER_ADMIN, ROLES.ADMIN]);
}

// Captains, ADMINs, and SUPER_ADMINs can submit/view scores
export function isCaptainRole(session) {
  return hasRole(session, [ROLES.CAPTAIN, ROLES.ADMIN, ROLES.SUPER_ADMIN]);
}

// ── SUPER_ADMIN exclusive ──────────────────────────────────
// Manage user accounts and role assignments
export function canManageRoles(session) {
  return hasRole(session, [ROLES.SUPER_ADMIN]);
}

// View full audit log trail
export function canViewAudit(session) {
  return hasRole(session, [ROLES.SUPER_ADMIN]);
}

// Delete approved matches (destructive, irreversible)
export function canDeleteMatch(session) {
  return hasRole(session, [ROLES.SUPER_ADMIN]);
}

// Edit team rosters and passwords
export function canEditTeams(session) {
  return hasRole(session, [ROLES.SUPER_ADMIN, ROLES.ADMIN]);
}

// Manage season settings (schedule, eligibility rules, admin config)
export function canManageSettings(session) {
  return hasRole(session, [ROLES.SUPER_ADMIN]);
}

// ── ADMIN and above ───────────────────────────────────────
// Approve / reject submitted scores
export function canApproveScores(session) {
  return hasRole(session, [ROLES.SUPER_ADMIN, ROLES.ADMIN]);
}

// Unlock lineups for re-submission
export function canUnlockLineups(session) {
  return hasRole(session, [ROLES.SUPER_ADMIN, ROLES.ADMIN]);
}

// View all lineups (even before reveal)
export function canViewAllLineups(session) {
  return hasRole(session, [ROLES.SUPER_ADMIN, ROLES.ADMIN]);
}

// Rename / sync player names on matches
export function canSyncNames(session) {
  return hasRole(session, [ROLES.SUPER_ADMIN, ROLES.ADMIN]);
}

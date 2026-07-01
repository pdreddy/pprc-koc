export const APPROVED_MATCH_STATUSES = new Set(['APPROVED', 'ADMIN_APPROVED', 'approved', 'admin_approved', undefined, null, '']);

export function isApprovedMatch(match) {
  return APPROVED_MATCH_STATUSES.has(match?.status);
}

export function approvedMatches(matches = []) {
  return (matches || []).filter(isApprovedMatch);
}

const CURRENT_SEASON_ROOT = 'koc_s3';

const seasonPath = (child) => `${CURRENT_SEASON_ROOT}/${child}`;

// Firebase RTDB paths are centralized here so current-season data and legacy archives stay separated.
export const PATHS = {
  teams: seasonPath('teams'),
  matches: seasonPath('matches'),
  playerRatings: seasonPath('playerRatings'),
  admin: seasonPath('admin'),
  adminUsers: seasonPath('adminUsers'),
  schedule: seasonPath('schedule'),
  settings: seasonPath('settings'),
  standings: seasonPath('standings'),
  pprcRatings: seasonPath('pprcRatings'),
  playerHistory: seasonPath('playerHistory'),
  teamHistory: seasonPath('teamHistory'),
  playerMatchups: seasonPath('playerMatchups'),
  teamMatchups: seasonPath('teamMatchups'),
  playerEligibility: seasonPath('playerEligibility'),
  cachedSummaries: seasonPath('cachedSummaries'),
  auditLogs: seasonPath('auditLogs'),
  lineupSubmissions: seasonPath('lineupSubmissions'),
  lineupSubmissionMeta: seasonPath('lineupSubmissionMeta'),
  revealedLineups: seasonPath('revealedLineups'),
  lineupUnlocks: seasonPath('lineupUnlocks'),
  lineupDeletes: seasonPath('lineupDeletes'),
  koc2db: 'KOC2DB',
  season1: 'KOC2DBPONEW'
};

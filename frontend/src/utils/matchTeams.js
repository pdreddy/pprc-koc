// Resolves a match record's team references using current `teams` map.
// Prefers stored t1Id/t2Id; falls back to name lookup for legacy records.

export function resolveMatchTeams(match, teams) {
  if (!match || !teams) return { team1: null, team2: null };
  const byId = (id) => id && teams[id] ? teams[id] : null;
  const byName = (name) => name ? Object.values(teams).find(t => t.name === name) : null;
  const team1 = byId(match.t1Id) || byName(match.t1) || null;
  const team2 = byId(match.t2Id) || byName(match.t2) || null;
  return { team1, team2 };
}

function fallbackName(name, abbr) {
  if (abbr === 'RR') return 'Rudra Racquets';
  return name || 'Unknown';
}

export function matchTeamNames(match, teams) {
  const { team1, team2 } = resolveMatchTeams(match, teams);
  return {
    t1Name: team1 ? team1.name : fallbackName(match.t1, match.t1Abbr),
    t2Name: team2 ? team2.name : fallbackName(match.t2, match.t2Abbr),
    t1Abbr: team1 ? team1.abbreviation : (match.t1Abbr || '?'),
    t2Abbr: team2 ? team2.abbreviation : (match.t2Abbr || '?'),
    team1Id: team1 ? team1.id : match.t1Id,
    team2Id: team2 ? team2.id : match.t2Id
  };
}

// Winner: prefer winnerId; fallback to comparing win (name) to resolved teams
export function matchWinnerId(match, teams) {
  if (match.winnerId) return match.winnerId;
  const { team1, team2 } = resolveMatchTeams(match, teams);
  if (match.win && team1 && match.win === team1.name) return team1.id;
  if (match.win && team2 && match.win === team2.name) return team2.id;
  return null;
}

// Court winner: prefer stored set wins so doubles match tiebreak courts such as
// 3-4, 4-3, 10-5 (stored as a 1-0 deciding set) are not treated as tied just
// because match-tiebreak points are excluded from game totals.
export function lineWinnerSide(line, match = {}) {
  const setWins1 = Number(line?.setWins?.team1);
  const setWins2 = Number(line?.setWins?.team2);
  if (setWins1 > setWins2) return 1;
  if (setWins2 > setWins1) return 2;
  if (line?.winner && match?.t1 && line.winner === match.t1) return 1;
  if (line?.winner && match?.t2 && line.winner === match.t2) return 2;
  const g1 = Number(line?.g1) || 0;
  const g2 = Number(line?.g2) || 0;
  if (g1 > g2) return 1;
  if (g2 > g1) return 2;
  return null;
}

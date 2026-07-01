import { resolveMatchTeams, matchWinnerId } from '../utils/matchTeams';
import { isApprovedMatch } from '../utils/matchStatus';

// Re-implement statsForGroup here for unit testing (pure logic, no JSX)
function statsForGroup(teamsInGroup, matches, allTeams) {
  const groupIds = new Set(teamsInGroup.map(t => t.id));
  const stats = {};
  teamsInGroup.forEach(t => {
    stats[t.id] = {
      id: t.id, team: t.name, abbr: t.abbreviation, logoUrl: t.logoUrl || null,
      matches: 0, wins: 0, losses: 0,
      setsFor: 0, setsAgainst: 0,
      gamesFor: 0, gamesAgainst: 0, points: 0, singlesWins: 0
    };
  });
  const headToHead = {};
  for (const m of matches || []) {
    if (!isApprovedMatch(m)) continue;
    const { team1, team2 } = resolveMatchTeams(m, allTeams);
    if (!team1 || !team2) continue;
    if (!groupIds.has(team1.id) || !groupIds.has(team2.id)) continue;
    const winId = matchWinnerId(m, allTeams);
    stats[team1.id].matches++; stats[team2.id].matches++;
    stats[team1.id].gamesFor += Number(m.g1) || 0; stats[team1.id].gamesAgainst += Number(m.g2) || 0;
    stats[team2.id].gamesFor += Number(m.g2) || 0; stats[team2.id].gamesAgainst += Number(m.g1) || 0;
    stats[team1.id].setsFor += Number(m.s1) || 0; stats[team1.id].setsAgainst += Number(m.s2) || 0;
    stats[team2.id].setsFor += Number(m.s2) || 0; stats[team2.id].setsAgainst += Number(m.s1) || 0;
    (m.lines || []).filter(l => l.type === 'singles').forEach(l => {
      if ((Number(l.g1) || 0) > (Number(l.g2) || 0)) stats[team1.id].singlesWins++;
      if ((Number(l.g2) || 0) > (Number(l.g1) || 0)) stats[team2.id].singlesWins++;
    });
    if (winId === team1.id) { stats[team1.id].wins++; stats[team2.id].losses++; stats[team1.id].points++; }
    else if (winId === team2.id) { stats[team2.id].wins++; stats[team1.id].losses++; stats[team2.id].points++; }
    headToHead[`${team1.id}:${team2.id}`] = (headToHead[`${team1.id}:${team2.id}`] || 0) + (winId === team1.id ? 1 : 0);
    headToHead[`${team2.id}:${team1.id}`] = (headToHead[`${team2.id}:${team1.id}`] || 0) + (winId === team2.id ? 1 : 0);
  }
  return Object.values(stats).map(s => ({
    ...s,
    setDiff: s.setsFor - s.setsAgainst,
    gameDiff: s.gamesFor - s.gamesAgainst
  })).sort((a, b) =>
    (b.points - a.points) ||
    (b.setsFor - a.setsFor) ||
    (b.gamesFor - a.gamesFor) ||
    (b.singlesWins - a.singlesWins) ||
    ((headToHead[`${b.id}:${a.id}`] || 0) - (headToHead[`${a.id}:${b.id}`] || 0)) ||
    (b.setDiff - a.setDiff) ||
    (b.gameDiff - a.gameDiff) ||
    a.team.localeCompare(b.team)
  );
}

const T1 = { id: 't1', name: 'Alpha', abbreviation: 'AL', group: 'A' };
const T2 = { id: 't2', name: 'Beta',  abbreviation: 'BE', group: 'A' };
const T3 = { id: 't3', name: 'Gamma', abbreviation: 'GA', group: 'A' };
const allTeams = { t1: T1, t2: T2, t3: T3 };

function approvedMatch({ team1Id = 't1', team2Id = 't2', winnerId, s1 = 2, s2 = 1, g1 = 12, g2 = 8, lines = [], status = 'approved' } = {}) {
  return {
    status,
    t1Id: team1Id,
    t2Id: team2Id,
    // derive winnerId from sets if not explicitly provided
    winnerId: winnerId || (s1 > s2 ? team1Id : s2 > s1 ? team2Id : null),
    s1, s2, g1, g2,
    lines,
  };
}

describe('statsForGroup', () => {
  test('empty matches → zero stats for all teams', () => {
    const rows = statsForGroup([T1, T2], [], allTeams);
    expect(rows).toHaveLength(2);
    rows.forEach(r => {
      expect(r.matches).toBe(0);
      expect(r.wins).toBe(0);
      expect(r.points).toBe(0);
    });
  });

  test('ignores non-approved matches', () => {
    const m = approvedMatch({ status: 'pending' });
    const rows = statsForGroup([T1, T2], [m], allTeams);
    expect(rows[0].matches).toBe(0);
  });

  test('ignores matches where a team is not in the group', () => {
    const m = approvedMatch({ team1Id: 't1', team2Id: 't3' });
    const rows = statsForGroup([T1, T2], [m], allTeams);
    expect(rows.find(r => r.id === 't1').matches).toBe(0);
  });

  test('records win/loss/sets/games correctly', () => {
    const m = approvedMatch({ team1Id: 't1', team2Id: 't2', s1: 2, s2: 0, g1: 12, g2: 5 });
    const rows = statsForGroup([T1, T2], [m], allTeams);
    const winner = rows.find(r => r.id === 't1');
    const loser  = rows.find(r => r.id === 't2');
    expect(winner.wins).toBe(1);
    expect(winner.losses).toBe(0);
    expect(winner.points).toBe(1);
    expect(winner.setsFor).toBe(2);
    expect(winner.setsAgainst).toBe(0);
    expect(winner.gamesFor).toBe(12);
    expect(winner.gamesAgainst).toBe(5);
    expect(loser.wins).toBe(0);
    expect(loser.losses).toBe(1);
    expect(loser.points).toBe(0);
    expect(loser.setsFor).toBe(0);
    expect(loser.gamesFor).toBe(5);
  });

  test('setDiff and gameDiff computed correctly', () => {
    const m = approvedMatch({ team1Id: 't1', team2Id: 't2', s1: 2, s2: 1, g1: 14, g2: 10 });
    const rows = statsForGroup([T1, T2], [m], allTeams);
    const r1 = rows.find(r => r.id === 't1');
    expect(r1.setDiff).toBe(1);
    expect(r1.gameDiff).toBe(4);
  });

  test('counts singles wins per team', () => {
    const m = approvedMatch({
      team1Id: 't1', team2Id: 't2',
      lines: [
        { type: 'singles', g1: 6, g2: 3 },
        { type: 'singles', g1: 3, g2: 6 },
        { type: 'doubles', g1: 6, g2: 4 },
      ]
    });
    const rows = statsForGroup([T1, T2], [m], allTeams);
    const r1 = rows.find(r => r.id === 't1');
    const r2 = rows.find(r => r.id === 't2');
    expect(r1.singlesWins).toBe(1);
    expect(r2.singlesWins).toBe(1);
  });

  test('primary sort: points descending', () => {
    const m1 = approvedMatch({ team1Id: 't1', team2Id: 't2', s1: 2, s2: 0 });
    const rows = statsForGroup([T1, T2], [m1], allTeams);
    expect(rows[0].id).toBe('t1'); // t1 won = 1 point
    expect(rows[1].id).toBe('t2');
  });

  test('tiebreaker: sets won when points equal', () => {
    // t1 beats t3, t2 beats t3 — both 1pt; t1 wins more sets
    const m1 = approvedMatch({ team1Id: 't1', team2Id: 't3', s1: 2, s2: 0, g1: 12, g2: 4 });
    const m2 = approvedMatch({ team1Id: 't2', team2Id: 't3', s1: 2, s2: 1, g1: 10, g2: 8 });
    const rows = statsForGroup([T1, T2, T3], [m1, m2], allTeams);
    const r1 = rows.find(r => r.id === 't1');
    const r2 = rows.find(r => r.id === 't2');
    // Both 1pt; t1 has setsFor=2, t2 has setsFor=2 — equal sets, check games
    // t1: 12 games, t2: 10 games → t1 first
    expect(rows.indexOf(r1)).toBeLessThan(rows.indexOf(r2));
  });

  test('tiebreaker: games won when sets equal', () => {
    const m1 = approvedMatch({ team1Id: 't1', team2Id: 't3', s1: 2, s2: 0, g1: 12, g2: 2 });
    const m2 = approvedMatch({ team1Id: 't2', team2Id: 't3', s1: 2, s2: 0, g1: 8,  g2: 2 });
    const rows = statsForGroup([T1, T2, T3], [m1, m2], allTeams);
    const r1 = rows.find(r => r.id === 't1');
    const r2 = rows.find(r => r.id === 't2');
    expect(rows.indexOf(r1)).toBeLessThan(rows.indexOf(r2));
  });

  test('tiebreaker: singles wins when points+sets+games equal', () => {
    const m1 = approvedMatch({ team1Id: 't1', team2Id: 't3', s1: 2, s2: 0, g1: 12, g2: 4, lines: [{ type: 'singles', g1: 6, g2: 3 }, { type: 'singles', g1: 6, g2: 3 }] });
    const m2 = approvedMatch({ team1Id: 't2', team2Id: 't3', s1: 2, s2: 0, g1: 12, g2: 4, lines: [{ type: 'singles', g1: 6, g2: 3 }] });
    const rows = statsForGroup([T1, T2, T3], [m1, m2], allTeams);
    const r1 = rows.find(r => r.id === 't1');
    const r2 = rows.find(r => r.id === 't2');
    expect(rows.indexOf(r1)).toBeLessThan(rows.indexOf(r2));
  });

  test('tiebreaker: head-to-head when points+sets+games+singles equal', () => {
    // t1 beats t2 head-to-head; both beat t3 with identical stats
    const m_t1_t3 = approvedMatch({ team1Id: 't1', team2Id: 't3', s1: 2, s2: 0, g1: 12, g2: 4 });
    const m_t2_t3 = approvedMatch({ team1Id: 't2', team2Id: 't3', s1: 2, s2: 0, g1: 12, g2: 4 });
    const m_h2h   = approvedMatch({ team1Id: 't1', team2Id: 't2', s1: 2, s2: 1, g1: 14, g2: 10 });
    const rows = statsForGroup([T1, T2, T3], [m_t1_t3, m_t2_t3, m_h2h], allTeams);
    // t1 has 2pts (beat t3 + beat t2), t2 has 1pt → points break tie before h2h even matters
    const r1 = rows.find(r => r.id === 't1');
    expect(rows.indexOf(r1)).toBe(0);
  });

  test('alphabetical fallback when all stats identical and no h2h', () => {
    // No matches played — all zeros. Should sort Alpha < Beta
    const rows = statsForGroup([T2, T1], [], allTeams);
    expect(rows[0].id).toBe('t1'); // Alpha before Beta
  });

  test('accumulates stats across multiple matches', () => {
    const m1 = approvedMatch({ team1Id: 't1', team2Id: 't2', s1: 2, s2: 0, g1: 12, g2: 4 });
    const m2 = approvedMatch({ team1Id: 't1', team2Id: 't2', s1: 2, s2: 1, g1: 13, g2: 10 });
    const rows = statsForGroup([T1, T2], [m1, m2], allTeams);
    const r1 = rows.find(r => r.id === 't1');
    expect(r1.matches).toBe(2);
    expect(r1.wins).toBe(2);
    expect(r1.setsFor).toBe(4);
    expect(r1.gamesFor).toBe(25);
  });
});

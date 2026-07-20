import { get, push, ref, update } from 'firebase/database';
import { db, PATHS } from '../firebase';
import { buildPtlRatings } from '../utils/ptlRating';
import { resolveMatchTeams, matchWinnerId, lineWinnerSide } from '../utils/matchTeams';
import { DEFAULT_ELIGIBILITY_RULES, normalizeEligibilityRules } from '../utils/eligibilityRules';
import { approvedMatches, isApprovedMatch } from '../utils/matchStatus';
import { validateLineScore } from '../utils/tennisScoreRules';
import { isAdminRole } from '../utils/roles';

const keyFor = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'unknown';
const listFrom = (val) => Object.entries(val || {}).map(([id, value]) => ({ id, ...(value || {}) }));


export function validateScore(match) {
  if (!match?.t1Id || !match?.t2Id) throw new Error('Score validation failed: both teams are required.');
  if (match.t1Id === match.t2Id) throw new Error('Score validation failed: teams must be different.');
  if (!Array.isArray(match.lines) || match.lines.length === 0) throw new Error('Score validation failed: at least one scored court is required.');
  if (!match.winnerId && !match.win) throw new Error('Score validation failed: winner could not be determined.');
  let courtsWon1 = 0, courtsWon2 = 0;
  match.lines.forEach(line => {
    const winnerSide = lineWinnerSide(line, match);
    if (winnerSide === 1) courtsWon1 += 1;
    if (winnerSide === 2) courtsWon2 += 1;
  });
  if (courtsWon1 === courtsWon2) throw new Error('Score validation failed: match winner is tied or unclear.');
  const expectedWinnerId = courtsWon1 > courtsWon2 ? match.t1Id : match.t2Id;
  if (match.winnerId && match.winnerId !== expectedWinnerId) throw new Error('Score validation failed: winner does not match court results.');
  const lineErrors = match.lines.flatMap(line => validateLineScore(line));
  if (lineErrors.length > 0) throw new Error(`Score validation failed:
${Array.from(new Set(lineErrors)).join('\n')}`);
  return true;
}

function computeStandings(teams, matches) {
  const rows = Object.fromEntries(Object.values(teams || {}).map(t => [t.id, {
    teamId: t.id, team: t.name, abbr: t.abbreviation, group: t.group || 'A', matches: 0, wins: 0, losses: 0,
    points: 0, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0, singlesWins: 0, position: 0
  }]));
  const headToHead = {};
  for (const m of matches) {
    const { team1, team2 } = resolveMatchTeams(m, teams);
    if (!team1 || !team2 || !rows[team1.id] || !rows[team2.id]) continue;
    const winId = matchWinnerId(m, teams) || m.winnerId;
    rows[team1.id].matches++; rows[team2.id].matches++;
    rows[team1.id].setsWon += Number(m.s1) || 0; rows[team1.id].setsLost += Number(m.s2) || 0;
    rows[team2.id].setsWon += Number(m.s2) || 0; rows[team2.id].setsLost += Number(m.s1) || 0;
    rows[team1.id].gamesWon += Number(m.g1) || 0; rows[team1.id].gamesLost += Number(m.g2) || 0;
    rows[team2.id].gamesWon += Number(m.g2) || 0; rows[team2.id].gamesLost += Number(m.g1) || 0;
    (m.lines || []).filter(l => l.type === 'singles').forEach(l => {
      if ((Number(l.g1) || 0) > (Number(l.g2) || 0)) rows[team1.id].singlesWins++;
      if ((Number(l.g2) || 0) > (Number(l.g1) || 0)) rows[team2.id].singlesWins++;
    });
    if (winId === team1.id) { rows[team1.id].wins++; rows[team1.id].points++; rows[team2.id].losses++; }
    if (winId === team2.id) { rows[team2.id].wins++; rows[team2.id].points++; rows[team1.id].losses++; }
    headToHead[`${team1.id}:${team2.id}`] = (headToHead[`${team1.id}:${team2.id}`] || 0) + (winId === team1.id ? 1 : 0);
    headToHead[`${team2.id}:${team1.id}`] = (headToHead[`${team2.id}:${team1.id}`] || 0) + (winId === team2.id ? 1 : 0);
  }
  const sorted = Object.values(rows).sort((a, b) =>
    (b.points - a.points) || (b.setsWon - a.setsWon) || (b.singlesWins - a.singlesWins) ||
    ((headToHead[`${b.teamId}:${a.teamId}`] || 0) - (headToHead[`${a.teamId}:${b.teamId}`] || 0)) ||
    ((b.gamesWon - b.gamesLost) - (a.gamesWon - a.gamesLost)) || a.team.localeCompare(b.team)
  );
  sorted.forEach((r, i) => { r.position = i + 1; r.setDiff = r.setsWon - r.setsLost; r.gameDiff = r.gamesWon - r.gamesLost; });
  return sorted;
}

function addPlayer(history, name, won, line, match, team, opponent, side) {
  const key = keyFor(name);
  const row = history[key] || { playerName: name, matchesPlayed: 0, wins: 0, losses: 0, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0, singlesRecord: { wins: 0, losses: 0 }, doublesRecord: { wins: 0, losses: 0 } };
  row.teamId = team?.id || ''; row.lastOpponent = opponent?.name || ''; row.lastPlayed = match.ts || Date.now(); row.lastResult = won ? 'W' : 'L';
  row.matchesPlayed++; row.wins += won ? 1 : 0; row.losses += won ? 0 : 1;
  row.gamesWon += Number(line[side === 1 ? 'g1' : 'g2']) || 0; row.gamesLost += Number(line[side === 1 ? 'g2' : 'g1']) || 0;
  row.setsWon += Number(line.setWins?.[side === 1 ? 'team1' : 'team2']) || 0; row.setsLost += Number(line.setWins?.[side === 1 ? 'team2' : 'team1']) || 0;
  const bucket = line.type === 'singles' ? row.singlesRecord : row.doublesRecord; bucket[won ? 'wins' : 'losses']++;
  row.winPct = Math.round((row.wins / row.matchesPlayed) * 100); history[key] = row;
}

function computeHistories(teams, matches) {
  const playerHistory = {}, playerMatchups = {}, teamMatchups = {};
  const teamHistory = Object.fromEntries(Object.values(teams || {}).map(t => [t.id, { teamId: t.id, team: t.name, meetings: 0, wins: 0, losses: 0, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0 }]));
  for (const m of matches) {
    const { team1, team2 } = resolveMatchTeams(m, teams); if (!team1 || !team2) continue;
    const winId = matchWinnerId(m, teams) || m.winnerId;
    [[team1, team2, 1], [team2, team1, 2]].forEach(([team, opp, side]) => {
      const h = teamHistory[team.id] || { teamId: team.id, team: team.name, meetings: 0, wins: 0, losses: 0, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0 };
      h.meetings++; h.wins += winId === team.id ? 1 : 0; h.losses += winId === team.id ? 0 : 1;
      h.setsWon += Number(m[side === 1 ? 's1' : 's2']) || 0; h.setsLost += Number(m[side === 1 ? 's2' : 's1']) || 0;
      h.gamesWon += Number(m[side === 1 ? 'g1' : 'g2']) || 0; h.gamesLost += Number(m[side === 1 ? 'g2' : 'g1']) || 0;
      h.lastOpponent = opp.name; h.lastPlayed = m.ts || Date.now(); teamHistory[team.id] = h;
    });
    const teamKey = [team1.id, team2.id].sort().join('_vs_');
    const tm = teamMatchups[teamKey] || { teams: [team1.id, team2.id], meetings: 0, wins: {}, losses: {}, sets: {}, games: {} };
    tm.meetings++; tm.wins[winId] = (tm.wins[winId] || 0) + 1; tm.losses[winId === team1.id ? team2.id : team1.id] = (tm.losses[winId === team1.id ? team2.id : team1.id] || 0) + 1;
    tm.sets[team1.id] = (tm.sets[team1.id] || 0) + (Number(m.s1) || 0); tm.sets[team2.id] = (tm.sets[team2.id] || 0) + (Number(m.s2) || 0);
    tm.games[team1.id] = (tm.games[team1.id] || 0) + (Number(m.g1) || 0); tm.games[team2.id] = (tm.games[team2.id] || 0) + (Number(m.g2) || 0); tm.lastPlayed = m.ts || Date.now(); teamMatchups[teamKey] = tm;
    (m.lines || []).forEach(line => {
      const t1Won = lineWinnerSide(line, m) === 1;
      (line.players?.team1 || []).forEach(p => addPlayer(playerHistory, p, t1Won, line, m, team1, team2, 1));
      (line.players?.team2 || []).forEach(p => addPlayer(playerHistory, p, !t1Won, line, m, team2, team1, 2));
      for (const p1 of (line.players?.team1 || [])) for (const p2 of (line.players?.team2 || [])) {
        const k = [p1, p2].map(keyFor).sort().join('_vs_'); const pm = playerMatchups[k] || { players: [p1, p2], matchesPlayed: 0, wins: {}, losses: {}, winPct: {} };
        pm.matchesPlayed++; pm.wins[t1Won ? p1 : p2] = (pm.wins[t1Won ? p1 : p2] || 0) + 1; pm.losses[t1Won ? p2 : p1] = (pm.losses[t1Won ? p2 : p1] || 0) + 1; pm.lastResult = `${t1Won ? p1 : p2} beat ${t1Won ? p2 : p1}`; pm.lastPlayed = m.ts || Date.now(); pm.winPct[p1] = Math.round(((pm.wins[p1] || 0) / pm.matchesPlayed) * 100); pm.winPct[p2] = Math.round(((pm.wins[p2] || 0) / pm.matchesPlayed) * 100); playerMatchups[k] = pm;
      }
    });
  }
  return { playerHistory, teamHistory, playerMatchups, teamMatchups };
}


function eligibilityNameKey(playerName) {
  return String(playerName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function eligibilityKey(teamId, playerName) {
  return `${teamId}:${eligibilityNameKey(playerName)}`;
}

function eligibilityPairKey(teamId, names) {
  return `${teamId}:${names.map(eligibilityNameKey).sort().join('|')}`;
}

function computePlayerEligibility(teams, matches) {
  const rows = {};
  Object.values(teams || {}).forEach(team => {
    (team.players || []).forEach(player => {
      const key = eligibilityKey(team.id, player.name);
      rows[key] = { playerId: key, playerName: player.name, teamId: team.id, seasonId: 'koc_s3', totalMatchDays: 0, singlesDays: 0, doublesDays: 0, partnerHistory: {} };
    });
  });
  approvedMatches(matches).forEach(match => {
    const { team1, team2 } = resolveMatchTeams(match, teams); if (!team1 || !team2) return;
    const dayPlayers = new Map();
    const dayPairs = new Map();
    (match.lines || []).forEach(line => {
      const type = line.type === 'singles' ? 'singles' : 'doubles';
      [[team1, line.players?.team1 || []], [team2, line.players?.team2 || []]].forEach(([team, names]) => {
        names.forEach(name => {
          const key = eligibilityKey(team.id, name);
          const row = dayPlayers.get(key) || { key, teamId: team.id, name, singles: false, doubles: false, doublesCount: 0 };
          if (type === 'singles') row.singles = true;
          if (type === 'doubles') { row.doubles = true; row.doublesCount += 1; }
          dayPlayers.set(key, row);
        });
        if (type === 'doubles' && names.length === 2) {
          dayPairs.set(eligibilityPairKey(team.id, names), { teamId: team.id, names });
        }
      });
    });
    dayPairs.forEach((pair, pairKey) => {
      pair.names.forEach(name => {
        const key = eligibilityKey(pair.teamId, name);
        const base = rows[key] || { playerId: key, playerName: name, teamId: pair.teamId, seasonId: 'koc_s3', totalMatchDays: 0, singlesDays: 0, doublesDays: 0, partnerHistory: {} };
        base.partnerHistory[pairKey] = (base.partnerHistory[pairKey] || 0) + 1;
        rows[key] = base;
      });
    });
    dayPlayers.forEach(day => {
      const row = rows[day.key] || { playerId: day.key, playerName: day.name, teamId: day.teamId, seasonId: 'koc_s3', totalMatchDays: 0, singlesDays: 0, doublesDays: 0, partnerHistory: {} };
      if (day.singles) row.singlesDays += 1;
      if (day.doubles) row.doublesDays += 1;
      row.totalMatchDays += 1;
      rows[day.key] = row;
    });
  });
  return rows;
}


function assertEligibilityRules(teams, matches, eligibilityRules = DEFAULT_ELIGIBILITY_RULES, { enforce = true } = {}) {
  const rules = normalizeEligibilityRules(eligibilityRules);
  const rows = computePlayerEligibility(teams, matches);
  const errors = [];
  Object.values(rows).forEach(row => {
    if (row.singlesDays > rules.maxSinglesDays) errors.push(`${row.playerName}: singles limit exceeded (${row.singlesDays}/${rules.maxSinglesDays} Singles Days)`);
    if (row.totalMatchDays > rules.maxTotalMatchDays) errors.push(`${row.playerName}: match-day limit exceeded (${row.totalMatchDays}/${rules.maxTotalMatchDays} Match Days)`);
    Object.values(row.partnerHistory || {}).forEach(count => {
      if (count > rules.maxPartnerDays) errors.push(`${row.playerName}: doubles partner limit exceeded (${count}/${rules.maxPartnerDays} Match Days)`);
    });
  });
  approvedMatches(matches).forEach(match => {
    const { team1, team2 } = resolveMatchTeams(match, teams); if (!team1 || !team2) return;
    const dayPlayers = new Map();
    (match.lines || []).forEach(line => {
      const type = line.type === 'singles' ? 'singles' : 'doubles';
      [[team1, line.players?.team1 || []], [team2, line.players?.team2 || []]].forEach(([team, names]) => {
        names.forEach(name => {
          const key = eligibilityKey(team.id, name);
          const row = dayPlayers.get(key) || { name, singles: false, doublesCount: 0 };
          if (type === 'singles') row.singles = true;
          if (type === 'doubles') row.doublesCount += 1;
          dayPlayers.set(key, row);
        });
      });
    });
    dayPlayers.forEach(row => {
      if (row.singles && row.doublesCount > 0) errors.push(`${row.name}: cannot play singles and doubles on the same match day`);
      if (row.doublesCount > 0 && row.doublesCount !== 2) errors.push(`${row.name}: doubles players must play both Doubles and Reverse Doubles`);
    });
  });
  if (errors.length > 0) {
    const message = `Player eligibility validation failed:\n${Array.from(new Set(errors)).join('\n')}`;
    if (enforce) throw new Error(message);
    console.warn('Admin score processing eligibility warnings skipped:', message);
  }
  return rows;
}

export class ScoreProcessingService {
  static async updateAfterScoreEntry(matchResult, { session = {} } = {}) {
    const matchRef = push(ref(db, PATHS.matches));
    const matchRecord = { ...matchResult, id: matchRef.key };
    await this.processMatchResult(matchRef.key, { session, matchRecord, writeMatchRecord: true });
    return { key: matchRef.key, matchRecord };
  }

  static async processMatchResult(matchId, { session = {}, matchRecord = null, writeMatchRecord = false } = {}) {
    const now = Date.now();
    const [teamsSnap, matchesSnap, ratingsSnap, settingsSnap] = await Promise.all([get(ref(db, PATHS.teams)), get(ref(db, PATHS.matches)), get(ref(db, PATHS.playerRatings)), get(ref(db, PATHS.settings))]);
    const teams = teamsSnap.val() || {};
    let matches = listFrom(matchesSnap.val());
    const current = matchRecord || matches.find(m => m.id === matchId);
    if (matchRecord && matchId) {
      const normalizedRecord = { ...matchRecord, id: matchId };
      matches = matches.some(m => m.id === matchId)
        ? matches.map(m => (m.id === matchId ? normalizedRecord : m))
        : [...matches, normalizedRecord];
    }
    const approved = approvedMatches(matches);
    if (current && isApprovedMatch(current)) validateScore(current);
    approved.forEach(validateScore);
    const playerEligibility = assertEligibilityRules(teams, approved, settingsSnap.val()?.eligibilityRules, { enforce: !isAdminRole(session) });
    const standings = computeStandings(teams, approved); const pprcRatings = buildPtlRatings(teams, approved, ratingsSnap.val() || {}); const histories = computeHistories(teams, approved);
    const updatedBy = session?.teamId || session?.role || 'system'; const meta = { updatedAt: now, updatedBy, version: now };
    const matchUpdates = matchId ? (writeMatchRecord
      ? { [`${PATHS.matches}/${matchId}`]: { ...matchRecord, ...meta, processedAt: now, scoreEnteredBy: matchRecord?.enteredBy || updatedBy, approvedBy: matchRecord?.approvedBy || session?.role || updatedBy } }
      : { [`${PATHS.matches}/${matchId}/processedAt`]: now, [`${PATHS.matches}/${matchId}/updatedAt`]: now, [`${PATHS.matches}/${matchId}/updatedBy`]: updatedBy, [`${PATHS.matches}/${matchId}/version`]: now }) : {};
    await update(ref(db), {
      [PATHS.standings]: Object.fromEntries(standings.map(r => [r.teamId, { ...r, ...meta }])),
      [PATHS.pprcRatings]: Object.fromEntries(pprcRatings.map(r => [keyFor(r.name), { ...r, ...meta }])),
      [PATHS.playerHistory]: Object.fromEntries(Object.entries(histories.playerHistory).map(([k, v]) => [k, { ...v, ...meta }])),
      [PATHS.teamHistory]: Object.fromEntries(Object.entries(histories.teamHistory).map(([k, v]) => [k, { ...v, ...meta }])),
      [PATHS.playerMatchups]: Object.fromEntries(Object.entries(histories.playerMatchups).map(([k, v]) => [k, { ...v, ...meta }])),
      [PATHS.teamMatchups]: Object.fromEntries(Object.entries(histories.teamMatchups).map(([k, v]) => [k, { ...v, ...meta }])),
      [PATHS.playerEligibility]: Object.fromEntries(Object.entries(playerEligibility).map(([k, v]) => [k, { ...v, ...meta }])),
      [PATHS.cachedSummaries]: { updatedAt: now, updatedBy, version: now, matchCount: approved.length },
      ...matchUpdates
    });
    return { standings, pprcRatings, playerEligibility, ...histories };
  }
}

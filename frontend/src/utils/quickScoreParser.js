// Quick-paste score parser: ports the legacy scorecard.html parser into a pure function
// and adds player-name fuzzy validation against team rosters.
import { matchName } from './nameMatch';

export function parseQuickScore(text, teams) {
  const results = [];
  const errors = [];
  const corrections = [];

  const abbrLookup = new Map();
  Object.values(teams || {}).forEach(t => {
    if (t.abbreviation) abbrLookup.set(t.abbreviation.toUpperCase(), t);
  });

  const rawLines = (text || '').trim().split('\n').map(l => l.trim()).filter(Boolean);
  if (rawLines.length === 0) return { results: [], errors: [], corrections: [], team1: null, team2: null };

  let team1 = null, team2 = null;
  let startLine = 0;

  // First line: TEAM1 vs TEAM2
  const teamsMatch = rawLines[0].match(/^(\w+)\s+vs\.?\s+(\w+)$/i);
  if (teamsMatch) {
    const t1Abbr = teamsMatch[1].toUpperCase();
    const t2Abbr = teamsMatch[2].toUpperCase();
    team1 = abbrLookup.get(t1Abbr);
    team2 = abbrLookup.get(t2Abbr);
    if (!team1) errors.push(`Unknown team: ${teamsMatch[1]}`);
    if (!team2) errors.push(`Unknown team: ${teamsMatch[2]}`);
    if (team1 && team2 && team1.id === team2.id) errors.push('Teams must be different');
    startLine = 1;
  } else {
    // Try detect from (won) abbreviations
    const wonAbbrs = new Set();
    const m = text.match(/\(won\)\s*(\w+)/gi);
    if (m) m.forEach(w => {
      const a = w.replace(/\(won\)\s*/i, '').toUpperCase();
      if (abbrLookup.has(a)) wonAbbrs.add(a);
    });
    const list = Array.from(wonAbbrs);
    if (list.length >= 2) { team1 = abbrLookup.get(list[0]); team2 = abbrLookup.get(list[1]); }
    if (!team1 || !team2) {
      errors.push('First line should be: TEAM1 vs TEAM2 (e.g., SK vs RR)');
      return { results: [], errors, corrections, team1: null, team2: null };
    }
  }
  if (!team1 || !team2) return { results: [], errors, corrections, team1: null, team2: null };

  const t1Abbr = team1.abbreviation.toUpperCase();
  const t2Abbr = team2.abbreviation.toUpperCase();

  // Merge continuation lines
  const mergedLines = [];
  for (let i = startLine; i < rawLines.length; i++) {
    const line = rawLines[i];
    const startsWithType = /^(S\d?|D\d?|Singles\s*\d?|Doubles\s*\d?)[\s:]/i.test(line);
    const isScoreOnly = /^[\d_\-(),\s]+\(won\)/i.test(line);
    if (isScoreOnly && mergedLines.length > 0) {
      mergedLines[mergedLines.length - 1] += ' ' + line;
    } else if (/^final\s*:/i.test(line)) {
      // Final line is a human-readable match summary; courts already determine the saved winner.
    } else if (startsWithType || /vs/i.test(line)) {
      mergedLines.push(line);
    }
  }

  let doublesCount = 0;
  let singlesCount = 0;

  for (let i = 0; i < mergedLines.length; i++) {
    try {
      const parsed = parseLine(mergedLines[i], team1, team2, t1Abbr, t2Abbr, abbrLookup);
      if (!parsed) continue;
      if (parsed.type === 'doubles') {
        doublesCount++;
        if (!parsed.labelNum) parsed.label = `Doubles ${doublesCount}`;
      } else {
        singlesCount++;
        if (!parsed.labelNum) parsed.label = `Singles ${singlesCount}`;
      }

      if (parsed.type === 'singles' && (parsed.players.team1.length !== 1 || parsed.players.team2.length !== 1)) {
        errors.push(`${parsed.label}: singles requires 1 player per team`);
        continue;
      }
      if (parsed.type === 'doubles' && (parsed.players.team1.length !== 2 || parsed.players.team2.length !== 2)) {
        errors.push(`${parsed.label}: doubles requires 2 players per team`);
        continue;
      }

      // Name validation against the proper team rosters with fuzzy match
      const validate = (names, team) => names.map(n => {
        const trimmed = (n || '').trim();
        if (!trimmed) {
          errors.push(`${parsed.label}: empty player`);
          return trimmed;
        }
        const r = matchName(trimmed, team.players || []);
        if (r.exact) return r.matched.name;
        if (r.matched) {
          corrections.push(`${parsed.label}: auto-corrected "${trimmed}" to "${r.matched.name}"`);
          return r.matched.name;
        }
        if (r.suggestions.length > 0) {
          errors.push(`${parsed.label}: "${trimmed}" not found in ${team.name}. Did you mean ${r.suggestions.slice(0, 3).map(s => `"${s.name}"`).join(', ')}?`);
        } else {
          errors.push(`${parsed.label}: "${trimmed}" not found in ${team.name}`);
        }
        return trimmed;
      });
      parsed.players.team1 = validate(parsed.players.team1, team1);
      parsed.players.team2 = validate(parsed.players.team2, team2);

      results.push(parsed);
    } catch (err) {
      errors.push(`Line ${i + 1 + startLine}: ${err.message}`);
    }
  }
  return { results, errors, corrections, team1, team2 };
}

function parseLine(line, team1, team2, team1Abbr, team2Abbr, abbrLookup) {
  const typeMatch = line.match(/^(S(?:ingles)?\s*(\d)?|D(?:oubles)?\s*(\d)?)[\s:]+/i);
  let remainder = line.replace(/_/g, '');
  let isDoubles = true;
  let courtNum = null;
  let labelNum = false;

  if (typeMatch) {
    const typeStr = typeMatch[1].toUpperCase();
    isDoubles = typeStr.startsWith('D');
    const numMatch = typeStr.match(/\d/);
    if (numMatch) { courtNum = numMatch[0]; labelNum = true; }
    remainder = line.slice(typeMatch[0].length).trim();
    // Be forgiving if Auto-format or pasted text left a nested court label, e.g. "S: S1: Name vs Name".
    remainder = remainder.replace(/^(S\d?|D\d?)\s*:\s*/i, '');
  }

  const wonMatch = remainder.match(/\(won\)\s*(\w+)\s*\.?\s*$/i);
  if (!wonMatch) throw new Error('Must include (won) followed by winner abbreviation');
  const winnerAbbr = wonMatch[1].toUpperCase();
  remainder = remainder.slice(0, wonMatch.index).trim();

  let winnerTeamNum = null;
  const winnerTeam = abbrLookup.get(winnerAbbr);
  if (winnerAbbr === team1Abbr || (winnerTeam && winnerTeam.id === team1.id)) winnerTeamNum = 1;
  else if (winnerAbbr === team2Abbr || (winnerTeam && winnerTeam.id === team2.id)) winnerTeamNum = 2;
  else throw new Error(`Winner "${winnerAbbr}" doesn't match ${team1Abbr} or ${team2Abbr}`);

  const vsMatch = remainder.match(/\s+vs\.?\s+/i);
  if (!vsMatch) throw new Error('Must include "vs" between players');

  const leftSide = remainder.slice(0, vsMatch.index).trim();
  const rightSide = remainder.slice(vsMatch.index + vsMatch[0].length).trim();
  const leftPlayers = leftSide.split('/').map(p => p.trim()).filter(Boolean);

  const scoreStartMatch = rightSide.match(/\s+(\d+\s*-\s*\d+)/);
  if (!scoreStartMatch) throw new Error('Could not find scores (e.g., 4-0)');

  const rightPlayersStr = rightSide.slice(0, scoreStartMatch.index).trim();
  const scoresStr = rightSide.slice(scoreStartMatch.index).trim();
  const rightPlayers = rightPlayersStr.split('/').map(p => p.trim()).filter(Boolean);

  if (leftPlayers.length === 1 && rightPlayers.length === 1) isDoubles = false;
  else if (leftPlayers.length === 2 && rightPlayers.length === 2) isDoubles = true;

  const sets = parseScores(scoresStr);
  if (sets.length === 0) throw new Error('Add at least one set score');
  let g1 = 0, g2 = 0, s1 = 0, s2 = 0;
  const setsData = [];
  for (let i = 0; i < sets.length; i++) {
    const s = sets[i];
    const splitBeforeThird = isDoubles && i === 2 && setsData.length >= 2 && setsData[0].team1 !== setsData[0].team2 && setsData[1].team1 !== setsData[1].team2 && ((setsData[0].team1 > setsData[0].team2) !== (setsData[1].team1 > setsData[1].team2));
    const setData = { set: i + 1, team1: s.left, team2: s.right };
    if (splitBeforeThird) {
      const tbLeft = s.tiebreak?.left ?? s.left;
      const tbRight = s.tiebreak?.right ?? s.right;
      setData.matchTieBreak = { team1: tbLeft, team2: tbRight };
      if (tbLeft > tbRight) {
        setData.team1 = 1;
        setData.team2 = 0;
        s1++;
      } else if (tbRight > tbLeft) {
        setData.team1 = 0;
        setData.team2 = 1;
        s2++;
      }
    } else {
      g1 += s.left; g2 += s.right;
      if (s.left > s.right) s1++;
      else if (s.right > s.left) s2++;
      if (s.tiebreak) setData.tieBreak = { team1: s.tiebreak.left, team2: s.tiebreak.right };
    }
    setsData.push(setData);
  }

  const computedWinnerTeamNum = s1 > s2 ? 1 : (s2 > s1 ? 2 : null);
  if (!computedWinnerTeamNum) throw new Error('No clear winner from set scores');
  if (computedWinnerTeamNum !== winnerTeamNum) throw new Error('Winner abbreviation does not match set scores');

  const courtLabel = isDoubles ? `Doubles ${courtNum || ''}`.trim() : `Singles ${courtNum || ''}`.trim();
  return {
    label: courtLabel,
    labelNum,
    type: isDoubles ? 'doubles' : 'singles',
    players: { team1: leftPlayers, team2: rightPlayers },
    sets: setsData,
    g1, g2, sets1: s1, sets2: s2,
    winnerTeamNum
  };
}

function parseScores(scoresStr) {
  const out = [];
  scoresStr = String(scoresStr || '').replace(/_/g, '');
  const re = /(\d+)\s*-\s*(\d+)(?:\((\d+)\s*-\s*(\d+)\))?/g;
  let m;
  while ((m = re.exec(scoresStr)) !== null) {
    const set = { left: parseInt(m[1], 10), right: parseInt(m[2], 10) };
    if (m[3] && m[4]) set.tiebreak = { left: parseInt(m[3], 10), right: parseInt(m[4], 10) };
    out.push(set);
  }
  return out;
}

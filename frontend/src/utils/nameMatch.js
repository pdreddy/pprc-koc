// Fuzzy name matching utilities

function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

// Levenshtein distance
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[a.length][b.length];
}

// Similarity 0..1
function similarity(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  // First-name token boost: "Srini" matches "Srinivasan" or "Srini Y"
  const ta = na.split(' ');
  const tb = nb.split(' ');
  if (ta[0] === tb[0]) return Math.max(0.85, 1 - levenshtein(na, nb) / Math.max(na.length, nb.length));
  // Substring match
  if (nb.includes(na) || na.includes(nb)) return 0.8;
  // First token of one is substring of other token
  for (const x of ta) for (const y of tb) {
    if (x.length >= 3 && y.length >= 3 && (x.startsWith(y) || y.startsWith(x))) return 0.78;
  }
  const dist = levenshtein(na, nb);
  return Math.max(0, 1 - dist / Math.max(na.length, nb.length));
}

/**
 * Match an input name against team roster.
 * @param {string} input - typed name
 * @param {Array<{name:string,isCaptain?:boolean}>} roster - team players
 * @returns {{matched: object|null, exact: boolean, suggestions: Array<{name:string,score:number,isCaptain?:boolean}>}}
 */
export function matchName(input, roster) {
  if (!input || !Array.isArray(roster) || roster.length === 0) {
    return { matched: null, exact: false, suggestions: [] };
  }
  const inputN = normalize(input);
  // Exact normalized match
  const exact = roster.find(p => normalize(p.name) === inputN);
  if (exact) return { matched: exact, exact: true, suggestions: [] };

  // Score all
  const scored = roster.map(p => ({ ...p, score: similarity(input, p.name) }));
  scored.sort((a, b) => b.score - a.score);
  const top = scored.filter(s => s.score >= 0.45).slice(0, 5);
  // If top score is very high (>=0.92), auto-match
  if (top.length > 0 && top[0].score >= 0.92) {
    return { matched: top[0], exact: false, suggestions: top };
  }
  return { matched: null, exact: false, suggestions: top };
}

// Match a name against pool of multiple teams - returns top suggestions across teams
export function matchNameAcrossTeams(input, teams) {
  if (!input || !teams) return [];
  const pool = [];
  Object.values(teams).forEach(t => {
    (t.players || []).forEach(p => pool.push({ ...p, teamName: t.name, teamId: t.id }));
  });
  return pool
    .map(p => ({ ...p, score: similarity(input, p.name) }))
    .filter(p => p.score >= 0.45)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

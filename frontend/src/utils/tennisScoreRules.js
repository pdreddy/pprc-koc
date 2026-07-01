export const SCORE_ERRORS = {
  regularSet: 'Only 4-0, 4-1, 4-2 or 4-3 are valid set scores.',
  tieRequired: '4-3 requires a tiebreak score.',
  tieInvalid: 'Tiebreak winner must reach 7 points and win by 2.',
  matchTieInvalid: 'Match tiebreak winner must reach 10 points and win by 2.',
  singlesSets: 'Singles winner must win 3 sets.',
  doublesSets: 'Doubles winner must win 2 sets.',
  doublesThird: 'Third set in doubles must be a 10-point match tiebreak.'
};

export function regularSetWinner(a, b) {
  if (a === 4 && b >= 0 && b <= 3) return 1;
  if (b === 4 && a >= 0 && a <= 3) return 2;
  return null;
}

export function isValidTiebreakScore(winnerPoints, loserPoints, minPoints) {
  return winnerPoints >= minPoints && winnerPoints - loserPoints >= 2;
}

function validateRegularSet(set, label, errors) {
  const a = Number(set.team1);
  const b = Number(set.team2);
  const winner = regularSetWinner(a, b);
  if (!winner) {
    errors.push(`${label}: ${SCORE_ERRORS.regularSet}`);
    return null;
  }
  if (Math.max(a, b) === 4 && Math.min(a, b) === 3) {
    const tb = set.tieBreak;
    if (!tb || tb.team1 == null || tb.team2 == null) {
      errors.push(`${label}: ${SCORE_ERRORS.tieRequired}`);
      return winner;
    }
    const tbWinner = Number(tb.team1) > Number(tb.team2) ? 1 : 2;
    const winnerPoints = Math.max(Number(tb.team1) || 0, Number(tb.team2) || 0);
    const loserPoints = Math.min(Number(tb.team1) || 0, Number(tb.team2) || 0);
    if (tbWinner !== winner || !isValidTiebreakScore(winnerPoints, loserPoints, 7)) errors.push(`${label}: ${SCORE_ERRORS.tieInvalid}`);
  }
  return winner;
}

function validateMatchTieBreak(set, label, errors) {
  const matchTieBreak = typeof set.matchTieBreak === 'object' ? set.matchTieBreak : null;
  const a = Number(matchTieBreak?.team1 ?? set.team1) || 0;
  const b = Number(matchTieBreak?.team2 ?? set.team2) || 0;
  const winner = a > b ? 1 : (b > a ? 2 : null);
  const winnerPoints = Math.max(a, b);
  const loserPoints = Math.min(a, b);
  if (!winner || !isValidTiebreakScore(winnerPoints, loserPoints, 10)) errors.push(`${label}: ${SCORE_ERRORS.matchTieInvalid}`);
  return winner;
}

export function validateLineScore(line) {
  const errors = [];
  const sets = line?.sets || [];
  let s1 = 0, s2 = 0;
  sets.forEach((set, idx) => {
    const isDoublesMatchTieBreak = line.type === 'doubles' && idx === 2 && set.matchTieBreak;
    const winner = isDoublesMatchTieBreak ? validateMatchTieBreak(set, line.label, errors) : validateRegularSet(set, line.label, errors);
    if (winner === 1) s1 += 1;
    if (winner === 2) s2 += 1;
  });

  if (line.type === 'singles') {
    if (Math.max(s1, s2) !== 3 || Math.min(s1, s2) >= 3) errors.push(`${line.label}: ${SCORE_ERRORS.singlesSets}`);
  } else {
    const firstTwoSplit = sets.length >= 2 && regularSetWinner(Number(sets[0].team1), Number(sets[0].team2)) !== regularSetWinner(Number(sets[1].team1), Number(sets[1].team2));
    if (firstTwoSplit) {
      if (!sets[2]?.matchTieBreak) errors.push(`${line.label}: ${SCORE_ERRORS.doublesThird}`);
    } else if (sets[2]?.team1 != null || sets[2]?.team2 != null) {
      errors.push(`${line.label}: ${SCORE_ERRORS.doublesThird}`);
    }
    if (Math.max(s1, s2) !== 2 || Math.min(s1, s2) >= 2) errors.push(`${line.label}: ${SCORE_ERRORS.doublesSets}`);
  }
  return [...new Set(errors)];
}

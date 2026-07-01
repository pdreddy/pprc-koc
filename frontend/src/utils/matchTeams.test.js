import { lineWinnerSide } from './matchTeams';

describe('lineWinnerSide', () => {
  test('uses set wins when counted games are tied by a doubles match tiebreak', () => {
    const line = {
      g1: 7,
      g2: 7,
      setWins: { team1: 2, team2: 1 },
      sets: [
        { team1: 3, team2: 4, tiebreak: { team1: 4, team2: 7 } },
        { team1: 4, team2: 3, tiebreak: { team1: 7, team2: 5 } },
        { team1: 1, team2: 0, matchTieBreak: { team1: 10, team2: 5 } }
      ]
    };

    expect(lineWinnerSide(line)).toBe(1);
  });

  test('falls back to counted games for older line records without set wins', () => {
    expect(lineWinnerSide({ g1: 8, g2: 6 })).toBe(1);
    expect(lineWinnerSide({ g1: 5, g2: 8 })).toBe(2);
    expect(lineWinnerSide({ g1: 7, g2: 7 })).toBeNull();
  });
});

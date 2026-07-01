import { parseQuickScore } from './quickScoreParser';
import { validateLineScore } from './tennisScoreRules';

const teams = {
  rcb: {
    id: 'rcb',
    name: 'RCB',
    abbreviation: 'RCB',
    players: [
      { name: 'Jay Sermadevi' },
      { name: 'Kalyan Kalidindi' },
      { name: 'Jayesh Barai' },
      { name: 'Janaki Ram Kantheti' },
      { name: 'Satish K' }
    ]
  },
  posh: {
    id: 'posh',
    name: 'POSH',
    abbreviation: 'POSH',
    players: [
      { name: 'Nikhil Katakam' },
      { name: 'Vamsi Atluri' },
      { name: 'Guru Bavirisetty' },
      { name: 'Vinod Aripaka' },
      { name: 'Rajasekhar Chejerla' }
    ]
  }
};

test('doubles match tiebreak is stored as a 1-0 set with 10-point score', () => {
  const parsed = parseQuickScore(`RCB vs POSH
D1: Kalyan Kalidindi/Jayesh Barai vs Vamsi Atluri/Guru Bavirisetty 3-4(4-7), 4-3(7-5), 10-5 (won) RCB`, teams);

  expect(parsed.errors).toEqual([]);
  const line = parsed.results[0];
  expect(line.g1).toBe(7);
  expect(line.g2).toBe(7);
  expect(line.sets).toEqual([
    { set: 1, team1: 3, team2: 4, tieBreak: { team1: 4, team2: 7 } },
    { set: 2, team1: 4, team2: 3, tieBreak: { team1: 7, team2: 5 } },
    { set: 3, team1: 1, team2: 0, matchTieBreak: { team1: 10, team2: 5 } }
  ]);
  expect(validateLineScore({ label: line.label, type: line.type, sets: line.sets })).toEqual([]);
});

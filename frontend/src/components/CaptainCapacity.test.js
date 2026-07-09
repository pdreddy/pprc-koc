import { buildCaptainCapacityRows } from './CaptainCapacity';

const team = {
  id: 'bb',
  players: [
    { name: 'A' },
    { name: 'B' },
    { name: 'C' },
    { name: 'D' },
    { name: 'E' }
  ]
};
const teams = { bb: team, rr: { id: 'rr', players: [] } };
const rules = { maxSinglesDays: 2, maxTotalMatchDays: 5, maxPartnerDays: 2 };

test('locked lineup counts before score entry', () => {
  const rows = buildCaptainCapacityRows(team, teams, [], rules, {
    sched1: {
      bb: {
        scheduleId: 'sched1',
        lockedAt: 1,
        lineup: [
          { label: 'S1', players: ['A'] },
          { label: 'D1', players: ['B', 'C'] },
          { label: 'D2', players: ['D', 'E'] }
        ]
      }
    }
  });
  expect(rows.find(row => row.name === 'A').singlesDays).toBe(1);
  expect(rows.find(row => row.name === 'B').doublesDays).toBe(2);
});

test('approved score does not double-count the same schedule lineup', () => {
  const rows = buildCaptainCapacityRows(team, teams, [{
    scheduleId: 'sched1',
    t1Id: 'bb',
    t2Id: 'rr',
    status: 'APPROVED',
    lines: [
      { type: 'singles', players: { team1: ['A'], team2: ['Z'] } },
      { type: 'doubles', players: { team1: ['B', 'C'], team2: ['Y', 'X'] } },
      { type: 'doubles', players: { team1: ['B', 'C'], team2: ['W', 'V'] } }
    ]
  }], rules, {
    sched1: {
      bb: {
        scheduleId: 'sched1',
        lockedAt: 1,
        lineup: [
          { label: 'S1', players: ['A'] },
          { label: 'D1', players: ['B', 'C'] }
        ]
      }
    }
  });
  expect(rows.find(row => row.name === 'A').singlesDays).toBe(1);
  expect(rows.find(row => row.name === 'B').doublesDays).toBe(2);
  expect(rows.find(row => row.name === 'B').totalMatchDays).toBe(2);
});

test('converted locked lineup does not count after score conversion marker', () => {
  const rows = buildCaptainCapacityRows(team, teams, [], rules, {
    sched2: {
      bb: {
        scheduleId: 'sched2',
        lockedAt: 1,
        convertedToScoreAt: 2,
        lineup: [
          { label: 'S1', players: ['A'] },
          { label: 'D1', players: ['B', 'C'] }
        ]
      }
    }
  });
  expect(rows.find(row => row.name === 'A').singlesDays).toBe(0);
  expect(rows.find(row => row.name === 'B').doublesDays).toBe(0);
});

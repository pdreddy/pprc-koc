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
  expect(rows.find(row => row.name === 'B').doublesDays).toBe(1);
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
  expect(rows.find(row => row.name === 'B').doublesDays).toBe(1);
  expect(rows.find(row => row.name === 'B').totalMatchDays).toBe(1);
});

test('converted locked lineup does not double-count when saved match is visible', () => {
  const rows = buildCaptainCapacityRows(team, teams, [{
    id: 'm-visible',
    scheduleId: 'sched2',
    t1Id: 'bb',
    t2Id: 'rr',
    status: 'APPROVED',
    lines: [
      { type: 'singles', players: { team1: ['A'], team2: ['Z'] } },
      { type: 'doubles', players: { team1: ['B', 'C'], team2: ['Y', 'X'] } },
      { type: 'doubles', players: { team1: ['B', 'C'], team2: ['W', 'V'] } }
    ]
  }], rules, {
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
  expect(rows.find(row => row.name === 'A').singlesDays).toBe(1);
  expect(rows.find(row => row.name === 'A').totalMatchDays).toBe(1);
  expect(rows.find(row => row.name === 'B').doublesDays).toBe(1);
  expect(rows.find(row => row.name === 'B').totalMatchDays).toBe(1);
});

test('same player counts once per scored match day but across separate saved days', () => {
  const rows = buildCaptainCapacityRows(team, teams, [
    {
      id: 'm1',
      scheduleId: 'sched1',
      t1Id: 'bb',
      t2Id: 'rr',
      status: 'APPROVED',
      lines: [
        { type: 'doubles', players: { team1: ['B', 'C'], team2: ['Y', 'X'] } },
        { type: 'doubles', players: { team1: ['B', 'C'], team2: ['W', 'V'] } }
      ]
    },
    {
      id: 'm2',
      scheduleId: 'sched2',
      t1Id: 'bb',
      t2Id: 'rr',
      status: 'APPROVED',
      lines: [
        { type: 'singles', players: { team1: ['B'], team2: ['Z'] } }
      ]
    }
  ], rules, {});
  const row = rows.find(item => item.name === 'B');
  expect(row.doublesDays).toBe(1);
  expect(row.singlesDays).toBe(1);
  expect(row.totalMatchDays).toBe(2);
});

test('capacity matches saved player names with punctuation and spacing differences', () => {
  const rows = buildCaptainCapacityRows(team, teams, [{
    id: 'm3',
    scheduleId: 'sched3',
    t1Id: 'bb',
    t2Id: 'rr',
    status: 'APPROVED',
    lines: [
      { type: 'singles', players: { team1: ['  A!!  '], team2: ['Z'] } },
      { type: 'doubles', players: { team1: ['B', 'C'], team2: ['Y', 'X'] } },
      { type: 'doubles', players: { team1: ['B', 'C'], team2: ['W', 'V'] } }
    ]
  }], rules, {});
  expect(rows.find(row => row.name === 'A').singlesDays).toBe(1);
  expect(rows.find(row => row.name === 'A').totalMatchDays).toBe(1);
  expect(rows.find(row => row.name === 'B').doublesDays).toBe(1);
  expect(rows.find(row => row.name === 'B').totalMatchDays).toBe(1);
});

test('locked lineup still counts when score marker exists but saved match is not visible yet', () => {
  const rows = buildCaptainCapacityRows(team, teams, [], rules, {
    sched4: {
      bb: {
        scheduleId: 'sched4',
        lockedAt: 1,
        scoreSavedAt: 2,
        convertedToScoreAt: 2,
        lineup: [
          { label: 'S1', players: ['A'] },
          { label: 'D1', players: ['B', 'C'] },
          { label: 'D2', players: ['D', 'E'] }
        ]
      }
    }
  });
  expect(rows.find(row => row.name === 'A').singlesDays).toBe(1);
  expect(rows.find(row => row.name === 'A').totalMatchDays).toBe(1);
  expect(rows.find(row => row.name === 'B').doublesDays).toBe(1);
  expect(rows.find(row => row.name === 'B').totalMatchDays).toBe(1);
});

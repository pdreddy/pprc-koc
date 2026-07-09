jest.mock('../firebase', () => ({
  db: {},
  ensureAuth: jest.fn(),
  PATHS: {
    lineupSubmissions: 'koc_s3/lineupSubmissions',
    lineupSubmissionMeta: 'koc_s3/lineupSubmissionMeta'
  }
}));

import { buildLineupCourts, scoreLineupFixtures, buildLineupScoreClearUpdates } from './ScoreEntry';

const teams = {
  rr: {
    id: 'rr',
    name: 'Rudra Racquets',
    abbreviation: 'RR',
    group: 'A',
    players: [
      { name: 'RR Singles' },
      { name: 'RR D1 A' },
      { name: 'RR D1 B' },
      { name: 'RR D2 A' },
      { name: 'RR D2 B' }
    ]
  },
  bb: {
    id: 'bb',
    name: 'Baseline Bashers',
    abbreviation: 'BB',
    group: 'A',
    players: [
      { name: 'BB Singles' },
      { name: 'BB D1 A' },
      { name: 'BB D1 B' },
      { name: 'BB D2 A' },
      { name: 'BB D2 B' }
    ]
  }
};

const schedule = {
  'A-r1-m1': {
    id: 'A-r1-m1',
    round: 1,
    date: '2026-06-27',
    team1Id: 'rr',
    team2Id: 'bb',
    group: 'A'
  }
};

test('buildLineupCourts maps official revealed lineup into score-entry court order', () => {
  const courts = buildLineupCourts(
    ['RR Singles', 'RR D1 A', 'RR D1 B', 'RR D2 A', 'RR D2 B'],
    ['BB Singles', 'BB D1 A', 'BB D1 B', 'BB D2 A', 'BB D2 B']
  );

  expect(courts.map(court => court.label)).toEqual(['Singles', 'Doubles 1', 'Doubles 1 Reverse', 'Doubles 2', 'Doubles 2 Reverse']);
  expect(courts[0].p1).toEqual(['RR Singles']);
  expect(courts[0].p2).toEqual(['BB Singles']);
  expect(courts[1].p1).toEqual(['RR D1 A', 'RR D1 B']);
  expect(courts[1].p2).toEqual(['BB D1 A', 'BB D1 B']);
  expect(courts[2].p1).toEqual(['RR D1 A', 'RR D1 B']);
  expect(courts[2].p2).toEqual(['BB D2 A', 'BB D2 B']);
  expect(courts[4].p1).toEqual(['RR D2 A', 'RR D2 B']);
  expect(courts[4].p2).toEqual(['BB D1 A', 'BB D1 B']);
});

test('scoreLineupFixtures prefers canonical revealed lineup rows', () => {
  const fixtures = scoreLineupFixtures(
    schedule,
    {
      'A-r1-m1-R26747739': {
        revealId: 'A-r1-m1-R26747739',
        revealCode: 'A-r1-m1-R26747739',
        scheduleId: 'A-r1-m1',
        team1Id: 'rr',
        team2Id: 'bb',
        revealedAt: 10,
        lineups: {
          rr: [
            { label: 'S1', players: ['RR Singles'] },
            { label: 'D1', players: ['RR D1 A', 'RR D1 B'] },
            { label: 'D2', players: ['RR D2 A', 'RR D2 B'] }
          ],
          bb: [
            { label: 'S1', players: ['BB Singles'] },
            { label: 'D1', players: ['BB D1 A', 'BB D1 B'] },
            { label: 'D2', players: ['BB D2 A', 'BB D2 B'] }
          ]
        }
      }
    },
    {},
    'rr',
    'bb',
    teams,
    [],
    {}
  );

  expect(fixtures).toHaveLength(1);
  expect(fixtures[0]).toMatchObject({
    revealId: 'A-r1-m1-R26747739',
    revealCode: 'A-r1-m1-R26747739',
    source: 'revealedLineups',
    ready: true,
    revealed: true
  });
  expect(fixtures[0].team1Names).toEqual(['RR Singles', 'RR D1 A', 'RR D1 B', 'RR D2 A', 'RR D2 B']);
  expect(fixtures[0].team2Names).toEqual(['BB Singles', 'BB D1 A', 'BB D1 B', 'BB D2 A', 'BB D2 B']);
});

test('scoreLineupFixtures keeps locked submission fallback distinct from canonical reveal source', () => {
  const fixtures = scoreLineupFixtures(
    schedule,
    {},
    {
      'A-r1-m1': {
        rr: {
          scheduleId: 'A-r1-m1',
          teamId: 'rr',
          lockedAt: 10,
          lineup: [
            { label: 'S1', players: ['RR Singles'] },
            { label: 'D1', players: ['RR D1 A', 'RR D1 B'] },
            { label: 'D2', players: ['RR D2 A', 'RR D2 B'] }
          ]
        },
        bb: {
          scheduleId: 'A-r1-m1',
          teamId: 'bb',
          lockedAt: 11,
          lineup: [
            { label: 'S1', players: ['BB Singles'] },
            { label: 'D1', players: ['BB D1 A', 'BB D1 B'] },
            { label: 'D2', players: ['BB D2 A', 'BB D2 B'] }
          ]
        }
      }
    },
    'rr',
    'bb',
    teams,
    [],
    {}
  );

  expect(fixtures).toHaveLength(1);
  expect(fixtures[0]).toMatchObject({
    source: 'lockedSubmissions',
    ready: true,
    revealed: false
  });
});

test('buildLineupScoreClearUpdates clears saved score markers for both teams', () => {
  const updates = buildLineupScoreClearUpdates({
    scheduleId: 'A-r1-m1',
    t1Id: 'rr',
    t2Id: 'bb'
  }, 12345);

  expect(updates).toMatchObject({
    'koc_s3/lineupSubmissions/A-r1-m1/rr/scoreSavedAt': null,
    'koc_s3/lineupSubmissions/A-r1-m1/rr/scoreSavedBy': null,
    'koc_s3/lineupSubmissions/A-r1-m1/rr/convertedToScoreAt': null,
    'koc_s3/lineupSubmissions/A-r1-m1/rr/lastUpdatedAt': 12345,
    'koc_s3/lineupSubmissions/A-r1-m1/bb/scoreSavedAt': null,
    'koc_s3/lineupSubmissionMeta/A-r1-m1/bb/scoreSavedAt': null,
    'koc_s3/lineupSubmissionMeta/A-r1-m1/bb/scoreSavedBy': null,
    'koc_s3/lineupSubmissionMeta/A-r1-m1/bb/convertedToScoreAt': null,
    'koc_s3/lineupSubmissionMeta/A-r1-m1/bb/lastUpdatedAt': 12345
  });
});

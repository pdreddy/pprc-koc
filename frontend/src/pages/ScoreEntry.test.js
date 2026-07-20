jest.mock('../firebase', () => ({
  db: {},
  ensureAuth: jest.fn(),
  PATHS: {
    lineupSubmissions: 'koc_s3/lineupSubmissions',
    lineupSubmissionDetails: 'koc_s3/lineupSubmissionDetails',
    lineupSubmissionMeta: 'koc_s3/lineupSubmissionMeta',
    scoreArchive: 'koc_s3/scoreArchive'
  }
}));

import { buildLineupCourts, courtsFromMatch, scoreLineupFixtures, validateEligibilityForLines } from './ScoreEntry';
import { buildLineupScoreClearUpdates } from '../utils/lineupScoreMarkers';
import { buildScoreArchiveUpdates } from '../utils/scoreArchive';

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
    'koc_s3/lineupSubmissionDetails/A-r1-m1/rr/scoreSavedAt': null,
    'koc_s3/lineupSubmissionDetails/A-r1-m1/rr/scoreSavedBy': null,
    'koc_s3/lineupSubmissionDetails/A-r1-m1/rr/convertedToScoreAt': null,
    'koc_s3/lineupSubmissionDetails/A-r1-m1/rr/lastUpdatedAt': 12345,
    'koc_s3/lineupSubmissionDetails/A-r1-m1/bb/scoreSavedAt': null,
    'koc_s3/lineupSubmissionMeta/A-r1-m1/bb/scoreSavedAt': null,
    'koc_s3/lineupSubmissionMeta/A-r1-m1/bb/scoreSavedBy': null,
    'koc_s3/lineupSubmissionMeta/A-r1-m1/bb/convertedToScoreAt': null,
    'koc_s3/lineupSubmissionMeta/A-r1-m1/bb/lastUpdatedAt': 12345
  });
});


test('validateEligibilityForLines excludes the current schedule when rechecking a saved score', () => {
  const lines = [
    { type: 'singles', players: { team1: ['RR Singles'], team2: ['Prashanth Jayantha Kumar'] } }
  ];
  const existingMatches = [
    {
      id: 'old-match',
      scheduleId: 'A-r0-m1',
      status: 'APPROVED',
      t1Id: 'rr',
      t2Id: 'bb',
      lines
    },
    {
      id: 'current-match',
      scheduleId: 'A-r1-m1',
      status: 'APPROVED',
      t1Id: 'rr',
      t2Id: 'bb',
      lines
    }
  ];
  const localTeams = {
    ...teams,
    bb: {
      ...teams.bb,
      players: [{ name: 'Prashanth Jayantha Kumar' }]
    }
  };

  expect(validateEligibilityForLines(lines, localTeams.rr, localTeams.bb, existingMatches, localTeams, { maxSinglesDays: 2, maxTotalMatchDays: 10, maxPartnerDays: 10 }))
    .toContain('Prashanth Jayantha Kumar: singles limit exceeded (3/2 Singles Days)');
  expect(validateEligibilityForLines(lines, localTeams.rr, localTeams.bb, existingMatches, localTeams, { maxSinglesDays: 2, maxTotalMatchDays: 10, maxPartnerDays: 10 }, { scheduleId: 'A-r1-m1' }))
    .not.toContain('Prashanth Jayantha Kumar: singles limit exceeded (3/2 Singles Days)');
});


test('courtsFromMatch maps previous S1/D1/D2 score labels back into every editable court', () => {
  const courts = courtsFromMatch({
    lines: [
      {
        label: 'S1',
        type: 'singles',
        players: { team1: ['RR Singles'], team2: ['BB Singles'] },
        sets: [{ team1: 4, team2: 1 }]
      },
      {
        label: 'D1',
        type: 'doubles',
        players: { team1: ['RR D1 A', 'RR D1 B'], team2: ['BB D1 A', 'BB D1 B'] },
        sets: [{ team1: 4, team2: 2 }]
      },
      {
        label: 'D1',
        type: 'doubles',
        players: { team1: ['RR D1 A', 'RR D1 B'], team2: ['BB D2 A', 'BB D2 B'] },
        sets: [{ team1: 3, team2: 4 }]
      },
      {
        label: 'D2',
        type: 'doubles',
        players: { team1: ['RR D2 A', 'RR D2 B'], team2: ['BB D2 A', 'BB D2 B'] },
        sets: [{ team1: 4, team2: 0 }]
      },
      {
        label: 'D2',
        type: 'doubles',
        players: { team1: ['RR D2 A', 'RR D2 B'], team2: ['BB D1 A', 'BB D1 B'] },
        sets: [{ team1: 2, team2: 4 }]
      }
    ]
  });

  expect(courts[0].p1).toEqual(['RR Singles']);
  expect(courts[1].p1).toEqual(['RR D1 A', 'RR D1 B']);
  expect(courts[1].p2).toEqual(['BB D1 A', 'BB D1 B']);
  expect(courts[2].p1).toEqual(['RR D1 A', 'RR D1 B']);
  expect(courts[2].p2).toEqual(['BB D2 A', 'BB D2 B']);
  expect(courts[3].p1).toEqual(['RR D2 A', 'RR D2 B']);
  expect(courts[3].p2).toEqual(['BB D2 A', 'BB D2 B']);
  expect(courts[4].p1).toEqual(['RR D2 A', 'RR D2 B']);
  expect(courts[4].p2).toEqual(['BB D1 A', 'BB D1 B']);
  expect(courts[0].sets[0]).toMatchObject({ a: '4', b: '1' });
  expect(courts[2].sets[0]).toMatchObject({ a: '3', b: '4' });
  expect(courts[4].sets[0]).toMatchObject({ a: '2', b: '4' });
});



test('buildScoreArchiveUpdates writes current and immutable event snapshots', () => {
  const updates = buildScoreArchiveUpdates({ id: 'match-1', t1Id: 'rr', t2Id: 'bb', courtsWon1: 3, courtsWon2: 2 }, { action: 'delete', session: { role: 'SUPER_ADMIN' }, now: 999, reason: 'test delete' });

  expect(updates['koc_s3/scoreArchive/match-1/current']).toMatchObject({
    id: 'match-1',
    archiveAction: 'delete',
    archiveReason: 'test delete',
    archivedBy: 'SUPER_ADMIN',
    archivedAt: 999
  });
  expect(updates['koc_s3/scoreArchive/match-1/events/999_delete']).toMatchObject({
    id: 'match-1',
    courtsWon1: 3,
    courtsWon2: 2,
    archiveAction: 'delete'
  });
});

test('validateEligibilityForLines matches saved names with punctuation when enforcing caps', () => {
  const localTeams = {
    rr: { ...teams.rr, players: [{ name: 'CSK Opponent' }] },
    bb: { ...teams.bb, players: [{ name: 'Prashanth Jayantha Kumar' }] }
  };
  const currentLines = [
    { type: 'singles', players: { team1: ['CSK Opponent'], team2: ['Prashanth Jayantha Kumar'] } }
  ];
  const existingMatches = [
    {
      id: 'm1',
      scheduleId: 'sched-one',
      status: 'APPROVED',
      t1Id: 'rr',
      t2Id: 'bb',
      lines: [
        { type: 'singles', players: { team1: ['CSK Opponent'], team2: ['  Prashanth  Jayantha-Kumar!! '] } }
      ]
    },
    {
      id: 'm2',
      scheduleId: 'sched-two',
      status: 'APPROVED',
      t1Id: 'rr',
      t2Id: 'bb',
      lines: [
        { type: 'doubles', players: { team1: ['CSK Opponent', 'RR D1 A'], team2: ['Prashanth Jayantha Kumar', 'BB D1 A'] } },
        { type: 'doubles', players: { team1: ['CSK Opponent', 'RR D1 A'], team2: ['Prashanth Jayantha Kumar', 'BB D1 A'] } }
      ]
    }
  ];

  expect(validateEligibilityForLines(currentLines, localTeams.rr, localTeams.bb, existingMatches, localTeams, { maxSinglesDays: 1, maxTotalMatchDays: 2, maxPartnerDays: 10 }))
    .toEqual(expect.arrayContaining([
      'Prashanth Jayantha Kumar: singles limit exceeded (2/1 Singles Days)',
      'Prashanth Jayantha Kumar: match-day limit exceeded (3/2 Match Days)'
    ]));
});

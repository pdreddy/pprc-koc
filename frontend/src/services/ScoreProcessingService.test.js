jest.mock('../firebase', () => ({
  db: {},
  PATHS: {
    teams: 'teams',
    matches: 'matches',
    playerRatings: 'playerRatings',
    settings: 'settings',
    standings: 'standings',
    pprcRatings: 'pprcRatings',
    playerHistory: 'playerHistory',
    teamHistory: 'teamHistory',
    playerMatchups: 'playerMatchups',
    teamMatchups: 'teamMatchups',
    playerEligibility: 'playerEligibility',
    cachedSummaries: 'cachedSummaries'
  }
}));

const mockGet = jest.fn();
const mockUpdate = jest.fn();

jest.mock('firebase/database', () => ({
  get: (...args) => mockGet(...args),
  update: (...args) => mockUpdate(...args),
  ref: (_db, path = '') => path,
  push: jest.fn(() => ({ key: 'new-match-id' }))
}));

import { ScoreProcessingService } from './ScoreProcessingService';

const teams = {
  csk: { id: 'csk', name: 'Chill Super Kings', abbreviation: 'CSK', players: [{ name: 'Kalyan Ghanta' }] },
  kc: { id: 'kc', name: "Karna's Crusaders", abbreviation: 'KC', players: [{ name: 'Prashanth Jayantha Kumar' }] }
};

function singlesMatch(id, scheduleId, cskName = 'Kalyan Ghanta') {
  return {
    id,
    scheduleId,
    t1Id: 'csk',
    t2Id: 'kc',
    winnerId: 'csk',
    status: 'APPROVED',
    g1: 12,
    g2: 0,
    s1: 3,
    s2: 0,
    lines: [{
      label: 'Singles',
      type: 'singles',
      g1: 12,
      g2: 0,
      setWins: { team1: 3, team2: 0 },
      sets: [{ team1: 4, team2: 0 }, { team1: 4, team2: 0 }, { team1: 4, team2: 0 }],
      players: { team1: [cskName], team2: ['Prashanth Jayantha Kumar'] }
    }]
  };
}

function mockProcessingReads(matches) {
  mockGet.mockImplementation(path => Promise.resolve({
    val: () => {
      if (path === 'teams') return teams;
      if (path === 'matches') return Object.fromEntries(matches.map(match => [match.id, match]));
      if (path === 'settings') return { eligibilityRules: { maxSinglesDays: 1, maxTotalMatchDays: 6, maxPartnerDays: 3 } };
      return {};
    }
  }));
  mockUpdate.mockResolvedValue(undefined);
}

beforeEach(() => {
  mockGet.mockReset();
  mockUpdate.mockReset();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  console.warn.mockRestore();
});

test('captain score processing still enforces eligibility caps', async () => {
  mockProcessingReads([
    singlesMatch('m1', 'sched-1'),
    singlesMatch('m2', 'sched-2', 'Kalyan  Ghanta!!')
  ]);

  await expect(ScoreProcessingService.processMatchResult(null, { session: { role: 'CAPTAIN', teamId: 'csk' } }))
    .rejects.toThrow('Kalyan Ghanta: singles limit exceeded (2/1 Singles Days)');
});

test('admin score processing saves aggregates while skipping eligibility blockers', async () => {
  mockProcessingReads([
    singlesMatch('m1', 'sched-1'),
    singlesMatch('m2', 'sched-2', 'Kalyan  Ghanta!!')
  ]);

  await expect(ScoreProcessingService.processMatchResult(null, { session: { role: 'SUPER_ADMIN' } }))
    .resolves.toEqual(expect.objectContaining({ playerEligibility: expect.any(Object) }));
  expect(mockUpdate).toHaveBeenCalled();
  expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Admin score processing eligibility warnings skipped:'), expect.stringContaining('Kalyan Ghanta: singles limit exceeded'));
});

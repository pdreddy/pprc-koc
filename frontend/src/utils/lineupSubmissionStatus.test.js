import { isLockedLineupSubmission } from './lineupSubmissionStatus';

test('recognizes all submitted locked lineup variants', () => {
  expect(isLockedLineupSubmission({ lockedAt: 1 })).toBe(true);
  expect(isLockedLineupSubmission({ submittedAt: 1 })).toBe(true);
  expect(isLockedLineupSubmission({ revealedAt: 1 })).toBe(true);
  expect(isLockedLineupSubmission({ revealId: 'r1' })).toBe(true);
  expect(isLockedLineupSubmission({ submissionStatus: 'submitted_locked' })).toBe(true);
});

test('does not treat missing or unlocked submissions as locked', () => {
  expect(isLockedLineupSubmission(null)).toBe(false);
  expect(isLockedLineupSubmission({})).toBe(false);
  expect(isLockedLineupSubmission({ lockedAt: 1, unlockedAt: 2 })).toBe(false);
});

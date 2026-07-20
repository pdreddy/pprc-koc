export function isLockedLineupSubmission(submission) {
  return !!submission && !submission.unlockedAt && (
    !!submission.lockedAt ||
    !!submission.submittedAt ||
    !!submission.revealedAt ||
    !!submission.revealId ||
    submission.submissionStatus === 'submitted_locked'
  );
}

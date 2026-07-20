// Use the v1 API explicitly. firebase-functions v6 no longer exposes the v1
// namespaces (functions.database.*) on the default export — they live under the
// /v1 subpath — so requiring the bare package makes functions.database undefined
// and `functions.database.ref` throws "is not a function" at load time.
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

admin.initializeApp();

const SEASON_ROOT = 'koc_s3';

function lineupByTeam(submission) {
  return Array.isArray(submission?.lineup) ? submission.lineup : [];
}


function playerNamesForTeam(team) {
  return new Set(Object.values(team?.players || {}).map(player => String(player?.name || '').trim().toLowerCase()).filter(Boolean));
}

function validateLockedSubmission({ submission, team, teamId, scheduleId, fixture }) {
  const errors = [];
  if (submission?.scheduleId && String(submission.scheduleId) !== String(scheduleId)) errors.push('Submission scheduleId does not match path scheduleId');
  if (submission?.teamId && String(submission.teamId) !== String(teamId)) errors.push('Submission teamId does not match path teamId');
  if (![fixture.team1Id, fixture.team2Id].includes(teamId)) errors.push('Team is not part of this scheduled match');
  const lineup = lineupByTeam(submission);
  const singles = lineup.filter(line => line?.label === 'S1');
  const doubles1 = lineup.filter(line => line?.label === 'D1');
  const doubles2 = lineup.filter(line => line?.label === 'D2');
  if (singles.length !== 1 || doubles1.length !== 1 || doubles2.length !== 1) errors.push('Lineup must include S1, D1, and D2 lines');
  const slotNames = [singles[0]?.players?.[0], ...(doubles1[0]?.players || []), ...(doubles2[0]?.players || [])].map(name => String(name || '').trim()).filter(Boolean);
  if (slotNames.length !== 5) errors.push('Lineup must include exactly 5 selected player slots');
  const lowerNames = slotNames.map(name => name.toLowerCase());
  if (new Set(lowerNames).size !== lowerNames.length) errors.push('A player cannot be selected in more than one lineup slot');
  const rosterNames = playerNamesForTeam(team);
  slotNames.forEach(name => {
    if (!rosterNames.has(name.toLowerCase())) errors.push(`${name} is not on the submitting team roster`);
  });
  if ((doubles1[0]?.players || []).length !== 2) errors.push('D1 must have exactly two players');
  if ((doubles2[0]?.players || []).length !== 2) errors.push('D2 must have exactly two players');
  return Array.from(new Set(errors));
}


async function writeSystemLineupAudit(root, { actionType, scheduleId, teamId, metadata = {} }) {
  const now = Date.now();
  await root.child('auditLogs').push({
    actionId: `${now}-${Math.random().toString(36).slice(2, 10)}`,
    actionType,
    performedByUserId: 'cloud-function',
    performedByName: 'Lineup Reveal Function',
    performedByRole: 'server',
    targetType: 'lineup',
    targetId: `${scheduleId || 'unknown'}:${teamId || 'all'}`,
    oldValue: null,
    newValue: { scheduleId, teamId, actionTimestamp: now, lastUpdatedAt: metadata.lastUpdatedAt || now, ...metadata },
    timestamp: now,
    ipAddress: 'server',
    device: 'server',
    browser: 'firebase-functions'
  });
}

async function markInvalidSubmission(root, scheduleId, teamId, errors) {
  const now = Date.now();
  const updates = {
    [`lineupSubmissionDetails/${scheduleId}/${teamId}/submissionStatus`]: 'validation_failed',
    [`lineupSubmissionDetails/${scheduleId}/${teamId}/validationErrors`]: errors,
    [`lineupSubmissionDetails/${scheduleId}/${teamId}/lockedAt`]: null,
    [`lineupSubmissionDetails/${scheduleId}/${teamId}/lastUpdatedAt`]: now,
    [`lineupSubmissionMeta/${scheduleId}/${teamId}/submissionStatus`]: 'validation_failed',
    [`lineupSubmissionMeta/${scheduleId}/${teamId}/validationErrors`]: errors,
    [`lineupSubmissionMeta/${scheduleId}/${teamId}/lockedAt`]: null,
    [`lineupSubmissionMeta/${scheduleId}/${teamId}/lastUpdatedAt`]: now
  };
  await root.update(updates);
  await writeSystemLineupAudit(root, { actionType: 'Lineup Validation Failed', scheduleId, teamId, metadata: { validationErrors: errors, lastUpdatedAt: now } });
}

// Trigger on the metadata `lockedAt` leaf (a single timestamp) instead of the
// full lineup submission. Realtime Database caps a Cloud Function event payload
// at 1 MB and rejects the client write before the function runs whenever the
// trigger snapshot would exceed that limit. Full lineup details now live under
// `lineupSubmissionDetails`, while this scalar metadata trigger stays tiny and
// avoids the legacy `lineupSubmissions` hot path that caused
// `TRIGGER_PAYLOAD_TOO_LARGE` during captain lineup and score-marker writes.
exports.revealLineupsOnLock = functions.database
  .ref(`/${SEASON_ROOT}/lineupSubmissionMeta/{scheduleId}/{teamId}/lockedAt`)
  .onWrite(async (change, context) => {
    const { scheduleId, teamId } = context.params;
    const root = admin.database().ref(SEASON_ROOT);

    // Read the full submission server-side; the trigger event only carries the
    // lockedAt timestamp, and a server read has no payload-size limit.
    const submissionSnap = await root.child(`lineupSubmissionDetails/${scheduleId}/${teamId}`).get();
    const after = submissionSnap.val();

    if (!after) {
      await root.child(`lineupSubmissionMeta/${scheduleId}/${teamId}`).remove();
      return null;
    }

    const safeMeta = {
      scheduleId,
      teamId,
      opponentTeamId: after.opponentTeamId || '',
      submissionStatus: after.submissionStatus || null,
      submittedAt: after.submittedAt || null,
      lockedAt: after.lockedAt || null,
      unlockedAt: after.unlockedAt || null,
      unlockedBy: after.unlockedBy || null,
      unlockReason: after.unlockReason || null,
      whatsappShared: !!after.whatsappShared,
      whatsappSharedAt: after.whatsappSharedAt || null,
      validationErrors: Array.isArray(after.validationErrors) ? after.validationErrors : [],
      convertedToScoreAt: after.convertedToScoreAt || null,
      scoreSavedAt: after.scoreSavedAt || null,
      scoreSavedBy: after.scoreSavedBy || null,
      lastUpdatedAt: after.lastUpdatedAt || null,
      version: after.version || null,
      revealedAt: after.revealedAt || null,
      revealId: after.revealId || null
    };
    await root.child(`lineupSubmissionMeta/${scheduleId}/${teamId}`).set(safeMeta);

    if (!after?.lockedAt || after.unlockedAt) return null;

    const scheduleSnap = await root.child(`schedule/${scheduleId}`).get();
    const fixture = scheduleSnap.val();
    if (!fixture?.team1Id || !fixture?.team2Id) return null;

    const submittingTeamSnap = await root.child(`teams/${teamId}`).get();
    const validationErrors = validateLockedSubmission({ submission: after, team: submittingTeamSnap.val(), teamId, scheduleId, fixture });
    if (validationErrors.length) {
      await markInvalidSubmission(root, scheduleId, teamId, validationErrors);
      return null;
    }

    const submissionsSnap = await root.child(`lineupSubmissionDetails/${scheduleId}`).get();
    const submissions = submissionsSnap.val() || {};
    const team1Submission = submissions[fixture.team1Id];
    const team2Submission = submissions[fixture.team2Id];
    if (!team1Submission?.lockedAt || !team2Submission?.lockedAt || team1Submission.unlockedAt || team2Submission.unlockedAt) return null;

    const teamsSnap = await root.child('teams').get();
    const teams = teamsSnap.val() || {};
    const team1Errors = validateLockedSubmission({ submission: team1Submission, team: teams[fixture.team1Id], teamId: fixture.team1Id, scheduleId, fixture });
    const team2Errors = validateLockedSubmission({ submission: team2Submission, team: teams[fixture.team2Id], teamId: fixture.team2Id, scheduleId, fixture });
    if (team1Errors.length || team2Errors.length) {
      if (team1Errors.length) await markInvalidSubmission(root, scheduleId, fixture.team1Id, team1Errors);
      if (team2Errors.length) await markInvalidSubmission(root, scheduleId, fixture.team2Id, team2Errors);
      return null;
    }

    const existingRevealId = team1Submission.revealId || team2Submission.revealId;
    if (existingRevealId) return null;

    const now = Date.now();
    const revealId = `${scheduleId}-R${now}`;
    const revealRecord = {
      revealId,
      scheduleId,
      revealCode: revealId,
      team1Id: fixture.team1Id,
      team2Id: fixture.team2Id,
      revealedAt: now,
      lineups: {
        [fixture.team1Id]: lineupByTeam(team1Submission),
        [fixture.team2Id]: lineupByTeam(team2Submission)
      }
    };

    const updates = {
      [`revealedLineups/${revealId}`]: revealRecord,
      [`lineupSubmissionDetails/${scheduleId}/${fixture.team1Id}/revealedAt`]: now,
      [`lineupSubmissionDetails/${scheduleId}/${fixture.team1Id}/revealId`]: revealId,
      [`lineupSubmissionDetails/${scheduleId}/${fixture.team1Id}/submissionStatus`]: 'revealed',
      [`lineupSubmissionDetails/${scheduleId}/${fixture.team1Id}/lastUpdatedAt`]: now,
      [`lineupSubmissionDetails/${scheduleId}/${fixture.team2Id}/revealedAt`]: now,
      [`lineupSubmissionDetails/${scheduleId}/${fixture.team2Id}/revealId`]: revealId,
      [`lineupSubmissionDetails/${scheduleId}/${fixture.team2Id}/submissionStatus`]: 'revealed',
      [`lineupSubmissionDetails/${scheduleId}/${fixture.team2Id}/lastUpdatedAt`]: now,
      [`lineupSubmissionMeta/${scheduleId}/${fixture.team1Id}/revealedAt`]: now,
      [`lineupSubmissionMeta/${scheduleId}/${fixture.team1Id}/revealId`]: revealId,
      [`lineupSubmissionMeta/${scheduleId}/${fixture.team1Id}/submissionStatus`]: 'revealed',
      [`lineupSubmissionMeta/${scheduleId}/${fixture.team1Id}/lastUpdatedAt`]: now,
      [`lineupSubmissionMeta/${scheduleId}/${fixture.team2Id}/revealedAt`]: now,
      [`lineupSubmissionMeta/${scheduleId}/${fixture.team2Id}/revealId`]: revealId,
      [`lineupSubmissionMeta/${scheduleId}/${fixture.team2Id}/submissionStatus`]: 'revealed',
      [`lineupSubmissionMeta/${scheduleId}/${fixture.team2Id}/lastUpdatedAt`]: now
    };

    await root.update(updates);
    await writeSystemLineupAudit(root, { actionType: 'Lineups Revealed', scheduleId, teamId: 'both', metadata: { revealId, revealCode: revealRecord.revealCode, revealedAt: now, lastUpdatedAt: now } });
    return null;
  });

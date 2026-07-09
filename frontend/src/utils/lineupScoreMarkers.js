import { ref, update } from 'firebase/database';
import { db, PATHS } from '../firebase';

export function buildLineupScoreClearUpdates(record, now = Date.now()) {
  if (!record?.scheduleId) return {};
  const updates = {};
  [record.t1Id, record.t2Id].filter(Boolean).forEach(teamId => {
    updates[`${PATHS.lineupSubmissions}/${record.scheduleId}/${teamId}/scoreSavedAt`] = null;
    updates[`${PATHS.lineupSubmissions}/${record.scheduleId}/${teamId}/scoreSavedBy`] = null;
    updates[`${PATHS.lineupSubmissions}/${record.scheduleId}/${teamId}/convertedToScoreAt`] = null;
    updates[`${PATHS.lineupSubmissions}/${record.scheduleId}/${teamId}/lastUpdatedAt`] = now;
    updates[`${PATHS.lineupSubmissionMeta}/${record.scheduleId}/${teamId}/scoreSavedAt`] = null;
    updates[`${PATHS.lineupSubmissionMeta}/${record.scheduleId}/${teamId}/scoreSavedBy`] = null;
    updates[`${PATHS.lineupSubmissionMeta}/${record.scheduleId}/${teamId}/convertedToScoreAt`] = null;
    updates[`${PATHS.lineupSubmissionMeta}/${record.scheduleId}/${teamId}/lastUpdatedAt`] = now;
  });
  return updates;
}

export async function clearLineupScoreMarkers(record) {
  const updates = buildLineupScoreClearUpdates(record);
  if (Object.keys(updates).length) await update(ref(db), updates);
}

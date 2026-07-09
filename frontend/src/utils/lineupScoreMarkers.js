import { ref, update } from 'firebase/database';
import { db, PATHS } from '../firebase';

export function buildLineupScoreClearUpdates(record, now = Date.now()) {
  const scheduleId = record?.scheduleId || record?.matchScheduleId;
  if (!scheduleId) return {};
  const updates = {};
  [record.t1Id, record.t2Id].filter(Boolean).forEach(teamId => {
    updates[`${PATHS.lineupSubmissions}/${scheduleId}/${teamId}/scoreSavedAt`] = null;
    updates[`${PATHS.lineupSubmissions}/${scheduleId}/${teamId}/scoreSavedBy`] = null;
    updates[`${PATHS.lineupSubmissions}/${scheduleId}/${teamId}/convertedToScoreAt`] = null;
    updates[`${PATHS.lineupSubmissions}/${scheduleId}/${teamId}/lastUpdatedAt`] = now;
    updates[`${PATHS.lineupSubmissionMeta}/${scheduleId}/${teamId}/scoreSavedAt`] = null;
    updates[`${PATHS.lineupSubmissionMeta}/${scheduleId}/${teamId}/scoreSavedBy`] = null;
    updates[`${PATHS.lineupSubmissionMeta}/${scheduleId}/${teamId}/convertedToScoreAt`] = null;
    updates[`${PATHS.lineupSubmissionMeta}/${scheduleId}/${teamId}/lastUpdatedAt`] = now;
  });
  return updates;
}

export async function clearLineupScoreMarkers(record) {
  const updates = buildLineupScoreClearUpdates(record);
  if (Object.keys(updates).length) await update(ref(db), updates);
}

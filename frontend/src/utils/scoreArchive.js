import { ref, update } from 'firebase/database';
import { db, PATHS } from '../firebase';

function archiveKey(value = '') {
  return String(value || 'unknown').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown';
}

export function buildScoreArchiveUpdates(matchRecord, { action = 'snapshot', session = {}, now = Date.now(), reason = '' } = {}) {
  if (!matchRecord) return {};
  const matchId = archiveKey(matchRecord.id || matchRecord.matchId || `${matchRecord.t1Id || matchRecord.t1 || 'team1'}_${matchRecord.t2Id || matchRecord.t2 || 'team2'}_${matchRecord.ts || now}`);
  const eventId = `${now}_${archiveKey(action)}`;
  const actor = session?.teamId || session?.userId || session?.role || 'system';
  const archiveRecord = {
    ...matchRecord,
    id: matchRecord.id || matchId,
    archivedAt: now,
    archiveAction: action,
    archiveReason: reason || action,
    archivedBy: actor
  };
  return {
    [`${PATHS.scoreArchive}/${matchId}/current`]: archiveRecord,
    [`${PATHS.scoreArchive}/${matchId}/events/${eventId}`]: archiveRecord
  };
}

export async function archiveScoreSnapshot(matchRecord, options = {}) {
  const updates = buildScoreArchiveUpdates(matchRecord, options);
  if (Object.keys(updates).length) await update(ref(db), updates);
}

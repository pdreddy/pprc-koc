const admin = require('firebase-admin');

const DEFAULT_CONFIG = {
  enableWhatsApp: false,
  enableEmail: false,
  enablePush: false,
  enableSMS: false,
  clubId: 'pprc',
  tournamentId: 'koc_s3',
  rateLimitPerMinute: 20,
  retryAttempts: 3,
  timeoutMs: 10000
};

function nowTimestamp() {
  return admin.firestore.FieldValue.serverTimestamp();
}

function normalizePhone(phone) {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  const plus = raw.startsWith('+') ? '+' : '';
  const digits = raw.replace(/[^0-9]/g, '');
  return digits ? `${plus}${digits}` : '';
}

async function getNotificationConfig({ clubId = 'pprc', tournamentId = 'koc_s3' } = {}) {
  const db = admin.firestore();
  const [globalSnap, clubSnap, tournamentSnap] = await Promise.all([
    db.doc('notifications/config').get(),
    db.doc(`clubs/${clubId}/notifications/config`).get(),
    db.doc(`clubs/${clubId}/tournaments/${tournamentId}/notifications/config`).get()
  ]);
  return {
    ...DEFAULT_CONFIG,
    ...(globalSnap.exists ? globalSnap.data() : {}),
    ...(clubSnap.exists ? clubSnap.data() : {}),
    ...(tournamentSnap.exists ? tournamentSnap.data() : {}),
    clubId,
    tournamentId
  };
}

async function createNotificationLog(payload) {
  const doc = admin.firestore().collection('notification_logs').doc();
  const record = {
    id: doc.id,
    channel: payload.channel || 'whatsapp',
    phone: normalizePhone(payload.phone),
    playerId: payload.playerId || payload.recipient?.playerId || payload.recipient?.id || null,
    tournamentId: payload.tournamentId || 'koc_s3',
    clubId: payload.clubId || 'pprc',
    template: payload.template || payload.type || 'CUSTOM',
    message: payload.message || '',
    status: payload.status || 'queued',
    metaMessageId: payload.metaMessageId || null,
    error: payload.error || null,
    dedupeKey: payload.dedupeKey || null,
    createdAt: nowTimestamp(),
    sentAt: payload.sentAt || null
  };
  await doc.set(record);
  return { id: doc.id, ref: doc, record };
}

async function updateNotificationLog(refOrId, patch) {
  const ref = typeof refOrId === 'string' ? admin.firestore().collection('notification_logs').doc(refOrId) : refOrId;
  await ref.update({ ...patch, updatedAt: nowTimestamp() });
}

async function hasDuplicateNotification(dedupeKey) {
  if (!dedupeKey) return false;
  const snap = await admin.firestore().collection('notification_logs').where('dedupeKey', '==', dedupeKey).where('status', 'in', ['queued', 'sent']).limit(1).get();
  return !snap.empty;
}

module.exports = { DEFAULT_CONFIG, normalizePhone, getNotificationConfig, createNotificationLog, updateNotificationLog, hasDuplicateNotification, nowTimestamp };

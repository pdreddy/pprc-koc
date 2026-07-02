const admin = require('firebase-admin');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const { MetaWhatsAppClient } = require('./metaClient');
const { normalizePhone, getNotificationConfig, createNotificationLog, updateNotificationLog, nowTimestamp } = require('./NotificationQueue');

const whatsappAccessToken = defineSecret('WHATSAPP_ACCESS_TOKEN');
const whatsappPhoneNumberId = defineSecret('WHATSAPP_PHONE_NUMBER_ID');

function assertMessageInput(data) {
  const phone = normalizePhone(data?.phone || data?.recipient?.phone);
  const message = String(data?.message || '').trim();
  if (!phone) throw new HttpsError('invalid-argument', 'phone is required.');
  if (!message && !data?.templateName) throw new HttpsError('invalid-argument', 'message or templateName is required.');
  if (message.length > 4096) throw new HttpsError('invalid-argument', 'message must be 4096 characters or less.');
  return { phone, message };
}

async function sendWhatsApp(data) {
  const { phone, message } = assertMessageInput(data);
  const config = await getNotificationConfig({ clubId: data.clubId, tournamentId: data.tournamentId });
  if (!config.enableWhatsApp && !data.force) {
    return { success: false, error: 'WhatsApp notifications are disabled.' };
  }
  const log = await createNotificationLog({ ...data, channel: 'whatsapp', phone, message, status: 'queued' });
  const client = new MetaWhatsAppClient({
    accessToken: whatsappAccessToken.value(),
    phoneNumberId: whatsappPhoneNumberId.value(),
    timeoutMs: Number(config.timeoutMs || 10000),
    retryAttempts: Number(config.retryAttempts || 3)
  });
  const result = data.templateName
    ? await client.sendTemplate({ phone, templateName: data.templateName, languageCode: data.languageCode, components: data.components || [] })
    : await client.sendText({ phone, message });
  if (result.success) {
    await updateNotificationLog(log.ref, { status: 'sent', metaMessageId: result.metaMessageId || null, sentAt: nowTimestamp(), error: null });
    return { success: true, metaMessageId: result.metaMessageId || null, error: null };
  }
  await updateNotificationLog(log.ref, { status: 'failed', error: result.error || 'WhatsApp send failed.' });
  return { success: false, metaMessageId: null, error: result.error || 'WhatsApp send failed.' };
}

const sendWhatsAppMessage = onCall({ secrets: [whatsappAccessToken, whatsappPhoneNumberId], timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in is required.');
  return sendWhatsApp({ ...request.data, force: true });
});

async function enqueueReminderJobs() {
  const config = await getNotificationConfig();
  if (!config.enableWhatsApp) return null;
  const root = admin.database().ref(config.tournamentId || 'koc_s3');
  const [scheduleSnap, teamsSnap, metaSnap, matchesSnap] = await Promise.all([
    root.child('schedule').get(), root.child('teams').get(), root.child('lineupSubmissionMeta').get(), root.child('matches').get()
  ]);
  const schedule = scheduleSnap.val() || {};
  const teams = teamsSnap.val() || {};
  const meta = metaSnap.val() || {};
  const matches = matchesSnap.val() || {};
  const now = Date.now();
  const soon = now + 48 * 60 * 60 * 1000;
  const jobs = [];
  Object.values(schedule).forEach(fixture => {
    if (!fixture || fixture.type === 'buffer' || fixture.status === 'completed') return;
    const matchDate = Date.parse(`${fixture.date || ''} ${fixture.time || '00:00'}`);
    if (!Number.isFinite(matchDate) || matchDate < now || matchDate > soon) return;
    [fixture.team1Id, fixture.team2Id].forEach(teamId => {
      const team = teams[teamId];
      const opponent = teams[teamId === fixture.team1Id ? fixture.team2Id : fixture.team1Id];
      const captain = (team?.players || []).find(p => p.isCaptain) || team?.players?.[0] || {};
      if (!captain.phone && !team?.phone) return;
      if (!meta?.[fixture.id]?.[teamId]?.lockedAt) jobs.push({ fixture, team, opponent, captain, phone: captain.phone || team.phone, type: 'LINEUP_REMINDER' });
      const hasScore = Object.values(matches).some(m => m.scheduleId === fixture.id || m.fixtureId === fixture.id);
      if (matchDate < now && !hasScore) jobs.push({ fixture, team, opponent, captain, phone: captain.phone || team.phone, type: 'SCORE_REMINDER' });
    });
  });
  return Promise.all(jobs.slice(0, 20).map(job => sendWhatsApp({
    phone: job.phone,
    type: job.type,
    template: job.type,
    tournamentId: config.tournamentId,
    clubId: config.clubId,
    message: job.type === 'SCORE_REMINDER'
      ? `Hello ${job.captain.name || 'Captain'}, please submit the score for ${job.team.name} vs ${job.opponent.name}.`
      : `Hello ${job.captain.name || 'Captain'}, your lineup for ${job.team.name} vs ${job.opponent.name} is due before match time.`,
  }).catch(error => ({ success: false, error: error.message }))));
}

const scheduledNotificationSweep = onSchedule({ schedule: 'every 15 minutes', secrets: [whatsappAccessToken, whatsappPhoneNumberId], timeoutSeconds: 120, memory: '256MiB' }, enqueueReminderJobs);

module.exports = { sendWhatsApp, sendWhatsAppMessage, scheduledNotificationSweep };

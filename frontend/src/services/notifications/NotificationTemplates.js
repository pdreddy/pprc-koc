export const NOTIFICATION_TEMPLATES = {
  TEST_MESSAGE: 'Hello {{player}}, this is a test message from {{club}}.',
  PLAYER_MESSAGE: 'Hello {{player}}, {{message}}',
  CAPTAIN_MESSAGE: 'Hello {{captain}}, {{message}}',
  LINEUP_REMINDER: 'Hello {{captain}}\n\nYour lineup for {{team}} vs {{opponent}} must be submitted before {{deadline}}.\n\nClub: {{club}}',
  SCORE_REMINDER: 'Hello {{captain}}\n\nPlease submit the score for {{team}} vs {{opponent}} on Court {{court}}.',
  MATCH_REMINDER: 'Hello {{captain}}\n\nReminder: {{team}} plays {{opponent}} on {{date}} at {{time}}. Court: {{court}}.'
};

export function renderNotificationTemplate(template, variables = {}) {
  return String(template || '').replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key) => {
    const value = variables[key];
    return value == null ? '' : String(value);
  });
}

export function resolveNotificationTemplate(type, template) {
  return template || NOTIFICATION_TEMPLATES[type] || '{{message}}';
}

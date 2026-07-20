import { push, ref } from 'firebase/database';
import { db, PATHS } from '../firebase';
import { normalizeRole } from '../utils/roles';

const MAX_AUDIT_DEPTH = 6;
const MAX_AUDIT_ARRAY_ITEMS = 50;
const MAX_AUDIT_OBJECT_KEYS = 80;
const MAX_AUDIT_STRING_LENGTH = 1000;

function sanitizeAuditValue(value, depth = 0) {
  if (value === undefined) return null;
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'string' && value.length > MAX_AUDIT_STRING_LENGTH) {
      return `${value.slice(0, MAX_AUDIT_STRING_LENGTH)}…[truncated ${value.length - MAX_AUDIT_STRING_LENGTH} chars]`;
    }
    return value;
  }
  if (depth >= MAX_AUDIT_DEPTH) return '[truncated: max audit depth reached]';
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_AUDIT_ARRAY_ITEMS).map(child => sanitizeAuditValue(child, depth + 1));
    if (value.length > MAX_AUDIT_ARRAY_ITEMS) items.push(`[truncated ${value.length - MAX_AUDIT_ARRAY_ITEMS} items]`);
    return items;
  }
  const entries = Object.entries(value).slice(0, MAX_AUDIT_OBJECT_KEYS);
  const sanitized = Object.fromEntries(entries.map(([key, child]) => [key, sanitizeAuditValue(child, depth + 1)]));
  const remaining = Object.keys(value).length - entries.length;
  if (remaining > 0) sanitized.__truncatedKeys = remaining;
  return sanitized;
}

export async function writeAuditLog({ actionType, session, targetType, targetId, oldValue = null, newValue = null }) {
  const now = Date.now();
  const role = normalizeRole(session?.role);
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const record = {
    actionId: `${now}-${Math.random().toString(36).slice(2, 10)}`,
    actionType,
    performedByUserId: session?.teamId || session?.userId || role,
    performedByName: session?.teamName || session?.name || role,
    performedByRole: role,
    targetType,
    targetId,
    oldValue: sanitizeAuditValue(oldValue),
    newValue: sanitizeAuditValue(newValue),
    timestamp: now,
    ipAddress: 'client-unavailable',
    device: /Mobi|Android|iPhone|iPad/i.test(ua) ? 'mobile' : 'desktop',
    browser: ua.slice(0, 240)
  };
  try {
    await push(ref(db, PATHS.auditLogs), record);
    return { ...record, auditWriteStatus: 'written' };
  } catch (error) {
    console.warn('Audit log write skipped:', error?.message || error);
    return { ...record, auditWriteStatus: 'skipped', auditWriteError: error?.code || error?.message || 'unknown' };
  }
}


export async function recordLineupAudit({ actionType, scheduleId, teamId, session, metadata = {}, oldValue = null }) {
  const now = Date.now();
  return writeAuditLog({
    actionType,
    session,
    targetType: 'lineup',
    targetId: `${scheduleId || 'unknown'}:${teamId || 'unknown'}`,
    oldValue,
    newValue: {
      scheduleId,
      teamId,
      actionTimestamp: now,
      lastUpdatedAt: metadata.lastUpdatedAt || now,
      ...metadata
    }
  });
}

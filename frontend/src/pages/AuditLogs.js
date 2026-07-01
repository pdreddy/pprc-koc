import React, { useCallback, useEffect, useRef, useState } from 'react';
import { endBefore, get, limitToLast, onValue, orderByChild, query, ref } from 'firebase/database';
import { db, PATHS } from '../firebase';

const PAGE_SIZE = 50;

function toRows(snapVal) {
  const rows = Object.entries(snapVal || {}).map(([id, row]) => ({ id, ...row }));
  rows.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  return rows;
}

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const seenIds = useRef(new Set());

  useEffect(() => {
    const firstPageQuery = query(ref(db, PATHS.auditLogs), orderByChild('timestamp'), limitToLast(PAGE_SIZE));
    const unsub = onValue(firstPageQuery, snap => {
      const rows = toRows(snap.val());
      seenIds.current = new Set(rows.map(r => r.id));
      setLogs(rows);
      setHasMore(rows.length === PAGE_SIZE);
    });
    return unsub;
  }, []);

  const loadMore = useCallback(async () => {
    const oldest = logs[logs.length - 1];
    if (!oldest?.timestamp) return;
    setLoadingMore(true);
    try {
      const nextPageQuery = query(ref(db, PATHS.auditLogs), orderByChild('timestamp'), endBefore(oldest.timestamp), limitToLast(PAGE_SIZE));
      const snap = await get(nextPageQuery);
      const rows = toRows(snap.val()).filter(r => !seenIds.current.has(r.id));
      rows.forEach(r => seenIds.current.add(r.id));
      setLogs(prev => [...prev, ...rows]);
      setHasMore(rows.length === PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }, [logs]);

  return (
    <main className="container">
      <div className="page-title">
        <h1>Audit Logs</h1>
        <p>SUPER_ADMIN-only activity trail for security-sensitive actions.</p>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="std" data-testid="audit-table">
            <thead><tr><th>When</th><th>Action</th><th>By</th><th>Role</th><th>Target</th><th>Device</th></tr></thead>
            <tbody>
              {logs.length === 0 && <tr><td colSpan="6" className="center muted">No audit events yet.</td></tr>}
              {logs.map(log => (
                <tr key={log.id}>
                  <td>{log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}</td>
                  <td><strong>{log.actionType}</strong></td>
                  <td>{log.performedByName}</td>
                  <td>{log.performedByRole}</td>
                  <td>{log.targetType}:{log.targetId}</td>
                  <td>{log.device}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {hasMore && (
          <div className="center" style={{ marginTop: '1rem' }}>
            <button className="btn ghost" onClick={loadMore} disabled={loadingMore} data-testid="audit-load-more">
              {loadingMore ? 'Loading…' : 'Load older events'}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

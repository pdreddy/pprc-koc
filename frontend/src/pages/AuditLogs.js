import React, { useEffect, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { db, PATHS } from '../firebase';

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  useEffect(() => {
    const unsub = onValue(ref(db, PATHS.auditLogs), snap => {
      const rows = Object.entries(snap.val() || {}).map(([id, row]) => ({ id, ...row }));
      rows.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setLogs(rows.slice(0, 250));
    });
    return unsub;
  }, []);
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
      </div>
    </main>
  );
}

import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ROLES, hasRole, canViewAudit } from '../utils/roles';
import { writeAuditLog } from '../services/AuditService';

const publicShortcuts = [
  { to: '/schedule', icon: '📅', label: 'Schedule', desc: 'Upcoming and completed fixtures', testid: 'more-schedule' },
  { to: '/standings', icon: '📊', label: 'Standings', desc: 'Group tables and points', testid: 'more-standings' },
  { to: '/history', icon: '📜', label: 'Match History', desc: 'View past results', testid: 'more-history' },
  { to: '/matchups', icon: '🎾', label: 'Matchups', desc: 'Head-to-head team matchups and score lines', testid: 'more-matchups' },
  { to: '/rules', icon: '📋', label: 'Rules', desc: 'KOC rules, scoring, and lineup guidance', testid: 'more-rules' }
];

export function buildMoreSections(session) {
  const sections = [{ title: 'Public shortcuts', items: [...publicShortcuts] }];

  if (hasRole(session, [ROLES.GUEST])) {
    sections.push({
      title: 'Account',
      items: [{ to: '/login', icon: '🔒', label: 'Captain / Admin Login', desc: 'Sign in to enter scores', testid: 'more-login' }]
    });
    return sections;
  }

  if (hasRole(session, [ROLES.CAPTAIN])) {
    sections.unshift({
      title: 'Captain shortcuts',
      items: [
        { to: '/', icon: '🎾', label: 'My Lineup', desc: 'Open your dashboard lineup submissions', testid: 'more-my-lineup' },
        { to: '/score', icon: '✍️', label: 'Enter Score', desc: `Logged in as ${session.teamName || 'captain'}`, testid: 'more-score' },
        { disabled: true, icon: '🔔', label: 'Notifications', desc: 'Push alerts are coming soon', testid: 'more-notifications' }
      ]
    });
  }

  if (hasRole(session, [ROLES.ADMIN, ROLES.SUPER_ADMIN])) {
    const adminItems = [
      { to: '/admin', icon: '⚙️', label: 'Admin Dashboard', desc: 'Manage teams, schedules, and operations', testid: 'more-admin' },
      { to: '/teams', icon: '👥', label: 'Team Management', desc: 'Review teams, captains, and rosters', testid: 'more-teams' },
      { to: '/score', icon: '✍️', label: 'Enter Score', desc: 'Admin score entry', testid: 'more-score' },
      { disabled: true, icon: '🔔', label: 'Notifications', desc: 'Push alerts are coming soon', testid: 'more-notifications' }
    ];
    if (canViewAudit(session)) adminItems.push({ to: '/audit', icon: '🧾', label: 'Audit Logs', desc: 'SUPER_ADMIN-only system activity', testid: 'more-audit' });
    sections.unshift({ title: 'Admin shortcuts', items: adminItems });
  }

  return sections;
}

function ShortcutCard({ item }) {
  const content = (
    <>
      <div className="more-shortcut-icon">{item.icon}</div>
      <div className="more-shortcut-copy">
        <div className="more-shortcut-title">{item.label}</div>
        <div className="muted more-shortcut-desc">{item.desc}</div>
      </div>
      <span className="more-shortcut-chevron">{item.disabled ? 'Soon' : '›'}</span>
    </>
  );
  if (item.disabled) {
    return <div className="card more-shortcut disabled" data-testid={item.testid} aria-disabled="true">{content}</div>;
  }
  return <Link key={item.to} to={item.to} className="card more-shortcut" data-testid={item.testid}>{content}</Link>;
}

export default function More() {
  const { session, logout } = useAuth();
  const sections = buildMoreSections(session);
  const handleLogout = async () => {
    const currentSession = session;
    logout();
    await writeAuditLog({ actionType: 'Logout', session: currentSession, targetType: currentSession?.teamId ? 'team' : 'user', targetId: currentSession?.teamId || currentSession?.userId || currentSession?.role }).catch(() => {});
  };

  return (
    <main className="container">
      <div className="page-title">
        <h1>More</h1>
        <p>Role-aware shortcuts and overflow actions in one place</p>
      </div>

      <div className="more-sections" data-testid="more-list">
        {sections.map(section => (
          <section className="more-section" key={section.title}>
            <h2>{section.title}</h2>
            <div className="more-shortcut-grid">
              {section.items.map(item => <ShortcutCard key={`${section.title}-${item.testid}`} item={item} />)}
            </div>
          </section>
        ))}

        {!hasRole(session, [ROLES.GUEST]) && (
          <button
            className="btn ghost full"
            onClick={handleLogout}
            data-testid="more-logout-btn"
          >
            Log out
          </button>
        )}
      </div>
    </main>
  );
}

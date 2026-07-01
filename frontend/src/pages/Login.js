import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ROLES } from '../utils/roles';
import { DEFAULT_ADMIN_USERS, normalizeAdminUsername } from '../data/initialTeams';
import { writeAuditLog } from '../services/AuditService';
import TeamLogo from '../components/TeamLogo';

const RECOVERY_PINS = {
  [ROLES.SUPER_ADMIN]: '19850905',
  [ROLES.ADMIN]: '00000000',
};

export default function Login({ teams, adminConfig }) {
  const [mode, setMode] = useState('team'); // 'team' | 'admin'
  const [teamId, setTeamId] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { loginAdmin, loginTeam } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const next = location.state?.next || (mode === 'admin' ? '/admin' : '/score');

  const teamList = Object.values(teams || {}).sort((a, b) => (a.gradient || 0) - (b.gradient || 0));
  const selectedTeam = teamId ? teams?.[teamId] : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'admin') {
        const username = normalizeAdminUsername(adminUsername);
        const users = adminConfig?.users || {};
        const configuredUserEntry = Object.entries(users).find(([key]) => normalizeAdminUsername(key) === username);
        const configuredUser = configuredUserEntry?.[1] || null;
        const defaultUser = username ? DEFAULT_ADMIN_USERS[username] : null;
        const adminUser = configuredUser || defaultUser;
        if (!username || !adminUser) { setError('Incorrect admin username or password.'); return; }
        const adminRole = adminUser?.role || adminConfig?.role || ROLES.SUPER_ADMIN;
        // Role-specific password takes priority over the legacy shared central password
        const rolePassword = adminRole === ROLES.SUPER_ADMIN
          ? String(adminConfig?.superAdminPassword || adminConfig?.password || '').trim()
          : String(adminConfig?.adminPassword || adminConfig?.password || '').trim();
        const allowedPasswords = [configuredUser?.password, ...(configuredUser?.passwords || []), rolePassword].map(value => String(value || '').trim()).filter(Boolean);
        if (!allowedPasswords[0]) { setError('Admin password not configured yet.'); return; }
        const recoveryPin = RECOVERY_PINS[adminRole];
        const usedPin = recoveryPin && password.trim() === recoveryPin;
        if (usedPin || allowedPasswords.includes(password.trim())) {
          const nextSession = { role: adminRole, userId: username || adminRole, name: adminUser?.name || username || adminRole, loginAt: Date.now(), loginViaPin: usedPin };
          loginAdmin(adminRole, { username: nextSession.userId, name: nextSession.name, loginViaPin: usedPin });
          await writeAuditLog({ actionType: usedPin ? 'LoginViaPin' : 'Login', session: nextSession, targetType: 'user', targetId: nextSession.userId });
          navigate(next, { replace: true });
        } else {
          setError('Incorrect admin username or password.');
        }
      } else {
        if (!teamId) { setError('Please choose your team.'); return; }
        const team = teams[teamId];
        if (!team) { setError('Team not found.'); return; }
        if (password.trim() === String(team.password || '')) {
          const nextSession = { role: ROLES.CAPTAIN, teamId: team.id, teamName: team.name, loginAt: Date.now() };
          loginTeam(team.id, team.name);
          await writeAuditLog({ actionType: 'Login', session: nextSession, targetType: 'team', targetId: team.id });
          navigate('/', { replace: true });
        } else {
          setError('Incorrect team password.');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lx-shell">
      {/* LEFT — branding panel */}
      <div className="lx-brand" aria-hidden="true">
        <div className="lx-brand-inner">
          <div className="lx-logos">
            <img src="/logos/koc-logo.svg" alt="" className="lx-logo" />
            <span className="lx-x">×</span>
            <img src="/logos/pprc-logo.svg" alt="" className="lx-logo" />
          </div>
          <h2 className="lx-brand-title">KOC Tennis League</h2>
          <p className="lx-brand-sub">Prosper Premier Racquet Club · Season 2024</p>
          <div className="lx-stats">
            <div className="lx-stat"><strong>16</strong><span>Teams</span></div>
            <div className="lx-stat"><strong>2</strong><span>Groups</span></div>
            <div className="lx-stat"><strong>Top 4</strong><span>Qualify</span></div>
          </div>
        </div>
        <div className="lx-brand-bg" />
      </div>

      {/* RIGHT — form panel */}
      <div className="lx-form-panel">
        <div className="lx-form-wrap" data-testid="login-card">

          <div className="lx-form-header">
            <div className="lx-form-logo-pair" aria-label="KOC and PPRC">
              <img src="/logos/koc-logo.svg" alt="KOC" />
              <span>×</span>
              <img src="/logos/pprc-logo.svg" alt="PPRC" />
            </div>
            <div>
              <div className="lx-form-title">Sign in</div>
              <div className="lx-form-sub">KOC Tennis League portal</div>
            </div>
          </div>

          {/* Role selector */}
          <div className="lx-role-tabs" role="tablist">
            <button
              className={`lx-role-tab${mode === 'team' ? ' active' : ''}`}
              onClick={() => { setMode('team'); setError(''); setPassword(''); }}
              data-testid="login-tab-team"
            >
              <span className="lx-tab-icon">🎾</span>
              <span className="lx-tab-label">Team Captain</span>
            </button>
            <button
              className={`lx-role-tab${mode === 'admin' ? ' active' : ''}`}
              onClick={() => { setMode('admin'); setError(''); setPassword(''); setTeamId(''); setAdminUsername(''); }}
              data-testid="login-tab-admin"
            >
              <span className="lx-tab-icon">⚙️</span>
              <span className="lx-tab-label">Admin</span>
            </button>
          </div>

          {error && (
            <div className="lx-error" data-testid="login-error">
              <span>⚠️</span> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="lx-form">
            {mode === 'team' && (
              <div className="lx-field">
                <label className="lx-label">Your Team</label>
                <select
                  className="lx-input"
                  value={teamId}
                  onChange={e => setTeamId(e.target.value)}
                  data-testid="login-team-select"
                >
                  <option value="">— Select your team —</option>
                  {teamList.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.abbreviation})</option>
                  ))}
                </select>
                {selectedTeam && (
                  <div className="login-team-preview" data-testid="login-team-preview">
                    <TeamLogo team={selectedTeam} size={46} />
                    <div>
                      <strong>{selectedTeam.name}</strong>
                      <span>{selectedTeam.abbreviation} · Group {selectedTeam.group || 'A'}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {mode === 'admin' && (
              <div className="lx-field">
                <label className="lx-label">Username</label>
                <input
                  className="lx-input"
                  value={adminUsername}
                  onChange={e => setAdminUsername(e.target.value)}
                  placeholder="Admin username"
                  data-testid="login-admin-username-input"
                  autoComplete="username"
                />
              </div>
            )}

            <div className="lx-field">
              <label className="lx-label">{mode === 'admin' ? 'Password' : 'Team Password'}</label>
              <input
                type="password"
                className="lx-input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password"
                data-testid="login-password-input"
                autoComplete="current-password"
              />
            </div>

            <button type="submit" className="lx-submit" data-testid="login-submit-btn" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In →'}
            </button>
          </form>

          <div className="lx-guest">
            <span>Just browsing?</span>
            <button
              type="button"
              className="lx-guest-btn"
              onClick={() => navigate('/teams')}
              data-testid="login-guest-btn"
            >Continue as Guest</button>
          </div>
        </div>
      </div>
    </div>
  );
}

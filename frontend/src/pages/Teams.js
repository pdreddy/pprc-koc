import React, { useMemo, useState } from 'react';
import TeamLogo from '../components/TeamLogo';

const GRAD_COLORS = {
  1: '#ef4444', 2: '#3b82f6', 3: '#10b981', 4: '#f59e0b',
  5: '#8b5cf6', 6: '#ec4899', 7: '#14b8a6', 8: '#6366f1',
  9: '#f97316', 10: '#0ea5e9', 11: '#84cc16', 12: '#a855f7',
  13: '#06b6d4', 14: '#facc15', 15: '#f43f5e', 16: '#475569',
};

function avgUtr(players) {
  const vals = (players || []).map(p => parseFloat(p.actualUtr || p.utr || '')).filter(v => !isNaN(v));
  if (!vals.length) return null;
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);
}

function UtrBadge({ value }) {
  if (!value) return null;
  return (
    <span style={{ fontSize: '.72rem', fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,0.35)', borderRadius: '999px', padding: '.15rem .55rem', letterSpacing: '.01em' }}>
      UTR {value}
    </span>
  );
}

function Chip({ children, color }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.25rem', fontSize: '.75rem', fontWeight: 600, color: color || '#4b5563', background: color ? `${color}18` : '#f1f5f9', border: `1px solid ${color ? `${color}40` : '#e2e8f0'}`, borderRadius: '999px', padding: '.2rem .65rem', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

function PlayerList({ players }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
      {(players || []).map((p, i) => {
        const utr = p.actualUtr || p.utr || '';
        const isCaptain = i === 0 || p.isCaptain;
        return (
          <div
            key={i}
            style={{ display: 'flex', alignItems: 'center', gap: '.65rem', padding: '.55rem .75rem', borderRadius: '.5rem', background: isCaptain ? '#fefce8' : '#f8fafc', border: isCaptain ? '1px solid #fde68a' : '1px solid #f1f5f9' }}
            data-testid={`team-player-${i}`}
          >
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: isCaptain ? '#f59e0b' : '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.72rem', fontWeight: 800, color: isCaptain ? '#fff' : '#64748b', flexShrink: 0 }}>
              {isCaptain ? '©' : i + 1}
            </div>
            <span style={{ flex: 1, fontSize: '.88rem', fontWeight: isCaptain ? 700 : 500, color: '#1e293b', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.name}
            </span>
            {utr && (
              <span style={{ fontSize: '.72rem', fontWeight: 700, color: '#6366f1', background: '#eef2ff', borderRadius: '999px', padding: '.1rem .5rem', flexShrink: 0 }}>
                {utr}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TeamCard({ t, isOpen, onToggle }) {
  const color = GRAD_COLORS[t.gradient || 1] || '#6366f1';
  const avg = useMemo(() => avgUtr(t.players), [t.players]);

  return (
    <div
      className="team-card"
      data-testid={`team-card-${t.abbreviation}`}
      style={{ background: '#fff', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.07)', border: '1px solid #e8ecf0' }}
    >
      {/* Header strip */}
      <div
        onClick={onToggle}
        data-testid={`team-toggle-${t.abbreviation}`}
        style={{ display: 'flex', alignItems: 'center', gap: '.85rem', padding: '.9rem 1rem', cursor: 'pointer', background: `linear-gradient(135deg, ${color}18, ${color}08)`, borderBottom: `3px solid ${color}` }}
      >
        <TeamLogo team={t} size={52} style={{ border: `2.5px solid ${color}`, boxShadow: `0 0 0 3px ${color}22` }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 900, fontSize: '1rem', color: '#0f172a', lineHeight: 1.2 }}>{t.name}</div>
          {t.captain && <div style={{ fontSize: '.78rem', color: '#64748b', marginTop: '.15rem' }}>Captain · {t.captain}</div>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '.3rem', flexShrink: 0 }}>
          <span style={{ fontWeight: 800, fontSize: '.8rem', color, background: `${color}18`, border: `1px solid ${color}40`, borderRadius: '999px', padding: '.15rem .55rem' }}>
            {t.abbreviation}
          </span>
          <span style={{ fontSize: '.72rem', color: '#94a3b8' }}>{(t.players || []).length} players</span>
        </div>
      </div>

      {/* Meta chips */}
      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', padding: '.65rem 1rem', borderBottom: '1px solid #f1f5f9' }}>
        <Chip color={color}>Group {t.group || 'A'}</Chip>
        {avg && <Chip>Avg UTR {avg}</Chip>}
        <Chip>{isOpen ? 'Roster expanded' : 'Tap to view roster'}</Chip>
      </div>

      {/* Roster */}
      {isOpen && (
        <div style={{ padding: '.75rem 1rem 1rem' }}>
          <PlayerList players={t.players} />
        </div>
      )}
    </div>
  );
}

function GroupSection({ label, teams, open, onToggle, testid }) {
  const color = label === 'A' ? '#3b82f6' : '#f97316';
  return (
    <div data-testid={testid}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.65rem', marginBottom: '.9rem' }}>
        <div style={{ width: 36, height: 36, borderRadius: '10px', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '1.1rem', color: '#fff', flexShrink: 0 }}>
          {label}
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a' }}>Group {label}</div>
          <div style={{ fontSize: '.75rem', color: '#64748b' }}>{teams.length} teams competing</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
        {teams.map(t => (
          <TeamCard key={t.id} t={t} isOpen={open[t.id] === undefined ? false : open[t.id]} onToggle={() => onToggle(t.id)} />
        ))}
      </div>
    </div>
  );
}

export default function Teams({ teams, loaded }) {
  const [open, setOpen] = useState({});
  const list = useMemo(() => Object.values(teams || {}).sort((a, b) => (a.gradient || 0) - (b.gradient || 0)), [teams]);
  const groupA = useMemo(() => list.filter(t => (t.group || 'A') === 'A'), [list]);
  const groupB = useMemo(() => list.filter(t => t.group === 'B'), [list]);

  if (!loaded) {
    return (
      <main className="container">
        <div className="page-title"><h1>Tournament Teams</h1><p>Loading teams…</p></div>
      </main>
    );
  }

  const toggle = (id) => setOpen(o => ({ ...o, [id]: !(o[id] === undefined ? false : o[id]) }));
  const expandAll = (teamsList) => setOpen(o => { const n = { ...o }; teamsList.forEach(t => { n[t.id] = true; }); return n; });
  const collapseAll = (teamsList) => setOpen(o => { const n = { ...o }; teamsList.forEach(t => { n[t.id] = false; }); return n; });

  return (
    <main className="container">
      <div className="page-title">
        <h1>Tournament Teams</h1>
        <p>{list.length} teams · 2 groups · Tap a card to view roster</p>
      </div>

      <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <button className="btn ghost small" onClick={() => expandAll(list)}>Expand all</button>
        <button className="btn ghost small" onClick={() => collapseAll(list)}>Collapse all</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: '2rem', alignItems: 'start' }}>
        <GroupSection label="A" teams={groupA} open={open} onToggle={toggle} testid="teams-list-a" />
        <GroupSection label="B" teams={groupB} open={open} onToggle={toggle} testid="teams-list-b" />
      </div>
    </main>
  );
}

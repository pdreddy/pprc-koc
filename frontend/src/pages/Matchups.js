import React, { useMemo, useState } from 'react';
import { resolveMatchTeams, lineWinnerSide } from '../utils/matchTeams';
import { isApprovedMatch } from '../utils/matchStatus';

// Compute player statistics from matches
function computeStats(matches, teams) {
  const players = {};
  const doubles = {};
  const playerTeamMap = {};

  // First pass: build player→team map from team rosters (more accurate than from matches)
  Object.values(teams || {}).forEach(t => {
    (t.players || []).forEach(p => {
      playerTeamMap[p.name] = t.name;
    });
  });

  matches.forEach((match) => {
    if (!isApprovedMatch(match)) return;
    if (!match.lines) return;
    const matchId = match.id;
    const { team1: m1, team2: m2 } = resolveMatchTeams(match, teams);
    const t1Name = m1 ? m1.name : (match.t1 || 'Unknown');
    const t2Name = m2 ? m2.name : (match.t2 || 'Unknown');

    match.lines.forEach(line => {
      const t1 = line.players?.team1 || [];
      const t2 = line.players?.team2 || [];
      const g1 = line.g1 || 0;
      const g2 = line.g2 || 0;
      const winnerSide = lineWinnerSide(line, match);
      const t1won = winnerSide ? winnerSide === 1 : g1 > g2;

      [...t1, ...t2].forEach(p => {
        if (!players[p]) {
          players[p] = {
            courtsWon: 0, courtsLost: 0,
            matchesPlayed: new Set(),
            singlesCount: 0, doublesCount: 0,
            team: playerTeamMap[p] || (t1.includes(p) ? t1Name : t2Name) || 'Unknown'
          };
        }
        players[p].matchesPlayed.add(matchId);
        const playerWon = t1.includes(p) ? t1won : !t1won;
        if (playerWon) players[p].courtsWon++; else players[p].courtsLost++;
        if (line.type === 'singles') players[p].singlesCount++;
        else if (line.type === 'doubles') players[p].doublesCount++;
      });

      if (line.type === 'doubles' && t1.length === 2 && t2.length === 2) {
        [t1, t2].forEach((team, idx) => {
          const key = [...team].sort().join(' & ');
          if (!doubles[key]) {
            doubles[key] = {
              w: 0, l: 0, matchesPlayed: new Set(),
              teams: team.map(p => playerTeamMap[p] || (idx === 0 ? t1Name : t2Name) || 'Unknown')
            };
          }
          doubles[key].matchesPlayed.add(matchId);
          const won = idx === 0 ? t1won : !t1won;
          if (won) doubles[key].w++; else doubles[key].l++;
        });
      }
    });
  });

  return { players, doubles };
}

function PlayerStatsTable({ players }) {
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    return Object.entries(players).map(([name, d]) => {
      const totalCourts = d.courtsWon + d.courtsLost;
      const pct = totalCourts > 0 ? Math.round((d.courtsWon / totalCourts) * 100) : 0;
      return {
        name, team: d.team,
        matchesPlayed: d.matchesPlayed.size,
        totalCourts, courtsWon: d.courtsWon, courtsLost: d.courtsLost,
        singles: d.singlesCount, doubles: d.doublesCount,
        pct, maxed: d.matchesPlayed.size >= 6, singlesMaxed: d.singlesCount >= 2
      };
    }).sort((a, b) => b.matchesPlayed - a.matchesPlayed || b.totalCourts - a.totalCourts);
  }, [players]);

  const filtered = rows.filter(r => !q || (r.name + ' ' + r.team).toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <input
        className="input"
        placeholder="🔍 Search player or team..."
        value={q}
        onChange={e => setQ(e.target.value)}
        data-testid="matchups-players-search"
        style={{ marginBottom: '.6rem' }}
      />
      <div className="card">
        <div className="table-wrap">
          <table className="std" data-testid="matchups-players-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Team</th>
                <th>MD</th>
                <th>Crts</th>
                <th>W</th>
                <th>L</th>
                <th>S</th>
                <th>D</th>
                <th>Win%</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan="9" className="center muted">No player data yet</td></tr>}
              {filtered.map(r => {
                const color = r.pct >= 60 ? 'win' : r.pct >= 40 ? 'tie' : 'lose';
                return (
                  <tr key={r.name} className={r.maxed ? 'q' : ''} data-testid={`matchups-player-${r.name}`}>
                    <td><strong>{r.name}</strong></td>
                    <td><span className="tag" style={{ fontSize: '.7rem' }}>{r.team}</span></td>
                    <td>{r.matchesPlayed}</td>
                    <td><strong>{r.totalCourts}</strong></td>
                    <td>{r.courtsWon}</td>
                    <td>{r.courtsLost}</td>
                    <td>{r.singles}</td>
                    <td>{r.doubles}</td>
                    <td><span className={`tag ${color}`}>{r.pct}%</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="hint">MD = Match Days · Highlighted rows are at the 6-day cap.</p>
      </div>
    </>
  );
}

function SinglesCapTable({ players }) {
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    return Object.entries(players).map(([name, d]) => ({
      name, team: d.team,
      matchesPlayed: d.matchesPlayed.size,
      singlesCount: d.singlesCount,
      doublesCount: d.doublesCount,
      totalCourts: d.courtsWon + d.courtsLost,
      singlesMaxed: d.singlesCount >= 2,
      matchesMaxed: d.matchesPlayed.size >= 6
    })).sort((a, b) => {
      if (a.singlesMaxed && !b.singlesMaxed) return -1;
      if (b.singlesMaxed && !a.singlesMaxed) return 1;
      return b.matchesPlayed - a.matchesPlayed || b.singlesCount - a.singlesCount;
    });
  }, [players]);

  const filtered = rows.filter(r => !q || (r.name + ' ' + r.team).toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <input
        className="input"
        placeholder="🔍 Search player or team..."
        value={q}
        onChange={e => setQ(e.target.value)}
        data-testid="matchups-singles-search"
        style={{ marginBottom: '.6rem' }}
      />
      <div className="card">
        <div className="table-wrap">
          <table className="std" data-testid="matchups-singles-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Team</th>
                <th>MD</th>
                <th>S/2</th>
                <th>D</th>
                <th>Crts</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan="7" className="center muted">No player data yet</td></tr>}
              {filtered.map(r => {
                const status = r.singlesMaxed ? 'MAXED' : `${2 - r.singlesCount} left`;
                const color = r.singlesMaxed ? 'lose' : r.singlesCount >= 1 ? 'tie' : 'win';
                return (
                  <tr key={r.name} className={r.singlesMaxed || r.matchesMaxed ? 'q' : ''} data-testid={`matchups-singles-${r.name}`}>
                    <td><strong>{r.name}</strong></td>
                    <td><span className="tag" style={{ fontSize: '.7rem' }}>{r.team}</span></td>
                    <td>{r.matchesPlayed}</td>
                    <td><strong>{r.singlesCount}</strong>/2</td>
                    <td>{r.doublesCount}</td>
                    <td>{r.totalCourts}</td>
                    <td><span className={`tag ${color}`}>{status}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="hint">Cap: 2 singles match days per player.</p>
      </div>
    </>
  );
}

function DoublesCombos({ doubles }) {
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    return Object.entries(doubles).map(([k, d]) => ({
      key: k, w: d.w, l: d.l,
      matchesPlayed: d.matchesPlayed.size,
      total: d.w + d.l,
      teams: [...new Set(d.teams)].join(' / ')
    })).sort((a, b) => {
      const aMax = a.matchesPlayed >= 3, bMax = b.matchesPlayed >= 3;
      if (aMax && !bMax) return -1;
      if (bMax && !aMax) return 1;
      return b.total - a.total;
    });
  }, [doubles]);

  const filtered = rows.filter(r => !q || (r.key + ' ' + r.teams).toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <input
        className="input"
        placeholder="🔍 Search combo or team..."
        value={q}
        onChange={e => setQ(e.target.value)}
        data-testid="matchups-doubles-search"
        style={{ marginBottom: '.6rem' }}
      />
      <div className="card">
        <h2>Doubles Partnerships</h2>
        {filtered.length === 0 && <p className="muted">No doubles data yet</p>}
        {filtered.map(r => {
          const maxed = r.matchesPlayed >= 3;
          const pct = r.total > 0 ? Math.round((r.w / r.total) * 100) : 0;
          const color = pct >= 60 ? 'win' : pct >= 40 ? 'tie' : 'lose';
          return (
            <div key={r.key} data-testid={`matchups-doubles-${r.key}`} style={{
              background: maxed ? 'linear-gradient(90deg, #fee2e2 0%, #fef2f2 100%)' : '#f8fafc',
              borderLeft: `4px solid ${maxed ? '#dc2626' : 'var(--bg2)'}`,
              borderRadius: 10, padding: '.75rem', marginBottom: '.5rem'
            }}>
              <div style={{ fontWeight: 800, marginBottom: '.3rem', fontSize: '.95rem' }}>
                {r.key} <span className="tag" style={{ fontSize: '.7rem' }}>{r.teams}</span>
                {maxed && <span className="tag lose" style={{ marginLeft: '.4rem', fontSize: '.7rem' }}>MAXED</span>}
              </div>
              <div className="muted" style={{ fontSize: '.85rem', display: 'flex', gap: '.8rem', flexWrap: 'wrap' }}>
                <span>MD: <strong style={{ color: 'var(--ink)' }}>{r.matchesPlayed}</strong>/3</span>
                <span>Courts: <strong style={{ color: 'var(--ink)' }}>{r.total}</strong></span>
                <span>Record: <strong style={{ color: 'var(--ink)' }}>{r.w}-{r.l}</strong></span>
                <span>Win: <span className={`tag ${color}`} style={{ fontSize: '.7rem' }}>{pct}%</span></span>
              </div>
            </div>
          );
        })}
        <p className="hint">Limit: 3 doubles match days per partnership.</p>
      </div>
    </>
  );
}

export default function Matchups({ matches, teams }) {
  const [tab, setTab] = useState('players');
  const { players, doubles } = useMemo(() => computeStats(matches || [], teams || {}), [matches, teams]);

  return (
    <main className="container">
      <div className="page-title">
        <h1>🎾 Player Matchups</h1>
        <p>Caps: 6 match days · 2 singles · 3 doubles per pair</p>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'players' ? 'active' : ''}`} onClick={() => setTab('players')} data-testid="matchups-tab-players">Player Stats</button>
        <button className={`tab ${tab === 'singles' ? 'active' : ''}`} onClick={() => setTab('singles')} data-testid="matchups-tab-singles">Singles Cap</button>
        <button className={`tab ${tab === 'doubles' ? 'active' : ''}`} onClick={() => setTab('doubles')} data-testid="matchups-tab-doubles">Doubles</button>
      </div>

      {tab === 'players' && <PlayerStatsTable players={players} />}
      {tab === 'singles' && <SinglesCapTable players={players} />}
      {tab === 'doubles' && <DoublesCombos doubles={doubles} />}
    </main>
  );
}

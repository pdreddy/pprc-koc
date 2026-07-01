import React from 'react';
import TeamLogo from '../components/TeamLogo';
import { resolveMatchTeams, matchWinnerId } from '../utils/matchTeams';
import { isApprovedMatch } from '../utils/matchStatus';

function statsForGroup(teamsInGroup, matches, allTeams) {
  const groupIds = new Set(teamsInGroup.map(t => t.id));
  const stats = {};
  teamsInGroup.forEach(t => {
    stats[t.id] = {
      id: t.id, team: t.name, abbr: t.abbreviation, logoUrl: t.logoUrl || null,
      matches: 0, wins: 0, losses: 0,
      setsFor: 0, setsAgainst: 0,
      gamesFor: 0, gamesAgainst: 0, points: 0, singlesWins: 0
    };
  });
  const headToHead = {};
  for (const m of matches || []) {
    if (!isApprovedMatch(m)) continue;
    const { team1, team2 } = resolveMatchTeams(m, allTeams);
    if (!team1 || !team2) continue;
    if (!groupIds.has(team1.id) || !groupIds.has(team2.id)) continue;
    const winId = matchWinnerId(m, allTeams);
    stats[team1.id].matches++; stats[team2.id].matches++;
    stats[team1.id].gamesFor += Number(m.g1) || 0; stats[team1.id].gamesAgainst += Number(m.g2) || 0;
    stats[team2.id].gamesFor += Number(m.g2) || 0; stats[team2.id].gamesAgainst += Number(m.g1) || 0;
    stats[team1.id].setsFor += Number(m.s1) || 0; stats[team1.id].setsAgainst += Number(m.s2) || 0;
    stats[team2.id].setsFor += Number(m.s2) || 0; stats[team2.id].setsAgainst += Number(m.s1) || 0;
    (m.lines || []).filter(l => l.type === 'singles').forEach(l => {
      if ((Number(l.g1) || 0) > (Number(l.g2) || 0)) stats[team1.id].singlesWins++;
      if ((Number(l.g2) || 0) > (Number(l.g1) || 0)) stats[team2.id].singlesWins++;
    });
    if (winId === team1.id) { stats[team1.id].wins++; stats[team2.id].losses++; stats[team1.id].points++; }
    else if (winId === team2.id) { stats[team2.id].wins++; stats[team1.id].losses++; stats[team2.id].points++; }
    headToHead[`${team1.id}:${team2.id}`] = (headToHead[`${team1.id}:${team2.id}`] || 0) + (winId === team1.id ? 1 : 0);
    headToHead[`${team2.id}:${team1.id}`] = (headToHead[`${team2.id}:${team1.id}`] || 0) + (winId === team2.id ? 1 : 0);
  }
  return Object.values(stats).map(s => ({
    ...s,
    setDiff: s.setsFor - s.setsAgainst,
    gameDiff: s.gamesFor - s.gamesAgainst
  })).sort((a, b) =>
    (b.points - a.points) ||
    (b.setsFor - a.setsFor) ||
    (b.gamesFor - a.gamesFor) ||
    (b.singlesWins - a.singlesWins) ||
    ((headToHead[`${b.id}:${a.id}`] || 0) - (headToHead[`${a.id}:${b.id}`] || 0)) ||
    (b.setDiff - a.setDiff) ||
    (b.gameDiff - a.gameDiff) ||
    a.team.localeCompare(b.team)
  );
}

function GroupTable({ label, rows, qualifyTop }) {
  const leader = rows[0];
  return (
    <section className="card standings-card" data-testid={`standings-group-${label}`}>
      <div className="standings-card-head">
        <div>
          <span className="standings-kicker">Group {label}</span>
          <h2>{leader?.team || `Group ${label}`} <span className="muted">· {rows.length} teams</span></h2>
        </div>
        <span className="standings-qualifier">Top {qualifyTop} qualify</span>
      </div>
      <div className="table-wrap">
        <table className="std" data-testid={`standings-table-${label}`}>
          <thead>
            <tr>
              <th>#</th>
              <th>Team</th>
              <th title="Matches played">M</th>
              <th title="Team points">Pts</th>
              <th title="Sets won">Sets</th>
              <th title="Total games won">Games</th>
              <th title="Singles wins">Singles</th>
              <th title="Match record">Record</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan="8" className="center muted">No teams in this group</td></tr>}
            {rows.map((r, i) => (
              <tr key={r.id} className={i < qualifyTop ? 'q' : ''} data-testid={`standings-${label}-row-${r.abbr}`}>
                <td className="rank"><span>{i + 1}</span></td>
                <td className="standing-team-cell">
                  <TeamLogo team={{ abbreviation: r.abbr, name: r.team, logoUrl: r.logoUrl }} size={24} />
                  <div className="standing-team-names">
                    <strong>{r.abbr}</strong>
                    <small>{r.team}</small>
                  </div>
                </td>
                <td>{r.matches}</td>
                <td className="pts">{r.points}</td>
                <td>
                  <strong>{r.setsFor}</strong>
                  <small className="standings-substat">{r.setDiff > 0 ? `+${r.setDiff}` : r.setDiff}</small>
                </td>
                <td>
                  <strong>{r.gamesFor}</strong>
                  <small className="standings-substat">{r.gameDiff > 0 ? `+${r.gameDiff}` : r.gameDiff}</small>
                </td>
                <td>{r.singlesWins}</td>
                <td><span className="record-pill">{r.wins}-{r.losses}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function Standings({ teams, matches }) {
  const list = Object.values(teams || {});
  const groupA = list.filter(t => (t.group || 'A') === 'A').sort((a, b) => (a.gradient || 0) - (b.gradient || 0));
  const groupB = list.filter(t => t.group === 'B').sort((a, b) => (a.gradient || 0) - (b.gradient || 0));

  const rowsA = statsForGroup(groupA, matches, teams);
  const rowsB = statsForGroup(groupB, matches, teams);

  return (
    <main className="container standings-page">
      <div className="page-title">
        <h1>Standings</h1>
        <p>Two groups of 8 · Top 4 from each group qualify for semifinals</p>
      </div>
      <section className="standings-summary" aria-label="Standings summary">
        <div className="standings-summary-card"><span>Groups</span><strong>2</strong><small>A & B brackets</small></div>
        <div className="standings-summary-card"><span>Teams</span><strong>{groupA.length + groupB.length}</strong><small>Competing teams</small></div>
        <div className="standings-summary-card"><span>Qualified</span><strong>4</strong><small>Top 4 each group</small></div>
      </section>
      <div className="groups-grid standings-grid">
        <GroupTable label="A" rows={rowsA} qualifyTop={4} />
        <GroupTable label="B" rows={rowsB} qualifyTop={4} />
      </div>
      <p className="hint center standings-sort-note">Sort: Team Points → Sets Won → Total Games Won → Singles Won → Head-to-Head</p>
    </main>
  );
}

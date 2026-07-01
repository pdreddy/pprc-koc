import React, { useMemo, useState } from 'react';
import { approvedMatches } from '../utils/matchStatus';
import { matchTeamNames, matchWinnerId } from '../utils/matchTeams';
import { useAuth } from '../contexts/AuthContext';
import { ROLES, hasRole } from '../utils/roles';
import TeamLogo from '../components/TeamLogo';

function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function weekdayShort(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase();
}

function formatPlayers(players = []) {
  return Array.isArray(players) && players.length > 0 ? players.join(' / ') : '—';
}

function formatLineup(lineup = []) {
  const labels = ['S1', 'D1', 'D2'];
  return labels.map(label => {
    const line = Array.isArray(lineup) ? lineup.find(row => row?.label === label) : null;
    const players = line?.players || [];
    return { label, players: Array.isArray(players) ? players.map(player => player?.name || player).filter(Boolean) : [] };
  });
}

function formatSetScore(set) {
  if (!set) return '';
  let score = `${set.team1}-${set.team2}`;
  if (set.tieBreak) score += `(${set.tieBreak.team1}-${set.tieBreak.team2})`;
  if (set.matchTieBreak) score += `(${set.matchTieBreak.team1}-${set.matchTieBreak.team2})`;
  return score;
}

function lineupForTeam(teamId, submissions, reveal) {
  const submittedLineup = submissions?.[teamId]?.lineup;
  if (Array.isArray(submittedLineup) && submittedLineup.length > 0) return submittedLineup;
  return reveal?.lineups?.[teamId] || [];
}

function LineupPanel({ fixture, teams, submissions, reveal }) {
  return (
    <div className="lineup-reveal" style={{ marginTop: '.45rem' }} data-testid={`schedule-lineups-${fixture.id}`}>
      <h4>Revealed Lineups</h4>
      {['team1Id', 'team2Id'].map(key => {
        const teamId = fixture[key];
        const team = teams[teamId];
        return (
          <div key={teamId} style={{ marginTop: '.35rem' }}>
            <strong>{team?.name || teamId}</strong>
            {formatLineup(lineupForTeam(teamId, submissions, reveal)).map(row => (
              <div key={row.label}><strong>{row.label}:</strong> {formatPlayers(row.players)}</div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function ScorePanel({ match, teams }) {
  if (!match) return null;
  const names = matchTeamNames(match, teams);
  const winnerId = matchWinnerId(match, teams);
  const winnerName = winnerId === names.team1Id ? names.t1Name : (winnerId === names.team2Id ? names.t2Name : (match.win || 'Unknown'));
  return (
    <div className="lines" style={{ marginTop: '.45rem' }} data-testid={`schedule-score-${match.scheduleId || match.matchScheduleId || match.id}`}>
      <strong>{winnerName} won · {match.g1}–{match.g2} games · {match.s1}–{match.s2} sets</strong>
      {(match.lines || []).map((line, idx) => (
        <div className="ln" key={idx}>
          <strong>{line.label}:</strong> {formatPlayers(line.players?.team1)} vs {formatPlayers(line.players?.team2)} — {(line.sets || []).map(formatSetScore).join(', ')} ({line.g1}-{line.g2})
        </div>
      ))}
    </div>
  );
}

function matchBelongsToFixture(match, fixture, teams) {
  if (!match || !fixture) return false;
  const savedScheduleId = match.scheduleId || match.matchScheduleId;
  if (savedScheduleId && String(savedScheduleId) === String(fixture.id)) return true;
  const names = matchTeamNames(match, teams);
  const matchTeamIds = [names.team1Id, names.team2Id].filter(Boolean).sort().join('|');
  const fixtureTeamIds = [fixture.team1Id, fixture.team2Id].filter(Boolean).sort().join('|');
  return !!matchTeamIds && matchTeamIds === fixtureTeamIds;
}

function teamPairKey(team1Id, team2Id) {
  return [team1Id, team2Id].filter(Boolean).sort().join('|');
}

function hasLineupForTeam(teamId, submissions, reveal) {
  const lineup = lineupForTeam(teamId, submissions, reveal);
  return Array.isArray(lineup) && lineup.length > 0;
}

function MatchRow({ m, t1, t2, isCompleted, lineupReady, scoreReady, lineupOpen, scoreOpen, onToggleLineup, onToggleScore, submissions, reveal, match, teams, showPublicDetails }) {
  return (
    <div data-testid={`schedule-match-${m.id}`} style={{ background: isCompleted ? '#ecfdf5' : '#f8fafc', borderLeft: `3px solid ${isCompleted ? '#10b981' : (m.group === 'A' ? '#2563eb' : '#d97706')}`, borderRadius: 8, padding: '.55rem .65rem' }}>
      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
        <div style={{
          background: '#fff', borderRadius: 6, padding: '.25rem .4rem',
          minWidth: 60, textAlign: 'center',
          color: m.group === 'A' ? '#2563eb' : '#d97706',
          fontWeight: 900, fontSize: '.72rem', lineHeight: 1.2
        }}>
          <div>{weekdayShort(m.date)}</div>
          <div style={{ color: 'var(--ink)', fontSize: '.7rem', marginTop: 1 }}>{m.time}</div>
        </div>
        <div style={{ flex: 1, fontSize: '.82rem', lineHeight: 1.3, minWidth: 0 }}>
          <div className="team-logo-line" style={{ fontWeight: 800 }}>
            <TeamLogo team={t1} size={30} />
            <span className="team-logo-line-text"><strong>{t1 ? `${t1.name}` : '?'}</strong><span className="muted" style={{ fontWeight: 600, fontSize: '.72rem' }}>{t1?.abbreviation || '?'}</span></span>
          </div>
          <div className="muted" style={{ fontWeight: 800, fontSize: '.7rem', margin: '.18rem 0 .18rem 2.4rem' }}>vs</div>
          <div className="team-logo-line" style={{ fontWeight: 800 }}>
            <TeamLogo team={t2} size={30} />
            <span className="team-logo-line-text"><strong>{t2 ? `${t2.name}` : '?'}</strong><span className="muted" style={{ fontWeight: 600, fontSize: '.72rem' }}>{t2?.abbreviation || '?'}</span></span>
          </div>
        </div>
        {isCompleted && <span className="tag win" style={{ fontSize: '.65rem' }}>✓</span>}
      </div>
      {showPublicDetails && (
        <>
          <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', marginTop: '.5rem' }}>
            <button type="button" className="btn small ghost" disabled={!lineupReady} onClick={onToggleLineup} data-testid={`schedule-reveal-lineups-${m.id}`}>{lineupOpen ? 'Hide lineups' : 'Reveal lineups'}</button>
            <button type="button" className="btn small ghost" disabled={!scoreReady} onClick={onToggleScore} data-testid={`schedule-view-score-${m.id}`}>{scoreOpen ? 'Hide score' : 'View score'}</button>
          </div>
          {!lineupReady && <div className="hint" style={{ marginTop: '.3rem' }}>Lineups unlock here after both captains reveal/lock lineups. Scores unlock after a submitted score is approved.</div>}
          {lineupOpen && <LineupPanel fixture={m} teams={teams} submissions={submissions} reveal={reveal} />}
          {scoreOpen && <ScorePanel match={match} teams={teams} />}
        </>
      )}
    </div>
  );
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Schedule({ teams, schedule, matches = [], lineupSubmissions = {}, revealedLineups = {} }) {
  const { session } = useAuth();
  const showPublicDetails = true; // reveal lineups + view score available to all roles
  const [filterTeam, setFilterTeam] = useState('all');
  const [filterGroup, setFilterGroup] = useState('all');
  const [openLineups, setOpenLineups] = useState({});
  const [openScores, setOpenScores] = useState({});
  const [collapsedRounds, setCollapsedRounds] = useState({});

  const scheduleItems = useMemo(() => Object.values(schedule || {}), [schedule]);
  const bufferItems = useMemo(() => scheduleItems.filter(item => item?.type === 'buffer'), [scheduleItems]);
  const matchList = useMemo(() => scheduleItems.filter(item => item?.type !== 'buffer'), [scheduleItems]);
  const approvedMatchList = useMemo(() => approvedMatches(matches), [matches]);
  const revealedByScheduleId = useMemo(() => {
    const map = {};
    Object.values(revealedLineups || {}).forEach(row => {
      if (row?.scheduleId) map[row.scheduleId] = row;
    });
    return map;
  }, [revealedLineups]);
  const approvedMatchByFixtureId = useMemo(() => {
    const byScheduleId = {};
    const byTeamPair = {};
    approvedMatchList.forEach(match => {
      const scheduleId = match.scheduleId || match.matchScheduleId;
      if (scheduleId && !byScheduleId[scheduleId]) byScheduleId[scheduleId] = match;
      const names = matchTeamNames(match, teams);
      const pair = teamPairKey(names.team1Id, names.team2Id);
      if (pair && !byTeamPair[pair]) byTeamPair[pair] = match;
    });
    return matchList.reduce((map, fixture) => {
      map[fixture.id] = byScheduleId[fixture.id] || byTeamPair[teamPairKey(fixture.team1Id, fixture.team2Id)] || null;
      return map;
    }, {});
  }, [approvedMatchList, matchList, teams]);
  const fixtureDetailsById = useMemo(() => {
    return matchList.reduce((map, fixture) => {
      const submissions = lineupSubmissions?.[fixture.id] || {};
      const reveal = revealedByScheduleId[fixture.id];
      const teamIds = [fixture.team1Id, fixture.team2Id];
      const bothLocked = teamIds.every(teamId => {
        const sub = submissions?.[teamId] || {};
        return (sub.lockedAt || sub.revealedAt || sub.revealId) && !sub.unlockedAt;
      });
      const scoreMatch = approvedMatchByFixtureId[fixture.id] || (showPublicDetails ? approvedMatchList.find(match => matchBelongsToFixture(match, fixture, teams)) : null);
      const bothLineupsAvailable = teamIds.every(teamId => hasLineupForTeam(teamId, submissions, reveal));
      const hasUnlockedLineup = teamIds.some(teamId => submissions?.[teamId]?.unlockedAt);
      map[fixture.id] = {
        submissions,
        reveal,
        scoreMatch,
        lineupReady: (bothLineupsAvailable || !!reveal || bothLocked) && !hasUnlockedLineup,
        scoreReady: !!scoreMatch
      };
      return map;
    }, {});
  }, [approvedMatchByFixtureId, approvedMatchList, lineupSubmissions, matchList, revealedByScheduleId, showPublicDetails, teams]);

  const teamOptions = useMemo(() =>
    Object.values(teams || {})
      .filter(t => filterGroup === 'all' || t.group === filterGroup)
      .sort((a, b) => (a.group || '').localeCompare(b.group || '') || (a.groupOrder || 0) - (b.groupOrder || 0) || (a.gradient || 0) - (b.gradient || 0))
  , [teams, filterGroup]);

  // Group by round
  const rounds = useMemo(() => {
    const map = {};
    matchList.forEach(m => {
      const key = `${m.round}-${m.date}`;
      if (!map[key]) map[key] = { round: m.round, date: m.date, items: [] };
      map[key].items.push(m);
    });
    return Object.values(map).sort((a, b) => (a.round - b.round) || a.date.localeCompare(b.date));
  }, [matchList]);

  const timeline = useMemo(() => {
    const bufferCards = filterGroup === 'all' && filterTeam === 'all'
      ? bufferItems.map(item => ({ type: 'buffer', date: item.date, id: item.id, item }))
      : [];
    return [
      ...rounds.map(round => ({ type: 'round', date: round.date, id: `${round.round}-${round.date}`, round })),
      ...bufferCards
    ].sort((a, b) => a.date.localeCompare(b.date) || (a.type === 'buffer' ? -1 : 1));
  }, [bufferItems, filterGroup, filterTeam, rounds]);

  if (matchList.length === 0) {
    return (
      <main className="container">
        <div className="page-title">
          <h1>Schedule</h1>
          <p>Fixtures load from Firebase — auto-seeded on first launch.</p>
        </div>
        <div className="card center muted" data-testid="schedule-empty">No schedule yet. Sign in as admin to build one.</div>
      </main>
    );
  }

  return (
    <main className="container">
      <div className="page-title">
        <h1>Schedule</h1>
        <p>7 rounds · Group A Saturdays · Group B Sundays · July 4 buffer week</p>
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: '.5rem' }}>
          <div style={{ flex: 1 }}>
            <div className="field-label">Group</div>
            <select className="select" value={filterGroup} onChange={e => { setFilterGroup(e.target.value); setFilterTeam('all'); }} data-testid="schedule-group-filter">
              <option value="all">All</option>
              <option value="A">Group A</option>
              <option value="B">Group B</option>
            </select>
          </div>
          <div style={{ flex: 2 }}>
            <div className="field-label">Team</div>
            <select className="select" value={filterTeam} onChange={e => setFilterTeam(e.target.value)} data-testid="schedule-team-filter">
              <option value="all">All Teams</option>
              {teamOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {timeline.map((entry) => {
        if (entry.type === 'buffer') {
          const item = entry.item;
          return (
            <div className="card center muted" key={item.id} data-testid="schedule-buffer-week">
              <strong>{item.title || 'Buffer week'}</strong>
              <div>{formatDate(item.date)}</div>
            </div>
          );
        }

        const r = entry.round;
        const visible = r.items.filter(m => {
          if (filterGroup !== 'all' && m.group !== filterGroup) return false;
          if (filterTeam !== 'all' && m.team1Id !== filterTeam && m.team2Id !== filterTeam) return false;
          return true;
        }).sort((a, b) => (a.group.localeCompare(b.group)) || a.time.localeCompare(b.time));
        if (visible.length === 0) return null;

        const roundKey = `${r.round}-${r.date}`;
        const isPast = r.date < todayIso();
        // Default: past rounds collapsed, current/future open
        const isCollapsed = roundKey in collapsedRounds ? collapsedRounds[roundKey] : isPast;
        const toggleRound = () => setCollapsedRounds(prev => ({ ...prev, [roundKey]: !isCollapsed }));

        const completedCount = visible.filter(m => {
          const details = fixtureDetailsById[m.id] || {};
          return m.status === 'completed' || details.scoreReady;
        }).length;

        return (
          <div className="card" key={roundKey} data-testid={`schedule-round-${r.round}`} style={{ padding: 0, overflow: 'hidden' }}>
            {/* Collapsible header */}
            <button
              type="button"
              onClick={toggleRound}
              style={{
                width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '.65rem .85rem', background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: isCollapsed ? 'none' : '2px solid var(--ring)',
                textAlign: 'left', gap: '.5rem'
              }}
              aria-expanded={!isCollapsed}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                <span className="tag" style={{ background: 'linear-gradient(135deg,var(--bg1),var(--bg2))', color: '#fff', padding: '.25rem .6rem', fontSize: '.72rem' }}>Week {r.round}</span>
                <span className="muted" style={{ fontWeight: 700, fontSize: '.82rem' }}>{formatDate(r.date)}</span>
                {completedCount > 0 && (
                  <span style={{ fontSize: '.68rem', color: '#10b981', fontWeight: 700 }}>✓ {completedCount}/{visible.length} done</span>
                )}
                {filterGroup === 'all' && (() => {
                  const grpA = visible.filter(m => m.group === 'A');
                  const grpB = visible.filter(m => m.group === 'B');
                  const doneA = grpA.filter(m => m.status === 'completed' || (fixtureDetailsById[m.id] || {}).scoreReady).length;
                  const doneB = grpB.filter(m => m.status === 'completed' || (fixtureDetailsById[m.id] || {}).scoreReady).length;
                  return (
                    <div style={{ display: 'flex', gap: '.3rem', flexShrink: 0 }}>
                      {grpA.length > 0 && <span style={{ fontSize: '.62rem', background: '#dbeafe', color: '#1e3a8a', padding: '.1rem .35rem', borderRadius: 10, fontWeight: 700 }}>A {doneA}/{grpA.length}</span>}
                      {grpB.length > 0 && <span style={{ fontSize: '.62rem', background: '#fed7aa', color: '#9a3412', padding: '.1rem .35rem', borderRadius: 10, fontWeight: 700 }}>B {doneB}/{grpB.length}</span>}
                    </div>
                  );
                })()}
              </div>
              <span style={{ color: 'var(--muted)', fontSize: '.85rem', flexShrink: 0 }}>{isCollapsed ? '▶' : '▼'}</span>
            </button>

            {!isCollapsed && (() => {
              const groupA = visible.filter(m => m.group === 'A');
              const groupB = visible.filter(m => m.group === 'B');
              const renderGroup = (label, items) => {
                if (items.length === 0) return null;
                const color = label === 'A' ? '#2563eb' : '#d97706';
                const bg = label === 'A' ? '#dbeafe' : '#fed7aa';
                const textColor = label === 'A' ? '#1e3a8a' : '#9a3412';
                const doneCount = items.filter(m => {
                  const d = fixtureDetailsById[m.id] || {};
                  return m.status === 'completed' || d.scoreReady;
                }).length;
                return (
                  <div key={label} style={{ marginBottom: '.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.3rem 0', borderBottom: `2px solid ${bg}`, marginBottom: '.4rem' }}>
                      <span style={{ background: bg, color: textColor, fontWeight: 800, fontSize: '.72rem', padding: '.2rem .55rem', borderRadius: 20 }}>Group {label}</span>
                      {doneCount > 0 && <span style={{ fontSize: '.68rem', color: '#10b981', fontWeight: 700 }}>✓ {doneCount}/{items.length} done</span>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                      {items.map(m => {
                        const details = fixtureDetailsById[m.id] || {};
                        return (
                          <div key={m.id}>
                            {(m.status === 'completed' || m.status === 'cancelled') && (
                              <div style={{ display: 'flex', gap: '.3rem', marginBottom: '.2rem' }}>
                                {m.status === 'completed' && <span className="tag win" style={{ fontSize: '.65rem' }}>Played</span>}
                                {m.status === 'cancelled' && <span className="tag lose" style={{ fontSize: '.65rem' }}>Cancelled</span>}
                              </div>
                            )}
                            <MatchRow
                              m={m}
                              t1={teams[m.team1Id]}
                              t2={teams[m.team2Id]}
                              isCompleted={m.status === 'completed' || details.scoreReady}
                              lineupReady={!!details.lineupReady}
                              scoreReady={!!details.scoreReady}
                              lineupOpen={!!openLineups[m.id]}
                              scoreOpen={!!openScores[m.id]}
                              onToggleLineup={() => setOpenLineups(prev => ({ ...prev, [m.id]: !prev[m.id] }))}
                              onToggleScore={() => setOpenScores(prev => ({ ...prev, [m.id]: !prev[m.id] }))}
                              submissions={details.submissions || {}}
                              reveal={details.reveal}
                              match={details.scoreMatch}
                              teams={teams}
                              showPublicDetails={showPublicDetails}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              };
              return (
                <div style={{ padding: '.5rem .85rem .75rem' }}>
                  {renderGroup('A', groupA)}
                  {renderGroup('B', groupB)}
                </div>
              );
            })()}
          </div>
        );
      })}
    </main>
  );
}

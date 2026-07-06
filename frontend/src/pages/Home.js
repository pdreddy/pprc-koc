import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ref, update } from 'firebase/database';
import { db, ensureAuth, PATHS } from '../firebase';
import { recordLineupAudit, writeAuditLog } from '../services/AuditService';
import { useAuth } from '../contexts/AuthContext';
import { ROLES, hasRole } from '../utils/roles';
import { DEFAULT_ELIGIBILITY_RULES, normalizeEligibilityRules } from '../utils/eligibilityRules';
import { approvedMatches } from '../utils/matchStatus';
import { resolveMatchTeams, lineWinnerSide } from '../utils/matchTeams';
import { CaptainCapacityCard, buildCaptainCapacityRows } from '../components/CaptainCapacity';
import TeamLogo from '../components/TeamLogo';
import { WhatsAppShareButton } from '../components/WhatsAppIcon';

function formatDate(iso) {
  if (!iso) return 'TBD';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function calendarBadgeParts(iso) {
  if (!iso) return { month: '—', day: '—' };
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return { month: dt.toLocaleDateString(undefined, { month: 'short' }).toUpperCase(), day: String(dt.getDate()) };
}

function CalendarBadge({ date }) {
  const { month, day } = calendarBadgeParts(date);
  return (
    <span className="cfc-cal-badge" aria-hidden="true">
      <span className="cfc-cal-month">{month}</span>
      <span className="cfc-cal-day">{day}</span>
    </span>
  );
}

function fixtureTeams(item, teams) {
  return { team1: teams?.[item.team1Id], team2: teams?.[item.team2Id] };
}

function pairKey(a, b) {
  return [a, b].filter(Boolean).sort().join('|');
}


const LINEUP_ROLE_SLOTS = [
  { code: 'S1', label: 'Singles' },
  { code: 'D1', label: 'Doubles 1 player A' },
  { code: 'D1', label: 'Doubles 1 player B' },
  { code: 'D2', label: 'Doubles 2 player A' },
  { code: 'D2', label: 'Doubles 2 player B' }
];

const LINEUP_STATUS = {
  notSubmitted: { label: '🟢 Not Submitted', className: 'lineup-status not-submitted' },
  submitted: { label: '🟡 Submitted & Locked', className: 'lineup-status submitted' },
  waiting: { label: '🔵 Waiting for Opponent', className: 'lineup-status waiting' },
  yourTurn: { label: '🟠 Waiting for Your Lineup', className: 'lineup-status your-turn' },
  revealed: { label: '🟣 Revealed', className: 'lineup-status revealed' },
  completed: { label: '⚫ Completed', className: 'lineup-status completed' }
};


function timeLabel(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function dateTimeLabel(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric' }).replace(',', '') + ' at ' + new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function selectedNames(team, selected = []) {
  return LINEUP_ROLE_SLOTS.map((_, idx) => team?.players?.[Number(selected[idx])]?.name || '');
}

function buildDashboardLineupLines(names) {
  return [
    { label: 'S1', players: [names[0]].filter(Boolean) },
    { label: 'D1', players: [names[1], names[2]].filter(Boolean) },
    { label: 'D2', players: [names[3], names[4]].filter(Boolean) }
  ];
}

function eligibilityPlayerKey(teamId, playerName) {
  return `${teamId || ''}:${String(playerName || '').trim().toLowerCase()}`;
}

function eligibilityPairKey(teamId, names) {
  return `${teamId || ''}:${[...(names || [])].map(name => String(name || '').trim().toLowerCase()).sort().join('|')}`;
}

function buildExistingEligibility(matches, teams) {
  const playerDays = new Map();
  const partnerDays = new Map();
  (matches || []).forEach(match => {
    if (match.status && match.status !== 'APPROVED' && match.status !== 'approved') return;
    const team1 = teams?.[match.t1Id] || Object.values(teams || {}).find(team => team.name === match.t1);
    const team2 = teams?.[match.t2Id] || Object.values(teams || {}).find(team => team.name === match.t2);
    if (!team1 || !team2) return;
    const matchPlayers = new Map();
    const matchPairs = new Set();
    (match.lines || []).forEach(line => {
      const type = line.type === 'singles' ? 'singles' : 'doubles';
      [[team1, line.players?.team1 || []], [team2, line.players?.team2 || []]].forEach(([lineTeam, names]) => {
        names.forEach(name => {
          const key = eligibilityPlayerKey(lineTeam.id, name);
          const row = matchPlayers.get(key) || { teamId: lineTeam.id, name, singles: false, doubles: false };
          if (type === 'singles') row.singles = true;
          if (type === 'doubles') row.doubles = true;
          matchPlayers.set(key, row);
        });
        if (type === 'doubles' && names.length === 2) matchPairs.add(eligibilityPairKey(lineTeam.id, names));
      });
    });
    matchPlayers.forEach(row => {
      const key = eligibilityPlayerKey(row.teamId, row.name);
      const previous = playerDays.get(key) || { totalMatchDays: 0, singlesDays: 0, doublesDays: 0 };
      playerDays.set(key, {
        totalMatchDays: previous.totalMatchDays + 1,
        singlesDays: previous.singlesDays + (row.singles ? 1 : 0),
        doublesDays: previous.doublesDays + (row.doubles ? 1 : 0)
      });
    });
    matchPairs.forEach(pairKey => partnerDays.set(pairKey, (partnerDays.get(pairKey) || 0) + 1));
  });
  return { playerDays, partnerDays };
}

function captainLineupEligibilityErrors(team, names, matches, teams, eligibilityRules = DEFAULT_ELIGIBILITY_RULES) {
  const rules = normalizeEligibilityRules(eligibilityRules);
  const existing = buildExistingEligibility(matches, teams);
  const lines = [
    { type: 'singles', players: [names[0]].filter(Boolean) },
    { type: 'doubles', players: [names[1], names[2]].filter(Boolean) },
    { type: 'doubles', players: [names[1], names[2]].filter(Boolean) },
    { type: 'doubles', players: [names[3], names[4]].filter(Boolean) },
    { type: 'doubles', players: [names[3], names[4]].filter(Boolean) }
  ].filter(line => line.players.length > 0);
  const currentPlayers = new Map();
  const currentPairs = new Map();
  lines.forEach(line => {
    line.players.forEach(name => {
      const key = eligibilityPlayerKey(team.id, name);
      const row = currentPlayers.get(key) || { name, teamId: team.id, singles: false, doublesCount: 0 };
      if (line.type === 'singles') row.singles = true;
      if (line.type === 'doubles') row.doublesCount += 1;
      currentPlayers.set(key, row);
    });
    if (line.type === 'doubles' && line.players.length === 2) {
      const pairKey = eligibilityPairKey(team.id, line.players);
      const pair = currentPairs.get(pairKey) || { names: line.players, days: 0 };
      pair.days = 1;
      currentPairs.set(pairKey, pair);
    }
  });
  const errors = [];
  currentPlayers.forEach(row => {
    if (row.singles && row.doublesCount > 0) errors.push(`${row.name}: cannot play singles and doubles on the same match day`);
    if (row.doublesCount > 0 && row.doublesCount !== 2) errors.push(`${row.name}: doubles players must play both Doubles and Reverse Doubles`);
    const previous = existing.playerDays.get(eligibilityPlayerKey(row.teamId, row.name)) || { singlesDays: 0, doublesDays: 0 };
    const nextSingles = previous.singlesDays + (row.singles ? 1 : 0);
    const nextDoubles = previous.doublesDays + (row.doublesCount > 0 ? 1 : 0);
    const nextTotal = nextSingles + nextDoubles;
    if (nextSingles > rules.maxSinglesDays) errors.push(`${row.name}: singles limit exceeded (${nextSingles}/${rules.maxSinglesDays} Singles Days)`);
    if (nextTotal > rules.maxTotalMatchDays) errors.push(`${row.name}: match-day limit exceeded (${nextTotal}/${rules.maxTotalMatchDays} Match Days)`);
  });
  currentPairs.forEach((pair, pairKey) => {
    const nextPartnerDays = (existing.partnerDays.get(pairKey) || 0) + pair.days;
    if (nextPartnerDays > rules.maxPartnerDays) errors.push(`${pair.names.join(' + ')}: doubles partner limit exceeded (${nextPartnerDays}/${rules.maxPartnerDays} Match Days)`);
  });
  return errors;
}

function validateDashboardLineup(team, selected, matches, teams, eligibilityRules = DEFAULT_ELIGIBILITY_RULES) {
  const errors = [];
  const normalized = LINEUP_ROLE_SLOTS.map((_, idx) => selected[idx] || '');
  if (normalized.some(value => !value)) errors.push('Select all 5 lineup slots before locking.');
  const picked = normalized.filter(Boolean);
  if (new Set(picked).size !== picked.length) errors.push('A player can only appear in one lineup role.');
  picked.forEach(value => {
    if (!team?.players?.[Number(value)]?.name) errors.push('Every selected player must exist on your roster.');
  });
  errors.push(...captainLineupEligibilityErrors(team, selectedNames(team, normalized), matches, teams, eligibilityRules));
  return Array.from(new Set(errors));
}

function lineupByLabel(submission) {
  return Object.fromEntries((submission?.lineup || []).map(line => [line.label, line.players || []]));
}


function shareTeamName(team, fallback) {
  return String(team?.name || fallback || '').replace(/[^A-Za-z0-9&.'\- ]+/g, '').replace(/\s+/g, ' ').trim() || fallback || 'Team';
}

function formatPlayers(players) {
  return (players || []).filter(Boolean).join(' / ') || 'Not available yet';
}

function revealedLineupRows(mySubmission, opponentSubmission) {
  const mine = lineupByLabel(mySubmission);
  const theirs = lineupByLabel(opponentSubmission);
  return ['S1', 'D1', 'D2'].map(label => ({
    label,
    mine: mine[label] || [],
    theirs: theirs[label] || []
  }));
}

function revealedRecordRows(revealedLineup, myTeamId, opponentTeamId, mySubmission, opponentSubmission) {
  const fallbackMine = lineupByLabel(mySubmission);
  const fallbackTheirs = lineupByLabel(opponentSubmission);
  if (!revealedLineup?.lineups) return revealedLineupRows(mySubmission, opponentSubmission);
  const mine = lineupByLabel({ lineup: revealedLineup.lineups?.[myTeamId] || [] });
  const theirs = lineupByLabel({ lineup: revealedLineup.lineups?.[opponentTeamId] || [] });
  return ['S1', 'D1', 'D2'].map(label => ({
    label,
    mine: mine[label]?.length ? mine[label] : (fallbackMine[label] || []),
    theirs: theirs[label]?.length ? theirs[label] : (fallbackTheirs[label] || [])
  }));
}

function whatsappMessage(fixture, team, opponent, captainName, mySubmission, opponentSubmission, revealedLineup) {
  const leftTeam = fixture?.team1Id === opponent?.id ? opponent : team;
  const rightTeam = fixture?.team2Id === team?.id ? team : opponent;
  const leftSubmission = leftTeam?.id === team?.id ? mySubmission : opponentSubmission;
  const rightSubmission = rightTeam?.id === team?.id ? mySubmission : opponentSubmission;
  const leftTeamName = shareTeamName(leftTeam, 'Team 1');
  const rightTeamName = shareTeamName(rightTeam, 'Team 2');
  const rows = revealedRecordRows(revealedLineup, leftTeam?.id, rightTeam?.id, leftSubmission, rightSubmission)
    .map(row => `${row.label}: ${formatPlayers(row.mine)} vs ${formatPlayers(row.theirs)}`)
    .join('\n');
  const revealedAt = revealedLineup?.revealedAt || mySubmission?.revealedAt || opponentSubmission?.revealedAt || (mySubmission?.lockedAt && opponentSubmission?.lockedAt ? Math.max(mySubmission.lockedAt, opponentSubmission.lockedAt) : null);
  const group = fixture?.group || leftTeam?.group || rightTeam?.group || '—';
  const highlightedRows = rows.split('\n').map(row => row.replace(/^([^:]+):/, '*$1:*')).join('\n');
  return `🏆 *KOC Match Lineups*\n*Group ${group} · Round ${fixture?.round || '—'}*\n📅 ${formatDate(fixture?.date)} · ${fixture?.time || 'TBD'}\n📍 ${fixture?.location || 'Location TBD'}\n\n🔥 *${leftTeamName} vs ${rightTeamName}*\n\n👤 *Captain sharing:*\n${captainName || 'Captain'}\n\n✅ *Official lines revealed*\n${highlightedRows}\n\n⏱️ *Submission timeline*\n• *${leftTeamName} submitted:* ${dateTimeLabel(leftSubmission?.submittedAt || leftSubmission?.lockedAt)}\n• *${rightTeamName} submitted:* ${dateTimeLabel(rightSubmission?.submittedAt || rightSubmission?.lockedAt)}\n• *Final reveal:* ${dateTimeLabel(revealedAt)}\n\n🔑 *Schedule ID:* ${fixture?.id || '—'}\n📌 _The KOC App is the official source of truth for these lineups._`;
}

function scoreEntryHref(fixture, revealedLineup, lineupSubmission) {
  const params = new URLSearchParams();
  if (fixture?.id) params.set('scheduleId', fixture.id);
  const revealId = revealedLineup?.revealId || lineupSubmission?.revealId;
  if (revealId) params.set('revealId', revealId);
  return `/score?${params.toString()}`;
}

function statusForFixture(isCompleted, mine, theirs) {
  if (isCompleted) return LINEUP_STATUS.completed;
  if (mine?.revealedAt || (mine?.lockedAt && theirs?.lockedAt)) return LINEUP_STATUS.revealed;
  if (mine?.lockedAt && !mine?.unlockedAt) return LINEUP_STATUS.submitted;
  if (theirs?.lockedAt && !mine?.lockedAt) return LINEUP_STATUS.yourTurn;
  if (theirs?.lockedAt) return LINEUP_STATUS.waiting;
  return LINEUP_STATUS.notSubmitted;
}

function LineupRoleSelect({ team, selected, onChange, readOnly, optionErrors = {} }) {
  const selectedSet = new Set(selected.filter(Boolean));
  const renderSlot = (slotIdx) => {
    const slot = LINEUP_ROLE_SLOTS[slotIdx];
    return (
      <label className="field" key={`${slot.code}-${slotIdx}`}>
        <div className="field-label">{slot.code} · {slot.label}</div>
        <select className="select" value={selected[slotIdx] || ''} onChange={e => onChange(slotIdx, e.target.value)} disabled={readOnly} data-testid={`dashboard-lineup-slot-${slotIdx}`}>
          <option value="">— Choose player —</option>
          {(team?.players || []).map((player, playerIdx) => {
            const value = String(playerIdx);
            return <option key={`${player.name}-${playerIdx}`} value={value} disabled={selectedSet.has(value) && selected[slotIdx] !== value}>{optionErrors[`${slotIdx}:${value}`] ? `⚠️ ${player.name}` : player.name}</option>;
          })}
        </select>
      </label>
    );
  };
  return (
    <div className="dashboard-lineup-roles">
      <div className="dashboard-lineup-row dashboard-lineup-singles">
        <h4>Singles</h4>
        {renderSlot(0)}
      </div>
      <div className="dashboard-lineup-row">
        <h4>Doubles 1</h4>
        <div className="dashboard-lineup-pair">{renderSlot(1)}{renderSlot(2)}</div>
      </div>
      <div className="dashboard-lineup-row">
        <h4>Doubles 2</h4>
        <div className="dashboard-lineup-pair">{renderSlot(3)}{renderSlot(4)}</div>
      </div>
    </div>
  );
}


const OpponentCapacityPreview = React.memo(function OpponentCapacityPreview({ opponent, teams, matches, eligibilityRules, lineupSubmissions }) {
  const rows = useMemo(() => opponent ? buildCaptainCapacityRows(opponent, teams, matches, eligibilityRules, lineupSubmissions) : [], [opponent, teams, matches, eligibilityRules, lineupSubmissions]);
  if (!opponent) return null;
  const highlighted = [...rows]
    .sort((a, b) => (b.warnings.length - a.warnings.length) || (b.totalMatchDays - a.totalMatchDays) || a.name.localeCompare(b.name))
    .slice(0, 6);
  return (
    <div className="opponent-capacity-panel" data-testid={`opponent-capacity-${opponent.id}`}>
      <div>
        <h4>{opponent.name} capacity</h4>
        <p className="hint">Preview is hidden by default and shown only for this scheduled match.</p>
      </div>
      <div className="opponent-capacity-grid">
        {highlighted.map(row => (
          <div key={row.name} className={row.warnings.length ? 'opponent-capacity-row warn' : 'opponent-capacity-row'}>
            <strong>{row.name}</strong>
            <span>S {row.singlesDays} · Total {row.totalMatchDays} · Partner {row.maxPartner}</span>
            <small>{row.warnings.length ? row.warnings.join(', ') : 'Available'}</small>
          </div>
        ))}
      </div>
    </div>
  );
});

const CaptainFixtureCard = React.memo(function CaptainFixtureCard({ item, teams, captainTeam, completed, lineupSubmission, opponentSubmission, revealedLineup, matches, eligibilityRules, session, onRefresh }) {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [selectionWarning, setSelectionWarning] = useState('');
  const [showOpponentCapacity, setShowOpponentCapacity] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [dateDraft, setDateDraft] = useState(item.date || '');
  const [timeDraft, setTimeDraft] = useState(item.time || '');
  const [locationDraft, setLocationDraft] = useState(item.location || '');
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleMessage, setScheduleMessage] = useState('');
  const { team1, team2 } = fixtureTeams(item, teams);
  const opponent = item.team1Id === captainTeam.id ? team2 : team1;
  const locked = !!lineupSubmission?.lockedAt && !lineupSubmission?.unlockedAt;
  const revealed = !!revealedLineup?.revealId || !!lineupSubmission?.revealedAt || (!!lineupSubmission?.lockedAt && !!opponentSubmission?.lockedAt);
  const scoreAlreadySaved = !!lineupSubmission?.scoreSavedAt;
  const isPlayoff = item?.matchType === 'playoff' || !item?.group;
  const status = statusForFixture(completed, lineupSubmission, opponentSubmission);
  const errors = validateDashboardLineup(captainTeam, selected, matches, teams, eligibilityRules);
  const names = selectedNames(captainTeam, selected);
  const canSubmit = !completed && !locked && errors.length === 0;
  const waText = whatsappMessage(item, captainTeam, opponent, captainTeam?.players?.find(p => p.isCaptain)?.name || captainTeam?.players?.[0]?.name || session.teamName, lineupSubmission, opponentSubmission, revealedLineup);
  const waHref = `https://wa.me/?text=${encodeURIComponent(waText)}`;

  useEffect(() => {
    if (lineupSubmission?.selected) setSelected(lineupSubmission.selected);
  }, [lineupSubmission?.selected]);

  useEffect(() => {
    if (!editingSchedule) {
      setDateDraft(item.date || '');
      setTimeDraft(item.time || '');
      setLocationDraft(item.location || '');
    }
  }, [item.date, item.time, item.location, editingSchedule]);

  const optionErrors = useMemo(() => {
    const map = {};
    LINEUP_ROLE_SLOTS.forEach((_, slotIdx) => {
      (captainTeam?.players || []).forEach((player, playerIdx) => {
        const next = [...selected];
        next[slotIdx] = String(playerIdx);
        const nextErrors = validateDashboardLineup(captainTeam, next, matches, teams, eligibilityRules)
          .filter(error => !error.startsWith('Select all 5 lineup slots'));
        if (nextErrors.length > 0) map[`${slotIdx}:${playerIdx}`] = nextErrors[0];
      });
    });
    return map;
  }, [captainTeam, selected, matches, teams, eligibilityRules]);

  const applySmartFill = () => {
    const players = captainTeam?.players || [];
    const base = LINEUP_ROLE_SLOTS.map((_, idx) => selected[idx] || '');
    const used = new Set(base.filter(Boolean));
    if (used.size !== base.filter(Boolean).length) {
      setSelectionWarning('A player can only appear in one lineup role.');
      return;
    }

    const search = (idx, draft, usedPlayers) => {
      if (idx >= LINEUP_ROLE_SLOTS.length) {
        return validateDashboardLineup(captainTeam, draft, matches, teams, eligibilityRules).length === 0 ? draft : null;
      }
      if (draft[idx]) return search(idx + 1, draft, usedPlayers);
      for (let playerIdx = 0; playerIdx < players.length; playerIdx += 1) {
        const value = String(playerIdx);
        if (usedPlayers.has(value)) continue;
        const nextDraft = [...draft];
        const nextUsed = new Set(usedPlayers);
        nextDraft[idx] = value;
        nextUsed.add(value);
        const found = search(idx + 1, nextDraft, nextUsed);
        if (found) return found;
      }
      return null;
    };

    const filled = search(0, base, used);
    if (filled) {
      setSelected(filled);
      setSelectionWarning('');
      return;
    }
    setSelectionWarning('Smart fill could not find a valid lineup with the current roster and KOC eligibility limits. Adjust existing selections or review player capacity.');
  };

  const setSlot = (idx, value) => setSelected(prev => {
    const next = [...prev];
    next[idx] = value;
    const nextErrors = validateDashboardLineup(captainTeam, next, matches, teams, eligibilityRules)
      .filter(error => !error.startsWith('Select all 5 lineup slots'));
    setSelectionWarning(nextErrors[0] || '');
    return next;
  });

  const submitLineup = async () => {
    const validationErrors = validateDashboardLineup(captainTeam, selected, matches, teams, eligibilityRules);
    if (validationErrors.length) {
      const now = Date.now();
      recordLineupAudit({ actionType: 'Lineup Validation Failed', session, scheduleId: item.id, teamId: captainTeam.id, metadata: { validationErrors, lastUpdatedAt: now } }).catch(() => {});
      return;
    }
    const now = Date.now();
    const revealId = null;
    const payload = {
      scheduleId: item.id,
      teamId: captainTeam.id,
      opponentTeamId: opponent?.id || '',
      selected,
      lineup: buildDashboardLineupLines(names),
      submissionStatus: 'submitted_locked',
      submittedAt: now,
      lockedAt: now,
      whatsappShared: lineupSubmission?.whatsappShared || false,
      validationErrors: [],
      lastUpdatedAt: now,
      version: (lineupSubmission?.version || 0) + 1,
      revealedAt: lineupSubmission?.revealedAt || null,
      revealId
    };
    const metaPayload = {
      scheduleId: item.id,
      teamId: captainTeam.id,
      opponentTeamId: opponent?.id || '',
      submissionStatus: payload.submissionStatus,
      submittedAt: now,
      lockedAt: now,
      whatsappShared: payload.whatsappShared,
      whatsappSharedAt: lineupSubmission?.whatsappSharedAt || null,
      lastUpdatedAt: now,
      version: payload.version,
      revealedAt: payload.revealedAt,
      revealId: payload.revealId
    };
    const updates = {
      [`${PATHS.lineupSubmissions}/${item.id}/${captainTeam.id}`]: payload,
      [`${PATHS.lineupSubmissionMeta}/${item.id}/${captainTeam.id}`]: metaPayload
    };
    try {
      setBusy(true);
      await ensureAuth();
      await update(ref(db), updates);
      await recordLineupAudit({ actionType: 'Lineup Submitted & Locked', session, scheduleId: item.id, teamId: captainTeam.id, metadata: { submittedAt: now, lockedAt: now, revealedAt: payload.revealedAt, validationErrors: payload.validationErrors, lastUpdatedAt: now } });
      setMessage('✅ Submitted & Locked');
    } catch (e) {
      setMessage(`Save failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const saveScheduleDetails = async () => {
    const nextDate = dateDraft.trim();
    const nextTime = timeDraft.trim();
    const nextLocation = locationDraft.trim();
    if (!nextDate) {
      setScheduleMessage('Save failed: date is required.');
      return;
    }
    setScheduleSaving(true);
    setScheduleMessage('');
    try {
      await ensureAuth();
      await update(ref(db, `${PATHS.schedule}/${item.id}`), { date: nextDate, time: nextTime, location: nextLocation });
      await writeAuditLog({
        actionType: 'Fixture Date/Time/Location Edited',
        session,
        targetType: 'schedule',
        targetId: item.id,
        oldValue: { date: item.date || '', time: item.time || '', location: item.location || '' },
        newValue: { date: nextDate, time: nextTime, location: nextLocation }
      });
      setEditingSchedule(false);
      setScheduleMessage('✅ Date, time & location updated');
      onRefresh();
    } catch (e) {
      setScheduleMessage(`Save failed: ${e.message}`);
    } finally {
      setScheduleSaving(false);
    }
  };

  const markWhatsappShared = async () => {
    const now = Date.now();
    try {
      await ensureAuth();
      await update(ref(db), { [`${PATHS.lineupSubmissions}/${item.id}/${captainTeam.id}/whatsappShared`]: true, [`${PATHS.lineupSubmissions}/${item.id}/${captainTeam.id}/whatsappSharedAt`]: now, [`${PATHS.lineupSubmissions}/${item.id}/${captainTeam.id}/lastUpdatedAt`]: now, [`${PATHS.lineupSubmissionMeta}/${item.id}/${captainTeam.id}/whatsappShared`]: true, [`${PATHS.lineupSubmissionMeta}/${item.id}/${captainTeam.id}/whatsappSharedAt`]: now, [`${PATHS.lineupSubmissionMeta}/${item.id}/${captainTeam.id}/lastUpdatedAt`]: now });
      await recordLineupAudit({ actionType: 'Lineup WhatsApp Shared', session, scheduleId: item.id, teamId: captainTeam.id, metadata: { whatsappSharedAt: now, lastUpdatedAt: now } });
    } catch (e) {
      setMessage(`WhatsApp status failed: ${e.message}`);
    }
  };

  return (
    <article className={`captain-fixture-card${completed ? ' cfc-completed' : ''}`} data-testid={`captain-fixture-${item.id}`}>
      <div className="captain-fixture-main">
        <CalendarBadge date={item.date} />
        <div className="cfc-info">
          <div className="cfc-round">Round {item.round || '—'} · {formatDate(item.date)} · {item.time || 'TBD'} · 📍 {item.location || 'Location TBD'}</div>
          {!completed && (
            editingSchedule ? (
              <div className="cfc-schedule-edit" data-testid={`edit-schedule-form-${item.id}`}>
                <label className="field">
                  <div className="field-label">Date</div>
                  <input className="input" type="date" value={dateDraft} onChange={e => setDateDraft(e.target.value)} disabled={scheduleSaving} data-testid={`edit-schedule-date-${item.id}`} />
                </label>
                <label className="field">
                  <div className="field-label">Time</div>
                  <input className="input" value={timeDraft} onChange={e => setTimeDraft(e.target.value)} placeholder="e.g. 7:15 PM" disabled={scheduleSaving} data-testid={`edit-schedule-time-${item.id}`} />
                </label>
                <label className="field">
                  <div className="field-label">Location</div>
                  <input className="input" value={locationDraft} onChange={e => setLocationDraft(e.target.value)} placeholder="Court / venue address" disabled={scheduleSaving} data-testid={`edit-schedule-location-${item.id}`} />
                </label>
                <div style={{ display: 'flex', gap: '.4rem', marginTop: '.35rem' }}>
                  <button type="button" className="btn small success" onClick={saveScheduleDetails} disabled={scheduleSaving} data-testid={`save-schedule-${item.id}`}>{scheduleSaving ? 'Saving...' : 'Save'}</button>
                  <button type="button" className="btn small ghost" onClick={() => { setEditingSchedule(false); setDateDraft(item.date || ''); setTimeDraft(item.time || ''); setLocationDraft(item.location || ''); }} disabled={scheduleSaving}>Cancel</button>
                </div>
                {scheduleMessage && <div className={scheduleMessage.startsWith('✅') ? 'success-box' : 'error-box'} style={{ marginTop: '.35rem' }}>{scheduleMessage}</div>}
              </div>
            ) : (
              <button type="button" className="btn small ghost cfc-btn-edit-schedule" onClick={() => setEditingSchedule(true)} data-testid={`edit-schedule-${item.id}`}>✏️ Edit date/time/location</button>
            )
          )}
          {scheduleMessage && !editingSchedule && <div className={scheduleMessage.startsWith('✅') ? 'success-box' : 'error-box'} style={{ marginTop: '.35rem' }}>{scheduleMessage}</div>}
          <div className="cfc-teams">{team1?.name || 'TBD'} <strong>vs</strong> {team2?.name || 'TBD'} <span className="cfc-group">· Group {item.group || team1?.group || team2?.group || '—'}</span></div>
          <div className="cfc-status-row">
            <span className={status.className}>{status.label}</span>
            <span className="cfc-opp-status">
              Opponent: {opponentSubmission?.submittedAt
                ? <strong style={{ color: '#15803d' }}>Submitted {timeLabel(opponentSubmission.submittedAt)}</strong>
                : <span style={{ color: '#94a3b8' }}>Waiting...</span>}
            </span>
          </div>
          {!locked && !completed && <div style={{ fontSize: '.75rem', color: '#b45309', marginTop: '.25rem', display: 'flex', alignItems: 'center', gap: '.3rem' }}><span>⚠️</span> Submit your lineup before score entry.</div>}
          {scoreAlreadySaved && !isPlayoff && !completed && <div style={{ fontSize: '.75rem', color: '#15803d', marginTop: '.25rem', display: 'flex', alignItems: 'center', gap: '.3rem' }}><span>✅</span> Score submitted {timeLabel(lineupSubmission.scoreSavedAt)}.</div>}
        </div>
        <div className="captain-fixture-actions">
          {!completed && !locked && <button type="button" className="btn small cfc-btn-lines" onClick={() => setExpanded(v => !v)} data-testid={`submit-lines-${item.id}`}>{expanded ? 'Hide Lines' : 'Submit Lines'}</button>}
          {locked && <button type="button" className="btn small ghost" onClick={() => setExpanded(v => !v)}>{expanded ? 'Hide' : 'View Status'}</button>}
          {!locked
            ? <button type="button" className="btn small ghost cfc-btn-score-disabled" disabled title="Submit your lineup first before entering the score" data-testid={`submit-score-${item.id}`}>Submit Score</button>
            : scoreAlreadySaved && !isPlayoff
              ? <button type="button" className="btn small ghost cfc-btn-score-disabled" disabled title="Score already submitted for this match" data-testid={`submit-score-${item.id}`}>Score Submitted ✓</button>
              : revealed && !completed
                ? <Link className="btn small cfc-btn-score" to={scoreEntryHref(item, revealedLineup, lineupSubmission)} data-testid={`submit-score-${item.id}`}>Submit Score</Link>
                : <button type="button" className="btn small ghost cfc-btn-score-disabled" disabled title="Waiting for both lineups to be revealed" data-testid={`submit-score-${item.id}`}>Submit Score</button>}
          <button type="button" className="btn small cfc-btn-capacity" onClick={() => setShowOpponentCapacity(v => !v)} data-testid={`toggle-opponent-capacity-${item.id}`}>{showOpponentCapacity ? 'Hide Opponent Capacity' : 'Show Opponent Capacity'}</button>
        </div>
      </div>
      {showOpponentCapacity && <OpponentCapacityPreview opponent={opponent} teams={teams} matches={matches} eligibilityRules={eligibilityRules} lineupSubmissions={{ [item.id]: { [opponent?.id]: opponentSubmission } }} />}
      {expanded && (
        <div className="dashboard-lineup-drawer">
          {message && <div className={message.startsWith('✅') ? 'success-box' : 'error-box'}>{message}</div>}
          {!locked ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '.5rem' }}><button type='button' className='btn small ghost' onClick={applySmartFill} disabled={busy} data-testid={`dashboard-lineup-smart-fill-${item.id}`}>Smart fill</button></div>
              <LineupRoleSelect team={captainTeam} selected={selected} onChange={setSlot} readOnly={busy} optionErrors={optionErrors} />
              {selectionWarning && <div className="error-box" style={{ whiteSpace: 'pre-line' }} data-testid={`lineup-selection-warning-${item.id}`}>{selectionWarning}</div>}
              {errors.length > 0 && <div className="error-box" style={{ whiteSpace: 'pre-line' }}>{errors.join('\n')}</div>}
              <div className="dashboard-sticky-actions"><button className="btn success full" disabled={!canSubmit || busy} onClick={submitLineup} data-testid={`lock-lineup-${item.id}`}>{busy ? 'Submitting...' : 'Submit & Lock Lineup'}</button></div>
            </>
          ) : (
            <div className="dashboard-submitted-panel">
              <h3>✅ Submitted & Locked</h3>
              <p>Submitted<br /><strong>{timeLabel(lineupSubmission.submittedAt)}</strong></p>
              <p>WhatsApp<br /><strong>{revealed ? (lineupSubmission.whatsappShared ? `WhatsApp Shared ${timeLabel(lineupSubmission.whatsappSharedAt)}` : 'Not Shared') : 'Available after both teams lock'}</strong></p>
              {revealed && (
                <WhatsAppShareButton
                  href={waHref}
                  onClick={markWhatsappShared}
                  label="Share Lineups"
                  ariaLabel={`Share ${captainTeam?.name || 'lineup'} via WhatsApp`}
                  testId={`share-lineup-whatsapp-${item.id}`}
                />
              )}
              <button className="btn ghost" type="button" onClick={onRefresh}>Refresh</button>
              <p className="hint">Last Updated<br />{timeLabel(lineupSubmission.lastUpdatedAt)}</p>
              {revealed && <div className="lineup-reveal"><h4>Revealed Lineups {(revealedLineup?.revealCode || lineupSubmission?.revealId) ? `· Code ${revealedLineup?.revealCode || lineupSubmission?.revealId}` : ''}</h4>{revealedRecordRows(revealedLineup, captainTeam.id, opponent?.id, lineupSubmission, opponentSubmission).map(row => <div key={row.label}><strong>{row.label}:</strong> {formatPlayers(row.mine)} <strong>vs</strong> {formatPlayers(row.theirs)}</div>)}</div>}
              {!revealed && <p className="hint">Lineup details and WhatsApp sharing stay hidden until both captains submit and lock.</p>}
            </div>
          )}
        </div>
      )}
    </article>
  );
});

function ScheduleMiniList({ title, description, fixtures, teams, emptyText, testid, showStatus = false }) {
  return (
    <section className="card" data-testid={testid}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', alignItems: 'flex-start', marginBottom: '.75rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>{title}</h2>
          {description && <p className="hint" style={{ margin: '.25rem 0 0' }}>{description}</p>}
        </div>
        <Link className="btn small ghost" to="/schedule">Full schedule</Link>
      </div>
      {fixtures.length === 0 ? <div className="muted center">{emptyText}</div> : (
        <div style={{ display: 'grid', gap: '.55rem' }}>
          {fixtures.map(item => {
            const { team1, team2 } = fixtureTeams(item, teams);
            return (
              <div key={item.id} className="rl-item" data-testid={`home-fixture-${item.id}`}>
                <span className="rl-ic" aria-hidden="true">📅</span>
                <div>
                  <div className="rl-lbl">Round {item.round || '—'} · {formatDate(item.date)} · {item.time || 'TBD'}</div>
                  <div className="rl-val">{team1?.name || 'TBD'} <strong>vs</strong> {team2?.name || 'TBD'} · Group {item.group || team1?.group || team2?.group || '—'}{showStatus && <span className="tag" style={{ marginLeft: '.35rem' }}>{item.homeStatus || (item.status === 'completed' ? 'Completed' : 'Upcoming')}</span>}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

const LINE_LABELS = { S1: 'Singles', D1: 'Doubles 1', D2: 'Doubles 2', S2: 'Rev Singles', RD1: 'Rev Doubles 1', RD2: 'Rev Doubles 2' };

function CompletedMatchDetails({ match, captainTeamId, teams }) {
  if (!match?.lines?.length) return <p className="muted" style={{ fontSize: '.85rem', margin: '.5rem 0 0' }}>No match line details available.</p>;

  const { team1, team2 } = resolveMatchTeams(match, teams);
  const t1Id = match.t1Id || (team1?.id);
  const isCaptainT1 = t1Id === captainTeamId;

  let mySets = 0, oppSets = 0, myGames = 0, oppGames = 0;
  const lines = match.lines.map((line, idx) => {
    const g1 = Number(line.g1 || 0), g2 = Number(line.g2 || 0);
    const winnerSide = lineWinnerSide(line, match);
    const myPlayers = (isCaptainT1 ? line.players?.team1 : line.players?.team2) || [];
    const oppPlayers = (isCaptainT1 ? line.players?.team2 : line.players?.team1) || [];
    const myGamesLine = isCaptainT1 ? g1 : g2;
    const oppGamesLine = isCaptainT1 ? g2 : g1;
    const iWon = winnerSide ? (isCaptainT1 ? winnerSide === 1 : winnerSide === 2) : myGamesLine > oppGamesLine;
    if (iWon) mySets++; else oppSets++;
    myGames += myGamesLine; oppGames += oppGamesLine;
    const label = line.label || LINE_LABELS[line.code] || line.type || `Line ${idx + 1}`;
    return { label, myPlayers, oppPlayers, myGames: myGamesLine, oppGames: oppGamesLine, iWon };
  });

  const myTeamName = isCaptainT1 ? (team1?.name || 'Your Team') : (team2?.name || 'Your Team');
  const oppTeamName = isCaptainT1 ? (team2?.name || 'Opponent') : (team1?.name || 'Opponent');
  const weWon = mySets > oppSets;

  return (
    <div style={{ marginTop: '.75rem', borderTop: '1px solid #e2e8f0', paddingTop: '.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '.6rem', flexWrap: 'wrap' }}>
        <span className={`tag ${weWon ? 'win' : 'lose'}`} style={{ fontSize: '.8rem' }}>{weWon ? 'WIN' : 'LOSS'}</span>
        <strong style={{ fontSize: '.95rem' }}>{myTeamName} {mySets}–{oppSets} {oppTeamName}</strong>
        <span className="muted" style={{ fontSize: '.8rem' }}>Games: {myGames}–{oppGames}</span>
      </div>
      <div style={{ display: 'grid', gap: '.35rem' }}>
        {lines.map((line, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '.5rem', padding: '.4rem .5rem', borderRadius: 7, background: line.iWon ? '#f0fdf4' : '#fef2f2', border: `1px solid ${line.iWon ? '#bbf7d0' : '#fecaca'}` }}>
            <span style={{ fontSize: '.7rem', fontWeight: 700, color: line.iWon ? '#15803d' : '#dc2626', minWidth: 28, paddingTop: '.1rem' }}>{line.iWon ? '✓' : '✗'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '.75rem', color: '#64748b', fontWeight: 600, marginBottom: '.15rem' }}>{line.label}</div>
              <div style={{ fontSize: '.82rem' }}>
                <span style={{ color: '#1e293b' }}>{line.myPlayers.join(' & ') || '—'}</span>
                <span style={{ color: '#94a3b8', margin: '0 .3rem' }}>vs</span>
                <span style={{ color: '#475569' }}>{line.oppPlayers.join(' & ') || '—'}</span>
              </div>
            </div>
            <span style={{ fontSize: '.82rem', fontWeight: 700, color: '#374151', whiteSpace: 'nowrap' }}>{line.myGames}–{line.oppGames}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CompletedMatchWhatsappShare({ item, teams, captainTeam, opponent, lineupSubmission, opponentSubmission, revealedLineup, session }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const captainName = captainTeam?.players?.find(p => p.isCaptain)?.name || captainTeam?.players?.[0]?.name || session?.teamName;
  const waText = whatsappMessage(item, captainTeam, opponent, captainName, lineupSubmission, opponentSubmission, revealedLineup);
  const waHref = `https://wa.me/?text=${encodeURIComponent(waText)}`;

  const markShared = async () => {
    const now = Date.now();
    try {
      setBusy(true);
      await ensureAuth();
      await update(ref(db), {
        [`${PATHS.lineupSubmissions}/${item.id}/${captainTeam.id}/whatsappShared`]: true,
        [`${PATHS.lineupSubmissions}/${item.id}/${captainTeam.id}/whatsappSharedAt`]: now,
        [`${PATHS.lineupSubmissions}/${item.id}/${captainTeam.id}/lastUpdatedAt`]: now,
        [`${PATHS.lineupSubmissionMeta}/${item.id}/${captainTeam.id}/whatsappShared`]: true,
        [`${PATHS.lineupSubmissionMeta}/${item.id}/${captainTeam.id}/whatsappSharedAt`]: now,
        [`${PATHS.lineupSubmissionMeta}/${item.id}/${captainTeam.id}/lastUpdatedAt`]: now
      });
      await recordLineupAudit({ actionType: 'Lineup WhatsApp Shared', session, scheduleId: item.id, teamId: captainTeam.id, metadata: { whatsappSharedAt: now, lastUpdatedAt: now } });
    } catch (e) {
      setMsg(`WhatsApp status failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: '.6rem', display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
      <WhatsAppShareButton
        href={waHref}
        onClick={markShared}
        label="Share Lineups"
        ariaLabel={`Share ${captainTeam?.name || 'lineup'} via WhatsApp`}
        testId={`share-lineup-whatsapp-completed-${item.id}`}
        busy={busy}
      />
      {lineupSubmission?.whatsappShared && <span className="hint">Shared {timeLabel(lineupSubmission.whatsappSharedAt)}</span>}
      {msg && <span className="hint" style={{ color: '#dc2626' }}>{msg}</span>}
    </div>
  );
}

function CompletedMatchList({ title, description, fixtures, teams, matches, captainTeam, lineupSubmissions, revealedLineups, session, emptyText, testid }) {
  const [expanded, setExpanded] = useState({});
  const toggle = id => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const findMatch = fixture => {
    if (!matches?.length) return null;
    return matches.find(m => {
      const { team1, team2 } = resolveMatchTeams(m, teams);
      const ids = [team1?.id, team2?.id, m.t1Id, m.t2Id].filter(Boolean);
      return ids.includes(fixture.team1Id) && ids.includes(fixture.team2Id);
    }) || null;
  };

  return (
    <section className="card" style={{ marginTop: '1rem' }} data-testid={testid}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', alignItems: 'flex-start', marginBottom: '.75rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>{title}</h2>
          {description && <p className="hint" style={{ margin: '.25rem 0 0' }}>{description}</p>}
        </div>
        <Link className="btn small ghost" to="/schedule">Full schedule</Link>
      </div>
      {fixtures.length === 0 ? <div className="muted center">{emptyText}</div> : (
        <div style={{ display: 'grid', gap: '.6rem' }}>
          {fixtures.map(item => {
            const { team1, team2 } = fixtureTeams(item, teams);
            const isOpen = !!expanded[item.id];
            const match = findMatch(item);
            const opponentId = item.team1Id === captainTeam?.id ? item.team2Id : item.team1Id;
            const opponent = teams?.[opponentId];
            const lineupSubmission = lineupSubmissions?.[item.id]?.[captainTeam?.id];
            const opponentSubmission = lineupSubmissions?.[item.id]?.[opponentId];
            const revealedLineup = Object.values(revealedLineups || {}).find(row => row.scheduleId === item.id);
            return (
              <div key={item.id} data-testid={`home-completed-${item.id}`} style={{ border: '1.5px solid #d1fae5', borderRadius: 10, background: '#f0fdf4', overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => toggle(item.id)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '.6rem', padding: '.6rem .75rem', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                >
                  <span style={{ fontSize: '.85rem', color: '#6b7280', flexShrink: 0 }}>{isOpen ? '▼' : '▶'}</span>
                  <span style={{ fontSize: '.75rem', flexShrink: 0 }}>✅</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '.8rem', color: '#6b7280', fontWeight: 600 }}>Round {item.round || '—'} · {formatDate(item.date)} · {item.time || 'TBD'} · 📍 {item.location || 'Location TBD'}</div>
                    <div style={{ fontSize: '.88rem', fontWeight: 700, color: '#1e293b' }}>{team1?.name || 'TBD'} <span style={{ fontWeight: 400, color: '#6b7280' }}>vs</span> {team2?.name || 'TBD'}</div>
                  </div>
                  <span className="tag win" style={{ fontSize: '.7rem', flexShrink: 0 }}>Completed</span>
                </button>
                {isOpen && (
                  <div style={{ padding: '0 .75rem .75rem' }}>
                    <CompletedMatchDetails match={match} captainTeamId={captainTeam?.id} teams={teams} />
                    {captainTeam && <CompletedMatchWhatsappShare item={item} teams={teams} captainTeam={captainTeam} opponent={opponent} lineupSubmission={lineupSubmission} opponentSubmission={opponentSubmission} revealedLineup={revealedLineup} session={session} />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

const PUBLIC_HOME_LINKS = [
  { to: '/teams', icon: '👥', title: 'Teams', desc: 'Rosters, captains, and team groups.' },
  { to: '/schedule', icon: '📅', title: 'Schedule', desc: 'Round fixtures, lineups, and scores when public.' },
  { to: '/standings', icon: '📊', title: 'Standings', desc: 'Group tables and qualification positions.' },
  { to: '/matchups', icon: '🎾', title: 'Matchups', desc: 'Player, singles, and doubles matchup stats.' },
  { to: '/history', icon: '🏁', title: 'Match History', desc: 'Approved submitted match results.' },
  { to: '/rules', icon: '📋', title: 'Rules', desc: 'League format, eligibility, and scoring rules.' },
  { to: '/more', icon: '⋯', title: 'More', desc: 'Additional pages and captain/admin login.' }
];

function PublicNavigationGrid() {
  return (
    <section className="card" data-testid="public-home-navigation">
      <h2 style={{ marginTop: 0 }}>League Navigation</h2>
      <p className="hint">Use the home page as the public hub for every league section.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '.65rem', marginTop: '.75rem' }}>
        {PUBLIC_HOME_LINKS.map(link => (
          <Link
            key={link.to}
            to={link.to}
            className="rl-item home-nav-card"
            style={{ textDecoration: 'none', color: 'inherit', alignItems: 'flex-start' }}
            data-testid={`public-home-link-${link.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
          >
            <span className="rl-ic" aria-hidden="true">{link.icon}</span>
            <span>
              <strong>{link.title}</strong>
              <span className="hint" style={{ display: 'block', marginTop: '.15rem' }}>{link.desc}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function CaptainScheduleList({ fixtures, completedFixtures, teams, captainTeam, lineupSubmissions, revealedLineups, matches, eligibilityRules, session, lastRefreshed, onRefresh }) {
  return (
    <section className="card" data-testid="captain-scheduled-matches-card">
      <div className="dashboard-section-head">
        <div className="dashboard-section-title"><h2>Scheduled Matches</h2><p className="hint">Submit and lock one official lineup per match schedule ID.</p></div>
        <div className="dashboard-refresh"><button className="btn small ghost" onClick={onRefresh}>Refresh</button><span className="hint">Last Refreshed {timeLabel(lastRefreshed)}</span></div>
      </div>
      {fixtures.length === 0 ? <div className="muted center">No scheduled matches found for your team.</div> : (
        <div className="captain-fixture-list">
          {fixtures.map(item => {
            const opponentId = item.team1Id === captainTeam.id ? item.team2Id : item.team1Id;
            return <CaptainFixtureCard key={item.id} item={item} teams={teams} captainTeam={captainTeam} completed={false} lineupSubmission={lineupSubmissions?.[item.id]?.[captainTeam.id]} opponentSubmission={lineupSubmissions?.[item.id]?.[opponentId]} revealedLineup={Object.values(revealedLineups || {}).find(row => row.scheduleId === item.id)} matches={matches} eligibilityRules={eligibilityRules} session={session} onRefresh={onRefresh} />;
          })}
        </div>
      )}
      <CompletedMatchList title="Completed Matches" description="Tap a match to see line-by-line results." fixtures={completedFixtures} teams={teams} matches={matches} captainTeam={captainTeam} lineupSubmissions={lineupSubmissions} revealedLineups={revealedLineups} session={session} emptyText="No completed fixtures yet." testid="captain-completed-schedule-card" />
    </section>
  );
}


function TeamLogoManager({ team }) {
  const [open, setOpen] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const fileRef = useRef(null);

  const currentLogo = team?.logoUrl || null;

  async function saveLogoUrl(logoUrl) {
    setSaving(true);
    setMsg('');
    try {
      await ensureAuth();
      await update(ref(db, `${PATHS.teams}/${team.id}`), { logoUrl });
      setMsg('Logo updated! It may take a moment to refresh everywhere.');
      setOpen(false);
      setUrlInput('');
    } catch (e) {
      setMsg('Save failed: ' + (e.message || 'unknown error'));
    } finally {
      setSaving(false);
    }
  }

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 200 * 1024) { setMsg('File too large (max 200 KB). Use a URL instead.'); return; }
    const reader = new FileReader();
    reader.onload = ev => saveLogoUrl(ev.target.result);
    reader.readAsDataURL(file);
  }

  function handleUrl(e) {
    e.preventDefault();
    if (!urlInput.trim()) return;
    saveLogoUrl(urlInput.trim());
  }

  return (
    <div style={{ marginTop: '.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap' }}>
        <TeamLogo team={team} size={56} />
        <div>
          <div style={{ fontWeight: 700, fontSize: '.95rem' }}>{team.name}</div>
          <button className="btn ghost small" style={{ marginTop: '.3rem' }} onClick={() => setOpen(o => !o)}>
            {open ? 'Cancel' : currentLogo ? 'Change Logo' : 'Upload Logo'}
          </button>
        </div>
      </div>
      {msg && <p style={{ marginTop: '.4rem', fontSize: '.85rem', color: msg.startsWith('Save failed') ? '#dc2626' : '#16a34a' }}>{msg}</p>}
      {open && (
        <div style={{ marginTop: '.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '.5rem', padding: '1rem', display: 'grid', gap: '.75rem' }}>
          <div>
            <label style={{ fontSize: '.8rem', opacity: 0.7, display: 'block', marginBottom: '.3rem' }}>Upload image file (PNG/SVG, max 200 KB)</label>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} disabled={saving} />
          </div>
          <div>
            <label style={{ fontSize: '.8rem', opacity: 0.7, display: 'block', marginBottom: '.3rem' }}>Or paste an image URL</label>
            <form onSubmit={handleUrl} style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
              <input
                type="url"
                className="form-input"
                placeholder="https://..."
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                disabled={saving}
                style={{ flex: 1, minWidth: '200px', fontSize: '.88rem' }}
              />
              <button type="submit" className="btn small" disabled={saving || !urlInput.trim()}>
                {saving ? 'Saving…' : 'Save URL'}
              </button>
            </form>
          </div>
          {currentLogo && (
            <button
              className="btn ghost small"
              style={{ color: '#dc2626', alignSelf: 'start' }}
              disabled={saving}
              onClick={() => saveLogoUrl('')}
            >
              Remove custom logo (revert to default)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TeamSnapshot({ team, upcomingCount, completedCount, capacityRows }) {
  const rosterCount = team?.players?.length || 0;
  const blockedCount = capacityRows.filter(row => row.warnings.some(message => message.includes('reached'))).length;
  const warningCount = capacityRows.filter(row => row.warnings.length).length;
  return (
    <section className="card" data-testid="captain-team-snapshot">
      <h2>Team Snapshot</h2>
      <TeamLogoManager team={team} />
      <div className="rl-grid" style={{ marginTop: '.75rem' }}>
        <div className="rl-item"><span className="rl-ic" aria-hidden="true">👥</span><div><div className="rl-lbl">Roster</div><div className="rl-val">{rosterCount} players · Captain: {team.players?.[0]?.name || team.captain || 'TBD'}</div></div></div>
        <div className="rl-item"><span className="rl-ic" aria-hidden="true">🏷️</span><div><div className="rl-lbl">Group / Auction</div><div className="rl-val">Group {team.group || '—'} · Spent ${Number(team.totalSpent || 0).toLocaleString()} · Left ${Number(team.moneyLeft || 0).toLocaleString()}</div></div></div>
        <div className="rl-item"><span className="rl-ic" aria-hidden="true">📅</span><div><div className="rl-lbl">Schedule</div><div className="rl-val">{upcomingCount} upcoming · {completedCount} completed</div></div></div>
        <div className="rl-item"><span className="rl-ic" aria-hidden="true">🚨</span><div><div className="rl-lbl">Capacity Risk</div><div className="rl-val">{blockedCount} capped · {warningCount} with warnings</div></div></div>
      </div>
    </section>
  );
}

function OwnerGaps({ overdueFixtures, capacityRows }) {
  const cappedPlayers = capacityRows.filter(row => row.warnings.some(message => message.includes('reached')));
  const nearCapPlayers = capacityRows.filter(row => row.warnings.length && !row.warnings.some(message => message.includes('reached')));
  return (
    <section className="card" data-testid="captain-owner-gaps">
      <h2>Owner Checks</h2>
      <p className="hint">Tight checklist before lines or score entry.</p>
      <div style={{ display: 'grid', gap: '.5rem' }}>
        {overdueFixtures.length > 0 && (
          <div className="rl-flag warn"><span aria-hidden="true">⏰</span><span>{overdueFixtures.length} past fixture(s) still need a completed/approved score.</span></div>
        )}
        {cappedPlayers.length > 0 && (
          <div className="rl-flag warn"><span aria-hidden="true">🚫</span><span>{cappedPlayers.length} player(s) are already at a hard capacity cap. Do not place them in capped lines.</span></div>
        )}
        {nearCapPlayers.length > 0 && (
          <div className="rl-flag warn"><span aria-hidden="true">⚠️</span><span>{nearCapPlayers.length} player(s) are one use away from a cap. Double-check lineup balance.</span></div>
        )}
        {overdueFixtures.length === 0 && cappedPlayers.length === 0 && nearCapPlayers.length === 0 && (
          <div className="rl-flag ok"><span aria-hidden="true">✅</span><span>No owner gaps detected right now.</span></div>
        )}
      </div>
    </section>
  );
}

function DangerBells({ rows }) {
  const warnings = rows
    .filter(row => row.warnings.length)
    .flatMap(row => row.warnings.map(message => ({ player: row.name, message })));
  return (
    <section className="card" data-testid="captain-danger-bells">
      <h2>🚨 Danger Bells</h2>
      <p className="hint">Players at or near eligibility capacity before you set lines.</p>
      {warnings.length === 0 ? (
        <div className="rl-flag ok"><span aria-hidden="true">✅</span><span>No capacity danger bells right now.</span></div>
      ) : (
        <div style={{ display: 'grid', gap: '.5rem' }}>
          {warnings.map((warning, idx) => (
            <div key={`${warning.player}-${warning.message}-${idx}`} className="rl-flag warn">
              <span aria-hidden="true">⚠️</span>
              <span><strong>{warning.player}</strong>: {warning.message}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function Home({ teams, schedule, matches = [], eligibilityRules = DEFAULT_ELIGIBILITY_RULES, lineupSubmissions = {}, revealedLineups = {}, lastRefreshed = Date.now(), onRefresh = () => {} }) {
  const { session } = useAuth();
  const scheduleItems = useMemo(() => Object.values(schedule || {}).filter(item => item?.type !== 'buffer'), [schedule]);
  const sortedFixtures = useMemo(() => [...scheduleItems].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.time || '').localeCompare(String(b.time || ''))), [scheduleItems]);
  const captainTeam = hasRole(session, [ROLES.CAPTAIN]) ? teams?.[session.teamId] : null;
  const captainFixtures = useMemo(() => {
    if (!captainTeam) return [];
    return sortedFixtures.filter(item => item.team1Id === captainTeam.id || item.team2Id === captainTeam.id);
  }, [captainTeam, sortedFixtures]);
  const completedFixtureKeys = useMemo(() => {
    const keys = new Set();
    approvedMatches(matches).forEach(match => {
      const { team1, team2 } = resolveMatchTeams(match, teams);
      if (team1?.id && team2?.id) keys.add(pairKey(team1.id, team2.id));
    });
    return keys;
  }, [matches, teams]);
  const completedCaptainFixtures = useMemo(() => captainFixtures
    .filter(item => item.status === 'completed' || completedFixtureKeys.has(pairKey(item.team1Id, item.team2Id)))
    .map(item => ({ ...item, homeStatus: 'Completed' })), [captainFixtures, completedFixtureKeys]);
  const upcomingCaptainFixtures = useMemo(() => captainFixtures
    .filter(item => item.status !== 'completed' && !completedFixtureKeys.has(pairKey(item.team1Id, item.team2Id)))
    .map(item => ({ ...item, homeStatus: 'Upcoming' })), [captainFixtures, completedFixtureKeys]);
  const overdueFixtures = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return upcomingCaptainFixtures.filter(item => {
      if (!item.date) return false;
      const [y, m, d] = item.date.split('-').map(Number);
      const fixtureDate = new Date(y, m - 1, d);
      return fixtureDate < today;
    });
  }, [upcomingCaptainFixtures]);
  const capacityRows = useMemo(() => captainTeam ? buildCaptainCapacityRows(captainTeam, teams, matches, eligibilityRules, lineupSubmissions) : [], [captainTeam, teams, matches, eligibilityRules, lineupSubmissions]);

  useEffect(() => {
    if (!captainTeam) return undefined;
    const id = setInterval(onRefresh, 120000); // auto-refresh captain dashboard every 2 minutes
    return () => clearInterval(id);
  }, [captainTeam, onRefresh]);

  if (captainTeam) {
    return (
      <main className="container" data-testid="captain-dashboard-page">
        <div className="page-title">
          <h1>Captain Dashboard</h1>
          <p>{captainTeam.name} · your schedule, capacity, and lineup danger bells.</p>
        </div>
        <TeamSnapshot team={captainTeam} upcomingCount={upcomingCaptainFixtures.length} completedCount={completedCaptainFixtures.length} capacityRows={capacityRows} />
        <CaptainScheduleList fixtures={upcomingCaptainFixtures} completedFixtures={completedCaptainFixtures} teams={teams} captainTeam={captainTeam} lineupSubmissions={lineupSubmissions} revealedLineups={revealedLineups} matches={matches} eligibilityRules={eligibilityRules} session={session} lastRefreshed={lastRefreshed} onRefresh={onRefresh} />
        <OwnerGaps overdueFixtures={overdueFixtures} capacityRows={capacityRows} />
        <DangerBells rows={capacityRows} />
        <CaptainCapacityCard team={captainTeam} teams={teams} matches={matches} eligibilityRules={eligibilityRules} lineupSubmissions={lineupSubmissions} />
        <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          <Link className="btn" to="/score">Enter score</Link>
          <Link className="btn ghost" to="/schedule">Open schedule</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="container" data-testid="public-home-page">
      <div className="page-title">
        <h1>KOC3 / PPRC Tennis</h1>
        <p>Public landing page: navigate the full league without login.</p>
      </div>
      <PublicNavigationGrid />
    </main>
  );
}

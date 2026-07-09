import React, { useMemo } from 'react';
import { approvedMatches } from '../utils/matchStatus';
import { resolveMatchTeams } from '../utils/matchTeams';
import { DEFAULT_ELIGIBILITY_RULES, normalizeEligibilityRules } from '../utils/eligibilityRules';

function playerKey(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function rowForPlayer(rows, name) {
  const key = playerKey(name);
  if (rows.has(key)) return rows.get(key);
  const compact = key.replace(/ /g, '');
  if (!compact) return null;
  return Array.from(rows.entries()).find(([rowKey]) => rowKey.replace(/ /g, '') === compact)?.[1] || null;
}

export function buildCaptainCapacityRows(team, teams, matches, eligibilityRules = DEFAULT_ELIGIBILITY_RULES, lineupSubmissions = {}) {
  const rules = normalizeEligibilityRules(eligibilityRules);
  const rows = new Map((team?.players || []).map(player => [playerKey(player.name), {
    name: player.name, singlesDays: 0, doublesDays: 0, totalMatchDays: 0, partnerCounts: {}
  }]));

  const scoredScheduleIds = new Set();
  approvedMatches(matches).forEach(match => {
    const scheduleId = match.scheduleId || match.matchScheduleId || match.fixtureId;
    if (scheduleId) scoredScheduleIds.add(String(scheduleId));
    const { team1, team2 } = resolveMatchTeams(match, teams);
    const side = team1?.id === team?.id ? 'team1' : (team2?.id === team?.id ? 'team2' : null);
    if (!side) return;
    const dayPlayers = new Map();
    const dayPairs = new Set();
    (match.lines || []).forEach(line => {
      const names = line.players?.[side] || [];
      names.forEach(name => {
        const key = playerKey(name);
        const current = dayPlayers.get(key) || { name, singles: false, doubles: false };
        if (line.type === 'singles') current.singles = true;
        if (line.type === 'doubles') current.doubles = true;
        dayPlayers.set(key, current);
      });
      if (line.type === 'doubles' && names.length === 2) dayPairs.add(names.map(playerKey).sort().join('|'));
    });
    dayPlayers.forEach(day => {
      const row = rowForPlayer(rows, day.name);
      if (!row) return;
      if (day.singles) row.singlesDays += 1;
      if (day.doubles) row.doublesDays += 1;
      row.totalMatchDays += 1;
    });
    dayPairs.forEach(pairKeyValue => {
      pairKeyValue.split('|').forEach(key => {
        const row = rows.get(key);
        if (row) row.partnerCounts[pairKeyValue] = (row.partnerCounts[pairKeyValue] || 0) + 1;
      });
    });
  });

  Object.entries(lineupSubmissions || {}).forEach(([scheduleId, scheduleSubmissions]) => {
    const submission = scheduleSubmissions?.[team?.id];
    const submissionScheduleId = submission?.scheduleId || scheduleId;
    if (submissionScheduleId && scoredScheduleIds.has(String(submissionScheduleId))) return;
    if (!submission?.lockedAt || submission?.unlockedAt || !Array.isArray(submission.lineup)) return;
    const dayPlayers = new Map();
    const dayPairs = new Set();
    submission.lineup.forEach(line => {
      const type = line.label === 'S1' ? 'singles' : 'doubles';
      const names = line.players || [];
      names.forEach(name => {
        const key = playerKey(name);
        const current = dayPlayers.get(key) || { name, singles: false, doubles: false };
        if (type === 'singles') current.singles = true;
        if (type === 'doubles') current.doubles = true;
        dayPlayers.set(key, current);
      });
      if (type === 'doubles' && names.length === 2) dayPairs.add(names.map(playerKey).sort().join('|'));
    });
    dayPlayers.forEach(day => {
      const row = rowForPlayer(rows, day.name);
      if (!row) return;
      if (day.singles) row.singlesDays += 1;
      if (day.doubles) row.doublesDays += 1;
      row.totalMatchDays += 1;
    });
    dayPairs.forEach(pairKeyValue => {
      pairKeyValue.split('|').forEach(key => {
        const row = rows.get(key);
        if (row) row.partnerCounts[pairKeyValue] = (row.partnerCounts[pairKeyValue] || 0) + 1;
      });
    });
  });

  return Array.from(rows.values()).map(row => {
    const maxPartner = Math.max(0, ...Object.values(row.partnerCounts || {}));
    const warnings = [];
    if (row.singlesDays >= rules.maxSinglesDays) warnings.push('Singles cap reached');
    else if (row.singlesDays === rules.maxSinglesDays - 1) warnings.push('1 singles day left');
    if (row.totalMatchDays >= rules.maxTotalMatchDays) warnings.push('Total cap reached');
    else if (row.totalMatchDays === rules.maxTotalMatchDays - 1) warnings.push('1 match day left');
    if (maxPartner >= rules.maxPartnerDays) warnings.push('Partner cap reached');
    else if (maxPartner === rules.maxPartnerDays - 1) warnings.push('1 partner day left');
    return { ...row, maxPartner, warnings };
  });
}

export function CaptainCapacityCard({ team, teams, matches, eligibilityRules = DEFAULT_ELIGIBILITY_RULES, lineupSubmissions = {} }) {
  const rules = useMemo(() => normalizeEligibilityRules(eligibilityRules), [eligibilityRules]);
  const rows = useMemo(() => buildCaptainCapacityRows(team, teams, matches, eligibilityRules, lineupSubmissions), [team, teams, matches, eligibilityRules, lineupSubmissions]);
  if (!team) return null;
  return (
    <div className="card captain-capacity-card" data-testid="captain-capacity-card">
      <h2>Captain Capacity Watch</h2>
      <p className="hint">Singles cap is {rules.maxSinglesDays} days. Review capacity before setting lines. Locked lineup submissions count here before scores are entered.</p>
      <div className="table-wrap">
        <table className="std" data-testid="captain-capacity-table">
          <thead><tr><th>Player</th><th>Singles</th><th>Total</th><th>Partner</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.name} className={row.warnings.length ? 'q' : ''}>
                <td><strong>{row.name}</strong></td>
                <td>{row.singlesDays}/{rules.maxSinglesDays}</td>
                <td>{row.totalMatchDays}/{rules.maxTotalMatchDays}</td>
                <td>{row.maxPartner}/{rules.maxPartnerDays}</td>
                <td>{row.warnings.length ? row.warnings.join(', ') : 'Available'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

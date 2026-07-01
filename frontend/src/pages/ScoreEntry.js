import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ref, update } from 'firebase/database';
import { db, ensureAuth, PATHS } from '../firebase';
import { ScoreProcessingService } from '../services/ScoreProcessingService';
import { writeAuditLog, recordLineupAudit } from '../services/AuditService';
import { ROLES, isAdminRole } from '../utils/roles';
import { useAuth } from '../contexts/AuthContext';
import { matchName } from '../utils/nameMatch';
import { resolveMatchTeams } from '../utils/matchTeams';
import { DEFAULT_ELIGIBILITY_RULES, normalizeEligibilityRules } from '../utils/eligibilityRules';
import { parseQuickScore } from '../utils/quickScoreParser';
import { regularSetWinner, validateLineScore } from '../utils/tennisScoreRules';
import TeamLogo from '../components/TeamLogo';

// Quick Paste is kept as a legacy/migration parser path only; Score Entry mounts the form workflow by default.
const QUICK_PASTE_ENABLED = false;

const COURT_TEMPLATES = [
  { label: 'Singles', type: 'singles', setCount: 5 },
  { label: 'Doubles 1', type: 'doubles', setCount: 3 },
  { label: 'Doubles 1 Reverse', type: 'doubles', setCount: 3 },
  { label: 'Doubles 2', type: 'doubles', setCount: 3 },
  { label: 'Doubles 2 Reverse', type: 'doubles', setCount: 3 }
];


function getQuickTemplate(teams) {
  const list = Object.values(teams || {});
  const t1 = list.find(t => t.abbreviation === 'KC') || list[0];
  const t2 = list.find(t => t.abbreviation === 'ML') || list.find(t => t.id !== t1?.id) || list[1];
  const p1 = t1?.players || [];
  const p2 = t2?.players || [];
  const name = (players, idx, fallback) => players[idx]?.name || fallback;
  const a = t1?.abbreviation || 'TEAM1';
  const b = t2?.abbreviation || 'TEAM2';
  return `${a} vs ${b}

S1: ${name(p1, 0, 'Singles A1')} vs ${name(p2, 0, 'Singles B1')}
4-3, 4-2, 0-4, 4-2 (won) ${a}

D1: ${name(p1, 1, 'A Pair 1')}/${name(p1, 2, 'A Pair 2')} vs ${name(p2, 1, 'B Pair 1')}/${name(p2, 2, 'B Pair 2')}
4-3, 1-4, 1-0 (won) ${a}

D1: ${name(p1, 1, 'A Pair 1')}/${name(p1, 2, 'A Pair 2')} vs ${name(p2, 3, 'B Pair 3')}/${name(p2, 4, 'B Pair 4')}
3-4, 1-4 (won) ${b}

D2: ${name(p1, 3, 'A Pair 3')}/${name(p1, 4, 'A Pair 4')} vs ${name(p2, 3, 'B Pair 3')}/${name(p2, 4, 'B Pair 4')}
0-4, 2-4 (won) ${b}

D2: ${name(p1, 3, 'A Pair 3')}/${name(p1, 4, 'A Pair 4')} vs ${name(p2, 1, 'B Pair 1')}/${name(p2, 2, 'B Pair 2')}
4-1, 4-2 (won) ${a}

Final: ${a} won 3-2`;
}

function normalizeQuickText(text, teams) {
  const abbrs = new Set(Object.values(teams || {}).map(t => t.abbreviation?.toUpperCase()).filter(Boolean));
  const lines = (text || '').split('\n').map(line => {
    let out = line.trim().replace(/\s+/g, ' ');
    out = out.replace(/\bvs\.?\b/ig, 'vs');
    out = out.replace(/\(\s*won\s*\)/ig, '(won)');
    out = out.replace(/^(singles?)\s*[:.-]?\s*/i, 'S1: ');
    out = out.replace(/^doubles\s*(\d)?\s*[:.-]?\s*/i, (_, n) => `D${n || ''}: `);
    out = out.replace(/^d(\d)\s+/i, 'D$1: ');
    out = out.replace(/^s(\d)\s+/i, 'S$1: ');
    out = out.replace(/^s\s+/i, 'S1: ');
    out = out.replace(/^S:\s*(S\d\s*:)/i, '$1');
    out = out.replace(/\b([a-z]{2,4}|t\d{2})\b/g, token => {
      const upper = token.toUpperCase();
      return abbrs.has(upper) ? upper : token;
    });
    if (out && /^.+\svs\s.+/i.test(out) && !/^(S\d?|D\d?)\s*:/i.test(out) && !/^\w+\s+vs\s+\w+$/i.test(out)) {
      out = `S1: ${out}`;
    }
    return out;
  });
  return lines.join('\n');
}

function getQuickGuidance(text, parsed, teams) {
  const raw = (text || '').trim();
  const teamAbbrs = Object.values(teams || {}).map(t => t.abbreviation).filter(Boolean);
  if (!raw) {
    return [
      'Start with TEAM1 vs TEAM2 using team abbreviations.',
      'Singles use S1 and can be best-of-5 sets.',
      'Doubles use D1/D1 reverse and D2/D2 reverse; pair 1 and pair 2 play both opponent pairs.'
    ];
  }
  const tips = [];
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines[0] && !/^\w+\s+vs\.?\s+\w+$/i.test(lines[0])) tips.push(`First line format: ${teamAbbrs[0] || 'SK'} vs ${teamAbbrs[1] || 'RR'}`);
  lines.slice(1).forEach((line, idx) => {
    const lineNo = idx + 2;
    const nextLine = lines[idx + 2] || '';
    const hasScoreContinuation = /^[\d\s,()-]+\(won\)/i.test(nextLine);
    if (/^final\s*:/i.test(line) || /^[\d\s,()-]+\(won\)/i.test(line)) return;
    if (!/^(S\d?|D\d?|Singles\s*\d?|Doubles\s*\d?)\s*:/i.test(line)) tips.push(`Line ${lineNo}: add court label like S1:, D1:, or D2:.`);
    if (!/\s+vs\.?\s+/i.test(line)) tips.push(`Line ${lineNo}: include "vs" between players.`);
    if (!hasScoreContinuation && !/\d+-\d+/.test(line)) tips.push(`Line ${lineNo}: add set scores like 4-2,4-1.`);
    if (!hasScoreContinuation && !/\(won\)\s*\w+/i.test(line)) tips.push(`Line ${lineNo}: end with (won) ${parsed.team1?.abbreviation || teamAbbrs[0] || 'TEAM'}.`);
  });
  if (parsed.corrections?.length) parsed.corrections.forEach(c => tips.push(c));
  if (parsed.errors?.length && tips.length === 0) tips.push('Follow the sample format below, then use Auto-format to clean spacing and labels.');
  return Array.from(new Set(tips)).slice(0, 6);
}


const LINEUP_ROLE_SLOTS = [
  { code: 'S', label: 'Singles' },
  { code: 'D1', label: 'Doubles 1 player A' },
  { code: 'D1', label: 'Doubles 1 player B' },
  { code: 'D2', label: 'Doubles 2 player A' },
  { code: 'D2', label: 'Doubles 2 player B' }
];

function normalizeLineupSelection(selected = []) {
  return Array.from({ length: LINEUP_ROLE_SLOTS.length }, (_, idx) => selected[idx] || '');
}

function selectedNamesFromIndexes(team, indexes) {
  return normalizeLineupSelection(indexes).map(index => team?.players?.[Number(index)]?.name).filter(Boolean);
}

export function buildLineupCourts(team1Names, team2Names) {
  const templates = COURT_TEMPLATES.map(t => newCourt(t.label, t.type, t.setCount));
  if (team1Names.length < 5 || team2Names.length < 5) return templates;
  const [s1a, d1a, d1b, d2a, d2b] = team1Names;
  const [s1b, od1a, od1b, od2a, od2b] = team2Names;
  return templates.map((court, idx) => {
    if (idx === 0) return { ...court, p1: [s1a], p2: [s1b] };
    if (idx === 1) return { ...court, p1: [d1a, d1b], p2: [od1a, od1b] };
    if (idx === 2) return { ...court, p1: [d1a, d1b], p2: [od2a, od2b] };
    if (idx === 3) return { ...court, p1: [d2a, d2b], p2: [od2a, od2b] };
    return { ...court, p1: [d2a, d2b], p2: [od1a, od1b] };
  });
}

function buildQuickLineupText(team1, team2, team1Names, team2Names) {
  const courts = buildLineupCourts(team1Names, team2Names);
  const labels = ['S1', 'D1', 'D1', 'D2', 'D2'];
  const lines = courts.map((court, idx) => `${labels[idx]}: ${court.p1.join('/')} vs ${court.p2.join('/')}\n4-3, 4-3 (won) ${team1.abbreviation}`);
  return `${team1.abbreviation} vs ${team2.abbreviation}\n\n${lines.join('\n\n')}\n\nFinal: ${team1.abbreviation} won 3-2`;
}

function shareLabel(label = '') {
  const normalized = label.toLowerCase();
  if (normalized.startsWith('single') || normalized.startsWith('s1')) return 'S1';
  if (normalized.includes('doubles 1') || normalized.startsWith('d1')) return 'D1';
  if (normalized.includes('doubles 2') || normalized.startsWith('d2')) return 'D2';
  return label || 'Court';
}

function formatSetsForShare(sets = []) {
  return sets.map(set => {
    let score = `${set.team1}-${set.team2}`;
    if (set.tieBreak) score += `(${set.tieBreak.team1}-${set.tieBreak.team2})`;
    if (typeof set.matchTieBreak === 'object') score += `(${set.matchTieBreak.team1}-${set.matchTieBreak.team2})`;
    return score;
  }).join(', ');
}

function formatMatchShareText(match) {
  if (!match) return '';
  const team1Abbr = match.t1Abbr || 'TEAM1';
  const team2Abbr = match.t2Abbr || 'TEAM2';
  const lines = (match.lines || []).map(line => {
    const winnerAbbr = line.winner === match.t1 ? team1Abbr : (line.winner === match.t2 ? team2Abbr : '');
    const winnerText = winnerAbbr ? ` (won) ${winnerAbbr}` : '';
    return `${shareLabel(line.label)}: ${(line.players?.team1 || []).join('/')} vs ${(line.players?.team2 || []).join('/')}\n${formatSetsForShare(line.sets)}${winnerText}`;
  });
  const winnerAbbr = match.winnerId === match.t1Id ? team1Abbr : (match.winnerId === match.t2Id ? team2Abbr : (match.win === match.t1 ? team1Abbr : team2Abbr));
  return `${team1Abbr} vs ${team2Abbr}\n\n${lines.join('\n\n')}\n\nFinal: ${winnerAbbr} won ${match.courtsWon1}-${match.courtsWon2}`;
}

function ShareResultPreview({ text, compact = false }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(text)}`;
  const copyText = async () => {
    await navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className={compact ? 'share-preview-panel' : 'card'} data-testid="result-share-preview">
      <h2>📤 WhatsApp-friendly result preview</h2>
      <pre className="hint" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{text}</pre>
      <div className="row" style={{ marginTop: '.8rem' }}>
        <button type="button" className="btn small" onClick={copyText} data-testid="copy-result-preview">
          {copied ? 'Copied!' : 'Copy preview'}
        </button>
        <a className="btn small success" href={whatsappHref} target="_blank" rel="noreferrer" data-testid="whatsapp-result-share">
          Share on WhatsApp
        </a>
      </div>
    </div>
  );
}

function ResultPreviewModal({ text, saving, onConfirm, onCancel, confirmTestId, cancelTestId, modalTestId }) {
  if (!text) return null;
  return (
    <div className="score-modal-backdrop" role="presentation">
      <section className="score-modal" role="dialog" aria-modal="true" aria-labelledby={`${modalTestId}-title`} data-testid={modalTestId}>
        <div className="score-modal-head">
          <div>
            <p className="score-modal-kicker">Preview before saving</p>
            <h2 id={`${modalTestId}-title`}>Copy/share result, then confirm DB save</h2>
          </div>
          <button type="button" className="btn small ghost" onClick={onCancel} disabled={saving} aria-label="Close preview dialog">
            ✕
          </button>
        </div>
        <p className="hint">Review this WhatsApp-friendly message first. Use Copy or WhatsApp share, then confirm only when you are ready to write the result to Firebase.</p>
        <ShareResultPreview text={text} compact />
        <div className="score-modal-actions">
          <button className="btn success full" onClick={onConfirm} disabled={saving} data-testid={confirmTestId}>
            {saving ? 'Saving...' : 'Confirm & Save to DB'}
          </button>
          <button className="btn ghost full" onClick={onCancel} disabled={saving} data-testid={cancelTestId}>
            Cancel
          </button>
        </div>
      </section>
    </div>
  );
}

function buildLineupValidationLines(team1Names, team2Names) {
  const lines = [];
  if (team1Names[0] && team2Names[0]) lines.push({ type: 'singles', players: { team1: [team1Names[0]], team2: [team2Names[0]] } });
  if (team1Names[1] && team1Names[2] && team2Names[1] && team2Names[2]) lines.push({ type: 'doubles', players: { team1: [team1Names[1], team1Names[2]], team2: [team2Names[1], team2Names[2]] } });
  if (team1Names[1] && team1Names[2] && team2Names[3] && team2Names[4]) lines.push({ type: 'doubles', players: { team1: [team1Names[1], team1Names[2]], team2: [team2Names[3], team2Names[4]] } });
  if (team1Names[3] && team1Names[4] && team2Names[3] && team2Names[4]) lines.push({ type: 'doubles', players: { team1: [team1Names[3], team1Names[4]], team2: [team2Names[3], team2Names[4]] } });
  if (team1Names[3] && team1Names[4] && team2Names[1] && team2Names[2]) lines.push({ type: 'doubles', players: { team1: [team1Names[3], team1Names[4]], team2: [team2Names[1], team2Names[2]] } });
  return lines;
}

function TeamLineupPicker({ team, selected, onChange, label }) {
  const slots = normalizeLineupSelection(selected);
  const selectedSet = new Set(slots.filter(Boolean));
  const setSlot = (slotIdx, value) => {
    const next = normalizeLineupSelection(slots);
    next[slotIdx] = value;
    onChange(next);
  };
  const smartFill = () => {
    const next = normalizeLineupSelection(slots);
    const used = new Set(next.filter(Boolean));
    (team?.players || []).forEach((player, idx) => {
      const key = String(idx);
      if (used.has(key)) return;
      const emptyIdx = next.findIndex(value => !value);
      if (emptyIdx === -1) return;
      next[emptyIdx] = key;
      used.add(key);
    });
    onChange(next);
  };
  const clearAll = () => onChange(Array.from({ length: LINEUP_ROLE_SLOTS.length }, () => ''));
  const pickedCount = slots.filter(Boolean).length;
  return (
    <div className="lineup-picker" data-testid={`lineup-picker-${team?.abbreviation || label}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="field-label">{label} lineup · assign roles ({pickedCount}/5)</div>
        <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn small ghost" onClick={smartFill} data-testid={`lineup-${team?.abbreviation}-smart-fill`}>Smart fill</button>
          <button type="button" className="btn small ghost" onClick={clearAll} data-testid={`lineup-${team?.abbreviation}-clear`}>Clear</button>
        </div>
      </div>
      <div style={{ display: 'grid', gap: '.45rem', marginTop: '.5rem' }}>
        {LINEUP_ROLE_SLOTS.map((slot, slotIdx) => (
          <label key={`${slot.code}-${slotIdx}`} className="field" style={{ margin: 0 }}>
            <div className="field-label">{slot.code} · {slot.label}</div>
            <select
              className="select"
              value={slots[slotIdx] || ''}
              onChange={e => setSlot(slotIdx, e.target.value)}
              data-testid={`lineup-${team?.abbreviation}-${slotIdx}-role-select`}
            >
              <option value="">— Choose player —</option>
              {(team?.players || []).map((player, idx) => {
                const value = String(idx);
                const disabled = selectedSet.has(value) && slots[slotIdx] !== value;
                return <option key={`${player.name}-${idx}`} value={value} disabled={disabled}>{idx === 0 || player.isCaptain ? '🏆 ' : ''}{player.name}</option>;
              })}
            </select>
          </label>
        ))}
      </div>
      <p className="hint">Choose each player's role directly. D1 pair plays both D1 courts; D2 pair plays both D2 courts. Smart fill uses roster order but you can override every slot.</p>
    </div>
  );
}

function LineupBuilder({ team1, team2, teams, matches, eligibilityRules, team1Selected, setTeam1Selected, team2Selected, setTeam2Selected, onPopulateForm, onPopulateQuick }) {
  const team1Names = selectedNamesFromIndexes(team1, team1Selected);
  const team2Names = selectedNamesFromIndexes(team2, team2Selected);
  const lineupValidationLines = buildLineupValidationLines(team1Names, team2Names);
  const lineupErrors = lineupValidationLines.length > 0 ? validateEligibilityForLines(lineupValidationLines, team1, team2, matches, teams, eligibilityRules) : [];
  const ready = team1Names.length === 5 && team2Names.length === 5 && lineupErrors.length === 0;
  return (
    <div className="card lineup-builder-card" data-testid="score-lineup-builder">
      <h2>Lineup builder</h2>
      <p className="hint">After teams are selected, assign each roster player to Singles, D1, or D2. Smart fill can prefill by roster order, then captains can override every role before populating scores.</p>
      <div className="lineup-builder-grid">
        <TeamLineupPicker team={team1} selected={team1Selected} onChange={setTeam1Selected} label={team1?.abbreviation || 'Team 1'} />
        <TeamLineupPicker team={team2} selected={team2Selected} onChange={setTeam2Selected} label={team2?.abbreviation || 'Team 2'} />
      </div>
      {lineupErrors.length > 0 && <div className="error-box" data-testid="lineup-validation-error" style={{ whiteSpace: 'pre-line', marginTop: '.75rem' }}>{lineupErrors.join('\n')}</div>}
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginTop: '.75rem' }}>
        {onPopulateForm && <button type="button" className="btn small success" disabled={!ready} onClick={() => onPopulateForm(buildLineupCourts(team1Names, team2Names))} data-testid="populate-form-lineup">Populate form lines</button>}
        {onPopulateQuick && <button type="button" className="btn small success" disabled={!ready} onClick={() => onPopulateQuick(buildQuickLineupText(team1, team2, team1Names, team2Names))} data-testid="populate-quick-lineup">Populate quick paste</button>}
      </div>
    </div>
  );
}

function newCourt(label, type, setCount = 3) {
  return {
    label, type,
    p1: type === 'singles' ? [''] : ['', ''],
    p2: type === 'singles' ? [''] : ['', ''],
    sets: Array.from({ length: setCount }, () => ({ a: '', b: '', tieA: '', tieB: '' }))
  };
}

function PlayerInput({ value, onChange, roster, teamAbbr, testid }) {
  const [focus, setFocus] = useState(false);
  const trimmedValue = value.trim();
  const canSuggest = trimmedValue.length >= 3;
  const result = useMemo(() => matchName(value, roster), [value, roster]);
  const rosterSuggestions = useMemo(() => {
    if (!canSuggest || result.exact) return [];
    const query = trimmedValue.toLowerCase();
    const ranked = (roster || [])
      .map((player) => {
        const name = player.name || '';
        const lowerName = name.toLowerCase();
        const firstToken = lowerName.split(/\s+/)[0] || '';
        let rank = 3;
        if (firstToken.startsWith(query)) rank = 0;
        else if (lowerName.startsWith(query)) rank = 1;
        else if (lowerName.includes(query)) rank = 2;
        return { ...player, rank };
      })
      .filter(player => player.rank < 3)
      .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
      .slice(0, 5);

    const seen = new Set(ranked.map(player => player.name));
    const fuzzy = (result.suggestions || []).filter(player => !seen.has(player.name));
    return [...ranked, ...fuzzy].slice(0, 5);
  }, [canSuggest, result.exact, result.suggestions, roster, trimmedValue]);
  const showSuggest = focus && canSuggest && !result.exact && rosterSuggestions.length > 0;
  const showNoMatch = focus && canSuggest && !result.exact && rosterSuggestions.length === 0;
  const matchedExact = result.exact;
  const applySuggestion = (name) => {
    onChange(name);
    setFocus(false);
  };
  return (
    <div style={{ position: 'relative' }}>
      <input
        className="input"
        value={value}
        placeholder={teamAbbr ? `Type 3 letters for ${teamAbbr} roster` : 'Type 3 letters for roster'}
        onChange={e => onChange(autoCompleteUniqueRosterName(e.target.value, roster))}
        onFocus={() => setFocus(true)}
        onKeyDown={(e) => {
          if ((e.key === 'Tab' || e.key === 'Enter') && showSuggest && rosterSuggestions[0]) {
            e.preventDefault();
            applySuggestion(rosterSuggestions[0].name);
          }
        }}
        onBlur={() => setTimeout(() => setFocus(false), 180)}
        autoComplete="off"
        data-testid={testid}
        style={{
          borderColor: matchedExact ? '#10b981' : (showNoMatch ? '#ef4444' : undefined),
          paddingRight: '2rem'
        }}
      />
      {matchedExact && (
        <span style={{ position: 'absolute', right: 10, top: 11, color: '#10b981', fontWeight: 900 }} data-testid={`${testid}-match-ok`}>✓</span>
      )}
      {showNoMatch && (
        <span style={{ position: 'absolute', right: 10, top: 11, color: '#ef4444', fontWeight: 900 }} data-testid={`${testid}-match-bad`}>✗</span>
      )}
      {showSuggest && (
        <div className="suggest" data-testid={`${testid}-suggest`}>
          <div className="suggest-hint">Choose a {teamAbbr || 'team'} player, or press Enter/Tab for the first match</div>
          {rosterSuggestions.map((s, i) => (
            <div
              key={s.name || i}
              className="suggest-item"
              onMouseDown={(e) => { e.preventDefault(); applySuggestion(s.name); }}
              data-testid={`${testid}-suggest-${i}`}
            >
              {s.isCaptain ? '🏆 ' : ''}{s.name}
              {typeof s.score === 'number' && <span className="score">{Math.round(s.score * 100)}% match</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


function focusNextScoreInput(input) {
  requestAnimationFrame(() => {
    const scope = input.closest('.sets-entry-col') || input.closest('.court-card') || document;
    const inputs = Array.from(scope.querySelectorAll('.set-input input:not(:disabled)'));
    const currentIndex = inputs.indexOf(input);
    const next = currentIndex >= 0 ? inputs[currentIndex + 1] : null;
    if (next) {
      next.focus();
      next.select?.();
    }
  });
}

function shouldAdvanceScoreInput(value, digits) {
  const cleanValue = String(value || '').replace(/\D/g, '');
  return cleanValue.length >= digits;
}


function normalizedTieBreakForSetWinner(setWinner, tieA, tieB) {
  if (!setWinner || tieA === '' || tieB === '') return null;
  const ta = Number(tieA);
  const tb = Number(tieB);
  if (!Number.isFinite(ta) || !Number.isFinite(tb) || ta === tb) return { team1: ta, team2: tb };
  const winnerPoints = Math.max(ta, tb);
  const loserPoints = Math.min(ta, tb);
  return setWinner === 1
    ? { team1: winnerPoints, team2: loserPoints }
    : { team1: loserPoints, team2: winnerPoints };
}

function SetRow({ idx, set, onChange, disabled, isMatchTieBreak = false, team1Abbr = 'Team A', team2Abbr = 'Team B' }) {
  const [editing, setEditing] = useState(false);
  const [quickWinner, setQuickWinner] = useState(null);
  const a = set.a === '' ? null : Number(set.a);
  const b = set.b === '' ? null : Number(set.b);
  const resultClass = a == null || b == null || a === b ? 'empty' : (a > b ? 'team1-won' : 'team2-won');
  const scoreWinner = a == null || b == null || a === b ? null : (a > b ? 1 : 2);
  const selectedWinner = quickWinner || scoreWinner;
  const regularWinner = !isMatchTieBreak && a != null && b != null ? regularSetWinner(a, b) : null;
  const needsTieBreak = !isMatchTieBreak && ((a === 4 && b === 3) || (a === 3 && b === 4));
  const tieBreakComplete = !needsTieBreak || (set.tieA !== '' && set.tieB !== '');
  const matchTieBreakComplete = isMatchTieBreak && a != null && b != null && a !== b;
  const setComplete = isMatchTieBreak ? matchTieBreakComplete : !!regularWinner && tieBreakComplete;
  const displayTieBreak = needsTieBreak ? normalizedTieBreakForSetWinner(regularWinner, set.tieA, set.tieB) : null;
  const scoreDigits = isMatchTieBreak ? 2 : 1;
  const updateScore = (field, value, input, digits = scoreDigits) => {
    setEditing(true);
    setQuickWinner(null);
    onChange({ ...set, [field]: value });
    if (shouldAdvanceScoreInput(value, digits)) focusNextScoreInput(input);
  };
  const swapScoreSides = () => {
    setEditing(true);
    setQuickWinner(null);
    onChange({ ...set, a: set.b, b: set.a, tieA: set.tieB, tieB: set.tieA });
  };
  const scrollToNextSet = (element) => {
    requestAnimationFrame(() => {
      const currentSet = element?.closest('[data-testid*="-set-"]');
      const nextSet = currentSet?.nextElementSibling;
      nextSet?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      nextSet?.querySelector?.('input:not(:disabled)')?.focus?.();
    });
  };
  const applyQuickScore = (winnerTeamNum, loserGames, element) => {
    const nextSet = winnerTeamNum === 1
      ? { ...set, a: '4', b: String(loserGames), tieA: '', tieB: '' }
      : { ...set, a: String(loserGames), b: '4', tieA: '', tieB: '' };
    onChange(nextSet);
    setQuickWinner(null);
    setEditing(false);
    scrollToNextSet(element);
  };

  if (setComplete && !editing) {
    return (
      <div className={`set-input set-complete-summary ${resultClass}`.trim()}>
        <span className="label">{isMatchTieBreak ? 'Match TB' : `Set ${idx + 1}`}</span>
        <strong>{set.a}-{set.b}{displayTieBreak && ` (${displayTieBreak.team1}-${displayTieBreak.team2})`}</strong>
        <span className="tag win">{selectedWinner === 1 ? team1Abbr : team2Abbr} won</span>
        <button type="button" className="btn small ghost set-edit-btn" onClick={() => setEditing(true)} data-testid={`set-${idx}-edit`}>Edit</button>
      </div>
    );
  }

  return (
    <div className={`set-input ${resultClass} ${isMatchTieBreak ? 'match-tb' : ''}`.trim()}>
      <span className="label">{isMatchTieBreak ? 'Match TB' : `Set ${idx + 1}`}</span>
      <input
        className="input"
        type="number"
        inputMode="numeric"
        value={set.a}
        min="0"
        max={isMatchTieBreak ? "30" : "4"}
        disabled={disabled}
        onChange={e => updateScore('a', e.target.value, e.target)}
        placeholder="0"
        pattern="[0-9]*"
        enterKeyHint="next"
        autoComplete="off"
        aria-label={`${isMatchTieBreak ? 'Match tiebreak' : `Set ${idx + 1}`} team 1 score`}
        data-testid={`set-${idx}-a`}
      />
      <span>-</span>
      <input
        className="input"
        type="number"
        inputMode="numeric"
        value={set.b}
        min="0"
        max={isMatchTieBreak ? "30" : "4"}
        disabled={disabled}
        onChange={e => updateScore('b', e.target.value, e.target)}
        placeholder="0"
        pattern="[0-9]*"
        enterKeyHint="next"
        autoComplete="off"
        aria-label={`${isMatchTieBreak ? 'Match tiebreak' : `Set ${idx + 1}`} team 2 score`}
        data-testid={`set-${idx}-b`}
      />
      <button
        type="button"
        className="set-swap-btn"
        disabled={disabled || (set.a === '' && set.b === '' && set.tieA === '' && set.tieB === '')}
        onClick={swapScoreSides}
        aria-label={`${isMatchTieBreak ? 'Match tiebreak' : `Set ${idx + 1}`} swap team scores`}
        title="Swap score sides"
        data-testid={`set-${idx}-swap`}
      >
        ⇄
      </button>
      {!isMatchTieBreak && (
        <div className="set-winner-picker" aria-label={`Set ${idx + 1} winner`}>
          <button type="button" className={selectedWinner === 1 ? 'active' : ''} disabled={disabled} onClick={() => setQuickWinner(1)}>{team1Abbr}</button>
          <button type="button" className={selectedWinner === 2 ? 'active' : ''} disabled={disabled} onClick={() => setQuickWinner(2)}>{team2Abbr}</button>
        </div>
      )}
      {!isMatchTieBreak && (
        <div className="fast-score-row compact" aria-label={`Set ${idx + 1} fast score entry`}>
          {[0, 1, 2, 3].map(games => (
            <button key={games} type="button" disabled={disabled || !selectedWinner} onClick={(event) => applyQuickScore(selectedWinner, games, event.currentTarget)}>{`4-${games}`}</button>
          ))}
        </div>
      )}
      {needsTieBreak && (
        <>
          <span style={{ fontSize: '.75rem', color: '#92400e' }}>TB</span>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            value={set.tieA}
            min="0"
            disabled={disabled}
            onChange={e => updateScore('tieA', e.target.value, e.target, 2)}
            placeholder="0"
            pattern="[0-9]*"
            enterKeyHint="next"
            autoComplete="off"
            aria-label={`Set ${idx + 1} tiebreak team 1 score`}
            data-testid={`set-${idx}-tieA`}
          />
          <span>-</span>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            value={set.tieB}
            min="0"
            disabled={disabled}
            onChange={e => updateScore('tieB', e.target.value, e.target, 2)}
            placeholder="0"
            pattern="[0-9]*"
            enterKeyHint="next"
            autoComplete="off"
            aria-label={`Set ${idx + 1} tiebreak team 2 score`}
            data-testid={`set-${idx}-tieB`}
          />
        </>
      )}
    </div>
  );
}

function computeCourt(c) {
  let g1 = 0, g2 = 0, s1 = 0, s2 = 0;
  const sets = [];
  for (let i = 0; i < c.sets.length; i++) {
    const s = c.sets[i];
    if (s.a === '' || s.b === '') continue;
    const a = Number(s.a) || 0, b = Number(s.b) || 0;
    const firstTwoSplit = c.type === 'doubles' && i === 2 && sets.length >= 2 && regularSetWinner(sets[0].team1, sets[0].team2) !== regularSetWinner(sets[1].team1, sets[1].team2);
    const setEntry = { set: i + 1, team1: a, team2: b };
    if (firstTwoSplit) {
      setEntry.matchTieBreak = { team1: a, team2: b };
      if (a > b) {
        setEntry.team1 = 1;
        setEntry.team2 = 0;
        s1++;
      } else if (b > a) {
        setEntry.team1 = 0;
        setEntry.team2 = 1;
        s2++;
      }
    } else {
      g1 += a; g2 += b;
      if (a > b) s1++;
      else if (b > a) s2++;
      if ((a === 4 && b === 3) || (a === 3 && b === 4)) {
        const ta = s.tieA === '' ? null : Number(s.tieA);
        const tb = s.tieB === '' ? null : Number(s.tieB);
        if (ta != null && tb != null) setEntry.tieBreak = normalizedTieBreakForSetWinner(regularSetWinner(a, b), s.tieA, s.tieB);
      }
    }
    sets.push(setEntry);
  }
  const winnerTeamNum = s1 > s2 ? 1 : (s2 > s1 ? 2 : null);
  return { g1, g2, s1, s2, sets, winnerTeamNum };
}


function courtHasEntry(c) {
  return [...c.p1, ...c.p2].some(n => (n || '').trim()) || c.sets.some(s => s.a !== '' || s.b !== '' || s.tieA !== '' || s.tieB !== '');
}


function validateCourtShape(court, result, validationErrors) {
  const expectedPlayers = court.type === 'singles' ? 1 : 2;
  if ((court.p1 || []).length !== expectedPlayers || (court.p2 || []).length !== expectedPlayers) {
    validationErrors.push(`${court.label}: ${court.type === 'singles' ? 'singles requires 1 player per team' : 'doubles requires 2 players per team'}`);
  }
  if (result.sets.length > court.sets.length) {
    validationErrors.push(`${court.label}: too many sets entered for ${court.type}`);
  }
  const firstTwo = computeCourt({ ...court, sets: court.sets.slice(0, 2) });
  const needsDoublesThird = court.type === 'doubles' && firstTwo.s1 === 1 && firstTwo.s2 === 1;
  court.sets.forEach((set, idx) => {
    if (court.type === 'doubles' && idx === 2 && !needsDoublesThird) return;
    const hasA = set.a !== '';
    const hasB = set.b !== '';
    if (hasA !== hasB) validationErrors.push(`${court.label}: set ${idx + 1} needs both team scores`);
  });
  validationErrors.push(...validateLineScore({ label: court.label, type: court.type, sets: result.sets }));
}


function eligibilityPlayerKey(teamId, playerName) {
  return `${teamId}:${String(playerName || '').trim().toLowerCase()}`;
}

function eligibilityPairKey(teamId, names) {
  return `${teamId}:${names.map(name => String(name || '').trim().toLowerCase()).sort().join('|')}`;
}

function incrementPlayerDay(days, teamId, playerName, type) {
  const key = eligibilityPlayerKey(teamId, playerName);
  if (!key || key.endsWith(':')) return;
  const row = days.get(key) || { name: playerName, teamId, totalMatchDays: 0, singlesDays: 0, doublesDays: 0, partnerHistory: {} };
  if (type === 'singles') row.singlesDays += 1;
  if (type === 'doubles') row.doublesDays += 1;
  row.totalMatchDays = Math.max(row.totalMatchDays, row.singlesDays + row.doublesDays);
  days.set(key, row);
}

function buildExistingEligibility(matches, teams) {
  const playerDays = new Map();
  const partnerDays = new Map();
  (matches || []).forEach((match) => {
    if (match.status && match.status !== 'APPROVED' && match.status !== 'approved') return;
    const { team1, team2 } = resolveMatchTeams(match, teams);
    if (!team1 || !team2) return;
    const matchPlayers = new Map();
    const matchPairs = new Set();
    (match.lines || []).forEach((line) => {
      const type = line.type === 'singles' ? 'singles' : 'doubles';
      [[team1, line.players?.team1 || []], [team2, line.players?.team2 || []]].forEach(([team, names]) => {
        names.forEach((name) => {
          const key = eligibilityPlayerKey(team.id, name);
          const row = matchPlayers.get(key) || { teamId: team.id, name, singles: false, doubles: false };
          if (type === 'singles') row.singles = true;
          if (type === 'doubles') row.doubles = true;
          matchPlayers.set(key, row);
        });
        if (type === 'doubles' && names.length === 2) matchPairs.add(eligibilityPairKey(team.id, names));
      });
    });
    matchPlayers.forEach((row) => {
      if (row.singles) incrementPlayerDay(playerDays, row.teamId, row.name, 'singles');
      if (row.doubles) incrementPlayerDay(playerDays, row.teamId, row.name, 'doubles');
    });
    matchPairs.forEach((pairKey) => partnerDays.set(pairKey, (partnerDays.get(pairKey) || 0) + 1));
  });
  return { playerDays, partnerDays };
}

function validateEligibilityForLines(lines, team1, team2, matches, teams, eligibilityRules = DEFAULT_ELIGIBILITY_RULES) {
  const rules = normalizeEligibilityRules(eligibilityRules);
  const errors = [];
  const existing = buildExistingEligibility(matches, teams);
  const currentPlayers = new Map();
  const currentPairs = new Map();
  (lines || []).forEach((line) => {
    const type = line.type === 'singles' ? 'singles' : 'doubles';
    [[team1, line.players?.team1 || []], [team2, line.players?.team2 || []]].forEach(([team, names]) => {
      names.forEach((name) => {
        const key = eligibilityPlayerKey(team.id, name);
        const row = currentPlayers.get(key) || { name, teamId: team.id, singles: false, doublesCount: 0 };
        if (type === 'singles') row.singles = true;
        if (type === 'doubles') row.doublesCount += 1;
        currentPlayers.set(key, row);
      });
      if (type === 'doubles' && names.length === 2) {
        const pairKey = eligibilityPairKey(team.id, names);
        const pair = currentPairs.get(pairKey) || { teamId: team.id, names, days: 0, lines: 0 };
        pair.lines += 1;
        pair.days = 1;
        currentPairs.set(pairKey, pair);
      }
    });
  });

  currentPlayers.forEach((row) => {
    if (row.singles && row.doublesCount > 0) errors.push(`${row.name}: cannot play singles and doubles on the same match day`);
    if (row.doublesCount > 0 && row.doublesCount !== 2) errors.push(`${row.name}: doubles players must play both Doubles and Reverse Doubles`);
    const previous = existing.playerDays.get(eligibilityPlayerKey(row.teamId, row.name)) || { totalMatchDays: 0, singlesDays: 0, doublesDays: 0 };
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

function getDuplicatePlayers(courts) {
  const usage = new Map();
  courts.forEach(c => {
    [...c.p1, ...c.p2].forEach(name => {
      const clean = (name || '').trim();
      const key = clean.toLowerCase();
      if (!key) return;
      const current = usage.get(key) || { name: clean, singles: 0, doubles: 0 };
      if (c.type === 'singles') current.singles += 1;
      else current.doubles += 1;
      usage.set(key, current);
    });
  });
  return Array.from(usage.values())
    .filter(item => item.singles > 1 || (item.singles > 0 && item.doubles > 0) || item.doubles > 2)
    .map(item => item.name);
}

function courtCompletion(c) {
  if (!courtHasEntry(c)) return { status: 'empty', message: 'Not started' };
  const r = computeCourt(c);
  if (r.sets.length === 0) return { status: 'warning', message: 'Add set scores' };
  if (r.winnerTeamNum === null) return { status: 'warning', message: 'Needs clear winner' };
  return { status: 'ready', message: `Ready · ${r.s1}-${r.s2} sets · ${r.g1}-${r.g2} games` };
}

function getRosterSuggestions(query, roster) {
  if (!query || query.trim().length < 3) return [];
  const normalizedQuery = query.trim().toLowerCase();
  const ranked = (roster || [])
    .map((player) => {
      const name = player.name || '';
      const lowerName = name.toLowerCase();
      const firstToken = lowerName.split(/\s+/)[0] || '';
      let rank = 3;
      if (firstToken.startsWith(normalizedQuery)) rank = 0;
      else if (lowerName.startsWith(normalizedQuery)) rank = 1;
      else if (lowerName.includes(normalizedQuery)) rank = 2;
      return { ...player, rank };
    })
    .filter(player => player.rank < 3)
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
    .slice(0, 5);

  const seen = new Set(ranked.map(player => player.name));
  const fuzzy = matchName(query, roster).suggestions.filter(player => !seen.has(player.name));
  return [...ranked, ...fuzzy].slice(0, 5);
}

function autoCompleteUniqueRosterName(value, roster) {
  const query = (value || '').trim();
  if (query.length < 3 || /\s$/.test(value)) return value;
  const normalizedQuery = query.toLowerCase();
  const prefixMatches = (roster || []).filter(player => {
    const name = player.name || '';
    const lowerName = name.toLowerCase();
    const firstToken = lowerName.split(/\s+/)[0] || '';
    return firstToken.startsWith(normalizedQuery) || lowerName.startsWith(normalizedQuery);
  });
  return prefixMatches.length === 1 ? prefixMatches[0].name : value;
}

function getAllRosterPlayers(teams) {
  return Object.values(teams || {}).flatMap(team =>
    (team.players || []).map(player => ({
      ...player,
      teamAbbr: team.abbreviation,
      teamName: team.name
    }))
  );
}

function getQuickNameContext(text, cursor, parsed, teams) {
  if (cursor == null) return null;
  const lineStart = text.lastIndexOf('\n', Math.max(0, cursor - 1)) + 1;
  const lineEndAt = text.indexOf('\n', cursor);
  const lineEnd = lineEndAt === -1 ? text.length : lineEndAt;
  const line = text.slice(lineStart, lineEnd);
  const beforeCursor = text.slice(lineStart, cursor);
  const lowerLine = line.trim().toLowerCase();
  if (!line.trim() || lowerLine.startsWith('final:') || /^[\d\s,()-]+\(won\)/i.test(line.trim())) return null;
  const vsMatch = line.match(/\bvs\.?\b/i);
  const vsIndex = vsMatch?.index ?? -1;
  const isTeam2Side = vsMatch && beforeCursor.length > vsIndex;
  const team = isTeam2Side ? parsed.team2 : parsed.team1;
  const sideStart = isTeam2Side ? vsIndex + vsMatch[0].length : 0;
  const sideBeforeCursor = beforeCursor.slice(sideStart);
  const lastDelimiter = Math.max(sideBeforeCursor.lastIndexOf(':'), sideBeforeCursor.lastIndexOf('/'));
  const tokenStartInSide = lastDelimiter + 1;
  const rawToken = sideBeforeCursor.slice(tokenStartInSide);
  const leadingSpace = rawToken.match(/^\s*/)?.[0] || '';
  const query = rawToken.trimStart();
  const replaceStart = lineStart + sideStart + tokenStartInSide + leadingSpace.length;
  const roster = team?.players || getAllRosterPlayers(teams);
  const suggestions = getRosterSuggestions(query, roster);
  if (query.trim().length < 3 || suggestions.length === 0) return null;
  return { query, suggestions, teamAbbr: team?.abbreviation || 'all teams', replaceStart, replaceEnd: cursor };
}

export default function ScoreEntry({ teams, schedule = {}, lineupSubmissions = {}, revealedLineups = {}, matches, eligibilityRules = DEFAULT_ELIGIBILITY_RULES, onScoreSaved }) {
  const location = useLocation();
  const scoreTarget = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return {
      scheduleId: params.get('scheduleId') || '',
      revealId: params.get('revealId') || ''
    };
  }, [location.search]);
  const [sharedTeam1Id, setSharedTeam1IdRaw] = useState('');
  const [sharedTeam2Id, setSharedTeam2IdRaw] = useState('');
  const [team1Lineup, setTeam1Lineup] = useState([]);
  const [team2Lineup, setTeam2Lineup] = useState([]);
  const setSharedTeam1Id = (value) => { setSharedTeam1IdRaw(value); setTeam1Lineup([]); };
  const setSharedTeam2Id = (value) => { setSharedTeam2IdRaw(value); setTeam2Lineup([]); };
  const lineupState = { team1Lineup, setTeam1Lineup, team2Lineup, setTeam2Lineup };
  return (
    <main className="container">
      <div className="page-title">
        <h1>Enter Score</h1>
        <p>Score lines load from submitted dashboard lineups or can be filled in the form.</p>
      </div>
      <FormEntry
        teams={teams}
        matches={matches}
        schedule={schedule}
        lineupSubmissions={lineupSubmissions}
        revealedLineups={revealedLineups}
        eligibilityRules={eligibilityRules}
        onScoreSaved={onScoreSaved}
        team1Id={sharedTeam1Id}
        setTeam1Id={setSharedTeam1Id}
        team2Id={sharedTeam2Id}
        setTeam2Id={setSharedTeam2Id}
        targetScheduleId={scoreTarget.scheduleId}
        targetRevealId={scoreTarget.revealId}
      />
      {QUICK_PASTE_ENABLED && (
        <QuickEntry
          teams={teams}
          matches={matches}
          schedule={schedule}
          lineupSubmissions={lineupSubmissions}
          revealedLineups={revealedLineups}
          eligibilityRules={eligibilityRules}
          onScoreSaved={onScoreSaved}
          team1Id={sharedTeam1Id}
          setTeam1Id={setSharedTeam1Id}
          team2Id={sharedTeam2Id}
          setTeam2Id={setSharedTeam2Id}
          lineupState={lineupState}
        />
      )}
    </main>
  );
}

function teamGroup(team) {
  return team?.group || 'A';
}

function teamsShareGroup(team1, team2) {
  if (!team1 || !team2) return true;
  return teamGroup(team1) === teamGroup(team2);
}

function groupFilteredOpponents(teamList, selectedTeam) {
  return teamList.filter(team => team.id !== selectedTeam?.id && (!selectedTeam || teamsShareGroup(team, selectedTeam)));
}

function fixtureCode(item) {
  return item?.id ? String(item.id).slice(-6).toUpperCase() : 'MATCH';
}

function submittedLineupNames(submission, team) {
  const byLabel = Object.fromEntries((submission?.lineup || []).map(line => [shareLabel(line.label), line.players || []]));
  const names = [byLabel.S1?.[0], byLabel.D1?.[0], byLabel.D1?.[1], byLabel.D2?.[0], byLabel.D2?.[1]].filter(Boolean);
  if (names.length === 5) return names;
  const selectedNames = Array.isArray(submission?.selected)
    ? submission.selected.map(index => team?.players?.[Number(index)]?.name).filter(Boolean)
    : [];
  return selectedNames.length === 5 ? selectedNames : names;
}

function lineupFixtureMatchesTarget(row, targetScheduleId = '', targetRevealId = '') {
  if (!row) return false;
  return (!!targetScheduleId && String(row.item?.id || '') === String(targetScheduleId))
    || (!!targetRevealId && [row.revealId, row.revealCode].filter(Boolean).map(String).includes(String(targetRevealId)));
}

export function scoreLineupFixtures(schedule, revealedLineups, lineupSubmissions, team1Id, team2Id, teams, matches, eligibilityRules) {
  if (!team1Id || !team2Id) return [];
  const rows = new Map();
  const buildRow = (item, revealId, revealCode, team1Names, team2Names, revealed = true, source = 'revealedLineups') => {
    const lineupLines = buildLineupValidationLines(team1Names, team2Names);
    const eligibilityErrors = team1Names.length === 5 && team2Names.length === 5
      ? validateEligibilityForLines(lineupLines, teams[team1Id], teams[team2Id], matches, teams, eligibilityRules)
      : [];
    return { item, revealId, revealCode, revealed, source, team1Names, team2Names, eligibilityErrors, ready: team1Names.length === 5 && team2Names.length === 5 };
  };

  Object.values(revealedLineups || {})
    .filter(row => [row.team1Id, row.team2Id].includes(team1Id) && [row.team1Id, row.team2Id].includes(team2Id))
    .forEach(row => {
      const item = schedule?.[row.scheduleId] || { id: row.scheduleId, team1Id: row.team1Id, team2Id: row.team2Id };
      const fallbackSubmission = lineupSubmissions?.[row.scheduleId] || {};
      const team1Names = submittedLineupNames({ lineup: row.lineups?.[team1Id] }, teams[team1Id]).length === 5
        ? submittedLineupNames({ lineup: row.lineups?.[team1Id] }, teams[team1Id])
        : submittedLineupNames(fallbackSubmission[team1Id], teams[team1Id]);
      const team2Names = submittedLineupNames({ lineup: row.lineups?.[team2Id] }, teams[team2Id]).length === 5
        ? submittedLineupNames({ lineup: row.lineups?.[team2Id] }, teams[team2Id])
        : submittedLineupNames(fallbackSubmission[team2Id], teams[team2Id]);
      rows.set(row.scheduleId, buildRow(item, row.revealId, row.revealCode || row.revealId, team1Names, team2Names, true, 'revealedLineups'));
    });

  Object.entries(lineupSubmissions || {}).forEach(([scheduleId, submissions]) => {
    if (rows.has(scheduleId)) return;
    const mine = submissions?.[team1Id];
    const theirs = submissions?.[team2Id];
    if (!mine?.lockedAt || !theirs?.lockedAt || mine?.unlockedAt || theirs?.unlockedAt) return;
    const team1Names = submittedLineupNames(mine, teams[team1Id]);
    const team2Names = submittedLineupNames(theirs, teams[team2Id]);
    if (team1Names.length !== 5 || team2Names.length !== 5) return;
    const item = schedule?.[scheduleId] || { id: scheduleId, team1Id: mine.teamId || team1Id, team2Id: theirs.teamId || team2Id };
    const revealId = mine.revealId || theirs.revealId || `locked-${scheduleId}-${Math.max(Number(mine.lockedAt) || 0, Number(theirs.lockedAt) || 0)}`;
    rows.set(scheduleId, buildRow(item, revealId, revealId, team1Names, team2Names, false, 'lockedSubmissions'));
  });

  return Array.from(rows.values());
}


async function markLineupConvertedToScore(record, session) {
  if (!record?.scheduleId) return;
  const now = Date.now();
  const updates = {};
  [record.t1Id, record.t2Id].filter(Boolean).forEach(teamId => {
    updates[`${PATHS.lineupSubmissions}/${record.scheduleId}/${teamId}/convertedToScoreAt`] = now;
    updates[`${PATHS.lineupSubmissions}/${record.scheduleId}/${teamId}/scoreSavedAt`] = now;
    updates[`${PATHS.lineupSubmissions}/${record.scheduleId}/${teamId}/scoreSavedBy`] = session?.teamId || session?.userId || session?.role || 'unknown';
    updates[`${PATHS.lineupSubmissions}/${record.scheduleId}/${teamId}/lastUpdatedAt`] = now;
    updates[`${PATHS.lineupSubmissionMeta}/${record.scheduleId}/${teamId}/convertedToScoreAt`] = now;
    updates[`${PATHS.lineupSubmissionMeta}/${record.scheduleId}/${teamId}/scoreSavedAt`] = now;
    updates[`${PATHS.lineupSubmissionMeta}/${record.scheduleId}/${teamId}/scoreSavedBy`] = session?.teamId || session?.userId || session?.role || 'unknown';
    updates[`${PATHS.lineupSubmissionMeta}/${record.scheduleId}/${teamId}/lastUpdatedAt`] = now;
  });
  if (Object.keys(updates).length) await update(ref(db), updates);
}

function ScoreLineupLoader({ fixtures, teams, selectedId, onSelectedId, onLoad, mode }) {
  if (!fixtures.length) return null;
  const selected = fixtures.find(row => [row.revealId, row.revealCode, row.item?.id].filter(Boolean).map(String).includes(String(selectedId))) || fixtures[0];
  const { item, ready, revealed, eligibilityErrors = [] } = selected;
  const team1 = teams[item.team1Id];
  const team2 = teams[item.team2Id];
  return (
    <div className="card score-lineup-loader" data-testid={`${mode}-score-lineup-loader`}>
      <h2>Use submitted dashboard lineup</h2>
      <p className="hint">Select the match schedule code for the lines you are scoring. Lines can load after both captains have submitted and the matchup is revealed.</p>
      <div className="lineup-loader-row">
        <label className="field lineup-loader-select">
          <div className="field-label">Match schedule code</div>
          <select className="select" value={selected.revealId} onChange={e => onSelectedId(e.target.value)} data-testid={`${mode}-schedule-code-select`}>
            {fixtures.map(row => {
              const f = row.item;
              return <option key={row.revealId} value={row.revealId}>{row.revealCode || fixtureCode(f)} · Round {f.round || '—'} · {f.date || 'TBD'} · {teams[f.team1Id]?.abbreviation || 'T1'} vs {teams[f.team2Id]?.abbreviation || 'T2'}</option>;
            })}
          </select>
        </label>
        <button className="btn small success" type="button" disabled={!ready} onClick={() => onLoad(selected)} data-testid={`${mode}-load-submitted-lineup`}>Load submitted lines</button>
      </div>
      <p className="hint">{team1?.name || 'Team 1'} vs {team2?.name || 'Team 2'} · {revealed ? (ready ? 'Revealed and ready to load into score entry.' : 'Revealed, but submitted lineup data is incomplete.') : (ready ? 'Both lineups are locked and ready while the reveal record syncs.' : 'Waiting for both captains to submit before line details are available.')}</p>
      {eligibilityErrors.length > 0 && <div className="error-box" style={{ whiteSpace: 'pre-line', marginTop: '.65rem' }} data-testid={`${mode}-revealed-lineup-eligibility-error`}>Eligibility warning — lines can still be loaded, but save will re-check these rules:\n{eligibilityErrors.join('\n')}</div>}
    </div>
  );
}

function FormEntry({ teams, matches, schedule, lineupSubmissions, revealedLineups, eligibilityRules, onScoreSaved, team1Id, setTeam1Id, team2Id, setTeam2Id, targetScheduleId = '', targetRevealId = '' }) {
  const { session } = useAuth();
  const teamList = Object.values(teams || {});
  const myTeam = session.role === ROLES.CAPTAIN ? teams[session.teamId] : null;
  const isAdmin = isAdminRole(session);


  const [courts, setCourts] = useState(() => COURT_TEMPLATES.map(t => newCourt(t.label, t.type, t.setCount)));
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [success, setSuccess] = useState('');
  const [shareText, setShareText] = useState('');
  const [pendingRecord, setPendingRecord] = useState(null);
  const [saving, setSaving] = useState(false);
  const [selectedScheduleId, setSelectedScheduleId] = useState('');
  const [autoLoadedRevealId, setAutoLoadedRevealId] = useState('');
  const [loadedLineupFixture, setLoadedLineupFixture] = useState(null);
  const [visibleSetCounts, setVisibleSetCounts] = useState({});
  const [collapsedCourts, setCollapsedCourts] = useState({});
  const [editingCollapsedCourts, setEditingCollapsedCourts] = useState({});

  useEffect(() => {
    if (myTeam?.id && !team1Id) setTeam1Id(myTeam.id);
  }, [myTeam, setTeam1Id, team1Id]);

  useEffect(() => {
    if (!targetScheduleId) return;
    const fixture = schedule?.[targetScheduleId];
    if (!fixture?.team1Id || !fixture?.team2Id) return;
    if (myTeam?.id && [fixture.team1Id, fixture.team2Id].includes(myTeam.id)) {
      const opponentId = fixture.team1Id === myTeam.id ? fixture.team2Id : fixture.team1Id;
      if (team1Id !== myTeam.id) setTeam1Id(myTeam.id);
      if (team2Id !== opponentId) setTeam2Id(opponentId);
      return;
    }
    if (!myTeam?.id) {
      if (team1Id !== fixture.team1Id) setTeam1Id(fixture.team1Id);
      if (team2Id !== fixture.team2Id) setTeam2Id(fixture.team2Id);
    }
  }, [targetScheduleId, schedule, myTeam, team1Id, team2Id, setTeam1Id, setTeam2Id]);

  const team1 = teams[team1Id];
  const team2 = teams[team2Id];
  const opponentList = groupFilteredOpponents(teamList, team1);
  const targetFixture = targetScheduleId ? schedule?.[targetScheduleId] : null;
  const submittedLineupFixtures = useMemo(() => scoreLineupFixtures(schedule, revealedLineups, lineupSubmissions, team1Id, team2Id, teams, matches, eligibilityRules), [schedule, revealedLineups, lineupSubmissions, team1Id, team2Id, teams, matches, eligibilityRules]);

  // Clear form state when teams change (user explicitly picks different teams)
  const prevTeamPairRef = useRef('');
  useEffect(() => {
    const pair = `${team1Id}|${team2Id}`;
    if (pair === prevTeamPairRef.current) return;
    // Don't clear if the change was triggered by auto-loading from a targetScheduleId
    const fixture = targetScheduleId ? schedule?.[targetScheduleId] : null;
    const autoSet = fixture && team1Id && team2Id &&
      ((team1Id === fixture.team1Id && team2Id === fixture.team2Id) ||
       (myTeam?.id && [fixture.team1Id, fixture.team2Id].includes(team1Id)));
    if (!autoSet && prevTeamPairRef.current) {
      setError(''); setSuccess(''); setShareText(''); setPendingRecord(null);
    }
    if (team1 && team2 && !teamsShareGroup(team1, team2)) setTeam2Id('');
    prevTeamPairRef.current = pair;
  }, [team1Id, team2Id, team1, team2, targetScheduleId, schedule, myTeam, setTeam2Id]);

  useEffect(() => {
    const exact = submittedLineupFixtures.find(row => lineupFixtureMatchesTarget(row, targetScheduleId, targetRevealId));
    const target = exact || (submittedLineupFixtures.length === 1 ? submittedLineupFixtures[0] : null);
    if (!target?.ready || autoLoadedRevealId === target.revealId) return;
    setSelectedScheduleId(target.revealId);
    setCourts(buildLineupCourts(target.team1Names, target.team2Names));
    setLoadedLineupFixture(target);
    recordLineupAudit({ actionType: 'Lineup Loaded For Score Entry', session, scheduleId: target.item.id, teamId: session.teamId || team1Id, metadata: { revealId: target.revealId, revealCode: target.revealCode, source: target.source, viewedAt: Date.now() } }).catch(() => {});
    setShareText(''); setPendingRecord(null);
    setAutoLoadedRevealId(target.revealId);

    // Show validation status after lineup loads
    if (session.role === ROLES.CAPTAIN) {
      const schedId = target.item?.id;
      const mySubmission = schedId ? lineupSubmissions?.[schedId]?.[session.teamId] : null;
      const fixture = schedId ? schedule?.[schedId] : null;
      const isPlayoff = fixture?.matchType === 'playoff' || !fixture?.group;
      if (!isPlayoff && mySubmission?.scoreSavedAt) {
        setError('⚠️ You have already submitted a score for this match. Only one score submission is allowed per team per round-robin match.');
        setSuccess('');
      } else {
        setSuccess(`Loaded submitted dashboard lineup for schedule code ${target.revealCode || fixtureCode(target.item)}.`);
        setError('');
      }
    } else {
      setSuccess(`Loaded submitted dashboard lineup for schedule code ${target.revealCode || fixtureCode(target.item)}.`);
      setError('');
    }
  }, [submittedLineupFixtures, autoLoadedRevealId, session, team1Id, targetScheduleId, targetRevealId, lineupSubmissions, schedule]);

  const updateCourt = (idx, patch) => {
    setPendingRecord(null);
    setShareText('');
    setFieldErrors(errors => {
      const court = courts[idx];
      if (!court?.label || !errors[court.label]) return errors;
      const next = { ...errors };
      delete next[court.label];
      return next;
    });
    setCourts(cs => cs.map((c, i) => i === idx ? { ...c, ...patch } : c));
  };

  // Determine if save should be blocked for captain (lines not submitted, or score already saved for RR match)
  const scoreBlocked = useMemo(() => {
    if (session.role !== ROLES.CAPTAIN) return false;
    const schedId = loadedLineupFixture?.item?.id || targetScheduleId;
    if (!schedId) return false;
    const mySubmission = lineupSubmissions?.[schedId]?.[session.teamId];
    if (!mySubmission?.lockedAt) return true;
    const fixture = schedule?.[schedId];
    const isPlayoff = fixture?.matchType === 'playoff' || !fixture?.group;
    if (!isPlayoff && mySubmission?.scoreSavedAt) return true;
    return false;
  }, [session, loadedLineupFixture, targetScheduleId, lineupSubmissions, schedule]);

  // Find existing submitted match record for this schedule to display read-only
  const existingMatch = useMemo(() => {
    const schedId = loadedLineupFixture?.item?.id || targetScheduleId;
    if (!schedId || !scoreBlocked) return null;
    const mySubmission = lineupSubmissions?.[schedId]?.[session.teamId];
    if (!mySubmission?.scoreSavedAt) return null;
    return (matches || []).find(m => m.scheduleId === schedId || m.matchScheduleId === schedId) || null;
  }, [scoreBlocked, loadedLineupFixture, targetScheduleId, lineupSubmissions, session, matches]);

  const totals = useMemo(() => {
    let totalG1 = 0, totalG2 = 0, totalS1 = 0, totalS2 = 0, w1 = 0, w2 = 0;
    courts.forEach(c => {
      const r = computeCourt(c);
      totalG1 += r.g1; totalG2 += r.g2;
      totalS1 += r.s1; totalS2 += r.s2;
      if (r.winnerTeamNum === 1) w1++;
      else if (r.winnerTeamNum === 2) w2++;
    });
    return { totalG1, totalG2, totalS1, totalS2, w1, w2 };
  }, [courts]);

  const visibleSetCountForCourt = (court, idx) => {
    const firstTwo = computeCourt({ ...court, sets: court.sets.slice(0, 2) });
    const needsDoublesThird = court.type === 'doubles' && firstTwo.s1 === 1 && firstTwo.s2 === 1;
    const highestEntered = court.sets.reduce((max, set, setIdx) => {
      if (court.type === 'doubles' && !needsDoublesThird && setIdx >= 2) return max;
      return set.a !== '' || set.b !== '' || set.tieA !== '' || set.tieB !== '' ? setIdx + 1 : max;
    }, 0);
    const defaultCount = court.type === 'singles' ? 3 : (needsDoublesThird ? 3 : 2);
    return Math.min(court.sets.length, Math.max(visibleSetCounts[idx] || defaultCount, highestEntered));
  };

  const showMoreSets = (idx) => {
    setVisibleSetCounts(counts => ({ ...counts, [idx]: Math.min(5, (counts[idx] || 3) + 2) }));
  };

  const courtScoreReady = (court) => {
    if (!courtHasEntry(court)) return false;
    const result = computeCourt(court);
    if (!result.winnerTeamNum) return false;
    return validateLineScore({ label: court.label, type: court.type, sets: result.sets }).length === 0;
  };

  useEffect(() => {
    setCollapsedCourts(previous => {
      const next = { ...previous };
      courts.forEach((court, idx) => {
        if (courtScoreReady(court) && !editingCollapsedCourts[idx]) next[idx] = true;
        if (!courtScoreReady(court)) delete next[idx];
      });
      return next;
    });
  }, [courts, editingCollapsedCourts]);

  const enteredCourts = courts.filter(courtHasEntry);
  const canPreviewSaveScore = enteredCourts.length > 0 && enteredCourts.every(courtScoreReady) && totals.w1 !== totals.w2;


  const handleSubmit = async () => {
    setError(''); setFieldErrors({}); setSuccess(''); setShareText(''); setPendingRecord(null);
    if (!team1 || !team2) { setError('Please choose both teams.'); return; }
    if (team1.id === team2.id) { setError('Teams must be different.'); return; }
    if (!teamsShareGroup(team1, team2)) { setError('Teams can only play opponents in the same group.'); return; }

    // For team captains, must include their own team
    if (session.role === ROLES.CAPTAIN && team1.id !== session.teamId && team2.id !== session.teamId) {
      setError('Your team must be involved in the match.');
      return;
    }

    // Lines must be submitted before score entry (captains only)
    if (session.role === ROLES.CAPTAIN) {
      const schedId = loadedLineupFixture?.item?.id || targetScheduleId;
      const mySubmission = schedId ? lineupSubmissions?.[schedId]?.[session.teamId] : null;
      if (!mySubmission?.lockedAt) {
        setError('Lines must be submitted and locked before entering a score. Please submit your lineup first.');
        return;
      }

      // One score per team per schedule in round-robin (playoff/final matches are exempt)
      const fixture = schedId ? schedule?.[schedId] : null;
      const isPlayoff = fixture?.matchType === 'playoff' || !fixture?.group;
      if (!isPlayoff && mySubmission?.scoreSavedAt) {
        setError('You have already submitted a score for this match. Only one score submission is allowed per team per round-robin match.');
        return;
      }
    }

    // Validate all player names exist
    const validationErrors = [];
    const nextFieldErrors = {};
    const addValidationError = (message, courtLabel = '') => {
      validationErrors.push(message);
      if (courtLabel) nextFieldErrors[courtLabel] = [...(nextFieldErrors[courtLabel] || []), message];
    };
    const duplicatePlayers = getDuplicatePlayers(courts);
    duplicatePlayers.forEach(n => addValidationError(`Player entered more than once: ${n}`));

    const lines = courts.map((c, idx) => {
      const r = computeCourt(c);
      if (!courtHasEntry(c)) return null; // skip untouched courts
      if (r.sets.length === 0) {
        addValidationError(`${c.label}: add at least one set score or clear the court`, c.label);
        return null;
      }
      const courtValidationErrors = [];
      validateCourtShape(c, r, courtValidationErrors);
      courtValidationErrors.forEach(message => addValidationError(message, c.label));
      const checkSide = (names, team, side) => {
        return names.map((n, i) => {
          const trimmed = (n || '').trim();
          if (!trimmed) {
            addValidationError(`${c.label}: empty ${side} player ${i + 1}`, c.label);
            return trimmed;
          }
          const m = matchName(trimmed, team.players || []);
          if (!m.exact && !m.matched) {
            addValidationError(`${c.label}: "${trimmed}" not found in ${team.name}`, c.label);
            return trimmed;
          }
          return (m.matched || { name: trimmed }).name;
        });
      };
      const p1 = checkSide(c.p1, team1, `${team1.abbreviation}`);
      const p2 = checkSide(c.p2, team2, `${team2.abbreviation}`);
      if (r.winnerTeamNum === null) {
        addValidationError(`${c.label}: no clear winner from scores`, c.label);
      }
      return {
        label: c.label,
        type: c.type,
        g1: r.g1, g2: r.g2,
        sets: r.sets,
        setWins: { team1: r.s1, team2: r.s2 },
        players: { team1: p1, team2: p2 },
        winner: r.winnerTeamNum === 1 ? team1.name : (r.winnerTeamNum === 2 ? team2.name : null)
      };
    }).filter(Boolean);

    if (lines.length === 0) {
      setError('Please enter at least one court with scores.');
      return;
    }
    validateEligibilityForLines(lines, team1, team2, matches, teams, eligibilityRules).forEach(message => addValidationError(message));
    if (validationErrors.length > 0) {
      setFieldErrors(nextFieldErrors);
      setError(validationErrors.join('\n'));
      return;
    }

    const winner = totals.w1 > totals.w2 ? team1.name : (totals.w2 > totals.w1 ? team2.name : null);
    if (!winner) { setError('Match is tied on courts won. Please verify scores.'); return; }

    const record = {
      t1Id: team1.id,
      t2Id: team2.id,
      winnerId: totals.w1 > totals.w2 ? team1.id : team2.id,
      t1: team1.name,
      t2: team2.name,
      t1Abbr: team1.abbreviation,
      t2Abbr: team2.abbreviation,
      g1: totals.totalG1, g2: totals.totalG2,
      s1: totals.totalS1, s2: totals.totalS2,
      courtsWon1: totals.w1, courtsWon2: totals.w2,
      win: winner,
      ts: Date.now(),
      enteredBy: session.role === ROLES.CAPTAIN ? session.teamName : 'Admin',
      status: 'APPROVED',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      updatedBy: session.teamId || session.role,
      approvedBy: session.role,
      scheduleId: loadedLineupFixture?.item?.id || null,
      matchScheduleId: loadedLineupFixture?.item?.id || null,
      revealId: loadedLineupFixture?.revealId || null,
      revealCode: loadedLineupFixture?.revealCode || null,
      lineupSource: loadedLineupFixture?.source || (loadedLineupFixture ? 'revealedLineups' : 'manual'),
      lines
    };

    setPendingRecord(record);
    setShareText(formatMatchShareText(record));
    setSuccess('📋 Preview ready. Copy/share the WhatsApp message, then confirm to save this result to the database.');
  };

  const confirmSave = async () => {
    if (!pendingRecord) return;
    try {
      setSaving(true);
      await ensureAuth();
      const saved = await ScoreProcessingService.updateAfterScoreEntry(pendingRecord, { session });
      await markLineupConvertedToScore(pendingRecord, session);
      const savedRecord = { ...saved.matchRecord, scheduleId: pendingRecord.scheduleId, matchScheduleId: pendingRecord.matchScheduleId, revealId: pendingRecord.revealId, revealCode: pendingRecord.revealCode, lineupSource: pendingRecord.lineupSource };
      onScoreSaved?.(savedRecord);
      await writeAuditLog({ actionType: 'Score Entry', session, targetType: 'match', targetId: saved.key, newValue: savedRecord });
      setSuccess(`✅ Saved and synchronized ratings, standings, histories, and dashboard:  ${pendingRecord.t1} vs ${pendingRecord.t2} — Winner: ${pendingRecord.win}`);
      setShareText(formatMatchShareText(savedRecord));
      setPendingRecord(null);
      setVisibleSetCounts({});
      setCollapsedCourts({});
      setEditingCollapsedCourts({});
      setCourts(COURT_TEMPLATES.map(t => newCourt(t.label, t.type, t.setCount)));
    } catch (e) {
      setError('Save failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {myTeam && <p className="hint" style={{ marginBottom: '.7rem' }}>Captain: {myTeam.name}</p>}

      {error && <div className="error-box" data-testid="score-error" style={{ whiteSpace: 'pre-line' }}>{error}</div>}
      {success && <div className="success-box" data-testid="score-success">{success}</div>}
      {pendingRecord && (
        <ResultPreviewModal
          text={shareText}
          saving={saving}
          onConfirm={confirmSave}
          onCancel={() => { setPendingRecord(null); setShareText(''); setSuccess(''); }}
          confirmTestId="confirm-save-db-btn"
          cancelTestId="cancel-save-db-btn"
          modalTestId="score-save-confirmation-modal"
        />
      )}

      {targetFixture && (
        <div className="score-target-banner" data-testid="score-target-banner">
          <div>
            <strong>Scoring scheduled match</strong>
            <span>Round {targetFixture.round || '—'} · {targetFixture.date || 'TBD'} · {targetFixture.time || 'TBD'}</span>
          </div>
          <span className="tag">{targetRevealId || targetScheduleId}</span>
        </div>
      )}

      <div className="card score-teams-card">
        <h2>Match teams</h2>
        <div className="row score-teams-row">
          <div>
            <div className="field-label">Your team</div>
            <select
              className="select"
              value={team1Id}
              onChange={e => setTeam1Id(e.target.value)}
              disabled={!isAdmin && !!myTeam}
              data-testid="team1-select"
            >
              <option value="">— Select —</option>
              {teamList.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <span className="vs">vs</span>
          <div>
            <div className="field-label">Opponent {team1 ? `· Group ${teamGroup(team1)}` : ''}</div>
            <select
              className="select"
              value={team2Id}
              onChange={e => setTeam2Id(e.target.value)}
              data-testid="team2-select"
            >
              <option value="">— Select —</option>
              {opponentList.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {team1 && team2 && submittedLineupFixtures.length > 0 && (
        <ScoreLineupLoader
          fixtures={submittedLineupFixtures}
          teams={teams}
          selectedId={selectedScheduleId || targetRevealId || targetScheduleId}
          onSelectedId={setSelectedScheduleId}
          mode="form"
          onLoad={(row) => { setCourts(buildLineupCourts(row.team1Names, row.team2Names)); setLoadedLineupFixture(row); recordLineupAudit({ actionType: 'Lineup Loaded For Score Entry', session, scheduleId: row.item.id, teamId: session.teamId || team1Id, metadata: { revealId: row.revealId, revealCode: row.revealCode, viewedAt: Date.now() } }).catch(() => {}); setError(''); setSuccess(`Loaded submitted dashboard lineup for schedule code ${fixtureCode(row.item)}.`); setShareText(''); setPendingRecord(null); }}
        />
      )}

      {scoreBlocked && !existingMatch && session.role === ROLES.CAPTAIN && (
        <div className="card" style={{ border: '1.5px solid #f97316', background: '#fff7ed' }} data-testid="score-lines-required">
          <h2 style={{ marginTop: 0, color: '#c2410c' }}>⚠️ Lineup Required Before Score Entry</h2>
          <p style={{ color: '#9a3412', margin: 0 }}>Your lineup must be submitted and locked on the Captain Dashboard before you can enter a score for this match.</p>
          <a className="btn small" href="/home" style={{ marginTop: '.75rem', display: 'inline-block', background: '#f97316', color: '#fff' }}>Go to Captain Dashboard</a>
        </div>
      )}

      {existingMatch && (
        <div className="card" style={{ border: '1.5px solid #10b981', background: '#f0fdf4' }} data-testid="score-already-submitted-summary">
          <h2 style={{ marginTop: 0, color: '#065f46' }}>✅ Score Already Submitted</h2>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '.75rem' }}>
            <div><span className="muted" style={{ fontSize: '.8rem' }}>Result</span><div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{existingMatch.t1Abbr || existingMatch.t1} {existingMatch.courtsWon1}–{existingMatch.courtsWon2} {existingMatch.t2Abbr || existingMatch.t2}</div></div>
            <div><span className="muted" style={{ fontSize: '.8rem' }}>Winner</span><div style={{ fontWeight: 700 }}>{existingMatch.win}</div></div>
            <div><span className="muted" style={{ fontSize: '.8rem' }}>Games</span><div>{existingMatch.g1}–{existingMatch.g2}</div></div>
            <div><span className="muted" style={{ fontSize: '.8rem' }}>Sets</span><div>{existingMatch.s1}–{existingMatch.s2}</div></div>
          </div>
          {existingMatch.lines?.length > 0 && (
            <div style={{ display: 'grid', gap: '.35rem' }}>
              {existingMatch.lines.map((line, i) => (
                <div key={i} style={{ display: 'flex', gap: '.6rem', alignItems: 'center', fontSize: '.85rem', padding: '.3rem .5rem', borderRadius: 6, background: '#fff' }}>
                  <span style={{ fontWeight: 600, minWidth: 80, color: '#374151' }}>{line.label}</span>
                  <span>{(line.players?.team1 || []).join(' / ')}</span>
                  <span className="muted">vs</span>
                  <span>{(line.players?.team2 || []).join(' / ')}</span>
                  <span style={{ marginLeft: 'auto', fontWeight: 700 }}>{line.g1}–{line.g2}</span>
                </div>
              ))}
            </div>
          )}
          <p className="hint" style={{ marginTop: '.75rem', marginBottom: 0 }}>Contact an admin if this score needs to be corrected.</p>
        </div>
      )}

      {team1 && team2 && !scoreBlocked && submittedLineupFixtures.length === 0 && (
        <div className="card score-lineup-loader" data-testid="form-score-lineup-pending">
          <h2>Official lineup pending</h2>
          <p className="hint">Score lines are loaded only after both captains submit and lock their dashboard lineups. Manual lineup selection is no longer available on Score Entry.</p>
        </div>
      )}

      {team1 && team2 && !scoreBlocked && courts.map((c, idx) => {
        const status = courtCompletion(c);
        const result = computeCourt(c);
        const winnerName = result.winnerTeamNum === 1 ? team1.name : (result.winnerTeamNum === 2 ? team2.name : 'Winner pending');
        const setSummary = formatSetsForShare(result.sets);
        const isCollapsed = collapsedCourts[idx] && courtScoreReady(c);
        if (isCollapsed) {
          return (
            <div className={`match-line court-card classic collapsed ${status.status}`} key={idx} data-testid={`court-${idx}-collapsed`}>
              <div className="court-card-head">
                <h3>{c.label}</h3>
                <span className="tag">{c.type}</span>
                <span className="tag win">{winnerName} won</span>
                <button type="button" className="btn small ghost court-edit-btn" onClick={() => { setCollapsedCourts(prev => ({ ...prev, [idx]: false })); setEditingCollapsedCourts(prev => ({ ...prev, [idx]: true })); }} data-testid={`court-${idx}-edit`}>Edit</button>
              </div>
              <div className="court-collapse-summary">
                <strong>{setSummary}</strong>
                <span className="muted">Games {result.g1}-{result.g2} · Sets {result.s1}-{result.s2}</span>
              </div>
            </div>
          );
        }
        return (
        <div className={`match-line court-card classic ${status.status}`} key={idx}>
          <div className="court-card-head">
            <h3>{c.label}</h3>
            <span className="tag">{c.type}</span>
            <span className={`tag status ${status.status}`}>{status.message}</span>
            {courtScoreReady(c) && editingCollapsedCourts[idx] && (
              <button type="button" className="btn small ghost court-edit-btn" onClick={() => { setEditingCollapsedCourts(prev => ({ ...prev, [idx]: false })); setCollapsedCourts(prev => ({ ...prev, [idx]: true })); }} data-testid={`court-${idx}-done`}>Done</button>
            )}
          </div>

          <div className="score-entry-grid">
          <div className="player-entry-col">
            <div className="field-label player-line-label">{team1.abbreviation} player{c.type === 'doubles' ? 's' : ''}</div>
            {c.p1.map((n, i) => (
              <div className="compact-field" key={i}>
                <PlayerInput
                  value={n}
                  onChange={(v) => updateCourt(idx, { p1: c.p1.map((x, j) => j === i ? v : x) })}
                  roster={team1.players || []}
                  teamAbbr={team1.abbreviation}
                  testid={`court-${idx}-p1-${i}`}
                />
              </div>
            ))}
          </div>

          <div className="player-entry-col">
            <div className="field-label player-line-label">{team2.abbreviation} player{c.type === 'doubles' ? 's' : ''}</div>
            {c.p2.map((n, i) => (
              <div className="compact-field" key={i}>
                <PlayerInput
                  value={n}
                  onChange={(v) => updateCourt(idx, { p2: c.p2.map((x, j) => j === i ? v : x) })}
                  roster={team2.players || []}
                  teamAbbr={team2.abbreviation}
                  testid={`court-${idx}-p2-${i}`}
                />
              </div>
            ))}
          </div>

          <div className="sets-entry-col">
          <div className="score-sets-head">
            <div className="field-label">Sets ({team1.abbreviation} – {team2.abbreviation})</div>
            {c.type === 'singles' && visibleSetCountForCourt(c, idx) < c.sets.length && (
              <button type="button" className="btn small ghost add-sets-btn" onClick={() => showMoreSets(idx)} data-testid={`court-${idx}-add-sets`}>+ Add sets 4–5</button>
            )}
          </div>
          <div className="sets-card-grid">
            {c.sets.slice(0, visibleSetCountForCourt(c, idx)).map((s, i) => (
              <div key={i} data-testid={`court-${idx}-set-${i}-row`}>
                <SetRow idx={i} set={s} isMatchTieBreak={c.type === 'doubles' && i === 2 && computeCourt({ ...c, sets: c.sets.slice(0, 2) }).s1 === 1 && computeCourt({ ...c, sets: c.sets.slice(0, 2) }).s2 === 1} disabled={i > 0 && c.sets[i - 1].a === '' && c.sets[i - 1].b === ''} team1Abbr={team1.abbreviation} team2Abbr={team2.abbreviation} onChange={(ns) => updateCourt(idx, { sets: c.sets.map((x, j) => j === i ? ns : x) })} />
              </div>
            ))}
          </div>
          </div>
          </div>
          {fieldErrors[c.label]?.length > 0 && (
            <div className="field-error-list" data-testid={`court-${idx}-field-errors`}>
              {fieldErrors[c.label].map((message, errorIdx) => <div key={errorIdx}>⚠️ {message}</div>)}
            </div>
          )}
        </div>
        );
      })}

      {team1 && team2 && !scoreBlocked && (
        <div className="card">
          <h2>📊 Summary</h2>
          <div data-testid="score-summary">
            <div className="score-summary-teams">
              <span className="team-logo-line"><TeamLogo team={team1} size={32} /><strong>{team1.abbreviation}</strong></span>
              <span>{totals.totalG1} - {totals.totalG2}</span>
              <span className="team-logo-line"><TeamLogo team={team2} size={32} /><strong>{team2.abbreviation}</strong></span>
            </div>
            <div className="muted">Sets: {totals.totalS1}-{totals.totalS2} · Courts won: {totals.w1}-{totals.w2}</div>
            <div style={{ marginTop: '.5rem' }}>
              {totals.w1 > totals.w2 && <span className="tag win" data-testid="winner-tag">{team1.name} leading</span>}
              {totals.w2 > totals.w1 && <span className="tag win" data-testid="winner-tag">{team2.name} leading</span>}
              {totals.w1 === totals.w2 && (totals.w1 + totals.w2) > 0 && <span className="tag tie" data-testid="winner-tag">Tied</span>}
            </div>
          </div>
          <button
            className="btn success full"
            style={{ marginTop: '.8rem' }}
            onClick={handleSubmit}
            disabled={saving || scoreBlocked || !canPreviewSaveScore}
            title={!canPreviewSaveScore ? 'Complete each entered court before saving' : undefined}
            data-testid="submit-score-btn"
          >
            {saving ? 'Saving...' : 'Preview & Confirm Save'}
          </button>
        </div>
      )}
    </>
  );
}

// ==================== QUICK PASTE ENTRY ====================

function QuickEntry({ teams, matches, schedule, lineupSubmissions, revealedLineups, eligibilityRules, onScoreSaved, team1Id, setTeam1Id, team2Id, setTeam2Id, lineupState }) {
  const { session } = useAuth();
  const textareaRef = useRef(null);
  const [text, setText] = useState('');
  const [cursor, setCursor] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [shareText, setShareText] = useState('');
  const [pendingRecord, setPendingRecord] = useState(null);
  const [saving, setSaving] = useState(false);
  const [selectedScheduleId, setSelectedScheduleId] = useState('');
  const [autoLoadedRevealId, setAutoLoadedRevealId] = useState('');
  const [loadedLineupFixture, setLoadedLineupFixture] = useState(null);
  const teamList = Object.values(teams || {});
  const myTeam = session.role === ROLES.CAPTAIN ? teams[session.teamId] : null;
  const isAdmin = isAdminRole(session);
  const selectedTeam1 = teams[team1Id];
  const selectedTeam2 = teams[team2Id];
  const opponentList = groupFilteredOpponents(teamList, selectedTeam1);
  const submittedLineupFixtures = useMemo(() => scoreLineupFixtures(schedule, revealedLineups, lineupSubmissions, team1Id, team2Id, teams, matches, eligibilityRules), [schedule, revealedLineups, lineupSubmissions, team1Id, team2Id, teams, matches, eligibilityRules]);

  useEffect(() => {
    if (myTeam?.id && !team1Id) setTeam1Id(myTeam.id);
  }, [myTeam, setTeam1Id, team1Id]);

  useEffect(() => {
    if (selectedTeam2 && !teamsShareGroup(selectedTeam1, selectedTeam2)) setTeam2Id('');
  }, [selectedTeam1, selectedTeam2, setTeam2Id]);

  useEffect(() => {
    const only = submittedLineupFixtures.length === 1 ? submittedLineupFixtures[0] : null;
    if (!only?.ready || !selectedTeam1 || !selectedTeam2 || autoLoadedRevealId === only.revealId) return;
    setText(buildQuickLineupText(selectedTeam1, selectedTeam2, only.team1Names, only.team2Names));
    setLoadedLineupFixture(only);
    recordLineupAudit({ actionType: 'Lineup Loaded For Score Entry', session, scheduleId: only.item.id, teamId: session.teamId || team1Id, metadata: { revealId: only.revealId, revealCode: only.revealCode, viewedAt: Date.now() } }).catch(() => {});
    setSuccess(`Loaded submitted dashboard lineup for schedule code ${fixtureCode(only.item)}.`);
    setError(''); setShareText(''); setPendingRecord(null);
    setAutoLoadedRevealId(only.revealId);
  }, [submittedLineupFixtures, selectedTeam1, selectedTeam2, autoLoadedRevealId, session, team1Id]);

  const parsed = useMemo(() => parseQuickScore(text, teams), [text, teams]);
  const quickTemplate = useMemo(() => getQuickTemplate(teams), [teams]);
  const guidance = useMemo(() => getQuickGuidance(text, parsed, teams), [text, parsed, teams]);
  const normalizedText = useMemo(() => normalizeQuickText(text, teams), [text, teams]);
  const canNormalize = text.trim() && normalizedText !== text;
  const applyTemplate = () => { setText(quickTemplate); setError(''); setSuccess(''); setShareText(''); setPendingRecord(null); };
  const applyNormalize = () => { setText(normalizedText); setError(''); setSuccess(''); setShareText(''); setPendingRecord(null); };
  const quickNameContext = useMemo(() => getQuickNameContext(text, cursor, parsed, teams), [text, cursor, parsed, teams]);
  const updateCursorFromTextarea = (element) => setCursor(element.selectionStart || 0);
  const applyQuickSuggestion = (name) => {
    if (!quickNameContext) return;
    const nextText = `${text.slice(0, quickNameContext.replaceStart)}${name}${text.slice(quickNameContext.replaceEnd)}`;
    const nextCursor = quickNameContext.replaceStart + name.length;
    setText(nextText);
    setCursor(nextCursor);
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(nextCursor, nextCursor);
      }
    });
  };
  const applyQuickTextChange = (value, selectionStart) => {
    setShareText('');
    setPendingRecord(null);
    const nextParsed = parseQuickScore(value, teams);
    const nextContext = getQuickNameContext(value, selectionStart, nextParsed, teams);
    const autoName = nextContext ? autoCompleteUniqueRosterName(nextContext.query, nextContext.suggestions) : null;
    if (autoName && autoName !== nextContext.query) {
      const nextText = `${value.slice(0, nextContext.replaceStart)}${autoName}${value.slice(nextContext.replaceEnd)}`;
      const nextCursor = nextContext.replaceStart + autoName.length;
      setText(nextText);
      setCursor(nextCursor);
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(nextCursor, nextCursor);
        }
      });
      return;
    }
    setText(value);
    setCursor(selectionStart || 0);
  };

  const handleSubmit = async () => {
    setError(''); setSuccess(''); setShareText(''); setPendingRecord(null);
    const { results, errors, team1, team2 } = parsed;
    if (!team1 || !team2) { setError(errors.join('\n') || 'Could not detect teams.'); return; }
    if (errors.length > 0) { setError(errors.join('\n')); return; }
    if (!teamsShareGroup(team1, team2)) { setError('Teams can only play opponents in the same group.'); return; }
    if (results.length === 0) { setError('No valid courts parsed.'); return; }

    // Team-captain restriction
    if (session.role === ROLES.CAPTAIN && team1.id !== session.teamId && team2.id !== session.teamId) {
      setError('Your team must be involved in the match.');
      return;
    }

    let totalG1 = 0, totalG2 = 0, totalS1 = 0, totalS2 = 0, w1 = 0, w2 = 0;
    const lines = results.map(r => {
      totalG1 += r.g1; totalG2 += r.g2;
      totalS1 += r.sets1; totalS2 += r.sets2;
      if (r.winnerTeamNum === 1) w1++;
      else if (r.winnerTeamNum === 2) w2++;
      return {
        label: r.label,
        type: r.type,
        g1: r.g1, g2: r.g2,
        sets: r.sets,
        setWins: { team1: r.sets1, team2: r.sets2 },
        players: r.players,
        winner: r.winnerTeamNum === 1 ? team1.name : (r.winnerTeamNum === 2 ? team2.name : null)
      };
    });

    const scoreErrors = lines.flatMap(line => validateLineScore(line));
    if (scoreErrors.length > 0) { setError(scoreErrors.join('\n')); return; }

    const eligibilityErrors = validateEligibilityForLines(lines, team1, team2, matches, teams, eligibilityRules);
    if (eligibilityErrors.length > 0) { setError(eligibilityErrors.join('\n')); return; }

    const winner = w1 > w2 ? team1.name : (w2 > w1 ? team2.name : null);
    if (!winner) { setError('Match is tied on courts won. Please verify scores.'); return; }

    const record = {
      t1Id: team1.id, t2Id: team2.id,
      winnerId: w1 > w2 ? team1.id : team2.id,
      t1: team1.name, t2: team2.name,
      t1Abbr: team1.abbreviation, t2Abbr: team2.abbreviation,
      g1: totalG1, g2: totalG2,
      s1: totalS1, s2: totalS2,
      courtsWon1: w1, courtsWon2: w2,
      win: winner,
      ts: Date.now(),
      enteredBy: session.role === ROLES.CAPTAIN ? session.teamName : 'Admin',
      status: 'APPROVED',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      updatedBy: session.teamId || session.role,
      approvedBy: session.role,
      scheduleId: loadedLineupFixture?.item?.id || null,
      matchScheduleId: loadedLineupFixture?.item?.id || null,
      revealId: loadedLineupFixture?.revealId || null,
      revealCode: loadedLineupFixture?.revealCode || null,
      lineupSource: loadedLineupFixture ? 'revealedLineups' : 'manual',
      lines
    };

    setPendingRecord(record);
    setShareText(formatMatchShareText(record));
    setSuccess('📋 Preview ready. Copy/share the WhatsApp message, then confirm to save this result to the database.');
  };

  const confirmSave = async () => {
    if (!pendingRecord) return;
    try {
      setSaving(true);
      await ensureAuth();
      const saved = await ScoreProcessingService.updateAfterScoreEntry(pendingRecord, { session });
      await markLineupConvertedToScore(pendingRecord, session);
      const savedRecord = { ...saved.matchRecord, scheduleId: pendingRecord.scheduleId, matchScheduleId: pendingRecord.matchScheduleId, revealId: pendingRecord.revealId, revealCode: pendingRecord.revealCode, lineupSource: pendingRecord.lineupSource };
      onScoreSaved?.(savedRecord);
      await writeAuditLog({ actionType: 'Score Entry', session, targetType: 'match', targetId: saved.key, newValue: savedRecord });
      setSuccess(`✅ Saved and synchronized ratings, standings, histories, and dashboard:  ${pendingRecord.t1} vs ${pendingRecord.t2} — Winner: ${pendingRecord.win}`);
      setShareText(formatMatchShareText(savedRecord));
      setPendingRecord(null);
      setText('');
    } catch (e) {
      setError('Save failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const { results, errors, team1, team2 } = parsed;

  const placeholder = `Paste match results here...

KOC3 format:
KC vs ML
S1: Srini vs Bharath
4-3, 4-2, 0-4, 4-2 (won) KC
D1: Dinkar / Satya vs Rajasekar Karru / Mohan
4-3, 1-4, 1-0 (won) KC
D1: Dinkar / Satya vs Anil / Raja
3-4, 1-4 (won) ML
D2: Srikanth / Lloyd vs Anil / Raja
0-4, 2-4 (won) ML
D2: Srikanth / Lloyd vs Rajasekar Karru / Mohan
4-1, 4-2 (won) KC
Final: KC won 3-2`;

  let totG1 = 0, totG2 = 0, tw1 = 0, tw2 = 0;
  results.forEach(r => {
    totG1 += r.g1; totG2 += r.g2;
    if (r.winnerTeamNum === 1) tw1++;
    else if (r.winnerTeamNum === 2) tw2++;
  });

  return (
    <>
      {error && <div className="error-box" data-testid="quick-error" style={{ whiteSpace: 'pre-line' }}>{error}</div>}
      {success && <div className="success-box" data-testid="quick-success">{success}</div>}
      {pendingRecord && (
        <ResultPreviewModal
          text={shareText}
          saving={saving}
          onConfirm={confirmSave}
          onCancel={() => { setPendingRecord(null); setShareText(''); setSuccess(''); }}
          confirmTestId="quick-confirm-save-db-btn"
          cancelTestId="quick-cancel-save-db-btn"
          modalTestId="quick-save-confirmation-modal"
        />
      )}

      <div className="card score-teams-card">
        <h2>Match teams</h2>
        <div className="row score-teams-row">
          <div>
            <div className="field-label">Team 1</div>
            <select className="select" value={team1Id} onChange={e => setTeam1Id(e.target.value)} disabled={!isAdmin && !!myTeam} data-testid="quick-team1-select">
              <option value="">— Select —</option>
              {teamList.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <span className="vs">vs</span>
          <div>
            <div className="field-label">Team 2 {selectedTeam1 ? `· Group ${teamGroup(selectedTeam1)}` : ''}</div>
            <select className="select" value={team2Id} onChange={e => setTeam2Id(e.target.value)} data-testid="quick-team2-select">
              <option value="">— Select —</option>
              {opponentList.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {selectedTeam1 && selectedTeam2 && submittedLineupFixtures.length > 0 && (
        <ScoreLineupLoader
          fixtures={submittedLineupFixtures}
          teams={teams}
          selectedId={selectedScheduleId}
          onSelectedId={setSelectedScheduleId}
          mode="quick"
          onLoad={(row) => { setText(buildQuickLineupText(selectedTeam1, selectedTeam2, row.team1Names, row.team2Names)); setLoadedLineupFixture(row); recordLineupAudit({ actionType: 'Lineup Loaded For Score Entry', session, scheduleId: row.item.id, teamId: session.teamId || team1Id, metadata: { revealId: row.revealId, revealCode: row.revealCode, viewedAt: Date.now() } }).catch(() => {}); setError(''); setSuccess(`Loaded submitted dashboard lineup for schedule code ${fixtureCode(row.item)}.`); setShareText(''); setPendingRecord(null); }}
        />
      )}

      {selectedTeam1 && selectedTeam2 && submittedLineupFixtures.length === 0 && (
        <LineupBuilder
          team1={selectedTeam1}
          team2={selectedTeam2}
          teams={teams}
          matches={matches}
          eligibilityRules={eligibilityRules}
          team1Selected={lineupState.team1Lineup}
          setTeam1Selected={lineupState.setTeam1Lineup}
          team2Selected={lineupState.team2Lineup}
          setTeam2Selected={lineupState.setTeam2Lineup}
          onPopulateQuick={(nextText) => { setText(nextText); setError(''); setSuccess(''); setShareText(''); setPendingRecord(null); }}
        />
      )}

      <div className="card quick-entry-card">
        <div className="quick-entry-head">
          <div>
            <h2>⚡ Quick Score Entry</h2>
            <p className="hint">Paste messy scores, then use Auto-format and the live coach to fix the format.</p>
          </div>
          <div className="quick-actions">
            <button className="btn ghost small" onClick={applyTemplate} type="button" data-testid="quick-template-btn">Use example</button>
            <button className="btn small" onClick={applyNormalize} disabled={!canNormalize} type="button" data-testid="quick-normalize-btn">Auto-format</button>
          </div>
        </div>
        <div className="quick-layout">
          <div>
            <div className="quick-textarea-wrap">
              <textarea
                ref={textareaRef}
                className="textarea quick-textarea"
                value={text}
                onChange={e => {
                  applyQuickTextChange(e.target.value, e.target.selectionStart || 0);
                }}
                onClick={e => updateCursorFromTextarea(e.target)}
                onKeyUp={e => updateCursorFromTextarea(e.target)}
                onSelect={e => updateCursorFromTextarea(e.target)}
                onKeyDown={(e) => {
                  if ((e.key === 'Tab' || e.key === 'Enter') && quickNameContext?.suggestions?.[0]) {
                    e.preventDefault();
                    applyQuickSuggestion(quickNameContext.suggestions[0].name);
                  }
                }}
                placeholder={placeholder}
                data-testid="quick-textarea"
              />
              {quickNameContext && (
                <div className="suggest quick-suggest" data-testid="quick-name-suggest">
                  <div className="suggest-hint">Choose a {quickNameContext.teamAbbr} player, or press Enter/Tab for the first match</div>
                  {quickNameContext.suggestions.map((s, i) => (
                    <div
                      key={s.name || i}
                      className="suggest-item"
                      onMouseDown={(e) => { e.preventDefault(); applyQuickSuggestion(s.name); }}
                      data-testid={`quick-name-suggest-${i}`}
                    >
                      {s.isCaptain ? '🏆 ' : ''}{s.name}
                      {s.teamAbbr && <span className="score">{s.teamAbbr}</span>}
                      {typeof s.score === 'number' && <span className="score">{Math.round(s.score * 100)}% match</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <p className="hint">
              Team abbrs: {Object.values(teams || {}).map(t => t.abbreviation).join(', ')}
            </p>
          </div>
          <aside className="format-coach" data-testid="quick-format-coach">
            <h3>Format coach</h3>
            <code>{'{TEAM1} vs {TEAM2}'}</code>
            <code>S1: Player vs Player 4-2,4-1,4-0 (won) TEAM1</code>
            <code>D1: P1/P2 vs P3/P4 4-3,1-4,1-0 (won) TEAM2</code>
            <div className="divider" />
            {guidance.map((tip, i) => <p key={i} className="coach-tip">💡 {tip}</p>)}
          </aside>
        </div>
      </div>

      {text.trim() && (
        <div className="card" data-testid="quick-preview">
          <h2>📋 Preview</h2>
          {errors.length > 0 && (
            <div className="error-box" style={{ whiteSpace: 'pre-line' }}>
              {errors.map(e => `❌ ${e}`).join('\n')}
            </div>
          )}
          {parsed.corrections?.length > 0 && (
            <div className="success-box" style={{ whiteSpace: 'pre-line' }} data-testid="quick-corrections">
              {parsed.corrections.map(c => `✨ ${c}`).join('\n')}
            </div>
          )}
          {team1 && team2 && results.length > 0 && (
            <>
              <div className="match-line" style={{ background: '#d1fae5', borderLeft: '4px solid #10b981' }}>
                <strong>📊 {team1.name} {totG1}–{totG2} {team2.name}</strong>
                <div className="muted">Courts won: {tw1}-{tw2} → {tw1 > tw2 ? team1.name : (tw2 > tw1 ? team2.name : 'TIE')}</div>
              </div>
              {results.map((r, i) => {
                const winnerAbbr = r.winnerTeamNum === 1 ? team1.abbreviation : team2.abbreviation;
                const setsDisplay = r.sets.map(s => {
                  let str = `${s.team1}-${s.team2}`;
                  if (s.tieBreak) str += `(${s.tieBreak.team1}-${s.tieBreak.team2})`;
                  if (typeof s.matchTieBreak === 'object') str += `(${s.matchTieBreak.team1}-${s.matchTieBreak.team2})`;
                  return str;
                }).join(', ');
                return (
                  <div className="match-line" key={i}>
                    ✅ <strong>{r.label}:</strong> {r.players.team1.join('/')} vs {r.players.team2.join('/')}
                    <div className="muted" style={{ marginTop: '.25rem' }}>
                      {setsDisplay} (games {r.g1}-{r.g2}, won {winnerAbbr})
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {text.trim() && team1 && team2 && results.length > 0 && errors.length === 0 && (
        <button
          className="btn success full"
          onClick={handleSubmit}
          disabled={saving}
          data-testid="quick-submit-btn"
        >
          {saving ? 'Saving...' : 'Preview & Confirm Save'}
        </button>
      )}

      <button
        className="btn ghost full"
        style={{ marginTop: '.5rem' }}
        onClick={() => { setText(''); setError(''); setSuccess(''); setShareText(''); setPendingRecord(null); }}
        data-testid="quick-clear-btn"
      >Clear Input</button>
    </>
  );
}

import React, { useMemo, useState } from 'react';
import { buildPtlRatings } from '../utils/ptlRating';
import { UTR_RATINGS, matchUtrRating } from '../data/utrRatings';

function formatRating(value) {
  return value == null ? '—' : Number(value).toFixed(2);
}



function RatingRows({ players, startRank = 1, highlightQualifiers = true }) {
  return players.map((player, idx) => {
    const rank = startRank + idx;
    const deltaClass = player.ratingDelta > 0 ? 'win' : player.ratingDelta < 0 ? 'lose' : 'tie';
    return (
      <tr key={`${player.teamAbbr}-${player.name}`} className={highlightQualifiers && rank <= 8 && player.courts > 0 ? 'q' : ''} data-testid={`ptl-player-${player.name}`}>
        <td className="rank">{rank}</td>
        <td>
          <strong>{player.name}</strong>
          {player.aliases?.length > 0 && <div className="muted" style={{ fontSize: '.72rem' }}>aliases: {player.aliases.join(', ')}</div>}
          {!player.hasUtrLookup && <div className="muted" style={{ fontSize: '.72rem' }}>Needs UTR name mapping</div>}
        </td>
        <td><span className="tag">{player.teamAbbr}</span></td>
        <td>{formatRating(player.currentSinglesUtr)}</td>
        <td><strong className="ptl-rating-value">{formatRating(player.ptlSinglesRating)}</strong></td>
        <td>{formatRating(player.currentDoublesUtr)}</td>
        <td><strong className="ptl-rating-value">{formatRating(player.ptlDoublesRating)}</strong></td>
        <td><span className={`tag ${deltaClass}`}>{player.singlesRatingDelta > 0 ? '+' : ''}{formatRating(player.singlesRatingDelta)}/{player.doublesRatingDelta > 0 ? '+' : ''}{formatRating(player.doublesRatingDelta)}</span></td>
        <td>{player.wins}-{player.losses}</td>
        <td>{player.winPct}%</td>
        <td>{player.singles}/{player.doubles}</td>
        <td>{player.gameDiff > 0 ? `+${player.gameDiff}` : player.gameDiff}</td>
      </tr>
    );
  });
}

function RatingTable({ players, emptyText, startRank = 1, highlightQualifiers = true, testid = 'ptl-ratings-table' }) {
  return (
    <div className="table-wrap">
      <table className="std ptl-table" data-testid={testid}>
        <thead>
          <tr>
            <th>#</th>
            <th>Player</th>
            <th>Team</th>
            <th>UTR S</th>
            <th>PTL S</th>
            <th>UTR D</th>
            <th>PTL D</th>
            <th>Δ S/D</th>
            <th>W-L</th>
            <th>Win%</th>
            <th>S/D</th>
            <th>G±</th>
          </tr>
        </thead>
        <tbody>
          {players.length === 0 && <tr><td colSpan="12" className="center muted">{emptyText}</td></tr>}
          <RatingRows players={players} startRank={startRank} highlightQualifiers={highlightQualifiers} />
        </tbody>
      </table>
    </div>
  );
}

function collectLegacyNames(matches, lookupRows) {
  const names = new Map();
  (matches || []).forEach(match => {
    (match.lines || []).forEach(line => {
      [...(line.players?.team1 || []), ...(line.players?.team2 || [])].forEach(name => {
        const clean = String(name || '').trim();
        if (!clean) return;
        if (!names.has(clean)) names.set(clean, { name: clean, count: 0 });
        names.get(clean).count += 1;
      });
    });
  });
  const mapped = Array.from(names.values()).map(item => {
    const match = matchUtrRating(item.name, lookupRows);
    return {
      ...item,
      matchedName: match?.row.fullName || '',
      singlesUtr: match?.row.singlesUtr ?? null,
      doublesUtr: match?.row.doublesUtr ?? null,
      confidence: match ? Math.round(match.score * 100) : 0,
      reason: match?.reason || 'Needs manual mapping'
    };
  });
  const matchedCounts = mapped.reduce((acc, row) => {
    if (row.matchedName) acc[row.matchedName] = (acc[row.matchedName] || 0) + 1;
    return acc;
  }, {});
  return mapped.map(row => ({ ...row, duplicateMappedName: row.matchedName && matchedCounts[row.matchedName] > 1 }))
    .sort((a, b) => a.confidence - b.confidence || a.name.localeCompare(b.name));
}

export default function PtlRatings({ teams, matches, previousMatches = [], ratingLookup = {} }) {
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('ratings');
  const lookupRows = useMemo(() => {
    const entries = Object.entries(ratingLookup || {});
    const rows = entries.map(([id, row]) => ({ _id: id, ...(row || {}) }));
    return rows.length > 0 ? rows : UTR_RATINGS;
  }, [ratingLookup]);
  const ratingMatches = useMemo(() => [
    ...(previousMatches || []).map(match => ({ ...match, source: match.source || 'KOC2DB' })),
    ...(matches || []).map(match => ({ ...match, source: match.source || 'KOC3' }))
  ], [matches, previousMatches]);
  const ratings = useMemo(() => buildPtlRatings(teams, ratingMatches, lookupRows), [teams, ratingMatches, lookupRows]);
  const legacyNameMap = useMemo(() => collectLegacyNames(previousMatches, lookupRows), [previousMatches, lookupRows]);
  const filtered = ratings.filter(player =>
    !q || `${player.name} ${player.team} ${player.teamAbbr}`.toLowerCase().includes(q.toLowerCase())
  );

  const mappedPlayers = filtered.filter(player => player.hasUtrLookup);
  const unmappedPlayers = filtered.filter(player => !player.hasUtrLookup);
  const activeCount = ratings.filter(player => player.courts > 0).length;
  const unmappedCount = ratings.filter(player => !player.hasUtrLookup).length;
  const leader = ratings.find(player => player.courts > 0 && player.hasUtrLookup) || ratings.find(player => player.courts > 0);



  return (
    <main className="container">
      <div className="page-title ptl-hero">
        <div>
          <h1>PTL Rating</h1>
          <p>UTR-style KOC performance rating using KOC3 plus pulled KOC2DB history.</p>
        </div>
        <div className="ptl-hero-stat">
          <span>Leader</span>
          <strong>{leader ? leader.name : '—'}</strong>
          <small>{leader ? formatRating(leader.ptlRating) : 'No scores yet'}</small>
        </div>
      </div>

      <div className="ptl-summary">
        <div className="card ptl-info-card">
          <span className="ptl-kicker">Algorithm</span>
          <h2>How PTL works</h2>
          <p>
            PTL starts singles and doubles separately from the UTR table when available, otherwise from 3.50.
            Singles courts update only the singles PTL; doubles courts update only the doubles PTL using
            the average rating of the opposing pair. Previous season matches are pulled from /KOC2DB.
          </p>
        </div>
        <div className="card ptl-metric">
          <span>Rated players</span>
          <strong>{activeCount}</strong>
          <small>{ratingMatches.length} matches · {unmappedCount} need mapping</small>
        </div>
      </div>

      <input
        className="input"
        placeholder="🔍 Search player or team..."
        value={q}
        onChange={e => setQ(e.target.value)}
        data-testid="ptl-search"
        style={{ marginBottom: '.7rem' }}
      />

      <div className="tabs">
        <button className={`tab ${tab === 'ratings' ? 'active' : ''}`} onClick={() => setTab('ratings')} data-testid="ptl-tab-ratings">PTL Ratings</button>
        <button className={`tab ${tab === 'lookup' ? 'active' : ''}`} onClick={() => setTab('lookup')} data-testid="ptl-tab-lookup">UTR Lookup</button>
        <button className={`tab ${tab === 'koc2map' ? 'active' : ''}`} onClick={() => setTab('koc2map')} data-testid="ptl-tab-koc2map">KOC2 Map</button>
      </div>

      {tab === 'lookup' && (
        <div className="card">
          <h2>Stored Player Rating Lookup</h2>
          <p className="hint">This table is seeded into Firebase at {`/${'koc_s3/playerRatings'}`} and used to match KOC2DB names.</p>
          <div className="table-wrap">
            <table className="std ptl-table" data-testid="ptl-lookup-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Singles UTR</th>
                  <th>Status</th>
                  <th>Doubles UTR</th>
                  <th>Doubles Status</th>
                </tr>
              </thead>
              <tbody>
                {lookupRows.map(row => (
                  <tr key={row.fullName}>
                    <td><strong>{row.fullName}</strong></td>
                    <td>{formatRating(row.singlesUtr)}</td>
                    <td>{row.singlesStatus || '—'}</td>
                    <td>{formatRating(row.doublesUtr)}</td>
                    <td>{row.verifiedDoublesStatus || row.doublesStatus || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'koc2map' && (
        <div className="card">
          <h2>KOC2DB Name Mapping</h2>
          <p className="hint">Partial matches from previous-season names to the stored UTR lookup. Duplicate mapped names are highlighted so aliases can be cleaned up.</p>
          <div className="table-wrap">
            <table className="std ptl-table" data-testid="ptl-koc2-map-table">
              <thead>
                <tr>
                  <th>KOC2 name</th>
                  <th>Plays</th>
                  <th>Mapped UTR player</th>
                  <th>Confidence</th>
                  <th>Reason</th>
                  <th>UTR S</th>
                  <th>UTR D</th>
                </tr>
              </thead>
              <tbody>
                {legacyNameMap.length === 0 && <tr><td colSpan="7" className="center muted">No KOC2DB player names loaded yet</td></tr>}
                {legacyNameMap.map(row => (
                  <tr key={row.name} className={row.duplicateMappedName ? 'q' : ''}>
                    <td><strong>{row.name}</strong></td>
                    <td>{row.count}</td>
                    <td>{row.matchedName || '—'}</td>
                    <td><span className={`tag ${row.confidence >= 90 ? 'win' : row.confidence >= 72 ? 'tie' : 'lose'}`}>{row.confidence}%</span></td>
                    <td>{row.duplicateMappedName ? `${row.reason} · duplicate alias` : row.reason}</td>
                    <td>{formatRating(row.singlesUtr)}</td>
                    <td>{formatRating(row.doublesUtr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}


      {tab === 'ratings' && (
        <>
          <div className="card">
            <h2>Mapped PTL Ratings <span className="muted" style={{ fontWeight: 500, fontSize: '.85rem' }}>· matched to UTR names</span></h2>
            <RatingTable players={mappedPlayers} emptyText="No mapped players found" />
            <p className="hint">PTL = Prosper Tennis League rating. UTR S/D come from the provided lookup table; PTL S/D are KOC-only singles and doubles performance ratings.</p>
          </div>

          {unmappedPlayers.length > 0 && (
            <div className="card ptl-unmapped-card" data-testid="ptl-unmapped-card">
              <h2>Needs Name Mapping <span className="muted" style={{ fontWeight: 500, fontSize: '.85rem' }}>· not found in UTR lookup</span></h2>
              <p className="hint">These players are kept below the main mapped group because their current or legacy match name did not resolve to a stored UTR player. Ask a SUPER_ADMIN to map the source name to an actual UTR player to move them into the mapped table.</p>
              <RatingTable
                players={unmappedPlayers}
                emptyText="All players are mapped"
                startRank={mappedPlayers.length + 1}
                highlightQualifiers={false}
                testid="ptl-unmapped-table"
              />
            </div>
          )}
        </>
      )}
    </main>
  );
}

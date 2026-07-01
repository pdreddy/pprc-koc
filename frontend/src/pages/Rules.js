import React from 'react';

const ruleCards = [
  { num: '01', icon: '🏃', title: 'Player Participation (Round-Robin)', items: [
    ['👤', 'Regular Season', 'Each player must play a minimum of 3 days and a maximum of 6 days in the regular season.'],
    ['🎾', 'Singles Cap', 'Each player can play a maximum of 2 singles matches.'],
    ['🤝', 'Same Doubles Pair', 'The same doubles pair can partner together a maximum of 3 times — 3 match days or 6 matches.']
  ]},
  { num: '02', icon: '📝', title: 'Lines', items: [
    ['🗓️', 'Match Day Deadline', '🎾 Lineups are due by 7:00 PM on your scheduled match day (Saturday or Sunday) — this is mandatory, even if you plan to play the match later in the week.'],
    ['😄', 'Missed Deadline', 'Miss it? Vinod, Uma, or I will set your lines. Yes, that includes their own teams.']
  ]},
  { num: '03', icon: '📅', title: 'Scheduling', items: [
    ['🤝', 'Mutual Agreement', "Postpone only by mutual agreement. The current week's match comes first."],
    ['✅', 'Before RR Ends', 'All postponed matches must be completed before the round-robin ends.'],
    ['🌦️', 'Buffer Week', 'There is an extra buffer week at the end of round-robin for weather make-ups.']
  ]},
  { num: '04', icon: '📊', title: 'Scores', items: [
    ['🏆', 'Winning Captain', 'Winning captain posts the score by the immediate Monday EOD — strictly enforced.'],
    ['⏱️', 'Split Days', 'Splitting matches across days? Scores are still all due by that Monday.']
  ]},
  { num: '05', icon: '📋', title: 'Match Day Protocol', items: [
    ['🎾', 'Arrive Early', 'Arrive 15 minutes early.'],
    ['🎾', 'Exchange Lineups', 'Exchange lineups before play.'],
    ['🎾', 'Lineups Lock', 'No lineup changes once started.'],
    ['🎾', 'Same-Day Finish', 'All lines must finish the same day.']
  ]},
  { num: '06', icon: '🏥', title: 'Injuries', items: [
    ['📃', 'League (Round-Robin)', 'Replace with a similar UTR player or .5 lower level; requires Committee approval.'],
    ['🏅', 'Playoffs', 'Only if 2+ players are ruled out; requires Committee approval.']
  ]},
  { num: '07', icon: '⚡', title: 'No-Ad Scoring', items: [
    ['🎾', 'Deciding Point', 'Deciding point at deuce.'],
    ['🎾', 'Receiver Choice', 'Receiver chooses side (no 2-point advantage).']
  ]},
  { num: '08', icon: '🤝', title: 'Conduct & Fair Play', items: [
    ['🎾', 'Line Calls', 'Players make their own line calls.'],
    ['🎾', 'Disputes', 'Disputes → Committee decision.'],
    ['🎾', 'Respect', 'Respectful behavior is mandatory.'],
    ['⚠️', 'Misconduct', 'Misconduct = penalty.']
  ]},
  { num: '09', icon: '🌧️', title: 'Weather & Postponements', items: [
    ['🌧️', 'Full Washout', 'A full washout gives teams a window to reschedule, play, and post.'],
    ['0️⃣', 'No Completion', "Can't make it happen? Zero points for that fixture."],
    ['🚫', 'No Mutual Agreement', 'Postpone or no-show for a non-weather reason without mutual agreement? The opponent can raise it.'],
    ['📉', 'Penalty', 'Penalty: 4 games (or a set) deducted — and the match still gets played on a later day.']
  ]}
];

const matchFlow = [
  ['1', 'Share Lineup', 'Captains post lines before play.'],
  ['2', 'Play 5 Lines', 'Singles, doubles and reverse doubles.'],
  ['3', 'Post Scores', 'Winning captain reports by immediate Monday EOD.'],
  ['4', 'Standings Update', 'Points, sets, games and head-to-head decide rank.']
];

const playoffSections = [
  ['Quarterfinals — Top half', [['QF1', 'A1 vs B4'], ['QF2', 'A2 vs B3']]],
  ['Quarterfinals — Bottom half', [['QF3', 'A3 vs B2'], ['QF4', 'A4 vs B1']]],
  ['Semifinals', [['SF1', 'QF1 vs QF4'], ['SF2', 'QF2 vs QF3']]],
  ['Finals', [['Final', 'SF1 vs SF2']]]
];

const quickHighlights = [
  ['🗓️', 'Lineups', '7:00 PM match day'],
  ['📊', 'Scores', 'Immediate Monday EOD'],
  ['🏆', 'Playoffs', 'Top 4 from each group'],
  ['🎾', 'Eligibility', '3–6 days · max 2 singles']
];

function RuleItem({ item }) {
  const [icon, label, value] = item;
  return (
    <div className="rl-item">
      <span className="rl-ic" aria-hidden="true">{icon}</span>
      <div><div className="rl-lbl">{label}</div><div className="rl-val">{value}</div></div>
    </div>
  );
}

function RuleCard({ card }) {
  return (
    <article id={`rule-${card.num}`} className="card rl-card" data-testid={`rule-card-${card.num}`}>
      <div className="rl-card-head">
        <span className="rl-num">{card.num}</span>
        <span className="rl-chip" aria-hidden="true">{card.icon}</span>
        <h3>{card.title}</h3>
      </div>
      {card.items?.map(item => <RuleItem key={`${card.num}-${item[1]}`} item={item} />)}
    </article>
  );
}

function RulesHero() {
  return (
    <section className="rl-hero-strip" aria-label="Rules quick highlights">
      {quickHighlights.map(([icon, label, value]) => (
        <div className="rl-hero-pill" key={label}>
          <span aria-hidden="true">{icon}</span>
          <div><small>{label}</small><strong>{value}</strong></div>
        </div>
      ))}
    </section>
  );
}

function PlayoffBracket() {
  return (
    <section className="card rl-playoffs" data-testid="playoff-bracket">
      <h2>🏆 Playoffs</h2>
      <p className="rl-bracket-intro"><strong>Top 4 from both groups qualify.</strong> Quarterfinal crossovers pit each group's high seeds against the other group's lowest.</p>
      <div className="rl-cross">
        {playoffSections.map(([title, rows]) => (
          <div key={title}>
            <div className="rl-bracket-sub">{title}</div>
            {rows.map(([label, match]) => <div className="rl-qf" key={label}><span>{label}</span><b>{match}</b></div>)}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function Rules() {
  return (
    <main className="container rules-page-shell" data-testid="rules-page">
      <div className="page-title">
        <h1>Rules &amp; Format</h1>
        <p>Welcome to the season! Quick rundown before Week 1 — participation, lines, scores, weather and playoffs.</p>
      </div>

      <RulesHero />

      <div className="rl-sec-head"><h2>Match Flow</h2><div className="ln" /></div>
      <section className="rl-flow rl-flow-four" data-testid="match-flow">
        {matchFlow.map(([num, title, text]) => (
          <div className="rl-step" key={num}><b>{num}</b><strong>{title}</strong><small>{text}</small></div>
        ))}
      </section>

      <div className="rl-sec-head"><h2>The Rules</h2><div className="ln" /></div>
      <section className="rl-grid">{ruleCards.map(card => <RuleCard key={card.num} card={card} />)}</section>

      <div className="rl-sec-head"><h2>Playoffs</h2><div className="ln" /></div>
      <PlayoffBracket />

      <div className="rl-sec-head"><h2>Remember</h2><div className="ln" /></div>
      <section className="rl-flow rl-reminders">
        <div className="rl-step"><b>🗓️</b><strong>Match Day 7 PM</strong><small>Lines are due for Saturday or Sunday fixtures.</small></div>
        <div className="rl-step"><b>📊</b><strong>Monday EOD</strong><small>Scores are due.</small></div>
      </section>

      <div className="rl-motto" data-testid="rules-motto">Let's go! 🎾</div>
    </main>
  );
}

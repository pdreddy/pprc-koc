// Round-robin pairings using the circle method.
// Returns an array of `rounds`, each round is an array of [teamAIndex, teamBIndex] pairs.
export function roundRobin(n) {
  if (n < 2 || n % 2 !== 0) throw new Error('Need an even number of teams');
  const teams = Array.from({ length: n }, (_, i) => i);
  const rounds = [];
  const fixed = teams[0];
  let rotating = teams.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const round = [];
    const arr = [fixed, ...rotating];
    for (let i = 0; i < n / 2; i++) {
      round.push([arr[i], arr[n - 1 - i]]);
    }
    rounds.push(round);
    // rotate: take last and insert at start of rotating
    rotating = [rotating[rotating.length - 1], ...rotating.slice(0, -1)];
  }
  return rounds;
}

export const KOC3_SCHEDULE_VERSION = 'koc3-2026-06-27-group-weekends-715pm-v2';

const GROUP_A_FIRST_DATE = new Date(2026, 5, 27); // Jun 27, 2026
const GROUP_B_FIRST_DATE = new Date(2026, 5, 28); // Jun 28, 2026
const BUFFER_WEEK_START = new Date(2026, 6, 4); // Jul 4, 2026

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function dateForRound(firstDate, roundIndex) {
  const date = new Date(firstDate.getTime());
  const weekOffset = roundIndex === 0 ? 0 : roundIndex + 1; // skip Jul 4/5 buffer weekend before round 2
  date.setDate(firstDate.getDate() + weekOffset * 7);
  return date;
}

/**
 * Build the KOC3 schedule for two 8-team groups.
 * Group A plays Saturdays starting Jun 27, 2026; Group B plays Sundays starting Jun 28, 2026.
 * Jul 4/5 is a buffer weekend, then the remaining six weekly rounds continue.
 * @param {Array} groupATeams - 8 teams with .id and .abbreviation in requested seed order
 * @param {Array} groupBTeams - 8 teams with .id and .abbreviation in requested seed order
 * @returns {Object} map of matchId -> match record (Firebase-friendly)
 */
export function buildScheduleFor8x2(groupATeams, groupBTeams) {
  const out = {};
  const pairingsA = roundRobin(8);
  const pairingsB = roundRobin(8);

  const buildGroup = (label, teamsArr, pairings, firstDate) => {
    for (let r = 0; r < 7; r++) {
      const roundDate = dateForRound(firstDate, r);
      const dateISO = isoDate(roundDate);
      pairings[r].forEach(([i, j], k) => {
        const t1 = teamsArr[i];
        const t2 = teamsArr[j];
        if (!t1 || !t2) return;
        const slot = '7:15 PM';
        const id = `${label}-r${r + 1}-m${k + 1}`;
        out[id] = {
          id,
          group: label,
          round: r + 1,
          date: dateISO,
          time: slot,
          team1Id: t1.id,
          team2Id: t2.id,
          status: 'scheduled',
          scheduleVersion: KOC3_SCHEDULE_VERSION
        };
      });
    }
  };

  buildGroup('A', groupATeams, pairingsA, GROUP_A_FIRST_DATE);
  buildGroup('B', groupBTeams, pairingsB, GROUP_B_FIRST_DATE);

  out.buffer_week = {
    id: 'buffer_week',
    type: 'buffer',
    round: 2,
    group: 'ALL',
    date: isoDate(BUFFER_WEEK_START),
    time: '',
    title: 'July 4 buffer week',
    status: 'buffer',
    scheduleVersion: KOC3_SCHEDULE_VERSION
  };

  return out;
}

// First Sunday on or after the given date
export function firstSundayOnOrAfter(d) {
  const out = new Date(d.getTime());
  while (out.getDay() !== 0) {
    out.setDate(out.getDate() + 1);
  }
  return out;
}

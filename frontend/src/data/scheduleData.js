// Round-robin schedule for the 9 original KOC teams.
// Admin can update via Firebase if needed; placeholder Teams 10–16 are not scheduled.

export const scheduleData = [
  { week: 1, dates: 'Oct 17–18', matches: [
    { teams: ["Karna's Crusaders", 'Court Conquerors'], captains: ['Srikanth', 'Rajasekhar Chintha'], day: 'FRI', time: '5 PM' },
    { teams: ['Spin Kings', 'Mega Lions'], captains: ['Uma V', 'Anil Kunda'], day: 'FRI', time: '6 PM' },
    { teams: ['KOC Challengers', 'Chill Titans'], captains: ['Narayan Prasad', 'Satish Orugunta'], day: 'SAT', time: '7:15 PM' },
    { teams: ['Rally Squad', 'Agni Aces'], captains: ['Manish Jangid', 'Vinod Aripaka'], day: 'SAT', time: '7:15 PM' }
  ], bye: 'Rudra Racquets' },
  { week: 2, dates: 'Oct 24–25', matches: [
    { teams: ['Rudra Racquets', 'Court Conquerors'], captains: ['Yogesh', 'Rajasekhar Chintha'], day: 'FRI', time: '5 PM' },
    { teams: ['Spin Kings', 'Chill Titans'], captains: ['Uma V', 'Satish Orugunta'], day: 'FRI', time: '6 PM' },
    { teams: ['KOC Challengers', 'Agni Aces'], captains: ['Narayan Prasad', 'Vinod Aripaka'], day: 'SAT', time: '7:15 PM' },
    { teams: ['Rally Squad', 'Mega Lions'], captains: ['Manish Jangid', 'Anil Kunda'], day: 'SAT', time: '7:15 PM' }
  ], bye: "Karna's Crusaders" },
  { week: 3, dates: 'Oct 31–Nov 1', matches: [
    { teams: ['Rudra Racquets', "Karna's Crusaders"], captains: ['Yogesh', 'Srikanth'], day: 'FRI', time: '5 PM' },
    { teams: ['Court Conquerors', 'Mega Lions'], captains: ['Rajasekhar Chintha', 'Anil Kunda'], day: 'FRI', time: '6 PM' },
    { teams: ['KOC Challengers', 'Rally Squad'], captains: ['Narayan Prasad', 'Manish Jangid'], day: 'SAT', time: '7:15 PM' },
    { teams: ['Agni Aces', 'Chill Titans'], captains: ['Vinod Aripaka', 'Satish Orugunta'], day: 'SAT', time: '7:15 PM' }
  ], bye: 'Spin Kings' },
  { week: 4, dates: 'Nov 7–8', matches: [
    { teams: ['Rudra Racquets', 'Spin Kings'], captains: ['Yogesh', 'Uma V'], day: 'FRI', time: '5 PM' },
    { teams: ["Karna's Crusaders", 'Mega Lions'], captains: ['Srikanth', 'Anil Kunda'], day: 'FRI', time: '6 PM' },
    { teams: ['Court Conquerors', 'Agni Aces'], captains: ['Rajasekhar Chintha', 'Vinod Aripaka'], day: 'SAT', time: '7:15 PM' },
    { teams: ['Rally Squad', 'Chill Titans'], captains: ['Manish Jangid', 'Satish Orugunta'], day: 'SAT', time: '7:15 PM' }
  ], bye: 'KOC Challengers' },
  { week: 5, dates: 'Nov 14–15', matches: [
    { teams: ['Rudra Racquets', 'KOC Challengers'], captains: ['Yogesh', 'Narayan Prasad'], day: 'FRI', time: '5 PM' },
    { teams: ["Karna's Crusaders", 'Spin Kings'], captains: ['Srikanth', 'Uma V'], day: 'FRI', time: '6 PM' },
    { teams: ['Court Conquerors', 'Rally Squad'], captains: ['Rajasekhar Chintha', 'Manish Jangid'], day: 'SAT', time: '7:15 PM' },
    { teams: ['Mega Lions', 'Agni Aces'], captains: ['Anil Kunda', 'Vinod Aripaka'], day: 'SAT', time: '7:15 PM' }
  ], bye: 'Chill Titans' },
  { week: 6, dates: 'Nov 21–22', matches: [
    { teams: ['Rudra Racquets', 'Rally Squad'], captains: ['Yogesh', 'Manish Jangid'], day: 'FRI', time: '5 PM' },
    { teams: ["Karna's Crusaders", 'KOC Challengers'], captains: ['Srikanth', 'Narayan Prasad'], day: 'FRI', time: '6 PM' },
    { teams: ['Spin Kings', 'Court Conquerors'], captains: ['Uma V', 'Rajasekhar Chintha'], day: 'SAT', time: '7:15 PM' },
    { teams: ['Mega Lions', 'Chill Titans'], captains: ['Anil Kunda', 'Satish Orugunta'], day: 'SAT', time: '7:15 PM' }
  ], bye: 'Agni Aces' },
  { break: true, icon: '🦃', text: 'Thanksgiving Break', dates: 'Nov 28–29' },
  { week: 7, dates: 'Dec 5–6', matches: [
    { teams: ['Rudra Racquets', 'Agni Aces'], captains: ['Yogesh', 'Vinod Aripaka'], day: 'FRI', time: '5 PM' },
    { teams: ["Karna's Crusaders", 'Rally Squad'], captains: ['Srikanth', 'Manish Jangid'], day: 'FRI', time: '6 PM' },
    { teams: ['Spin Kings', 'KOC Challengers'], captains: ['Uma V', 'Narayan Prasad'], day: 'SAT', time: '7:15 PM' },
    { teams: ['Court Conquerors', 'Chill Titans'], captains: ['Rajasekhar Chintha', 'Satish Orugunta'], day: 'SAT', time: '7:15 PM' }
  ], bye: 'Mega Lions' },
  { week: 8, dates: 'Dec 12–13', matches: [
    { teams: ['Rudra Racquets', 'Mega Lions'], captains: ['Yogesh', 'Anil Kunda'], day: 'FRI', time: '5 PM' },
    { teams: ["Karna's Crusaders", 'Chill Titans'], captains: ['Srikanth', 'Satish Orugunta'], day: 'FRI', time: '6 PM' },
    { teams: ['Spin Kings', 'Agni Aces'], captains: ['Uma V', 'Vinod Aripaka'], day: 'SAT', time: '7:15 PM' },
    { teams: ['Court Conquerors', 'KOC Challengers'], captains: ['Rajasekhar Chintha', 'Narayan Prasad'], day: 'SAT', time: '7:15 PM' }
  ], bye: 'Rally Squad' },
  { week: 9, dates: 'Dec 19–20', matches: [
    { teams: ['Rudra Racquets', 'Chill Titans'], captains: ['Yogesh', 'Satish Orugunta'], day: 'FRI', time: '5 PM' },
    { teams: ["Karna's Crusaders", 'Agni Aces'], captains: ['Srikanth', 'Vinod Aripaka'], day: 'FRI', time: '6 PM' },
    { teams: ['Spin Kings', 'Rally Squad'], captains: ['Uma V', 'Manish Jangid'], day: 'SAT', time: '7:15 PM' },
    { teams: ['KOC Challengers', 'Mega Lions'], captains: ['Narayan Prasad', 'Anil Kunda'], day: 'SAT', time: '7:15 PM' }
  ], bye: 'Court Conquerors' }
];

export const playoffs = [
  { name: 'Qualifier 1', date: 'Friday, Jan 16 • 5:00 PM', match: 'Top 1 vs Top 2', tags: [['w', 'W → Final'], ['l', 'L → Q2']] },
  { name: 'Eliminator', date: 'Saturday, Jan 17 • 7:15 PM', match: 'Top 3 vs Top 4', tags: [['w', 'W → Q2'], ['e', 'L → Out']] },
  { name: 'Qualifier 2', date: 'Friday, Jan 23 • 5:00 PM', match: 'Q1 Loser vs Elim Winner', tags: [['w', 'W → Final'], ['e', 'L → Out']] },
  { name: 'Championship Final', date: 'Saturday, Jan 31 • 7:15 PM', match: 'Q1 Winner vs Q2 Winner', tags: [['w', '🏆 Champion']], final: true }
];

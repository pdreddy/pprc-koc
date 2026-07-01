import { normalizeNameKey } from './utrRatings';

const AUCTION_PLAYER_ROWS = `Dinkar Bhardwaj|6.97|1|6.44|UTR 6.0|1781721198061|20000|6.97|6
Vinoth Duraisamy|6.71|1|6.11|UTR 6.0|1781721198062|20000|6.71|6
Volkan Bal|6.48|1|6.01|UTR 6.0|1781721198063|20000|6.48|6
Mohammad Azim|6.31|1|5.82|UTR 6.0|1781721198064|20000|6.31|6
Prashanth Gourineni|6.18|1|6.18|UTR 6.0|1781721198065|20000|5.9|6
Vamsi Atluri|6.14|1|6.14|UTR 6.0|1781721198066|20000|5.14|6
Vivekvardhan Reddy Mereddy|5.98|1|5.31|UTR 6.0|1781721198067|20000|5.98|6
Anand Krishnamurthy|5.96|1|5.96|UTR 6.0|1781721198068|20000|5.02|6
Nagarjuna Saladi|5.9|1|4.79|UTR 6.0|1781721198069|20000|5.9|6
Jayesh Barai|5.89|1|5.89|UTR 6.0|1781721198070|20000|5.78|6
Yogesh Dhadge|5.89|1|5.89|UTR 6.0|1781721198071|20000|5.21|6
Boopesh Natarajan|5.87|1|5.87|UTR 6.0|1781721198072|20000|5.62|6
Rajasekhar Mangalampally|5.81|1|5.35|UTR 6.0|1781721198073|20000|5.81|6
Rajesh Mishra|5.69|1|5.48|UTR 6.0|1781721198074|20000|5.69|6
Manish Jangid|5.68|1|5.68|UTR 6.0|1781721198075|20000|5.25|6
Harsha Reddy|5.52|1|5.52|UTR 6.0|1781721198076|20000|5.29|6
Prashant Janmatti|6.28|2|6.28|UTR 5.5|1781721198077|14000||5.5
Rajib Sarkar|6.06|2|6.06|UTR 5.5|1781721198078|14000|4.89|5.5
Vinod Aripaka|6.03|2|6.03|UTR 5.5|1781721198079|14000|4.4|5.5
Kalyan Kalidindi|5.94|2|5.94|UTR 5.5|1781721198080|14000||5.5
Praveenkumar Vijayakumar|5.9|2|5.9|UTR 5.5|1781721198081|14000||5.5
Dinesh Reddy Timmareddy|5.88|2|5.88|UTR 5.5|1781721198082|14000|5.13|5.5
Premkumar Balakrishnan|5.86|2|5.86|UTR 5.5|1781721198083|14000|4.76|5.5
Rajasekhar Chintha|5.82|2|5.82|UTR 5.5|1781721198084|14000|4.45|5.5
Tariq Hussain|5.74|2|5.74|UTR 5.5|1781721198085|14000||5.5
Hari Mothukuri|5.62|2|5.62|UTR 5.5|1781721198086|14000|4.43|5.5
Kailas Magi|5.58|2|5.58|UTR 5.5|1781721198087|14000|4.47|5.5
Satish Reddy Orugunta|5.52|2|5.52|UTR 5.5|1781721198088|14000|4.83|5.5
Anil Kunda|5.4|2|5.4|UTR 5.5|1781721198089|14000||5.5
Ritesh Kumar|5.26|2|5.26|UTR 5.5|1781721198090|14000|4.1|5.5
Sudhakara Nallapati|5.13|2|5.13|UTR 5.5|1781721198091|14000|4.45|5.5
Raj Chava||2||UTR 5.5|1781721198092|14000||5.5
Saket Raizada|5.98|3|5.53|UTR 5.0|1781721198093|12000|5.98|5
Vipul Sud|5.92|3|5.92|UTR 5.0|1781721198094|12000||5
Srinath Elitem|5.72|3|5.72|UTR 5.0|1781721198095|12000||5
Hariprashanth Ganapathy|5.7|3|5.7|UTR 5.0|1781721198096|12000|4.8|5
Janaki Ram Kantheti|5.56|3|5.56|UTR 5.0|1781721198097|12000|3.71|5
Krishna Vennapusa|5.54|3|5.54|UTR 5.0|1781721198098|12000|4.76|5
Jaweed Ibrahim|5.34|3|5.34|UTR 5.0|1781721198099|12000|4.36|5
Mahidhar Penigi|5.34|3|4.48|UTR 5.0|1781721198100|12000|5.34|5
Kalyan Ghanta|5.33|3|5.33|UTR 5.0|1781721198101|12000|5|5
Narayan Prasad|5.28|3|5.28|UTR 5.0|1781721198102|12000|4.7|5
Rajasekhar Karru|5.25|3|5.25|UTR 5.0|1781721198103|12000|4.37|5
Lloyd Prasana Kumar|5.24|3|5.24|UTR 5.0|1781721198104|12000||5
Uma Vommi|5.2|3|4.77|UTR 5.0|1781721198105|12000|5.2|5
Ninad Mahajan|5.2|3|5.2|UTR 5.0|1781721198106|12000|4.39|5
Chandrakant Dharme|5.19|3|5.03|UTR 5.0|1781721198107|12000|5.19|5
Nikhil Katakam|5.1|3|4.86|UTR 5.0|1781721198108|12000|5.1|5
Koushik Venkatasubramanian|5.46|4|5.46|UTR 4.5|1781721198109|10000||4.5
Veeresh Kurni|5.39|4|5.39|UTR 4.5|1781721198110|10000||4.5
Vivek Tiku|5.38|4|5.38|UTR 4.5|1781721198111|10000|1.82|4.5
Amol Patwardhan|5.32|4|5.32|UTR 4.5|1781721198112|10000||4.5
Biju Koshy|5.12|4|5.12|UTR 4.5|1781721198113|10000|4|4.5
Jitender Kumar|5.1|4|5.1|UTR 4.5|1781721198114|10000|4.08|4.5
Mohamed Noufal|5.1|4|5.1|UTR 4.5|1781721198115|10000|4.14|4.5
Raja R|5.05|4|5.05|UTR 4.5|1781721198116|10000||4.5
Jay Sermadevi|4.98|4||UTR 4.5|1781721198117|10000|4.98|4.5
Bharath Sunku|4.97|4|4.97|UTR 4.5|1781721198118|10000|4.27|4.5
Prashanth Jayantha Kumar|4.93|4|3.7|UTR 4.5|1781721198119|10000|4.93|4.5
Srinidhi Kulkarni|4.69|4||UTR 4.5|1781721198120|10000|4.69|4.5
Vijay Gate|4.68|4|4.48|UTR 4.5|1781721198121|10000|4.68|4.5
Venky Dh|4.58|4|4.58|UTR 4.5|1781721198122|10000|4.49|4.5
Sandeep Gengineri|4.34|4|4.13|UTR 4.5|1781721198123|10000|4.34|4.5
Guru Bavirisetty||4||UTR 4.5|1781721198124|10000||4.5
Chandu M|5.14|5|5.14|UTR 4.0|1781721198125|8000|4.1|4
Rajasekhar Chejerla|5.11|5|5.11|UTR 4.0|1781721198126|8000|3.18|4
Pratik Pitroda|4.85|5|4.85|UTR 4.0|1781721198127|8000|3.6|4
Prashanth Pendli|4.81|5|4.81|UTR 4.0|1781721198128|8000|4.79|4
Vivek Bihani|4.8|5|4.8|UTR 4.0|1781721198129|8000|4.41|4
Mohan Koripuri|4.76|5|4.76|UTR 4.0|1781721198130|8000|3.8|4
Srikant Tenni|4.76|5|4.76|UTR 4.0|1781721198131|8000||4
Anshul Goyal|4.75|5|4.75|UTR 4.0|1781721198132|8000|4.63|4
Naveenkumar Mohanram|4.7|5|4.7|UTR 4.0|1781721198133|8000|3.88|4
Vinod Punati|4.67|5|4.67|UTR 4.0|1781721198134|8000|4.27|4
Tushar Tipatre|4.65|5|4.65|UTR 4.0|1781721198135|8000||4
Sreekanth Bobbala|4.56|5|4.56|UTR 4.0|1781721198136|8000|3.66|4
Malla Reddy Cheerke|4.49|5|3.99|UTR 4.0|1781721198137|8000|4.49|4
Shailendra Patidar|4.47|5|4.47|UTR 4.0|1781721198138|8000|3.65|4
Sankara Lakshmanan|4.44|5|4.44|UTR 4.0|1781721198139|8000|4.18|4
Sidharth Behera|4.19|5||UTR 4.0|1781721198140|8000|4.19|4
Samir Junnarkar|5.08|6|5.08|UTR 3.5|1781721198141|6000|2.93|3.5
Amit Gundewar|4.9|6|4.9|UTR 3.5|1781721198142|6000|3.4|3.5
Bhaskar Boddireddy|4.87|6|4.87|UTR 3.5|1781721198143|6000|3.84|3.5
Satya Maddipati|4.6|6|4.6|UTR 3.5|1781721198144|6000|3.52|3.5
Dineshkumar Kaliyaperumal|4.47|6|4.47|UTR 3.5|1781721198145|6000||3.5
Damodhara Palavali|4.26|6|4.26|UTR 3.5|1781721198146|6000|3.58|3.5
Sashank T|4.22|6|4.22|UTR 3.5|1781721198147|6000|3.64|3.5
Karthik Ragunathan|4.14|6|4.14|UTR 3.5|1781721198148|6000|3.33|3.5
Charan Macharla|4.03|6|4.03|UTR 3.5|1781721198149|6000||3.5
Naseer Mohd|3.97|6|3.97|UTR 3.5|1781721198151|6000||3.5
Venkat Thimmisetty|3.95|6|3.95|UTR 3.5|1781721198152|6000|3.74|3.5
Arpit Rawat|3.94|6||UTR 3.5|1781721198153|6000|3.94|3.5
Jitin Jaitly|3.82|6|3.82|UTR 3.5|1781721198154|6000|3.47|3.5
Gopal Setty|3.78|6|3.78|UTR 3.5|1781721198155|6000|3.78|3.5
Shiva Gundimeda|3.74|6|3.74|UTR 3.5|1781721198156|6000|3.2|3.5
Satish K|3.38|6|3.38|UTR 3.5|1781721198157|6000||3.5
Venky Pantham|4.45|7|4.45|UTR 3.0|1781721198158|5000|2.99|3
Nivas Nazeer|4.14|7|4.14|UTR 3.0|1781721198159|5000|2.02|3
Mayur Patel|3.94|7|3.94|UTR 3.0|1781721198160|5000||3
Joel Kodoru|3.62|7|3.62|UTR 3.0|1781721198161|5000|2|3
Trinadh Cheepilla|3.42|7|3.42|UTR 3.0|1781721198162|5000|2.93|3
Avinash Terala|3.35|7|3.35|UTR 3.0|1781721198163|5000|3.21|3
Sai Varun Polishetty|2.94|7||UTR 3.0|1781721198164|5000|2.94|3
Asif Mohammed|2.8|7||UTR 3.0|1781721198165|5000|2.8|3
Jagapathi Raju|2.67|7||UTR 3.0|1781721198166|5000|2.67|3
Venice Robinson Amal Doss|2.38|7|2.38|UTR 3.0|1781721198167|5000|2.25|3
Karthik Kumaresan||7||UTR 3.0|1781721198168|5000||3
Abhishek Patel||7||UTR 3.0|1781721198169|5000||3
Raghu Ram||7||UTR 3.0|1781721198170|5000||3
Karthik Ram Senthilvel||7||UTR 3.0|1781721198171|5000||3
Chandan Singh||7||UTR 3.0|1781721198172|5000||3
Venu Sarvepalli||7||UTR 3.0|1781721198173|5000||3`;

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export const AUCTION_PLAYERS = AUCTION_PLAYER_ROWS.split('\n').map(line => {
  const [Name, best, cat, d, group, id, price, s, utr] = line.split('|');
  return {
    Name,
    best: toNumber(best),
    cat: Number(cat),
    d: toNumber(d),
    group,
    id: Number(id),
    price: Number(price),
    s: toNumber(s),
    utr: toNumber(utr)
  };
});

function splitName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/);
  if (parts.length <= 1) return { firstName: parts[0] || '', lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}

export function playerRatingId(fullName) {
  return String(fullName || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export function auctionPlayerToRating(player) {
  const { firstName, lastName } = splitName(player.Name);
  const singlesUtr = player.s ?? player.best ?? player.utr ?? null;
  const doublesUtr = player.d ?? player.best ?? player.utr ?? null;
  return {
    auctionId: player.id,
    firstName,
    lastName,
    fullName: player.Name,
    singlesUtr,
    singlesStatus: singlesUtr ? 'Auction' : 'Unrated',
    doublesUtr,
    doublesStatus: doublesUtr ? 'Auction' : 'Unrated',
    verifiedSinglesUtr: singlesUtr,
    verifiedSinglesStatus: singlesUtr ? 'Auction' : 'Unrated',
    verifiedDoublesUtr: doublesUtr,
    verifiedDoublesStatus: doublesUtr ? 'Auction' : 'Unrated',
    bestUtr: player.best,
    utr: player.utr,
    category: player.cat,
    group: player.group,
    price: player.price,
    aliases: [],
    keys: [
      normalizeNameKey(player.Name),
      normalizeNameKey(`${lastName} ${firstName}`),
      normalizeNameKey(`${firstName.split(' ')[0] || firstName} ${lastName}`)
    ].filter(Boolean)
  };
}

export function buildAuctionPlayerRatingsTable() {
  return AUCTION_PLAYERS.reduce((acc, player) => {
    acc[playerRatingId(player.Name)] = auctionPlayerToRating(player);
    return acc;
  }, {});
}

export function auctionPlayerRatingUpdates() {
  const table = buildAuctionPlayerRatingsTable();
  return Object.entries(table).reduce((updates, [id, row]) => {
    updates[id] = row;
    return updates;
  }, {});
}

function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function shuffledPlayers(players, seed = 2026) {
  const rand = seededRandom(seed);
  const copy = [...players];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function randomRosterNamesForTeams(captains, playersPerTeam = 6) {
  const captainKeys = new Set(captains.map(normalizeNameKey));
  const pool = shuffledPlayers(AUCTION_PLAYERS.filter(player => !captainKeys.has(normalizeNameKey(player.Name))));
  return captains.reduce((acc, captain, idx) => {
    acc[normalizeNameKey(captain)] = pool.slice(idx * playersPerTeam, idx * playersPerTeam + playersPerTeam).map(player => player.Name);
    return acc;
  }, {});
}

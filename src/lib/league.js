// 리그(팀 + 생성 선수 + 생성 선수 시즌 성적) 랜덤 생성

const CITIES = [
  'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego',
  'Dallas', 'San Jose', 'Austin', 'Jacksonville', 'Fort Worth', 'Columbus', 'Charlotte', 'Indianapolis',
  'San Francisco', 'Seattle', 'Denver', 'Nashville', 'Oklahoma City', 'El Paso', 'Boston', 'Portland',
  'Las Vegas', 'Detroit', 'Memphis', 'Louisville', 'Baltimore', 'Milwaukee', 'Albuquerque', 'Tucson',
  'Fresno', 'Sacramento', 'Kansas City', 'Atlanta', 'Omaha', 'Raleigh', 'Miami', 'Minneapolis', 'Tulsa',
  'Cleveland', 'Tampa', 'New Orleans', 'Honolulu', 'Anchorage', 'Pittsburgh', 'Cincinnati', 'St. Louis',
  'Salt Lake City', 'Boise', 'Buffalo', 'Richmond', 'Orlando', 'Birmingham', 'Des Moines', 'Charleston',
  'Savannah', 'Hartford', 'Providence', 'Spokane', 'Little Rock', 'Wichita', 'Madison',
];

const NICKNAMES = [
  'Thunderbolts', 'Comets', 'Lumberjacks', 'Rattlesnakes', 'Hurricanes', 'Foxes', 'Grizzlies', 'Falcons',
  'Ironmen', 'Wolves', 'Stallions', 'Sharks', 'Bison', 'Rockets', 'Owls', 'Hornets', 'Coyotes', 'Knights',
  'Vipers', 'Barons', 'Pilots', 'Mavericks', 'Outlaws', 'Riverhawks', 'Miners', 'Sentinels', 'Express',
  'Storm', 'Bulldogs', 'Jackrabbits', 'Lightning', 'Monarchs', 'Gators', 'Firebirds', 'Navigators', 'Bandits',
];

const COLORS = [
  '#c0392b', '#2563eb', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#ca8a04', '#db2777',
  '#334155', '#047857', '#7c2d12', '#1e3a8a', '#be123c', '#4d7c0f',
];

const NAME_POOLS = {
  US: {
    first: ['Jake', 'Tyler', 'Mason', 'Logan', 'Ethan', 'Ryan', 'Cole', 'Austin', 'Brandon', 'Chase', 'Dylan',
      'Hunter', 'Jordan', 'Kyle', 'Luke', 'Matt', 'Nathan', 'Owen', 'Parker', 'Sam', 'Trevor', 'Wyatt', 'Zach',
      'Bryce', 'Caleb', 'Derek', 'Garrett', 'Jared', 'Marcus', 'Tanner', 'Colby', 'Spencer', 'Blake', 'Gavin'],
    last: ['Miller', 'Johnson', 'Walker', 'Bennett', 'Carter', 'Hayes', 'Brooks', 'Foster', 'Griffin', 'Harper',
      'Jensen', 'Keller', 'Lawson', 'Morgan', 'Nolan', 'Porter', 'Reed', 'Shaw', 'Turner', 'Wells', 'Young',
      'Sullivan', 'Fletcher', 'Dalton', 'Whitaker', 'McCoy', 'Holloway', 'Prescott', 'Barrett', 'Callahan'],
  },
  LATIN: {
    first: ['José', 'Luis', 'Carlos', 'Miguel', 'Juan', 'Rafael', 'Pedro', 'Ramón', 'Wander', 'Yordan', 'Eloy',
      'Julio', 'Fernando', 'Andrés', 'Eugenio', 'Ronald', 'Starling', 'Jeimer', 'Oneil', 'Teoscar', 'Ketel',
      'Gleyber', 'Salvador', 'Yandy', 'Elvis', 'Framber', 'Cristian', 'Ezequiel'],
    last: ['Rodríguez', 'Martínez', 'Pérez', 'García', 'Hernández', 'Ramírez', 'Castillo', 'Guerrero', 'Soto',
      'Peña', 'Marte', 'Báez', 'Santana', 'Díaz', 'Mejía', 'Reyes', 'Álvarez', 'Torres', 'Valdez', 'Suárez',
      'Contreras', 'Arozarena', 'Encarnación', 'Domínguez', 'Tavárez', 'Moncada'],
  },
  JP: {
    first: ['Haruto', 'Yuto', 'Sota', 'Ren', 'Riku', 'Kaito', 'Daichi', 'Takumi', 'Shohei', 'Yuki', 'Kenta',
      'Masato', 'Ryota', 'Shota', 'Kazuki'],
    last: ['Sato', 'Suzuki', 'Takahashi', 'Tanaka', 'Watanabe', 'Ito', 'Yamamoto', 'Nakamura', 'Kobayashi',
      'Kato', 'Yoshida', 'Matsui', 'Murakami', 'Okamoto'],
  },
  KR: {
    first: ['Ji-hoon', 'Min-jun', 'Seo-jun', 'Do-yoon', 'Ha-jun', 'Joon-ho', 'Hyun-woo', 'Jae-won', 'Sung-min',
      'Woo-jin', 'Tae-hyun', 'Dong-hyun', 'Jung-hoo', 'Ha-seong'],
    last: ['Kim', 'Lee', 'Park', 'Choi', 'Jung', 'Kang', 'Cho', 'Yoon', 'Jang', 'Lim', 'Han', 'Oh', 'Seo', 'Ko'],
  },
  TW: {
    first: ['Wei-Lun', 'Chih-Hao', 'Yu-Cheng', 'Po-Yu', 'Chien-Ming', 'Tzu-Wei', 'Kuan-Yu', 'Jen-Ho'],
    last: ['Chen', 'Lin', 'Huang', 'Chang', 'Wang', 'Liu', 'Tsai', 'Yang'],
  },
  AU: {
    first: ['Liam', 'Jack', 'Lachlan', 'Cooper', 'Riley', 'Mitchell', 'Brodie', 'Jayden'],
    last: ['Smith', 'Kennedy', 'Murphy', 'Thompson', 'Campbell', 'Wright', 'Hughes', 'Kelly'],
  },
  NL: {
    first: ['Jurickson', 'Didi', 'Xander', 'Kenley', 'Andrelton', 'Ozzie', 'Jair', 'Sharlon'],
    last: ['Profar', 'Gregorius', 'Bogaerts', 'Jansen', 'Simmons', 'Albies', 'Schoop', 'Martis'],
  },
};

// [국적 코드, 가중치, 이름 풀]
const NATIONALITIES = [
  ['US', 46, 'US'], ['DO', 12, 'LATIN'], ['VE', 8, 'LATIN'], ['CU', 4, 'LATIN'], ['MX', 4, 'LATIN'],
  ['PR', 3, 'LATIN'], ['PA', 2, 'LATIN'], ['CO', 1, 'LATIN'], ['JP', 5, 'JP'], ['KR', 5, 'KR'],
  ['TW', 2, 'TW'], ['CA', 3, 'US'], ['AU', 2, 'AU'], ['CW', 2, 'NL'], ['NL', 1, 'NL'],
];

export const POSITIONS = [
  { code: 'P', name: '투수' },
  { code: 'C', name: '포수' },
  { code: '1B', name: '1루수' },
  { code: '2B', name: '2루수' },
  { code: '3B', name: '3루수' },
  { code: 'SS', name: '유격수' },
  { code: 'LF', name: '좌익수' },
  { code: 'CF', name: '중견수' },
  { code: 'RF', name: '우익수' },
  { code: 'DH', name: '지명타자' },
];

export const positionName = (code) => POSITIONS.find((p) => p.code === code)?.name ?? code;

export const STAT_KEYS = [
  'games', 'plate_appearances', 'at_bats', 'hits', 'doubles', 'triples', 'home_runs', 'rbi', 'walks',
  'strikeouts', 'outs_recorded', 'pitches', 'strikes_thrown', 'pitcher_strikeouts', 'walks_allowed',
  'hits_allowed', 'runs_allowed', 'wins', 'losses', 'best_batting_score', 'best_pitching_score', 'total_score',
];

export function emptyStats() {
  return Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));
}

// ---------- 표시용 지표 ----------
export function battingAvg(s) {
  if (!s || !s.at_bats) return null;
  return s.hits / s.at_bats;
}
export function era(s) {
  if (!s || !s.outs_recorded) return null;
  return (s.runs_allowed * 27) / s.outs_recorded;
}
export const fmtAvg = (v) => (v == null ? '-' : v.toFixed(3).replace(/^0/, ''));
export const fmtEra = (v) => (v == null ? '-' : v.toFixed(2));
export const fmtIp = (outs) => `${Math.floor((outs || 0) / 3)}.${(outs || 0) % 3}`;

// ---------- 랜덤 유틸 ----------
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function gauss(mean, sd) {
  const u = 1 - Math.random();
  const v = Math.random();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function weighted(list) {
  const total = list.reduce((s, x) => s + x[1], 0);
  let r = Math.random() * total;
  for (const item of list) {
    r -= item[1];
    if (r <= 0) return item;
  }
  return list[list.length - 1];
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeAbbr(city, used) {
  const words = city.replace(/\./g, '').split(' ');
  let base = words.length > 1 ? words.map((w) => w[0]).join('').slice(0, 3) : city.slice(0, 3);
  base = base.toUpperCase();
  let abbr = base;
  let i = 2;
  while (used.has(abbr)) abbr = `${base.slice(0, 2)}${i++}`;
  used.add(abbr);
  return abbr;
}

function batterStats() {
  const s = emptyStats();
  const g = randInt(90, 160);
  const pa = Math.round(g * rand(3.6, 4.4));
  const walks = Math.round(pa * rand(0.05, 0.13));
  const ab = pa - walks - randInt(0, 6);
  const avg = clamp(gauss(0.262, 0.028), 0.195, 0.345);
  const hits = Math.round(ab * avg);
  const hr = Math.min(Math.round(ab * rand(0.008, 0.065)), Math.round(hits * 0.4));
  Object.assign(s, {
    games: g,
    plate_appearances: pa,
    at_bats: ab,
    hits,
    home_runs: hr,
    doubles: Math.round((hits - hr) * rand(0.15, 0.26)),
    triples: Math.round((hits - hr) * rand(0, 0.03)),
    walks,
    strikeouts: Math.round(ab * rand(0.13, 0.31)),
    rbi: Math.round(hr * rand(2.2, 3) + (hits - hr) * rand(0.25, 0.4)),
  });
  return s;
}

function pitcherStats(starter) {
  const s = emptyStats();
  const g = starter ? randInt(24, 33) : randInt(40, 70);
  const ip = starter ? g * rand(5, 6.4) : g * rand(0.9, 1.2);
  const outs = Math.round(ip * 3);
  const e = clamp(gauss(3.9, 0.7), 1.9, 6.2);
  const pitches = Math.round(ip * rand(15, 17));
  Object.assign(s, {
    games: g,
    outs_recorded: outs,
    runs_allowed: Math.round((e * outs) / 27),
    pitcher_strikeouts: Math.round(ip * rand(0.7, 1.25)),
    walks_allowed: Math.round(ip * rand(0.25, 0.45)),
    hits_allowed: Math.round(ip * rand(0.78, 1.08)),
    pitches,
    strikes_thrown: Math.round(pitches * rand(0.6, 0.67)),
    wins: starter ? Math.round(g * rand(0.25, 0.5)) : randInt(0, 7),
    losses: starter ? Math.round(g * rand(0.2, 0.42)) : randInt(0, 6),
  });
  return s;
}

const ROSTER = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'P', 'P', 'P', 'P'];

export function generateLeague(teamCount = 10) {
  const cities = shuffle(CITIES).slice(0, teamCount);
  const nicknames = shuffle(NICKNAMES);
  const colors = shuffle(COLORS);
  const usedAbbr = new Set();
  const usedNames = new Set();

  const teams = cities.map((city, i) => {
    const abbr = makeAbbr(city, usedAbbr);
    return {
      id: `${abbr.toLowerCase()}-${Math.random().toString(36).slice(2, 7)}`,
      city,
      nickname: nicknames[i],
      abbr,
      color: colors[i % colors.length],
    };
  });

  const players = [];
  for (const team of teams) {
    let pitcherIdx = 0;
    for (const position of ROSTER) {
      const [nat, , pool] = weighted(NATIONALITIES);
      const names = NAME_POOLS[pool];
      let name;
      let tries = 0;
      do {
        name = `${pick(names.first)} ${pick(names.last)}`;
      } while (usedNames.has(name) && tries++ < 30);
      usedNames.add(name);

      const isPitcher = position === 'P';
      const r = Math.random();
      players.push({
        name,
        nationality: nat,
        position,
        age: randInt(20, 38),
        team_id: team.id,
        bats: isPitcher ? 'R' : r < 0.7 ? 'R' : r < 0.95 ? 'L' : 'S',
        throws: isPitcher ? (Math.random() < 0.35 ? 'L' : 'R') : Math.random() < 0.15 ? 'L' : 'R',
        stats: isPitcher ? pitcherStats(pitcherIdx++ < 2) : batterStats(),
      });
    }
  }
  return { teams, players };
}

export const teamName = (t) => (t ? `${t.city} ${t.nickname}` : '무소속');

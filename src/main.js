import './style.css';
import { db } from './lib/db.js';
import { COUNTRIES, countryLabel, flagOf } from './lib/countries.js';
import {
  POSITIONS, positionName, teamName, battingAvg, era, fmtAvg, fmtEra, fmtIp,
} from './lib/league.js';
import { PITCH_LIST } from './game/scene.js';
import { BattingGame } from './game/batting.js';
import { PitchingGame } from './game/pitching.js';

const app = document.getElementById('app');
const CURRENT_KEY = 'diamond-duel-current-player';
const state = { teams: [], teamMap: new Map(), me: null, game: null, token: 0 };

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const team = (id) => state.teamMap.get(id);
const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];
const fmtDate = (iso) => new Date(iso).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });

function teamChip(id) {
  const t = team(id);
  if (!t) return '<span class="muted">무소속</span>';
  return `<span class="team-chip" style="--team:${t.color}"><b>${esc(t.abbr)}</b> ${esc(teamName(t))}</span>`;
}

function getCurrentId() {
  try { return localStorage.getItem(CURRENT_KEY); } catch { return null; }
}
function setCurrent(player) {
  state.me = player;
  try {
    if (player) localStorage.setItem(CURRENT_KEY, player.id);
    else localStorage.removeItem(CURRENT_KEY);
  } catch { /* 저장 불가 환경 무시 */ }
}

// ------------------------------------------------------------------ 레이아웃 / 라우팅
const NAV = [
  ['home', '홈'], ['profile', '프로필'], ['play', '플레이'], ['records', '기록실'], ['league', '리그'], ['reviews', '리뷰'],
];

function layout(active, inner) {
  const me = state.me;
  return `
    <header class="topbar">
      <button class="brand" data-nav="home">⚾ 다이아몬드 듀얼</button>
      <nav>${NAV.map(([k, label]) => `<button data-nav="${k}" class="${k === active ? 'on' : ''}">${label}</button>`).join('')}</nav>
      <div class="me">${me ? `${flagOf(me.nationality)} <b>${esc(me.name)}</b>` : '<span class="muted">프로필 없음</span>'}
        <span class="mode-badge ${db.mode}">${db.mode === 'supabase' ? 'Supabase 연결됨' : '로컬 모드'}</span></div>
    </header>
    <main class="page">${inner}</main>`;
}

const SCREENS = { home, profile, play, records, league, reviews };

async function go(name, params = {}) {
  if (state.game) {
    state.game.destroy();
    state.game = null;
  }
  const token = ++state.token;
  window.scrollTo(0, 0);
  await (SCREENS[name] || home)(params, token);
}
const stale = (token) => token !== state.token;

app.addEventListener('click', (e) => {
  const nav = e.target.closest('[data-nav]');
  if (nav) {
    e.preventDefault();
    go(nav.dataset.nav);
  }
});

// ------------------------------------------------------------------ 홈
async function home() {
  const me = state.me;
  app.innerHTML = layout('home', `
    <section class="home">
      <div class="hjk" aria-hidden="true">황준규</div>
      <div class="hero">
        <div class="hero-badge">2026 SEASON · ${state.teams.length} TEAMS</div>
        <h1>다이아몬드<br/>듀얼</h1>
        <p class="lead">타석에서는 우타자로 타이밍을 맞춰 받아치고,<br/>마운드에서는 좌완 에이스로 존을 공략하세요.</p>
        <div class="hero-actions">
          ${me
            ? '<button class="btn primary" data-nav="play">플레이 하기</button><button class="btn" data-nav="profile">프로필 변경</button>'
            : '<button class="btn primary" data-nav="profile">선수 프로필 만들기</button>'}
          <button class="btn ghost" data-nav="records">기록실</button>
        </div>
        ${me ? profileCard(me) : ''}
      </div>
      <div class="feature-grid">
        <article class="feature"><h3>🏏 타격 모드</h3><p>상대 투수의 포심·슬라이더·커브·포크를 보고 <b>SPACE</b>로 스윙. 타이밍이 완벽하면 담장을 넘깁니다.</p></article>
        <article class="feature"><h3>🎯 피칭 모드</h3><p>좌완 투수로 4가지 구종을 골라 코스를 조준하고, 제구 게이지를 맞춰 3아웃을 잡으세요.</p></article>
        <article class="feature"><h3>🏟️ 리그</h3><p>미국 각 도시 이름으로 만든 ${state.teams.length}개 팀과 고정된 성적을 가진 생성 선수들이 있습니다.</p></article>
      </div>
    </section>`);
}

function profileCard(p) {
  const s = p.stats;
  return `
    <div class="profile-card" style="--team:${team(p.team_id)?.color ?? '#475569'}">
      <div class="pc-flag">${flagOf(p.nationality)}</div>
      <div class="pc-body">
        <div class="pc-name">${esc(p.name)} <span class="pos">${esc(p.position)}</span></div>
        <div class="pc-meta">${esc(countryLabel(p.nationality))} · ${p.age}세 · ${positionName(p.position)}</div>
        <div class="pc-meta">${teamChip(p.team_id)}</div>
      </div>
      <div class="pc-stats">
        <div><span>경기</span><b>${s.games}</b></div>
        <div><span>타율</span><b>${fmtAvg(battingAvg(s))}</b></div>
        <div><span>HR</span><b>${s.home_runs}</b></div>
        <div><span>ERA</span><b>${fmtEra(era(s))}</b></div>
        <div><span>탈삼진</span><b>${s.pitcher_strikeouts}</b></div>
        <div><span>총점</span><b>${s.total_score}</b></div>
      </div>
    </div>`;
}

// ------------------------------------------------------------------ 프로필
async function profile(_, token) {
  app.innerHTML = layout('profile', '<div class="loading">불러오는 중…</div>');
  const mine = await db.getPlayers({ generated: false });
  if (stale(token)) return;

  const countryOptions = (filter = '') => {
    const f = filter.trim().toLowerCase();
    return COUNTRIES.filter((c) => !f || c.ko.toLowerCase().includes(f) || c.en.toLowerCase().includes(f) || c.code.toLowerCase() === f)
      .map((c) => `<option value="${c.code}">${c.flag} ${esc(c.ko)} (${esc(c.en)})</option>`)
      .join('');
  };

  app.innerHTML = layout('profile', `
    <section class="two-col">
      <form class="card form" id="profile-form">
        <h2>새 선수 프로필</h2>
        <label>이름<input name="name" required maxlength="30" placeholder="선수 이름" /></label>
        <label>국적 <small class="muted">(${COUNTRIES.length}개 국가/지역 — 한글·영문 검색)</small>
          <input id="country-search" placeholder="예: 대한민국, Japan, Brazil…" autocomplete="off" />
          <select name="nationality" id="country-select" size="7" required>${countryOptions()}</select>
        </label>
        <div class="row">
          <label>포지션
            <select name="position">${POSITIONS.map((p) => `<option value="${p.code}">${p.code} · ${p.name}</option>`).join('')}</select>
          </label>
          <label>나이<input name="age" type="number" min="16" max="50" value="24" required /></label>
        </div>
        <label>소속 팀
          <div class="row tight">
            <select name="team_id" id="team-select">${state.teams.map((t) => `<option value="${t.id}">${esc(t.abbr)} · ${esc(teamName(t))}</option>`).join('')}</select>
            <button type="button" class="btn small" id="random-team">🎲 랜덤</button>
          </div>
        </label>
        <p class="hint">플레이 방식: 타격은 <b>우타자</b>, 피칭은 <b>좌투수</b>로 진행됩니다.</p>
        <button class="btn primary" type="submit">프로필 만들고 시작하기</button>
        <p class="form-msg" id="form-msg"></p>
      </form>
      <div class="card">
        <h2>내 선수 선택</h2>
        ${mine.length
          ? `<ul class="pick-list">${mine.map((p) => `
              <li class="${state.me?.id === p.id ? 'on' : ''}">
                <button data-pick="${p.id}">
                  <span class="flag">${flagOf(p.nationality)}</span>
                  <span class="grow"><b>${esc(p.name)}</b><small>${esc(p.position)} · ${p.age}세 · ${esc(team(p.team_id)?.abbr ?? '-')}</small></span>
                  <span class="muted">${p.stats.games}경기 · ${p.stats.total_score}점</span>
                </button>
              </li>`).join('')}</ul>`
          : '<p class="muted">아직 만든 선수가 없습니다. 왼쪽에서 프로필을 만들어 주세요.</p>'}
      </div>
    </section>`);

  const search = document.getElementById('country-search');
  const select = document.getElementById('country-select');
  select.value = 'KR';
  search.addEventListener('input', () => {
    const prev = select.value;
    select.innerHTML = countryOptions(search.value);
    if ([...select.options].some((o) => o.value === prev)) select.value = prev;
    else if (select.options.length) select.selectedIndex = 0;
  });
  document.getElementById('random-team').addEventListener('click', () => {
    document.getElementById('team-select').value = pickRandom(state.teams).id;
  });

  app.querySelectorAll('[data-pick]').forEach((b) =>
    b.addEventListener('click', () => {
      setCurrent(mine.find((p) => p.id === b.dataset.pick));
      go('home');
    }));

  document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const msg = document.getElementById('form-msg');
    const name = String(fd.get('name') || '').trim();
    const age = Number(fd.get('age'));
    const nationality = fd.get('nationality');
    if (!name) return (msg.textContent = '이름을 입력해 주세요.');
    if (!nationality) return (msg.textContent = '국적을 선택해 주세요.');
    if (!(age >= 16 && age <= 50)) return (msg.textContent = '나이는 16~50 사이로 입력해 주세요.');
    msg.textContent = '저장 중…';
    try {
      const player = await db.createPlayer({
        name, nationality, position: fd.get('position'), age, team_id: fd.get('team_id'), bats: 'R', throws: 'L',
      });
      setCurrent(player);
      go('play');
    } catch (err) {
      msg.textContent = `저장 실패: ${err.message}`;
    }
  });
}

// ------------------------------------------------------------------ 플레이
async function play() {
  if (!state.me) return go('profile');
  app.innerHTML = layout('play', `
    <section>
      <h2 class="page-title">모드 선택</h2>
      ${profileCard(state.me)}
      <div class="mode-grid">
        <button class="mode-card" data-mode="batting">
          <div class="mode-icon">🏏</div><h3>타격</h3>
          <p>우타자로 타석에 섭니다. 공이 홈플레이트에 도착하는 순간에 맞춰 <b>SPACE / 클릭</b>.</p>
          <ul><li>PERFECT 타이밍 → 장타·홈런</li><li>존 밖의 공은 참으면 볼</li><li>3아웃까지 최대한 많은 득점</li></ul>
        </button>
        <button class="mode-card" data-mode="pitching">
          <div class="mode-icon">🎯</div><h3>피칭</h3>
          <p>좌완 투수로 마운드에 섭니다. 구종 선택 → 코스 조준 → 제구 게이지.</p>
          <ul>${PITCH_LIST.map((p) => `<li><b style="color:${p.color}">${p.key}. ${p.name}</b> ${p.speed[0]}~${p.speed[1]}km/h</li>`).join('')}</ul>
        </button>
      </div>
    </section>`);
  app.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => startGame(b.dataset.mode)));
}

const LINEUP_ORDER = ['CF', 'SS', '1B', '3B', 'RF', 'DH', 'LF', 'C', '2B'];

async function startGame(mode) {
  if (state.game) {
    state.game.destroy();
    state.game = null;
  }
  const token = ++state.token;
  app.innerHTML = layout('play', '<div class="loading">상대 팀을 정하는 중…</div>');
  const me = state.me;
  const myTeam = team(me.team_id);
  const opponents = state.teams.filter((t) => t.id !== me.team_id);
  const opp = pickRandom(opponents.length ? opponents : state.teams);
  const roster = await db.getPlayers({ generated: true, teamId: opp.id });
  if (stale(token)) return;

  const pitchers = roster.filter((p) => p.position === 'P');
  const pitcher = pickRandom(pitchers) ?? { name: 'Unknown', throws: 'R', stats: {} };
  const lineup = roster
    .filter((p) => p.position !== 'P')
    .sort((a, b) => LINEUP_ORDER.indexOf(a.position) - LINEUP_ORDER.indexOf(b.position));

  const isBat = mode === 'batting';
  const head = isBat
    ? `<b>${esc(me.name)}</b> (우타) vs 투수 <b>${esc(pitcher.name)}</b> ${flagOf(pitcher.nationality)} (${pitcher.throws === 'L' ? '좌투' : '우투'} · ERA ${fmtEra(era(pitcher.stats))})`
    : `<b>${esc(me.name)}</b> (좌투) vs <b>${esc(teamName(opp))}</b> 타선`;

  app.innerHTML = layout('play', `
    <section class="game-wrap">
      <div class="game-head">
        <span class="mode-tag">${isBat ? '타격' : '피칭'}</span>
        <span>${head}</span>
        <span class="vs">${teamChip(me.team_id)} <i>VS</i> ${teamChip(opp.id)}</span>
      </div>
      <div class="game-main">
        <div class="canvas-box">
          <canvas id="game-canvas" width="960" height="540"></canvas>
          <div class="overlay hidden" id="overlay"></div>
        </div>
        <aside class="game-side">
          ${isBat ? `
            <div class="card slim"><h4>조작</h4><p><kbd>SPACE</kbd> 또는 화면 클릭/터치로 스윙</p>
              <p class="muted">빠르면 당겨치고(좌측), 늦으면 밀어칩니다(우측). 변화구는 타이밍 창이 좁습니다.</p></div>`
            : `
            <div class="card slim"><h4>구종</h4><div class="pitch-buttons">
              ${PITCH_LIST.map((p) => `<button data-pitch="${p.id}" style="--pc:${p.color}"><kbd>${p.key}</kbd> ${p.name}</button>`).join('')}
            </div>
            <p class="muted">마우스로 코스 조준 → 클릭 → 게이지 가운데에서 다시 클릭(또는 SPACE). 같은 구종을 반복하면 타자가 적응합니다.</p></div>
            <div class="card slim" id="batter-card"></div>`}
          <div class="card slim log-card"><h4>투구 기록</h4><ol class="log" id="log"></ol></div>
          <button class="btn ghost" data-nav="play">그만하기</button>
        </aside>
      </div>
    </section>`);

  const canvas = document.getElementById('game-canvas');
  const logEl = document.getElementById('log');
  let n = 0;
  const onLog = (line) => {
    const li = document.createElement('li');
    li.textContent = `${++n}구 · ${line}`;
    logEl.prepend(li);
  };
  const onEnd = (result) => showResult(result, { mode, opp, token });

  if (isBat) {
    state.game = new BattingGame(canvas, { player: me, myTeam, pitcher, pitcherTeam: opp, onLog, onEnd });
  } else {
    const batterCard = document.getElementById('batter-card');
    const onState = ({ type, batter, order }) => {
      app.querySelectorAll('[data-pitch]').forEach((b) => b.classList.toggle('on', b.dataset.pitch === type));
      batterCard.innerHTML = `<h4>${order}번 타자</h4>
        <p><b>${esc(batter.name)}</b> ${flagOf(batter.nationality)} · ${esc(batter.position)}</p>
        <p class="muted">AVG ${fmtAvg(battingAvg(batter.stats))} · HR ${batter.stats?.home_runs ?? 0} · K ${batter.stats?.strikeouts ?? 0}</p>`;
    };
    state.game = new PitchingGame(canvas, { player: me, myTeam, oppTeam: opp, lineup, onLog, onEnd, onState });
    app.querySelectorAll('[data-pitch]').forEach((b) =>
      b.addEventListener('click', () => state.game?.setPitchType(b.dataset.pitch)));
  }
  state.game.start();
}

async function showResult(result, { mode, opp, token }) {
  if (stale(token)) return;
  const overlay = document.getElementById('overlay');
  overlay.classList.remove('hidden');
  overlay.innerHTML = `
    <div class="result">
      <h2>${mode === 'batting' ? '타격' : '피칭'} 결과</h2>
      <div class="big-score">${result.score}<small>점</small></div>
      <div class="summary">${result.summary.map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div>
      <p class="save-msg" id="save-msg">기록 저장 중…</p>
      <div class="hero-actions">
        <button class="btn primary" id="again">다시 하기</button>
        <button class="btn" data-nav="records">기록실</button>
        <button class="btn ghost" data-nav="reviews">리뷰 쓰기</button>
      </div>
    </div>`;
  document.getElementById('again').addEventListener('click', () => startGame(mode));
  const msg = document.getElementById('save-msg');
  try {
    await db.recordGame({
      playerId: state.me.id, mode, score: result.score, opponentTeamId: opp.id, details: result.details, delta: result.delta,
    });
    state.me = (await db.getPlayer(state.me.id)) ?? state.me;
    if (!stale(token)) msg.textContent = `✅ 기록이 저장되었습니다 (${db.mode === 'supabase' ? 'Supabase' : '로컬'})`;
  } catch (err) {
    if (!stale(token)) msg.textContent = `⚠️ 저장 실패: ${err.message}`;
  }
}

// ------------------------------------------------------------------ 기록실
const SORTS = {
  total_score: ['총점', (p) => p.stats.total_score],
  avg: ['타율', (p) => (p.stats.at_bats >= 3 ? battingAvg(p.stats) : -1)],
  home_runs: ['홈런', (p) => p.stats.home_runs],
  rbi: ['타점', (p) => p.stats.rbi],
  era: ['ERA (낮은순)', (p) => (p.stats.outs_recorded >= 3 ? -era(p.stats) : -999)],
  pitcher_strikeouts: ['탈삼진', (p) => p.stats.pitcher_strikeouts],
  wins: ['승', (p) => p.stats.wins],
};

async function records(params = {}, token) {
  const tab = params.tab ?? 'batting';
  app.innerHTML = layout('records', `
    <h2 class="page-title">기록실</h2>
    <div class="tabs">
      <button data-tab="batting" class="${tab === 'batting' ? 'on' : ''}">🏏 타격 랭킹</button>
      <button data-tab="pitching" class="${tab === 'pitching' ? 'on' : ''}">🎯 피칭 랭킹</button>
      <button data-tab="players" class="${tab === 'players' ? 'on' : ''}">📋 선수 성적</button>
    </div>
    <div id="records-body" class="card"><div class="loading">불러오는 중…</div></div>`);
  app.querySelectorAll('[data-tab]').forEach((b) =>
    b.addEventListener('click', () => go('records', { tab: b.dataset.tab })));
  const body = document.getElementById('records-body');

  if (tab === 'batting' || tab === 'pitching') {
    const rows = await db.getLeaderboard(tab, 30);
    if (stale(token)) return;
    body.innerHTML = rows.length
      ? `<div class="table-wrap"><table>
          <thead><tr><th>#</th><th>선수</th><th>팀</th><th class="num">점수</th><th>세부</th><th>일시</th></tr></thead>
          <tbody>${rows.map((r, i) => `
            <tr class="${r.player_id === state.me?.id ? 'me-row' : ''}">
              <td>${i + 1}</td>
              <td>${r.player ? `${flagOf(r.player.nationality)} ${esc(r.player.name)}` : '-'}</td>
              <td>${team(r.player?.team_id)?.abbr ?? '-'}</td>
              <td class="num"><b>${r.score}</b></td>
              <td class="muted">${tab === 'batting'
                ? `득점 ${r.details?.runs ?? 0} · PERFECT ${r.details?.perfects ?? 0}`
                : `상대 타자 ${r.details?.batters_faced ?? 0}명 · ${r.details?.completed ? '이닝 완료' : '강판'}`}</td>
              <td class="muted">${fmtDate(r.created_at)}</td>
            </tr>`).join('')}</tbody></table></div>`
      : '<p class="muted">아직 기록이 없습니다. 첫 기록의 주인공이 되어 보세요!</p>';
    return;
  }

  const all = await db.getPlayers();
  if (stale(token)) return;
  const filters = { who: 'all', team: '', sort: 'total_score' };
  body.innerHTML = `
    <div class="filters">
      <select id="f-who"><option value="all">전체 선수</option><option value="user">유저 선수</option><option value="gen">생성 선수</option></select>
      <select id="f-team"><option value="">모든 팀</option>${state.teams.map((t) => `<option value="${t.id}">${esc(t.abbr)} · ${esc(teamName(t))}</option>`).join('')}</select>
      <select id="f-sort">${Object.entries(SORTS).map(([k, [label]]) => `<option value="${k}">${label} 순</option>`).join('')}</select>
      <span class="muted" id="f-count"></span>
    </div>
    <div class="table-wrap" id="player-table"></div>`;
  const draw = () => {
    let list = all.filter((p) =>
      (filters.who === 'all' || (filters.who === 'gen') === p.is_generated) && (!filters.team || p.team_id === filters.team));
    const key = SORTS[filters.sort][1];
    list = [...list].sort((a, b) => key(b) - key(a));
    document.getElementById('f-count').textContent = `${list.length}명`;
    document.getElementById('player-table').innerHTML = playerTable(list);
  };
  for (const [id, k] of [['f-who', 'who'], ['f-team', 'team'], ['f-sort', 'sort']]) {
    document.getElementById(id).addEventListener('change', (e) => {
      filters[k] = e.target.value;
      draw();
    });
  }
  draw();
}

function playerTable(list) {
  if (!list.length) return '<p class="muted">해당하는 선수가 없습니다.</p>';
  return `<table>
    <thead><tr>
      <th>선수</th><th>구분</th><th>팀</th><th>포지션</th><th class="num">나이</th><th class="num">G</th>
      <th class="num">AVG</th><th class="num">H</th><th class="num">HR</th><th class="num">RBI</th>
      <th class="num">IP</th><th class="num">ERA</th><th class="num">K</th><th class="num">W-L</th><th class="num">총점</th>
    </tr></thead>
    <tbody>${list.map((p) => {
      const s = p.stats;
      return `<tr class="${p.id === state.me?.id ? 'me-row' : ''}">
        <td title="${esc(countryLabel(p.nationality))}">${flagOf(p.nationality)} ${esc(p.name)}</td>
        <td>${p.is_generated ? '<span class="tag gen">생성</span>' : '<span class="tag user">유저</span>'}</td>
        <td>${esc(team(p.team_id)?.abbr ?? '-')}</td>
        <td>${esc(p.position)}</td>
        <td class="num">${p.age}</td>
        <td class="num">${s.games}</td>
        <td class="num">${fmtAvg(battingAvg(s))}</td>
        <td class="num">${s.hits}</td>
        <td class="num">${s.home_runs}</td>
        <td class="num">${s.rbi}</td>
        <td class="num">${s.outs_recorded ? fmtIp(s.outs_recorded) : '-'}</td>
        <td class="num">${fmtEra(era(s))}</td>
        <td class="num">${s.pitcher_strikeouts || (s.outs_recorded ? 0 : '-')}</td>
        <td class="num">${s.outs_recorded ? `${s.wins}-${s.losses}` : '-'}</td>
        <td class="num">${p.is_generated ? '-' : s.total_score}</td>
      </tr>`;
    }).join('')}</tbody></table>`;
}

// ------------------------------------------------------------------ 리그
async function league(params = {}, token) {
  const selected = params.team ?? state.teams[0]?.id;
  app.innerHTML = layout('league', `
    <h2 class="page-title">리그 · ${state.teams.length}개 팀</h2>
    <div class="team-grid">${state.teams.map((t) => `
      <button class="team-card ${t.id === selected ? 'on' : ''}" data-team="${t.id}" style="--team:${t.color}">
        <span class="abbr">${esc(t.abbr)}</span>
        <span class="city">${esc(t.city)}</span>
        <span class="nick">${esc(t.nickname)}</span>
      </button>`).join('')}</div>
    <div class="card" id="roster"><div class="loading">불러오는 중…</div></div>`);
  app.querySelectorAll('[data-team]').forEach((b) => b.addEventListener('click', () => go('league', { team: b.dataset.team })));
  if (!selected) return;
  const roster = await db.getPlayers({ teamId: selected });
  if (stale(token)) return;
  const t = team(selected);
  const pitchers = roster.filter((p) => p.position === 'P');
  const hitters = roster.filter((p) => p.position !== 'P')
    .sort((a, b) => (POSITIONS.findIndex((x) => x.code === a.position) - POSITIONS.findIndex((x) => x.code === b.position)));
  document.getElementById('roster').innerHTML = `
    <h3 style="color:${t.color}">${esc(teamName(t))}</h3>
    <p class="muted">생성 선수의 이름과 성적은 리그 생성 시 고정되어 저장됩니다. 이 팀을 고른 유저 선수도 함께 표시됩니다.</p>
    <h4>야수</h4><div class="table-wrap">${playerTable(hitters)}</div>
    <h4>투수</h4><div class="table-wrap">${playerTable(pitchers)}</div>`;
}

// ------------------------------------------------------------------ 리뷰
async function reviews(_, token) {
  app.innerHTML = layout('reviews', '<div class="loading">불러오는 중…</div>');
  const list = await db.getReviews();
  if (stale(token)) return;
  const avg = list.length ? list.reduce((s, r) => s + r.rating, 0) / list.length : 0;
  const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

  app.innerHTML = layout('reviews', `
    <section class="two-col">
      <form class="card form" id="review-form">
        <h2>게임 리뷰 쓰기</h2>
        <label>작성자<input name="author" maxlength="30" required value="${esc(state.me?.name ?? '')}" placeholder="이름" /></label>
        <label>평점
          <div class="star-input" id="star-input">${[1, 2, 3, 4, 5].map((i) => `<button type="button" data-star="${i}">★</button>`).join('')}</div>
        </label>
        <label>내용<textarea name="content" maxlength="500" rows="5" required placeholder="게임은 어떠셨나요?"></textarea></label>
        <button class="btn primary" type="submit">리뷰 등록</button>
        <p class="form-msg" id="review-msg"></p>
      </form>
      <div class="card">
        <h2>리뷰 ${list.length}개 <span class="rating-avg">${list.length ? `${stars(Math.round(avg))} ${avg.toFixed(1)}` : ''}</span></h2>
        ${list.length
          ? `<ul class="review-list">${list.map((r) => `
              <li><div class="rv-head"><b>${esc(r.author_name)}</b><span class="stars">${stars(r.rating)}</span><span class="muted">${fmtDate(r.created_at)}</span></div>
              <p>${esc(r.content)}</p></li>`).join('')}</ul>`
          : '<p class="muted">첫 번째 리뷰를 남겨 주세요!</p>'}
      </div>
    </section>`);

  let rating = 5;
  const starBtns = [...app.querySelectorAll('[data-star]')];
  const paint = () => starBtns.forEach((b) => b.classList.toggle('on', Number(b.dataset.star) <= rating));
  starBtns.forEach((b) => b.addEventListener('click', () => { rating = Number(b.dataset.star); paint(); }));
  paint();

  document.getElementById('review-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const msg = document.getElementById('review-msg');
    const authorName = String(fd.get('author') || '').trim();
    const content = String(fd.get('content') || '').trim();
    if (!authorName || !content) return (msg.textContent = '작성자와 내용을 입력해 주세요.');
    msg.textContent = '등록 중…';
    try {
      await db.addReview({ playerId: state.me?.id, authorName, rating, content });
      go('reviews');
    } catch (err) {
      msg.textContent = `등록 실패: ${err.message}`;
    }
  });
}

// ------------------------------------------------------------------ 시작
async function boot() {
  app.innerHTML = '<div class="boot"><div class="spinner">⚾</div><p>리그를 준비하는 중…</p></div>';
  try {
    state.teams = await db.init();
    state.teamMap = new Map(state.teams.map((t) => [t.id, t]));
    const id = getCurrentId();
    if (id) setCurrent(await db.getPlayer(id));
    go('home');
  } catch (err) {
    app.innerHTML = `
      <div class="boot error">
        <h2>데이터베이스에 연결할 수 없습니다</h2>
        <p>${esc(err.message)}</p>
        <p class="muted">.env.local 의 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 값과,<br/>
        Supabase SQL Editor 에서 <code>supabase/schema.sql</code> 을 실행했는지 확인해 주세요.</p>
        <button class="btn primary" onclick="location.reload()">다시 시도</button>
      </div>`;
  }
}

boot();

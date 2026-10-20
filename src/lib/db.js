// 데이터 저장 계층: Supabase 가 설정되어 있으면 Supabase, 아니면 localStorage 로컬 모드
import { supabase, isSupabaseConfigured } from './supabase.js';
import { generateLeague, emptyStats, STAT_KEYS } from './league.js';

function normalizePlayer(row) {
  if (!row) return null;
  const { player_stats, ...rest } = row;
  const stats = Array.isArray(player_stats) ? player_stats[0] : player_stats;
  return { ...rest, stats: { ...emptyStats(), ...(stats || {}) } };
}

function check({ data, error }) {
  if (error) throw new Error(error.message || String(error));
  return data;
}

// ---------------------------------------------------------------- Supabase
const remote = {
  mode: 'supabase',

  async init() {
    let teams = check(await supabase.from('teams').select('*').order('city'));
    if (!teams.length) {
      const league = generateLeague();
      check(await supabase.rpc('seed_league', { p_teams: league.teams, p_players: league.players }));
      teams = check(await supabase.from('teams').select('*').order('city'));
    }
    return teams;
  },

  async getPlayers({ generated, teamId } = {}) {
    let q = supabase.from('players').select('*, player_stats(*)');
    if (generated !== undefined) q = q.eq('is_generated', generated);
    if (teamId) q = q.eq('team_id', teamId);
    const rows = check(await q.order('created_at', { ascending: false }).limit(1000));
    return rows.map(normalizePlayer);
  },

  async getPlayer(id) {
    const row = check(await supabase.from('players').select('*, player_stats(*)').eq('id', id).maybeSingle());
    return normalizePlayer(row);
  },

  async createPlayer(p) {
    const row = check(
      await supabase
        .from('players')
        .insert({ ...p, is_generated: false })
        .select('*')
        .single(),
    );
    return normalizePlayer(row);
  },

  async recordGame({ playerId, mode, score, opponentTeamId, details, delta }) {
    return check(
      await supabase.rpc('record_game', {
        p_player_id: playerId,
        p_mode: mode,
        p_score: Math.max(0, Math.round(score)),
        p_opponent_team_id: opponentTeamId ?? null,
        p_details: details ?? {},
        p_delta: delta ?? {},
      }),
    );
  },

  async getLeaderboard(mode, limit = 20) {
    const rows = check(
      await supabase
        .from('game_records')
        .select('id, score, mode, created_at, details, player_id, players(name, nationality, team_id)')
        .eq('mode', mode)
        .order('score', { ascending: false })
        .limit(limit),
    );
    return rows.map((r) => ({ ...r, player: r.players }));
  },

  async getReviews() {
    return check(await supabase.from('reviews').select('*').order('created_at', { ascending: false }).limit(200));
  },

  async addReview({ playerId, authorName, rating, content }) {
    return check(
      await supabase
        .from('reviews')
        .insert({ player_id: playerId ?? null, author_name: authorName, rating, content })
        .select('*')
        .single(),
    );
  },
};

// ---------------------------------------------------------------- localStorage
const LOCAL_KEY = 'diamond-duel-db-v1';
const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

function loadLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* 손상된 데이터는 새로 만든다 */
  }
  return { teams: [], players: [], stats: {}, records: [], reviews: [] };
}
function saveLocal(data) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
}
const withStats = (data, p) => ({ ...p, stats: { ...emptyStats(), ...(data.stats[p.id] || {}) } });

const local = {
  mode: 'local',

  async init() {
    const data = loadLocal();
    if (!data.teams.length) {
      const league = generateLeague();
      data.teams = league.teams.map((t) => ({ ...t, created_at: new Date().toISOString() }));
      for (const gp of league.players) {
        const id = uid();
        const { stats, ...rest } = gp;
        data.players.push({ ...rest, id, is_generated: true, created_at: new Date().toISOString() });
        data.stats[id] = stats;
      }
      saveLocal(data);
    }
    return [...data.teams].sort((a, b) => a.city.localeCompare(b.city));
  },

  async getPlayers({ generated, teamId } = {}) {
    const data = loadLocal();
    return data.players
      .filter((p) => (generated === undefined || p.is_generated === generated) && (!teamId || p.team_id === teamId))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((p) => withStats(data, p));
  },

  async getPlayer(id) {
    const data = loadLocal();
    const p = data.players.find((x) => x.id === id);
    return p ? withStats(data, p) : null;
  },

  async createPlayer(p) {
    const data = loadLocal();
    const player = { ...p, id: uid(), is_generated: false, created_at: new Date().toISOString() };
    data.players.push(player);
    saveLocal(data);
    return withStats(data, player);
  },

  async recordGame({ playerId, mode, score, opponentTeamId, details, delta }) {
    const data = loadLocal();
    const p = data.players.find((x) => x.id === playerId);
    if (!p) throw new Error('player not found');
    if (p.is_generated) throw new Error('generated player stats are fixed');
    const s = { ...emptyStats(), ...(data.stats[playerId] || {}) };
    for (const k of STAT_KEYS) s[k] += Number(delta?.[k] || 0);
    s.games += 1;
    const sc = Math.max(0, Math.round(score));
    if (mode === 'batting') s.best_batting_score = Math.max(s.best_batting_score, sc);
    if (mode === 'pitching') s.best_pitching_score = Math.max(s.best_pitching_score, sc);
    s.total_score += sc;
    data.stats[playerId] = s;
    const id = uid();
    data.records.push({
      id, player_id: playerId, mode, score: sc, opponent_team_id: opponentTeamId ?? null,
      details: details ?? {}, created_at: new Date().toISOString(),
    });
    saveLocal(data);
    return id;
  },

  async getLeaderboard(mode, limit = 20) {
    const data = loadLocal();
    return data.records
      .filter((r) => r.mode === mode)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((r) => {
        const p = data.players.find((x) => x.id === r.player_id);
        return { ...r, player: p ? { name: p.name, nationality: p.nationality, team_id: p.team_id } : null };
      });
  },

  async getReviews() {
    return [...loadLocal().reviews].sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async addReview({ playerId, authorName, rating, content }) {
    const data = loadLocal();
    const review = {
      id: uid(), player_id: playerId ?? null, author_name: authorName, rating, content,
      created_at: new Date().toISOString(),
    };
    data.reviews.push(review);
    saveLocal(data);
    return review;
  },
};

export const db = isSupabaseConfigured ? remote : local;

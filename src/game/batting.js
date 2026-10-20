// 타격 모드: 우타자(플레이어)가 상대 투수의 공을 타이밍에 맞춰 친다
import {
  W, H, MOUND, WINDUP_MS, RELEASE_PHASE, PITCH_TYPES, SWING_MS, SWING_CONTACT_MS,
  rand, clamp, zoneToScreen, isStrike, flightMs, breakPx, ballAt, pitcherHand,
  drawField, drawZone, drawPitcher, drawBatter, drawBall, drawMitt, makeHitBall, drawHitBall,
  drawBanner, drawScoreboard, roundRect, Inning,
} from './scene.js';

const WINDOWS = { in: { p: 38, g: 85, w: 140 }, out: { p: 0, g: 50, w: 110 } };
const DIFFICULTY = { fourseam: 1, slider: 0.9, curve: 0.95, fork: 0.85 };
const PITCH_MIX = [['fourseam', 45], ['slider', 22], ['curve', 15], ['fork', 18]];

function weighted(list) {
  let r = Math.random() * list.reduce((s, x) => s + x[1], 0);
  for (const [v, w] of list) if ((r -= w) <= 0) return v;
  return list[0][0];
}

export class BattingGame {
  constructor(canvas, { player, myTeam, pitcher, pitcherTeam, onLog, onEnd }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.player = player;
    this.myColor = myTeam?.color ?? '#b91c1c';
    this.pitcher = pitcher;
    this.pitcherHand = pitcher?.throws === 'L' ? 'L' : 'R';
    this.pitcherColor = pitcherTeam?.color ?? '#2563eb';
    this.onLog = onLog ?? (() => {});
    this.onEnd = onEnd ?? (() => {});
    this.inning = new Inning();
    this.tally = {
      plate_appearances: 0, at_bats: 0, hits: 0, doubles: 0, triples: 0, home_runs: 0,
      rbi: 0, walks: 0, strikeouts: 0, perfects: 0, pitches_seen: 0,
    };
    this.pitch = null;
    this.swing = null;
    this.hitBall = null;
    this.banner = null;
    this.lastSpeed = null;
    this.phase = 'ready';
    this.phaseStart = performance.now();
    this.ended = false;

    this.loop = this.loop.bind(this);
    this.onKey = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        this.doSwing();
      }
    };
    this.onPointer = (e) => {
      e.preventDefault();
      this.doSwing();
    };
  }

  start() {
    window.addEventListener('keydown', this.onKey);
    this.canvas.addEventListener('pointerdown', this.onPointer);
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    this.ended = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey);
    this.canvas.removeEventListener('pointerdown', this.onPointer);
  }

  get score() {
    const t = this.tally;
    return this.inning.runs * 100 + t.hits * 30 + t.home_runs * 70 + t.walks * 10 + t.perfects * 15;
  }

  // ------------------------------------------------------------ 진행
  nextPitch(now) {
    const type = weighted(PITCH_MIX);
    const pt = PITCH_TYPES[type];
    const speed = Math.round(rand(...pt.speed));
    let nx;
    let ny;
    if (Math.random() < 0.58) {
      nx = rand(-0.9, 0.9);
      ny = rand(-0.9, 0.9);
    } else if ((type === 'fork' || type === 'curve') && Math.random() < 0.6) {
      nx = rand(-0.9, 0.9);
      ny = rand(1.25, 1.9);
    } else {
      const side = Math.floor(Math.random() * 4);
      nx = side < 2 ? (side === 0 ? -1 : 1) * rand(1.25, 1.8) : rand(-1, 1);
      ny = side < 2 ? rand(-1.1, 1.1) : (side === 2 ? -1 : 1) * rand(1.25, 1.7);
    }
    const releaseTime = now + WINDUP_MS * RELEASE_PHASE;
    const duration = flightMs(speed);
    this.pitch = {
      type, speed, nx, ny,
      inZone: isStrike(nx, ny),
      start: now,
      target: zoneToScreen(nx, ny),
      brk: breakPx(type, this.pitcherHand),
      arc: pt.arc,
      duration,
      releaseTime,
      arrival: releaseTime + duration,
      release: pitcherHand(MOUND.x, MOUND.y, this.pitcherHand, RELEASE_PHASE),
    };
    this.swing = null;
    this.hitBall = null;
    this.resolved = false;
    this.tally.pitches_seen++;
    this.setPhase('pitch', now);
  }

  setPhase(p, now) {
    this.phase = p;
    this.phaseStart = now;
  }

  doSwing() {
    if (this.phase !== 'pitch' || this.swing || this.resolved) return;
    const now = performance.now();
    this.swing = { start: now, contactTime: now + SWING_CONTACT_MS, evaluated: false, miss: false };
  }

  evaluateSwing(now) {
    const s = this.swing;
    const p = this.pitch;
    s.evaluated = true;
    if (s.contactTime < p.releaseTime) {
      s.miss = true;
      s.diff = -999;
      return;
    }
    const diff = s.contactTime - p.arrival;
    const win = p.inZone ? WINDOWS.in : WINDOWS.out;
    const f = DIFFICULTY[p.type];
    const ad = Math.abs(diff);
    s.diff = diff;
    s.quality = ad <= win.p * f ? 'perfect' : ad <= win.g * f ? 'good' : ad <= win.w * f ? 'weak' : 'miss';
    if (s.quality === 'miss') {
      s.miss = true;
      return;
    }
    this.resolveContact(s.quality, diff, now);
  }

  resolveContact(q, diff, now) {
    const p = this.pitch;
    const r = Math.random();
    let outcome;
    if (q === 'perfect') outcome = r < 0.5 ? 4 : r < 0.75 ? 2 : r < 0.85 ? 3 : 1;
    else if (q === 'good') outcome = r < 0.42 ? 1 : r < 0.57 ? 2 : r < 0.6 ? 3 : r < 0.64 ? 4 : 'out';
    else outcome = r < 0.62 ? 'foul' : 'out';

    const t = (this.swing.contactTime - p.releaseTime) / p.duration;
    const from = ballAt(t, p);
    let dir = clamp(diff / 100, -1, 1);
    let kind;
    let text;
    let color = '#facc15';
    const inn = this.inning;
    const T = this.tally;
    let res;

    if (outcome === 'foul') {
      dir = (diff < 0 ? -1 : 1) * rand(1.25, 1.6);
      kind = 'foul';
      res = inn.strike(true);
      text = '파울';
      color = '#e2e8f0';
    } else if (outcome === 'out') {
      kind = ['grounder', 'fly', 'liner'][Math.floor(Math.random() * 3)];
      res = inn.out();
      text = { grounder: '땅볼 아웃', fly: '뜬공 아웃', liner: '직선타 아웃' }[kind];
      color = '#f87171';
      T.plate_appearances++;
      T.at_bats++;
    } else {
      kind = outcome === 4 ? 'hr' : outcome === 1 ? (Math.random() < 0.5 ? 'grounder' : 'liner') : 'liner';
      res = inn.hit(outcome);
      text = { 1: '안타!', 2: '2루타!', 3: '3루타!', 4: '홈런!!' }[outcome];
      color = outcome === 4 ? '#fde047' : '#4ade80';
      T.plate_appearances++;
      T.at_bats++;
      T.hits++;
      if (outcome === 2) T.doubles++;
      if (outcome === 3) T.triples++;
      if (outcome === 4) T.home_runs++;
      T.rbi += res.runs;
    }
    if (q === 'perfect') T.perfects++;

    this.hitBall = makeHitBall(from, kind, dir, now);
    const timing = `${q === 'perfect' ? 'PERFECT' : q === 'good' ? 'GOOD' : '빗맞음'} · ${diff < 0 ? '빠름' : '늦음'} ${Math.abs(Math.round(diff))}ms`;
    const runText = res.runs ? ` (${res.runs}점 득점)` : '';
    this.finishPitch(now, text + runText, timing, color);
  }

  resolveNoSwing(now) {
    const p = this.pitch;
    const inn = this.inning;
    if (p.inZone) {
      const res = inn.strike();
      if (res.k) {
        this.tally.strikeouts++;
        this.tally.plate_appearances++;
        this.tally.at_bats++;
        this.finishPitch(now, '루킹 삼진', '스트라이크 존 통과', '#f87171');
      } else this.finishPitch(now, '스트라이크', '존 안으로 들어온 공', '#facc15');
    } else {
      const res = inn.ball();
      if (res.walk) {
        this.tally.walks++;
        this.tally.plate_appearances++;
        this.tally.rbi += res.runs;
        this.finishPitch(now, '볼넷', res.runs ? '밀어내기 득점!' : '1루로 걸어 나갑니다', '#4ade80');
      } else this.finishPitch(now, '볼', '잘 참았습니다', '#86efac');
    }
  }

  resolveMiss(now) {
    const res = this.inning.strike();
    const d = this.swing.diff;
    const sub = d === -999 ? '너무 빨랐습니다' : `${d < 0 ? '빠름' : '늦음'} ${Math.abs(Math.round(d))}ms`;
    if (res.k) {
      this.tally.strikeouts++;
      this.tally.plate_appearances++;
      this.tally.at_bats++;
      this.finishPitch(now, '헛스윙 삼진', sub, '#f87171');
    } else this.finishPitch(now, '헛스윙', sub, '#facc15');
  }

  finishPitch(now, text, sub, color) {
    const p = this.pitch;
    this.resolved = true;
    this.lastSpeed = { speed: p.speed, type: p.type };
    this.banner = { text, sub, color, start: now };
    this.onLog(`${PITCH_TYPES[p.type].name} ${p.speed}km/h ${p.inZone ? '(존)' : '(볼)'} → ${text}`);
    this.setPhase('result', now);
  }

  update(now) {
    if (this.phase === 'ready' && now - this.phaseStart > 900) this.nextPitch(now);
    if (this.phase === 'pitch') {
      const p = this.pitch;
      const s = this.swing;
      if (s && !s.evaluated && now >= s.contactTime) this.evaluateSwing(now);
      if (!this.resolved) {
        if (!s && now >= p.arrival + 160) this.resolveNoSwing(now);
        else if (s && s.evaluated && s.miss && now >= p.arrival) this.resolveMiss(now);
      }
    }
    if (this.phase === 'result') {
      const wait = this.hitBall ? Math.max(1500, this.hitBall.dur + 400) : 1300;
      if (now - this.phaseStart > wait) {
        if (this.inning.outs >= 3) this.setPhase('over', now);
        else this.setPhase('ready', now);
      }
    }
    if (this.phase === 'over' && !this.ended && now - this.phaseStart > 600) {
      this.ended = true;
      this.finish();
    }
  }

  finish() {
    const t = this.tally;
    const delta = {
      plate_appearances: t.plate_appearances, at_bats: t.at_bats, hits: t.hits, doubles: t.doubles,
      triples: t.triples, home_runs: t.home_runs, rbi: t.rbi, walks: t.walks, strikeouts: t.strikeouts,
    };
    this.onEnd({
      mode: 'batting',
      score: this.score,
      delta,
      details: { runs: this.inning.runs, perfects: t.perfects, pitches_seen: t.pitches_seen, pitcher: this.pitcher?.name },
      summary: [
        ['득점', this.inning.runs], ['안타', t.hits], ['홈런', t.home_runs], ['타점', t.rbi],
        ['볼넷', t.walks], ['삼진', t.strikeouts], ['PERFECT', t.perfects],
      ],
    });
  }

  // ------------------------------------------------------------ 렌더
  render(now) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);
    drawField(ctx);
    drawZone(ctx, { alpha: 0.4 });

    const p = this.pitch;
    let pPhase = null;
    if (p && now - p.start <= WINDUP_MS && this.phase !== 'ready') pPhase = (now - p.start) / WINDUP_MS;
    drawPitcher(ctx, {
      x: MOUND.x, y: MOUND.y, hand: this.pitcherHand, phase: pPhase, color: this.pitcherColor,
      holdingBall: pPhase == null ? this.phase === 'ready' : pPhase < RELEASE_PHASE,
    });

    let swingT = null;
    if (this.swing) {
      const st = (now - this.swing.start) / SWING_MS;
      swingT = st > 2.2 ? null : Math.min(st, 1);
    }
    drawBatter(ctx, { bats: 'R', swingT, color: this.myColor, name: this.player?.name ?? '' });

    if (p && (this.phase === 'pitch' || this.phase === 'result') && now >= p.releaseTime && !this.hitBall) {
      const t = (now - p.releaseTime) / p.duration;
      if (t >= 1) {
        drawMitt(ctx, p.target.x, p.target.y);
        drawBall(ctx, p.target.x, p.target.y, 8);
      } else {
        const b = ballAt(t, p);
        const prev = ballAt(Math.max(0, t - 0.06), p);
        drawBall(ctx, b.x, b.y, b.r, prev);
      }
    }
    if (this.hitBall) drawHitBall(ctx, this.hitBall, now);

    drawScoreboard(ctx, this.inning, [`득점 ${this.inning.runs}`, `점수 ${this.score}`]);

    // 전광판 (구속)
    ctx.save();
    ctx.fillStyle = 'rgba(15,23,42,0.85)';
    roundRect(ctx, 790, 140, 156, 64, 10);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 12px "Noto Sans KR", sans-serif';
    ctx.fillText('구속 / 구종', 868, 160);
    if (this.lastSpeed && this.phase !== 'pitch') {
      ctx.fillStyle = PITCH_TYPES[this.lastSpeed.type].color;
      ctx.font = '24px "Black Han Sans", sans-serif';
      ctx.fillText(`${this.lastSpeed.speed}km/h`, 868, 186);
      ctx.font = 'bold 12px "Noto Sans KR", sans-serif';
      ctx.fillText(PITCH_TYPES[this.lastSpeed.type].name, 868, 200);
    } else {
      ctx.fillStyle = '#475569';
      ctx.font = '24px "Black Han Sans", sans-serif';
      ctx.fillText('---', 868, 190);
    }
    ctx.restore();

    if (this.banner) drawBanner(ctx, this.banner.text, this.banner.sub, this.banner.color, now - this.banner.start);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 14px "Noto Sans KR", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    const hint = this.phase === 'over' ? '경기 종료!' : 'SPACE 또는 화면 클릭 = 스윙  ·  존 밖의 공은 참으세요';
    ctx.fillText(hint, W / 2, H - 12);
    ctx.restore();
  }

  loop(now) {
    if (this.ended && this.phase === 'over' && now - this.phaseStart > 3000) return;
    this.update(now);
    this.render(now);
    this.raf = requestAnimationFrame(this.loop);
  }
}

// 피칭 모드: 좌투수(플레이어)가 포심/슬라이더/커브/포크볼을 원하는 코스에 던진다
import {
  W, H, MOUND, ZONE, WINDUP_MS, RELEASE_PHASE, PITCH_TYPES, SWING_MS, SWING_CONTACT_MS,
  rand, clamp, zoneToScreen, screenToZone, isStrike, flightMs, breakPx, ballAt, pitcherHand,
  drawField, drawZone, drawPitcher, drawBatter, drawBall, drawMitt, makeHitBall, drawHitBall,
  drawBanner, drawScoreboard, roundRect, Inning,
} from './scene.js';
import { battingAvg, fmtAvg } from '../lib/league.js';

const CHASE = { fourseam: 0.22, slider: 0.42, curve: 0.3, fork: 0.48 };
const CONTACT = { fourseam: 0.8, slider: 0.66, curve: 0.64, fork: 0.58 };
const MAX_RUNS = 5;

export class PitchingGame {
  constructor(canvas, { player, myTeam, oppTeam, lineup, onLog, onEnd, onState }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.player = player;
    this.myColor = myTeam?.color ?? '#2563eb';
    this.oppTeam = oppTeam;
    this.oppColor = oppTeam?.color ?? '#b91c1c';
    this.lineup = lineup?.length ? lineup : [{ name: 'Batter', bats: 'R', stats: {} }];
    this.batterIdx = 0;
    this.onLog = onLog ?? (() => {});
    this.onEnd = onEnd ?? (() => {});
    this.onState = onState ?? (() => {});
    this.inning = new Inning();
    this.tally = {
      pitches: 0, strikes_thrown: 0, pitcher_strikeouts: 0, walks_allowed: 0, hits_allowed: 0,
      batters_faced: 0, pinpoint: 0,
    };
    this.type = 'fourseam';
    this.aim = { nx: 0, ny: 0 };
    this.streak = 0;
    this.lastType = null;
    this.prevSpeed = null;
    this.pitch = null;
    this.hitBall = null;
    this.banner = null;
    this.phase = 'aim';
    this.phaseStart = performance.now();
    this.ended = false;

    this.loop = this.loop.bind(this);
    this.onKey = (e) => {
      const pt = Object.values(PITCH_TYPES).find((p) => p.key === e.key);
      if (pt) this.setPitchType(pt.id);
      if (e.code === 'Space') {
        e.preventDefault();
        if (this.phase === 'meter') this.stopMeter(performance.now());
        else if (this.phase === 'aim') this.lockAim(performance.now());
      }
    };
    this.onMove = (e) => this.updateAim(e);
    this.onDown = (e) => {
      e.preventDefault();
      const now = performance.now();
      if (this.phase === 'aim') {
        this.updateAim(e);
        this.lockAim(now);
      } else if (this.phase === 'meter') this.stopMeter(now);
    };
  }

  get batter() {
    return this.lineup[this.batterIdx % this.lineup.length];
  }

  get batterSide() {
    const b = this.batter.bats;
    return b === 'L' ? 'L' : 'R'; // 스위치히터는 좌투수 상대로 우타석
  }

  get score() {
    const t = this.tally;
    const inn = this.inning;
    let s = t.strikes_thrown * 5 + t.pitcher_strikeouts * 30 + inn.outs * 20 - t.hits_allowed * 15
      - inn.runs * 40 - t.walks_allowed * 15 + t.pinpoint * 5;
    if (this.phase === 'over' && inn.outs >= 3 && inn.runs === 0) s += 150;
    return Math.max(0, s);
  }

  start() {
    window.addEventListener('keydown', this.onKey);
    this.canvas.addEventListener('pointermove', this.onMove);
    this.canvas.addEventListener('pointerdown', this.onDown);
    this.emitState();
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    this.ended = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerdown', this.onDown);
  }

  emitState() {
    this.onState({ type: this.type, phase: this.phase, batter: this.batter, order: (this.batterIdx % this.lineup.length) + 1 });
  }

  setPitchType(id) {
    if (this.phase !== 'aim' || !PITCH_TYPES[id]) return;
    this.type = id;
    this.emitState();
  }

  updateAim(e) {
    if (this.phase !== 'aim') return;
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) * W) / rect.width;
    const y = ((e.clientY - rect.top) * H) / rect.height;
    const z = screenToZone(x, y);
    this.aim = { nx: clamp(z.nx, -2.2, 2.2), ny: clamp(z.ny, -2, 2) };
  }

  lockAim(now) {
    this.setPhase('meter', now);
  }

  stopMeter(now) {
    const err = Math.abs(this.meterValue(now));
    this.throwPitch(now, err);
  }

  meterValue(now) {
    const speed = 3.6 + PITCH_TYPES[this.type].control * 2.4;
    return Math.sin(((now - this.phaseStart) / 1000) * speed);
  }

  setPhase(p, now) {
    this.phase = p;
    this.phaseStart = now;
    this.emitState();
  }

  // ------------------------------------------------------------ 투구
  throwPitch(now, err) {
    const pt = PITCH_TYPES[this.type];
    const scatter = 0.05 + err * 0.25 + err * err * 0.9 * pt.control;
    const ang = Math.random() * Math.PI * 2;
    const dist = scatter * Math.sqrt(Math.random());
    const nx = this.aim.nx + Math.cos(ang) * dist;
    const ny = this.aim.ny + Math.sin(ang) * dist * 0.9;
    const speed = Math.round(rand(...pt.speed) + (err < 0.1 ? 1.5 : 0));
    if (err < 0.1) this.tally.pinpoint++;
    const releaseTime = now + WINDUP_MS * RELEASE_PHASE;
    const duration = flightMs(speed);
    this.pitch = {
      type: this.type, speed, nx, ny, err,
      inZone: isStrike(nx, ny),
      start: now,
      aim: zoneToScreen(this.aim.nx, this.aim.ny),
      target: zoneToScreen(nx, ny),
      brk: breakPx(this.type, 'L'),
      arc: pt.arc,
      duration,
      releaseTime,
      arrival: releaseTime + duration,
      release: pitcherHand(MOUND.x, MOUND.y, 'L', RELEASE_PHASE),
    };
    this.pitch.ai = this.decide(this.pitch);
    this.hitBall = null;
    this.resolved = false;
    this.tally.pitches++;
    this.setPhase('pitch', now);
  }

  decide(p) {
    const st = this.batter.stats || {};
    const skill = clamp((battingAvg(st) ?? 0.25) / 0.26, 0.75, 1.3);
    const power = st.at_bats ? st.home_runs / st.at_bats : 0.03;
    const edge = Math.max(Math.abs(p.nx), Math.abs(p.ny));
    const center = p.inZone ? clamp(1 - edge, 0, 1) : 0;
    const dist = Math.max(0, edge - 1);
    const inn = this.inning;

    let swingP = p.inZone
      ? 0.6 + 0.15 * center + (inn.strikes === 2 ? 0.2 : 0)
      : Math.max(0, CHASE[p.type] - dist * 0.55 + (inn.strikes === 2 ? 0.12 : 0));
    if (!p.inZone && inn.balls === 3) swingP *= 0.6;
    if (Math.random() >= swingP) return { swing: false };

    const speedGap = this.prevSpeed == null ? 0 : Math.abs(p.speed - this.prevSpeed);
    const sameType = this.lastType === p.type ? this.streak : 0;
    let contactP = CONTACT[p.type] + center * 0.15 - (p.inZone ? 0 : 0.25 + dist * 0.4)
      + sameType * 0.06 - Math.min(0.2, speedGap / 150);
    if (p.type === 'fourseam' && p.ny < -0.6) contactP -= 0.12;
    contactP = clamp(contactP * skill, 0.05, 0.95);
    if (Math.random() > contactP) {
      return { swing: true, contact: false, jitter: (Math.random() < 0.5 ? -1 : 1) * rand(60, 110) };
    }
    const foulP = 0.45 - center * 0.15 + (p.inZone ? 0 : 0.12);
    if (Math.random() < foulP) return { swing: true, contact: true, outcome: 'foul' };
    const hitP = clamp(0.3 * skill + center * 0.15 - (p.inZone ? 0 : 0.15), 0.08, 0.6);
    if (Math.random() < hitP) {
      const hrP = clamp(power * 3 + center * 0.08, 0.02, 0.3);
      const r = Math.random();
      return { swing: true, contact: true, outcome: r < hrP ? 4 : r < hrP + 0.2 ? 2 : r < hrP + 0.23 ? 3 : 1 };
    }
    return { swing: true, contact: true, outcome: 'out' };
  }

  resolve(now) {
    const p = this.pitch;
    const ai = p.ai;
    const inn = this.inning;
    const T = this.tally;
    const name = PITCH_TYPES[p.type].name;
    let text;
    let sub = '';
    let color = '#facc15';
    let res;

    if (!ai.swing) {
      if (p.inZone) {
        T.strikes_thrown++;
        res = inn.strike();
        text = res.k ? '루킹 삼진!' : '스트라이크';
        color = res.k ? '#4ade80' : '#facc15';
        sub = res.k ? '꼼짝 못 했습니다' : '';
      } else {
        res = inn.ball();
        text = res.walk ? '볼넷' : '볼';
        color = '#f87171';
        sub = res.walk && res.runs ? '밀어내기 실점' : '';
        if (res.walk) T.walks_allowed++;
      }
    } else if (!ai.contact) {
      T.strikes_thrown++;
      res = inn.strike();
      text = res.k ? '헛스윙 삼진!' : '헛스윙';
      color = res.k ? '#4ade80' : '#facc15';
    } else {
      T.strikes_thrown++;
      const from = ballAt(1, p);
      if (ai.outcome === 'foul') {
        res = inn.strike(true);
        text = '파울';
        color = '#e2e8f0';
        this.hitBall = makeHitBall(from, 'foul', (Math.random() < 0.5 ? -1 : 1) * rand(1.25, 1.6), now);
      } else if (ai.outcome === 'out') {
        const kind = ['grounder', 'fly', 'liner'][Math.floor(Math.random() * 3)];
        res = inn.out();
        text = { grounder: '땅볼 아웃', fly: '뜬공 아웃', liner: '직선타 아웃' }[kind];
        color = '#4ade80';
        this.hitBall = makeHitBall(from, kind, rand(-1, 1), now);
      } else {
        const n = ai.outcome;
        res = inn.hit(n);
        T.hits_allowed++;
        text = { 1: '안타 허용', 2: '2루타 허용', 3: '3루타 허용', 4: '홈런 허용...' }[n];
        color = '#f87171';
        this.hitBall = makeHitBall(from, n === 4 ? 'hr' : 'liner', rand(-1, 1), now);
      }
    }
    if (res.k) T.pitcher_strikeouts++;
    if (res.runs) sub = `${res.runs}실점`;

    // 같은 구종 연속 사용 추적 (타자가 적응)
    this.streak = this.lastType === p.type ? this.streak + 1 : 1;
    this.lastType = p.type;
    this.prevSpeed = p.speed;
    if (res.paOver) {
      T.batters_faced++;
      this.batterIdx++;
      this.streak = 0;
      this.lastType = null;
    }

    const miss = Math.hypot(p.target.x - p.aim.x, p.target.y - p.aim.y);
    this.onLog(`${name} ${p.speed}km/h ${p.inZone ? '(존)' : '(볼)'} 오차 ${Math.round(miss)}px → ${text}`);
    this.banner = { text, sub: sub || `${name} ${p.speed}km/h`, color, start: now };
    this.resolved = true;
    this.setPhase('result', now);
  }

  update(now) {
    if (this.phase === 'pitch') {
      const p = this.pitch;
      const wait = p.ai.swing ? 0 : 140;
      if (!this.resolved && now >= p.arrival + wait) this.resolve(now);
    }
    if (this.phase === 'result') {
      const wait = this.hitBall ? Math.max(1500, this.hitBall.dur + 300) : 1200;
      if (now - this.phaseStart > wait) {
        if (this.inning.outs >= 3 || this.inning.runs >= MAX_RUNS) this.setPhase('over', now);
        else {
          this.pitch = null;
          this.hitBall = null;
          this.setPhase('aim', now);
        }
      }
    }
    if (this.phase === 'over' && !this.ended && now - this.phaseStart > 600) {
      this.ended = true;
      this.finish();
    }
  }

  finish() {
    const t = this.tally;
    const inn = this.inning;
    const completed = inn.outs >= 3;
    const delta = {
      outs_recorded: inn.outs, pitches: t.pitches, strikes_thrown: t.strikes_thrown,
      pitcher_strikeouts: t.pitcher_strikeouts, walks_allowed: t.walks_allowed, hits_allowed: t.hits_allowed,
      runs_allowed: inn.runs, wins: completed && inn.runs <= 1 ? 1 : 0, losses: completed ? 0 : 1,
    };
    this.onEnd({
      mode: 'pitching',
      score: this.score,
      delta,
      details: { completed, batters_faced: t.batters_faced, pinpoint: t.pinpoint },
      summary: [
        ['투구 수', t.pitches], ['스트라이크', t.strikes_thrown], ['탈삼진', t.pitcher_strikeouts],
        ['피안타', t.hits_allowed], ['볼넷', t.walks_allowed], ['실점', inn.runs],
        ['결과', completed ? (inn.runs === 0 ? '무실점 이닝!' : '이닝 종료') : '조기 강판'],
      ],
    });
  }

  // ------------------------------------------------------------ 렌더
  render(now) {
    const ctx = this.ctx;
    const pt = PITCH_TYPES[this.type];
    ctx.clearRect(0, 0, W, H);
    drawField(ctx);
    // 유인구 영역
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(ZONE.cx - ZONE.hw * 2.2, ZONE.cy - ZONE.hh * 2, ZONE.hw * 4.4, ZONE.hh * 4);
    ctx.restore();
    drawZone(ctx, { grid: true, alpha: 0.7 });

    const p = this.pitch;
    let pPhase = null;
    if (p && now - p.start <= WINDUP_MS) pPhase = (now - p.start) / WINDUP_MS;
    drawPitcher(ctx, {
      x: MOUND.x, y: MOUND.y, hand: 'L', phase: pPhase, color: this.myColor,
      holdingBall: pPhase == null ? !p : pPhase < RELEASE_PHASE,
    });

    let swingT = null;
    if (p?.ai?.swing) {
      const swingStart = p.arrival - SWING_CONTACT_MS + (p.ai.contact ? 0 : p.ai.jitter);
      const st = (now - swingStart) / SWING_MS;
      if (st >= 0 && st < 2.5) swingT = Math.min(st, 1);
    }
    const b = this.batter;
    drawBatter(ctx, { bats: this.batterSide, swingT, color: this.oppColor, name: b.name });

    if (this.phase === 'aim' || this.phase === 'meter') {
      const a = zoneToScreen(this.aim.nx, this.aim.ny);
      drawMitt(ctx, a.x, a.y, 0.9);
      ctx.save();
      ctx.strokeStyle = pt.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(a.x, a.y, 22, 0, Math.PI * 2);
      ctx.moveTo(a.x - 30, a.y);
      ctx.lineTo(a.x - 14, a.y);
      ctx.moveTo(a.x + 14, a.y);
      ctx.lineTo(a.x + 30, a.y);
      ctx.moveTo(a.x, a.y - 30);
      ctx.lineTo(a.x, a.y - 14);
      ctx.moveTo(a.x, a.y + 14);
      ctx.lineTo(a.x, a.y + 30);
      ctx.stroke();
      ctx.restore();
    }

    if (p && now >= p.releaseTime && !this.hitBall) {
      const t = (now - p.releaseTime) / p.duration;
      if (t >= 1) {
        if (!(p.ai.swing && p.ai.contact)) {
          drawMitt(ctx, p.target.x, p.target.y);
          drawBall(ctx, p.target.x, p.target.y, 8);
        }
      } else {
        const bb = ballAt(t, p);
        const prev = ballAt(Math.max(0, t - 0.06), p);
        drawBall(ctx, bb.x, bb.y, bb.r, prev);
      }
    }
    if (this.hitBall) drawHitBall(ctx, this.hitBall, now);

    drawScoreboard(ctx, this.inning, [`실점 ${this.inning.runs}`, `점수 ${this.score}`]);

    // 타자 정보
    ctx.save();
    ctx.fillStyle = 'rgba(15,23,42,0.85)';
    roundRect(ctx, 760, 140, 186, 76, 10);
    ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 12px "Noto Sans KR", sans-serif';
    ctx.fillText(`${(this.batterIdx % this.lineup.length) + 1}번 타자 · ${this.batterSide === 'L' ? '좌타' : '우타'}`, 774, 160);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 15px "Noto Sans KR", sans-serif';
    ctx.fillText(b.name.length > 18 ? `${b.name.slice(0, 17)}…` : b.name, 774, 182);
    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 13px "Noto Sans KR", sans-serif';
    ctx.fillText(`AVG ${fmtAvg(battingAvg(b.stats))}  HR ${b.stats?.home_runs ?? 0}`, 774, 203);
    ctx.restore();

    // 제구 게이지
    if (this.phase === 'meter') {
      const v = this.meterValue(now);
      const x0 = 330;
      const w = 300;
      const y = 506;
      ctx.save();
      ctx.fillStyle = 'rgba(15,23,42,0.85)';
      roundRect(ctx, x0 - 14, y - 26, w + 28, 50, 10);
      ctx.fill();
      const g = ctx.createLinearGradient(x0, 0, x0 + w, 0);
      g.addColorStop(0, '#ef4444');
      g.addColorStop(0.3, '#facc15');
      g.addColorStop(0.5, '#22c55e');
      g.addColorStop(0.7, '#facc15');
      g.addColorStop(1, '#ef4444');
      ctx.fillStyle = g;
      roundRect(ctx, x0, y - 6, w, 14, 7);
      ctx.fill();
      const nx = x0 + w / 2 + (v * w) / 2;
      ctx.fillStyle = '#fff';
      ctx.fillRect(nx - 2, y - 12, 4, 26);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 12px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('제구 게이지 — 가운데에서 클릭 / SPACE', x0 + w / 2, y - 12);
      ctx.restore();
    }

    if (this.banner) drawBanner(ctx, this.banner.text, this.banner.sub, this.banner.color, now - this.banner.start);

    ctx.save();
    ctx.textAlign = 'left';
    ctx.font = 'bold 14px "Noto Sans KR", sans-serif';
    ctx.fillStyle = pt.color;
    ctx.fillText(`구종: ${pt.name} [${pt.key}]`, 16, H - 14);
    if (this.phase === 'aim') {
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText('1~4로 구종 선택 · 마우스로 코스 조준 → 클릭', W / 2, H - 14);
    } else if (this.phase === 'over') {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.fillText('경기 종료!', W / 2, H - 14);
    }
    ctx.restore();
  }

  loop(now) {
    if (this.ended && this.phase === 'over' && now - this.phaseStart > 3000) return;
    this.update(now);
    this.render(now);
    this.raf = requestAnimationFrame(this.loop);
  }
}

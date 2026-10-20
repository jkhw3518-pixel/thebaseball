// 공용 렌더링/물리/볼카운트 로직 (포수 시점)

export const W = 960;
export const H = 540;
export const ZONE = { cx: 480, cy: 378, hw: 50, hh: 62 };
export const MOUND = { x: 480, y: 238 };
export const PLATE = { x: 480, y: 470 };
export const WINDUP_MS = 1000;
export const RELEASE_PHASE = 0.75;

// brk.x: 글러브 쪽(+) 으로 휘는 양 (존 반폭 단위), brk.y: 아래(+)로 떨어지는 양 (존 반높이 단위)
export const PITCH_TYPES = {
  fourseam: { id: 'fourseam', name: '포심', key: '1', speed: [145, 153], brk: { x: -0.1, y: -0.12 }, arc: 10, control: 0.85, color: '#f87171' },
  slider: { id: 'slider', name: '슬라이더', key: '2', speed: [130, 138], brk: { x: 0.95, y: 0.35 }, arc: 18, control: 1.0, color: '#60a5fa' },
  curve: { id: 'curve', name: '커브', key: '3', speed: [112, 122], brk: { x: 0.5, y: 1.6 }, arc: 46, control: 1.25, color: '#c084fc' },
  fork: { id: 'fork', name: '포크볼', key: '4', speed: [128, 137], brk: { x: 0.05, y: 1.2 }, arc: 16, control: 1.15, color: '#fbbf24' },
};
export const PITCH_LIST = Object.values(PITCH_TYPES);

export const rand = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export function zoneToScreen(nx, ny) {
  return { x: ZONE.cx + nx * ZONE.hw, y: ZONE.cy + ny * ZONE.hh };
}
export function screenToZone(x, y) {
  return { nx: (x - ZONE.cx) / ZONE.hw, ny: (y - ZONE.cy) / ZONE.hh };
}
export function isStrike(nx, ny) {
  // 공 반지름만큼 여유
  return Math.abs(nx) <= 1.08 && Math.abs(ny) <= 1.07;
}

export function flightMs(speedKmh) {
  return (880 * 150) / speedKmh;
}

export function breakPx(type, hand) {
  const p = PITCH_TYPES[type];
  // 포수 시점: 좌투수의 글러브 쪽 = 화면 왼쪽(-x), 우투수의 글러브 쪽 = 화면 오른쪽(+x)
  const glove = hand === 'L' ? -1 : 1;
  return { x: p.brk.x * glove * ZONE.hw, y: p.brk.y * ZONE.hh };
}

// t: 0(릴리스) ~ 1(홈플레이트 도착). 원근감 있는 보간 + 늦게 꺾이는 변화구
export function ballAt(t, pitch) {
  const k = 6;
  const s0 = 1 / (1 + k);
  const tt = Math.min(t, 1.12);
  const s = 1 / (1 + k * (1 - tt));
  const u = (s - s0) / (1 - s0);
  const { release, target, brk, arc } = pitch;
  const ax = target.x - brk.x;
  const ay = target.y - brk.y;
  return {
    x: release.x + (ax - release.x) * u + brk.x * u * u,
    y: release.y + (ay - release.y) * u + brk.y * u * u - Math.sin(Math.PI * Math.min(u, 1)) * arc,
    r: 2 + 7 * u,
    u,
  };
}

// ---------------------------------------------------------------- 키프레임
function kf(t, frames) {
  if (t <= frames[0][0]) return frames[0][1];
  for (let i = 1; i < frames.length; i++) {
    const [t1, v1] = frames[i];
    const [t0, v0] = frames[i - 1];
    if (t <= t1) {
      const f = (t - t0) / (t1 - t0);
      if (Array.isArray(v0)) return v0.map((v, j) => lerp(v, v1[j], f));
      return lerp(v0, v1, f);
    }
  }
  return frames[frames.length - 1][1];
}
const smooth = (a, b, t) => {
  const x = clamp((t - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
};

// ---------------------------------------------------------------- 필드
let fieldCache = null;
export function drawField(ctx) {
  if (!fieldCache) {
    fieldCache = document.createElement('canvas');
    fieldCache.width = W;
    fieldCache.height = H;
    paintField(fieldCache.getContext('2d'));
  }
  ctx.drawImage(fieldCache, 0, 0);
}

function paintField(c) {
  // 관중석
  const sky = c.createLinearGradient(0, 0, 0, 120);
  sky.addColorStop(0, '#0b1220');
  sky.addColorStop(1, '#1e293b');
  c.fillStyle = sky;
  c.fillRect(0, 0, W, 120);
  const crowd = ['#f87171', '#fbbf24', '#60a5fa', '#e5e7eb', '#a78bfa', '#34d399', '#94a3b8'];
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let row = 0; row < 7; row++) {
    for (let x = 4; x < W; x += 9) {
      c.fillStyle = crowd[Math.floor(rnd() * crowd.length)];
      c.globalAlpha = 0.35 + rnd() * 0.4;
      c.beginPath();
      c.arc(x + (row % 2) * 4 + rnd() * 2, 22 + row * 13, 3, 0, Math.PI * 2);
      c.fill();
    }
  }
  c.globalAlpha = 1;
  // 조명
  for (const lx of [90, 870]) {
    const g = c.createRadialGradient(lx, 10, 0, lx, 10, 140);
    g.addColorStop(0, 'rgba(255,255,230,0.35)');
    g.addColorStop(1, 'rgba(255,255,230,0)');
    c.fillStyle = g;
    c.fillRect(lx - 140, 0, 280, 150);
  }
  // 외야 펜스
  c.fillStyle = '#14532d';
  c.fillRect(0, 108, W, 22);
  c.fillStyle = '#facc15';
  c.fillRect(0, 106, W, 3);
  c.fillStyle = 'rgba(255,255,255,0.5)';
  c.font = 'bold 12px "Noto Sans KR", sans-serif';
  c.textAlign = 'center';
  c.fillText('400 ft', 480, 124);
  c.fillText('330 ft', 90, 124);
  c.fillText('330 ft', 870, 124);

  // 잔디 + 줄무늬
  const grass = c.createLinearGradient(0, 130, 0, H);
  grass.addColorStop(0, '#256b2c');
  grass.addColorStop(1, '#3b9a41');
  c.fillStyle = grass;
  c.fillRect(0, 130, W, H - 130);
  let y = 130;
  let h = 8;
  let on = false;
  while (y < H) {
    if (on) {
      c.fillStyle = 'rgba(255,255,255,0.045)';
      c.fillRect(0, y, W, h);
    }
    y += h;
    h *= 1.18;
    on = !on;
  }

  // 내야 흙
  c.fillStyle = '#b7814f';
  c.beginPath();
  c.moveTo(30, 300);
  c.quadraticCurveTo(480, 110, 930, 300);
  c.lineTo(560, 470);
  c.lineTo(400, 470);
  c.closePath();
  c.fill();
  // 내야 잔디
  c.fillStyle = '#358a3a';
  c.beginPath();
  c.moveTo(480, 430);
  c.lineTo(745, 262);
  c.lineTo(480, 200);
  c.lineTo(215, 262);
  c.closePath();
  c.fill();
  // 마운드
  c.fillStyle = '#c38d5b';
  c.beginPath();
  c.ellipse(MOUND.x, MOUND.y, 52, 13, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#f8fafc';
  c.fillRect(MOUND.x - 9, MOUND.y - 2, 18, 3);
  // 홈 주변 흙
  c.fillStyle = '#b7814f';
  c.beginPath();
  c.ellipse(PLATE.x, PLATE.y + 8, 190, 62, 0, 0, Math.PI * 2);
  c.fill();

  // 파울라인
  c.strokeStyle = 'rgba(255,255,255,0.9)';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(PLATE.x - 10, PLATE.y);
  c.lineTo(-6, 128);
  c.moveTo(PLATE.x + 10, PLATE.y);
  c.lineTo(W + 6, 128);
  c.stroke();

  // 베이스
  const base = (x, yy, s) => {
    c.fillStyle = '#fff';
    c.beginPath();
    c.moveTo(x, yy - s * 0.5);
    c.lineTo(x + s, yy);
    c.lineTo(x, yy + s * 0.5);
    c.lineTo(x - s, yy);
    c.closePath();
    c.fill();
  };
  base(760, 252, 8);
  base(480, 196, 6);
  base(200, 252, 8);

  // 타석
  c.strokeStyle = 'rgba(255,255,255,0.85)';
  c.lineWidth = 2.5;
  c.beginPath();
  c.moveTo(352, 512); c.lineTo(366, 436); c.lineTo(446, 436); c.lineTo(440, 512);
  c.moveTo(608, 512); c.lineTo(594, 436); c.lineTo(514, 436); c.lineTo(520, 512);
  c.stroke();

  // 홈플레이트
  c.fillStyle = '#fff';
  c.beginPath();
  c.moveTo(452, 462);
  c.lineTo(508, 462);
  c.lineTo(508, 471);
  c.lineTo(480, 482);
  c.lineTo(452, 471);
  c.closePath();
  c.fill();
}

export function drawZone(ctx, { grid = false, alpha = 0.55 } = {}) {
  const { cx, cy, hw, hh } = ZONE;
  ctx.save();
  ctx.fillStyle = `rgba(255,255,255,${alpha * 0.12})`;
  ctx.fillRect(cx - hw, cy - hh, hw * 2, hh * 2);
  ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - hw, cy - hh, hw * 2, hh * 2);
  if (grid) {
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    for (let i = 1; i < 3; i++) {
      ctx.moveTo(cx - hw + (hw * 2 * i) / 3, cy - hh);
      ctx.lineTo(cx - hw + (hw * 2 * i) / 3, cy + hh);
      ctx.moveTo(cx - hw, cy - hh + (hh * 2 * i) / 3);
      ctx.lineTo(cx + hw, cy - hh + (hh * 2 * i) / 3);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- 투수
const ARM_FRAMES = [
  [0, 80], [0.4, 15], [0.62, -80], [RELEASE_PHASE, -55], [0.86, 70], [1, 125],
];

function pitcherPose(x, y, hand, phase) {
  const side = hand === 'L' ? 1 : -1; // 투구 팔이 화면에서 위치한 쪽 (포수 시점: 좌투수 = 오른쪽)
  const p = phase ?? -1;
  const lift = p < 0 ? 0 : smooth(0.12, 0.38, p) * (1 - smooth(0.52, 0.66, p));
  const lean = p < 0 ? 0 : smooth(0.58, 0.8, p) * (1 - smooth(0.92, 1, p) * 0.5);
  const hipY = y - 26 + lean * 4;
  const shY = y - 47 + lean * 7;
  const shoulder = { x: x + side * 8, y: shY + 1 };
  const ang = ((p < 0 ? 80 : kf(p, ARM_FRAMES)) * Math.PI) / 180;
  const hand_ = { x: shoulder.x + side * Math.cos(ang) * 19, y: shoulder.y + Math.sin(ang) * 19 };
  return { side, lift, lean, hipY, shY, shoulder, hand: hand_ };
}

export function pitcherHand(x, y, hand, phase) {
  return pitcherPose(x, y, hand, phase).hand;
}

export function drawPitcher(ctx, { x, y, hand = 'L', phase = null, color = '#2563eb', holdingBall = true }) {
  const { side, lift, hipY, shY, shoulder, hand: hp, lean } = pitcherPose(x, y, hand, phase);
  ctx.save();
  ctx.lineCap = 'round';
  // 그림자
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(x, y + 1, 16, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // 다리
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(x + side * 3, hipY);
  ctx.lineTo(x + side * 7, y);
  ctx.moveTo(x - side * 3, hipY);
  ctx.lineTo(x - side * (9 + lift * 4), y - lift * 16 + lean * 2);
  ctx.stroke();
  // 몸통
  ctx.strokeStyle = color;
  ctx.lineWidth = 13;
  ctx.beginPath();
  ctx.moveTo(x, hipY);
  ctx.lineTo(x, shY + 3);
  ctx.stroke();
  // 글러브 팔
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(x - side * 7, shY + 2);
  ctx.lineTo(x - side * 13, shY + 12 - lean * 6);
  ctx.stroke();
  ctx.fillStyle = '#7c4a1e';
  ctx.beginPath();
  ctx.arc(x - side * 14, shY + 13 - lean * 6, 4.5, 0, Math.PI * 2);
  ctx.fill();
  // 투구 팔
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(shoulder.x, shoulder.y);
  ctx.lineTo(hp.x, hp.y);
  ctx.stroke();
  ctx.fillStyle = '#f1c8a0';
  ctx.beginPath();
  ctx.arc(hp.x, hp.y, 2.6, 0, Math.PI * 2);
  ctx.fill();
  if (holdingBall) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(hp.x, hp.y - 1, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  // 머리 + 모자
  const hy = shY - 8;
  ctx.fillStyle = '#f1c8a0';
  ctx.beginPath();
  ctx.arc(x, hy, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, hy - 1.5, 6.3, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(x - 7, hy - 2, 14, 2.4);
  ctx.restore();
}

// ---------------------------------------------------------------- 타자 (기본: 우타자, 포수 시점에서 홈 왼쪽)
const SWING_FRAMES_ANGLE = [[0, -118], [0.37, 2], [0.6, -70], [1, -170]];
const SWING_FRAMES_HANDS = [[0, [386, 330]], [0.37, [448, 380]], [0.6, [468, 352]], [1, [434, 318]]];
const SWING_FRAMES_LEN = [[0, 1], [0.37, 1], [0.6, 0.78], [1, 0.85]];
export const SWING_MS = 300;
export const SWING_CONTACT_MS = SWING_MS * 0.37;

export function drawBatter(ctx, { bats = 'R', swingT = null, color = '#b91c1c', name = '' }) {
  ctx.save();
  if (bats === 'L') {
    ctx.translate(PLATE.x * 2, 0);
    ctx.scale(-1, 1);
  }
  const x = 398;
  const feet = 505;
  const t = swingT == null ? 0 : clamp(swingT, 0, 1);
  const twist = swingT == null ? 0 : smooth(0.1, 0.5, t);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // 그림자
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(x, feet + 4, 50, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  // 다리
  ctx.strokeStyle = '#f1f5f9';
  ctx.lineWidth = 15;
  ctx.beginPath();
  ctx.moveTo(x - 8, 425);
  ctx.lineTo(x - 22, 465);
  ctx.lineTo(x - 30, feet);
  ctx.moveTo(x + 8, 425);
  ctx.lineTo(x + 22 + twist * 6, 465);
  ctx.lineTo(x + 30 + twist * 8, feet);
  ctx.stroke();
  ctx.fillStyle = '#111827';
  ctx.fillRect(x - 42, feet - 6, 20, 9);
  ctx.fillRect(x + 22 + twist * 8, feet - 6, 20, 9);
  // 몸통
  ctx.strokeStyle = color;
  ctx.lineWidth = 34;
  ctx.beginPath();
  ctx.moveTo(x, 420);
  ctx.lineTo(x + twist * 8, 345);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = 'bold 15px "Noto Sans KR", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(String((name.length * 7) % 60 || 7), x + twist * 6, 392);
  // 배트
  const ang = (kf(t, SWING_FRAMES_ANGLE) * Math.PI) / 180;
  const [hx, hy] = kf(t, SWING_FRAMES_HANDS);
  const len = 100 * kf(t, SWING_FRAMES_LEN);
  // 팔
  ctx.strokeStyle = color;
  ctx.lineWidth = 11;
  ctx.beginPath();
  ctx.moveTo(x - 10 + twist * 8, 350);
  ctx.lineTo(hx, hy);
  ctx.moveTo(x + 12 + twist * 8, 350);
  ctx.lineTo(hx + 3, hy + 3);
  ctx.stroke();
  ctx.strokeStyle = '#c08a4a';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(hx + Math.cos(ang) * len, hy + Math.sin(ang) * len);
  ctx.stroke();
  ctx.strokeStyle = '#8a5a2b';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(hx + Math.cos(ang) * len * 0.62, hy + Math.sin(ang) * len * 0.62);
  ctx.lineTo(hx + Math.cos(ang) * len, hy + Math.sin(ang) * len);
  ctx.stroke();
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.arc(hx, hy, 6.5, 0, Math.PI * 2);
  ctx.fill();
  // 머리 + 헬멧
  const hdx = x + twist * 10;
  ctx.fillStyle = '#e0b088';
  ctx.beginPath();
  ctx.arc(hdx, 318, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111827';
  ctx.beginPath();
  ctx.arc(hdx, 314, 17.5, Math.PI * 0.95, Math.PI * 2.05);
  ctx.fill();
  ctx.fillRect(hdx, 311, 24, 5);
  ctx.restore();
}

// ---------------------------------------------------------------- 공, 미트, 타구
export function drawBall(ctx, x, y, r, trail = null) {
  if (trail) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = r * 1.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(trail.x, trail.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = '#fafafa';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  if (r > 4) {
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x - r * 0.9, y, r * 0.7, -0.9, 0.9);
    ctx.arc(x + r * 0.9, y, r * 0.7, Math.PI - 0.9, Math.PI + 0.9);
    ctx.stroke();
  }
}

export function drawMitt(ctx, x, y, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#7c4a1e';
  ctx.beginPath();
  ctx.ellipse(x, y, 17, 19, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5b3412';
  ctx.beginPath();
  ctx.ellipse(x, y + 2, 10, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// kind: grounder | liner | fly | hr | foul ; dir: -1(좌측) ~ 1(우측)
export function makeHitBall(from, kind, dir, now) {
  const endY = { grounder: 255, liner: 175, fly: 150, hr: -40, foul: 160 }[kind];
  const height = { grounder: 0, liner: 60, fly: 200, hr: 260, foul: 140 }[kind];
  const dur = { grounder: 900, liner: 800, fly: 1400, hr: 1500, foul: 1000 }[kind];
  return { from, to: { x: 480 + dir * 400, y: endY }, height, dur, start: now, kind };
}

export function drawHitBall(ctx, hb, now) {
  const t = clamp((now - hb.start) / hb.dur, 0, 1);
  const e = 1 - (1 - t) * (1 - t);
  const x = lerp(hb.from.x, hb.to.x, e);
  const y = lerp(hb.from.y, hb.to.y, e) - Math.sin(Math.PI * Math.min(1, e * (hb.kind === 'hr' ? 0.7 : 1))) * hb.height;
  const r = lerp(8, 2, e);
  if (hb.kind === 'grounder') {
    // 바운드
    const bounce = Math.abs(Math.sin(e * Math.PI * 4)) * 18 * (1 - e);
    drawBall(ctx, x, y - bounce, r);
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(x, lerp(hb.from.y + 40, hb.to.y + 10, e), r, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    drawBall(ctx, x, y, r);
  }
  return t >= 1;
}

// ---------------------------------------------------------------- 텍스트 / 스코어보드
export function drawBanner(ctx, text, sub, color, age) {
  const a = clamp(1.4 - age / 1000, 0, 1);
  if (a <= 0) return;
  const pop = 1 + Math.max(0, 0.25 - age / 600);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(W / 2, 205);
  ctx.scale(pop, pop);
  ctx.textAlign = 'center';
  ctx.font = '48px "Black Han Sans", "Noto Sans KR", sans-serif';
  ctx.lineWidth = 7;
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  if (sub) {
    ctx.font = 'bold 18px "Noto Sans KR", sans-serif';
    ctx.lineWidth = 5;
    ctx.strokeText(sub, 0, 32);
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(sub, 0, 32);
  }
  ctx.restore();
}

export function drawScoreboard(ctx, inning, extra = []) {
  ctx.save();
  ctx.fillStyle = 'rgba(15,23,42,0.85)';
  roundRect(ctx, 14, 140, 170, 118, 10);
  ctx.fill();
  ctx.font = 'bold 14px "Noto Sans KR", sans-serif';
  ctx.textAlign = 'left';
  const rows = [['B', inning.balls, 3, '#22c55e'], ['S', inning.strikes, 2, '#facc15'], ['O', inning.outs, 2, '#ef4444']];
  rows.forEach(([label, n, max, col], i) => {
    const y = 166 + i * 24;
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(label, 26, y + 5);
    for (let k = 0; k < max; k++) {
      ctx.fillStyle = k < n ? col : 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.arc(52 + k * 18, y, 6.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  // 주자
  const bx = 140;
  const by = 192;
  const bases = [[bx + 18, by], [bx, by - 18], [bx - 18, by]];
  bases.forEach(([x, y], i) => {
    ctx.fillStyle = inning.bases[i] ? '#facc15' : 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.moveTo(x, y - 8);
    ctx.lineTo(x + 8, y);
    ctx.lineTo(x, y + 8);
    ctx.lineTo(x - 8, y);
    ctx.closePath();
    ctx.fill();
  });
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 13px "Noto Sans KR", sans-serif';
  extra.forEach((line, i) => ctx.fillText(line, 26, 244 + i * 18));
  ctx.restore();
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------------- 볼카운트 / 주자
export class Inning {
  constructor() {
    this.balls = 0;
    this.strikes = 0;
    this.outs = 0;
    this.runs = 0;
    this.bases = [false, false, false];
  }
  resetCount() {
    this.balls = 0;
    this.strikes = 0;
  }
  ball() {
    this.balls++;
    if (this.balls >= 4) return this.walk();
    return { paOver: false, runs: 0 };
  }
  strike(foul = false) {
    if (foul && this.strikes >= 2) return { paOver: false, runs: 0, foul: true };
    this.strikes++;
    if (this.strikes >= 3) {
      this.outs++;
      this.resetCount();
      return { paOver: true, k: true, runs: 0 };
    }
    return { paOver: false, runs: 0, foul };
  }
  out() {
    this.outs++;
    this.resetCount();
    return { paOver: true, runs: 0 };
  }
  walk() {
    let runs = 0;
    const b = this.bases;
    if (b[0]) {
      if (b[1]) {
        if (b[2]) runs++;
        b[2] = true;
      }
      b[1] = true;
    }
    b[0] = true;
    this.runs += runs;
    this.resetCount();
    return { paOver: true, walk: true, runs };
  }
  hit(n) {
    let runs = 0;
    const nb = [false, false, false];
    for (let i = 2; i >= 0; i--) {
      if (!this.bases[i]) continue;
      const dest = i + n;
      if (dest >= 3) runs++;
      else nb[dest] = true;
    }
    if (n >= 4) runs++;
    else nb[n - 1] = true;
    this.bases = nb;
    this.runs += runs;
    this.resetCount();
    return { paOver: true, hit: n, runs };
  }
}

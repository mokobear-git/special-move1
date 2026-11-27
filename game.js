/* WORLD CLASH - 2D対戦格闘ゲーム (HTML5 Canvas / 依存ライブラリなし) */
(() => {
'use strict';

// ============================================================
//  基本定数・ユーティリティ
// ============================================================
const W = 960, H = 540, GROUND = 470, WALL_L = 40, WALL_R = W - 40, GRAV = 0.72;
const ROUND_TIME = 99, SUPER_COST = 100, GAUGE_MAX = 100;
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
const FONT = '"Hiragino Kaku Gothic ProN","Hiragino Sans","Noto Sans JP","Noto Sans CJK JP","Yu Gothic","Meiryo","IPAGothic",sans-serif';
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = Math.random;
const hash = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const overlap = (a, b) => !!(a && b && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y);
const D2R = Math.PI / 180;
function shade(hex, amt) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const n = parseInt(c, 16);
  let r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
  if (amt < 0) { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  else { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
function text(c, s, x, y, size = 24, col = '#fff', align = 'center', stroke = 0, weight = 'bold') {
  c.font = `${weight} ${size}px ${FONT}`;
  c.textAlign = align; c.textBaseline = 'middle';
  if (stroke) { c.lineJoin = 'round'; c.lineWidth = stroke; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.strokeText(s, x, y); }
  c.fillStyle = col; c.fillText(s, x, y);
}
function wrapText(c, s, maxW, size) {
  c.font = `bold ${size}px ${FONT}`;
  const out = [];
  for (const para of s.split('\n')) {
    let line = '';
    for (const ch of para) {
      if (c.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; }
      else line += ch;
    }
    out.push(line);
  }
  return out;
}

// ============================================================
//  入力（キーボード＋ゲームパッド）
// ============================================================
const KEYS = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  KeyZ: 'lp', KeyX: 'mp', KeyC: 'hp', KeyA: 'lk', KeyS: 'mk', KeyD: 'hk',
  Space: 'sp', KeyV: 'sa', Enter: 'start', Escape: 'esc', KeyP: 'esc', KeyH: 'dbg'
};
const BTNS = ['lp', 'mp', 'hp', 'lk', 'mk', 'hk', 'sp', 'sa'];
const Input = {
  held: {}, pressed: {}, padPrev: {}, touchHeld: {},
  init() {
    addEventListener('keydown', e => {
      const a = KEYS[e.code]; if (!a) return;
      e.preventDefault(); Sound.init();
      if (!this.held[a] && !e.repeat) this.pressed[a] = true;
      this.held[a] = true;
    });
    addEventListener('keyup', e => { const a = KEYS[e.code]; if (a) { this.held[a] = false; e.preventDefault(); } });
    addEventListener('blur', () => { this.held = {}; });
    addEventListener('pointerdown', () => Sound.init());
  },
  poll() {
    const held = Object.assign({}, this.held, this.touchHeld), pressed = Object.assign({}, this.pressed);
    this.pressed = {};
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const B = i => !!(p.buttons[i] && p.buttons[i].pressed);
      const ax = i => p.axes[i] || 0;
      const pm = {
        left: B(14) || ax(0) < -0.5, right: B(15) || ax(0) > 0.5, up: B(12) || ax(1) < -0.5, down: B(13) || ax(1) > 0.5,
        lp: B(2), mp: B(3), hp: B(5), lk: B(0), mk: B(1), hk: B(7), sp: B(4), sa: B(6), start: B(9), esc: B(8)
      };
      for (const k in pm) {
        if (pm[k]) { held[k] = true; if (!this.padPrev[k]) pressed[k] = true; }
        this.padPrev[k] = pm[k];
      }
      break; // 1台目のみ
    }
    return {
      left: !!(held.left || pressed.left), right: !!(held.right || pressed.right),
      up: !!(held.up || pressed.up), down: !!(held.down || pressed.down),
      held, pressed
    };
  }
};
// ============================================================
//  タッチ操作（スマホ）＋画面レイアウト
// ============================================================
const Touch = {
  on: false,
  init() {
    const root = document.getElementById('touch');
    if (!root) return;
    const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    if (coarse || 'ontouchstart' in window || navigator.maxTouchPoints > 0) this.enable();
    addEventListener('touchstart', () => this.enable(), { passive: true });
    root.querySelectorAll('.b[data-k]').forEach(el => {
      const k = el.dataset.k;
      const down = e => { e.preventDefault(); Sound.init(); try { el.setPointerCapture(e.pointerId); } catch (_) {} el.classList.add('on'); Input.touchHeld[k] = true; Input.pressed[k] = true; };
      const up = () => { el.classList.remove('on'); Input.touchHeld[k] = false; };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('lostpointercapture', up);
      el.addEventListener('contextmenu', e => e.preventDefault());
    });
    const pad = document.getElementById('pad'), knob = document.getElementById('knob');
    let pid = null;
    const setDir = (l, r, u, d) => {
      const nv = { left: l, right: r, up: u, down: d };
      for (const k in nv) { if (nv[k] && !Input.touchHeld[k]) Input.pressed[k] = true; Input.touchHeld[k] = nv[k]; }
    };
    const move = e => {
      const rc = pad.getBoundingClientRect(), cx = rc.left + rc.width / 2, cy = rc.top + rc.height / 2;
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const rr = rc.width / 2, dist = Math.hypot(dx, dy);
      const kx = dist > rr * 0.6 ? dx * rr * 0.6 / dist : dx, ky = dist > rr * 0.6 ? dy * rr * 0.6 / dist : dy;
      knob.style.transform = `translate(${kx}px,${ky}px)`;
      if (dist < rr * 0.22) { setDir(false, false, false, false); return; }
      const a = Math.atan2(dy, dx) / D2R; // 0=右, 90=下
      setDir(a > 112.5 || a < -112.5, a > -67.5 && a < 67.5, a < -22.5 && a > -157.5, a > 22.5 && a < 157.5);
    };
    pad.addEventListener('pointerdown', e => { e.preventDefault(); Sound.init(); pid = e.pointerId; try { pad.setPointerCapture(pid); } catch (_) {} move(e); });
    pad.addEventListener('pointermove', e => { if (e.pointerId === pid) { e.preventDefault(); move(e); } });
    const end = e => { if (e.pointerId !== pid) return; pid = null; knob.style.transform = ''; setDir(false, false, false, false); };
    pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end); pad.addEventListener('lostpointercapture', end);
    cv.addEventListener('pointerdown', () => { try { cv.focus(); } catch (_) {} if (scene && scene instanceof TitleScene) Input.pressed.start = true; });
  },
  enable() {
    if (this.on) return;
    this.on = true;
    const root = document.getElementById('touch'); if (root) root.hidden = false;
    layout();
  }
};
function layout() {
  const app = document.getElementById('app');
  if (!app) return;
  const aw = app.clientWidth, ah = app.clientHeight;
  const portrait = Touch.on && ah > aw * 1.1;
  app.classList.toggle('portrait', portrait);
  let cw = Math.min(aw, ah * 16 / 9);
  if (portrait) cw = Math.min(aw, ah * 0.55 * 16 / 9);
  cv.style.width = Math.floor(cw) + 'px'; cv.style.height = Math.floor(cw * 9 / 16) + 'px';
}
addEventListener('resize', layout);
addEventListener('orientationchange', () => setTimeout(layout, 200));

const BLANK = { left: false, right: false, up: false, down: false, held: {}, pressed: {} };

// ============================================================
//  サウンド（WebAudio 合成）
// ============================================================
const Sound = {
  ctx: null, nb: null, out: null, muted: false, last: {}, log: null,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.nb = this.noiseBuffer(this.ctx);
      // 音割れ防止のコンプレッサー
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.002; comp.release.value = 0.15;
      const g = this.ctx.createGain(); g.gain.value = 0.9;
      g.connect(comp); comp.connect(this.ctx.destination);
      this.out = g;
    } catch (e) { this.ctx = null; }
  },
  noiseBuffer(a) {
    const len = Math.floor(a.sampleRate * 0.6), b = a.createBuffer(1, len, a.sampleRate), d = b.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < len; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; d[i] = seed / 0x3fffffff - 1; }
    return b;
  },
  play(type) {
    const a = this.ctx; if (!a || this.muted) return;
    if (this.log) this.log.push(type);
    const now = a.currentTime;
    if (this.last[type] != null && now - this.last[type] < 0.03) return; // 同一フレームの重複を抑制
    this.last[type] = now;
    try { this.render(type, a, this.out, this.nb, now); } catch (e) { /* 音声エラーは無視 */ }
  },
  // 効果音の合成（OfflineAudioContext でも同じ処理で鳴らせる）
  render(type, a, dest, nb, t) {
    // 種類ごとの音量バランス
    const vol = /^sp_/.test(type) ? 2.4 : type === 'super' ? 2.6 : /Whiff/.test(type) ? 1.8 : type === 'pHit2' ? 0.85 : 1;
    if (vol !== 1) { const vg = a.createGain(); vg.gain.value = vol; vg.connect(dest); dest = vg; }
    const tone = (f1, f2, dur, wave = 'square', vol = 0.12, delay = 0) => {
      const o = a.createOscillator(), g = a.createGain(), s = t + delay;
      o.type = wave; o.frequency.setValueAtTime(f1, s);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), s + dur);
      g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(vol, s + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
      o.connect(g); g.connect(dest); o.start(s); o.stop(s + dur + 0.02);
    };
    const noise = (dur, vol, f1, f2 = f1, ft = 'lowpass', delay = 0, q = 1, attack = 0.003) => {
      const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), s = t + delay;
      src.buffer = nb; f.type = ft; f.Q.value = q;
      f.frequency.setValueAtTime(f1, s); f.frequency.exponentialRampToValueAtTime(Math.max(30, f2), s + dur);
      g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(vol, s + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
      src.connect(f); f.connect(g); g.connect(dest); src.start(s, Math.random() * 0.2); src.stop(s + dur + 0.02);
    };
    const m = /^(p|k)(Whiff|Hit)([0-2])$/.exec(type);
    if (m) {
      const s = +m[3];
      if (m[1] === 'p' && m[2] === 'Whiff') {        // パンチの空振り「シュッ」：高く短い風切り音
        noise(0.05 + s * 0.03, 0.2 + s * 0.06, 4200 - s * 500, 1800, 'bandpass', 0, 2.5, 0.01);
      } else if (m[1] === 'k' && m[2] === 'Whiff') { // キックの空振り「ブンッ」：低く長い風切り音
        noise(0.11 + s * 0.05, 0.26 + s * 0.07, 700 + s * 80, 300, 'bandpass', 0, 1.8, 0.03);
        tone(120, 70, 0.1 + s * 0.04, 'sine', 0.05 + s * 0.02);
      } else if (m[1] === 'p') {                     // パンチのヒット「パシッ」：乾いた破裂音
        tone(1500 - s * 250, 300, 0.025, 'square', 0.1 + s * 0.03);
        noise(0.05 + s * 0.03, 0.45 + s * 0.15, 5000, 1500, 'lowpass', 0, 0.8);
        tone(220 - s * 30, 90, 0.05 + s * 0.03, 'sine', 0.15 + s * 0.08);
      } else {                                       // キックのヒット「ドスッ」：重く鈍い打撃音
        tone(120 - s * 15, 40, 0.11 + s * 0.05, 'sine', 0.4 + s * 0.12);
        noise(0.09 + s * 0.05, 0.45 + s * 0.12, 1400, 250, 'lowpass', 0, 1.2);
        tone(70, 35, 0.12 + s * 0.04, 'triangle', 0.2);
      }
      return;
    }
    switch (type) {
      // ---- 必殺技の発動音（技の種類ごとに異なる） ----
      case 'sp_projectile': // 飛び道具「ハァッ…ビュン」：溜め→放出
        tone(180, 900, 0.14, 'sine', 0.12);
        tone(900, 160, 0.38, 'sawtooth', 0.09, 0.12);
        noise(0.4, 0.35, 2500, 600, 'bandpass', 0.12, 3, 0.02);
        tone(1800, 1200, 0.25, 'triangle', 0.04, 0.12);
        break;
      case 'sp_rising':     // 対空技「シュイーン」：上昇スイープ
        tone(220, 1600, 0.28, 'square', 0.07);
        noise(0.3, 0.3, 600, 4500, 'bandpass', 0, 4, 0.02);
        tone(440, 2400, 0.22, 'triangle', 0.05, 0.03);
        break;
      case 'sp_rush':       // 突進技「ゴォッ」：うなる風圧
        noise(0.34, 0.5, 300, 2200, 'lowpass', 0, 2, 0.04);
        tone(90, 200, 0.3, 'sawtooth', 0.08);
        break;
      case 'sp_leap':       // 跳躍技「ヒュッ」
        noise(0.22, 0.32, 500, 1800, 'bandpass', 0, 3, 0.02);
        tone(300, 800, 0.16, 'triangle', 0.07);
        break;
      case 'sp_counter':    // カウンター構え「キィン」：金属的な残響
        tone(1760, 1700, 0.45, 'triangle', 0.09);
        tone(2637, 2600, 0.35, 'sine', 0.06, 0.02);
        tone(3520, 3400, 0.2, 'sine', 0.03, 0.04);
        break;
      case 'sp_throw':      // 投げ技の踏み込み「グッ」
        tone(160, 90, 0.12, 'square', 0.1);
        noise(0.1, 0.3, 900, 300, 'lowpass');
        break;
      case 'super':         // 超必殺技の発動（暗転）：上昇する和音
        tone(110, 880, 0.6, 'sawtooth', 0.08);
        tone(165, 1320, 0.6, 'sawtooth', 0.06, 0.04);
        tone(220, 1760, 0.6, 'square', 0.04, 0.08);
        noise(0.7, 0.3, 300, 6000, 'bandpass', 0, 1.5, 0.2);
        tone(1320, 1320, 0.5, 'triangle', 0.06, 0.55);
        break;
      // ---- 必殺技のヒット音 ----
      case 'spHit':         // 「ドカッ」：爆発的な打撃＋きらめき
        noise(0.28, 0.65, 3000, 300, 'lowpass', 0, 1);
        tone(200, 45, 0.28, 'sawtooth', 0.22);
        tone(1600, 700, 0.14, 'triangle', 0.08, 0.01);
        break;
      case 'saHit':         // 超必殺技のヒット「ズドン」
        noise(0.38, 0.75, 4000, 200, 'lowpass', 0, 1);
        tone(160, 35, 0.38, 'sawtooth', 0.26);
        tone(880, 220, 0.25, 'square', 0.07);
        tone(55, 30, 0.4, 'sine', 0.35);
        break;
      case 'slam':          // 投げの叩きつけ「ドシーン」
        tone(85, 28, 0.45, 'sine', 0.55);
        noise(0.4, 0.7, 700, 120, 'lowpass', 0, 1);
        break;
      case 'counter':       // カウンター成功
        tone(1400, 350, 0.2, 'square', 0.1);
        noise(0.18, 0.5, 4000, 800, 'lowpass');
        tone(2637, 2637, 0.3, 'triangle', 0.06, 0.05);
        break;
      // ---- その他 ----
      case 'block': noise(0.06, 0.35, 5000, 3000, 'highpass'); tone(900, 600, 0.05, 'triangle', 0.08); break;
      case 'ko': tone(400, 50, 0.9, 'sawtooth', 0.15); noise(0.6, 0.5, 900, 120); break;
      case 'throw': noise(0.12, 0.35, 1200, 400, 'bandpass', 0, 2); tone(260, 180, 0.08, 'square', 0.08); break;
      case 'land': noise(0.12, 0.3, 400, 120); break;
      case 'select': tone(600, 600, 0.04, 'square', 0.05); break;
      case 'confirm': tone(500, 1000, 0.12, 'square', 0.07); break;
      case 'cancel': tone(500, 250, 0.1, 'square', 0.06); break;
      case 'round': tone(440, 440, 0.15, 'square', 0.07); tone(660, 660, 0.25, 'square', 0.07, 0.15); break;
    }
  }
};

// ============================================================
//  技データ
// ============================================================
// str: 0=弱 1=中 2=強
const STR_DEF = { hitstun: [13, 17, 21], blockstun: [9, 13, 15], hitstop: [6, 8, 10], push: [3.2, 4.4, 5.8] };
function normMove(d, extra) {
  d = Object.assign({}, extra || {}, d);
  const s = d.str == null ? 1 : d.str;
  if (d.hitstun == null) d.hitstun = STR_DEF.hitstun[s];
  if (d.blockstun == null) d.blockstun = STR_DEF.blockstun[s];
  if (d.hitstop == null) d.hitstop = STR_DEF.hitstop[s];
  if (d.push == null) d.push = STR_DEF.push[s];
  if (d.guard == null) d.guard = 'mid';
  if (d.hits == null) d.hits = 1;
  if (d.active == null) d.active = 0;
  if (d.recovery == null) d.recovery = 0;
  return d;
}
const N = (o) => normMove(Object.assign({ type: 'normal', kind: /k/.test(o.pose) ? 'kick' : 'punch' }, o));
const NORMALS = {
  // 立ち
  sLP: N({ str: 0, pose: 'lp', startup: 3, active: 3, recovery: 7, dmg: 30, box: { x: 18, y: -146, w: 50, h: 20 }, cancel: true }),
  sMP: N({ str: 1, pose: 'mp', startup: 6, active: 3, recovery: 13, dmg: 60, box: { x: 18, y: -146, w: 60, h: 22 }, cancel: true }),
  sHP: N({ str: 2, pose: 'hp', startup: 9, active: 4, recovery: 20, dmg: 95, box: { x: 18, y: -150, w: 68, h: 26 }, cancel: true }),
  sLK: N({ str: 0, pose: 'lk', startup: 4, active: 3, recovery: 8, dmg: 35, box: { x: 14, y: -70, w: 58, h: 24 }, cancel: true }),
  sMK: N({ str: 1, pose: 'mk', startup: 7, active: 4, recovery: 15, dmg: 65, box: { x: 14, y: -112, w: 70, h: 26 } }),
  sHK: N({ str: 2, pose: 'hk', startup: 11, active: 4, recovery: 22, dmg: 100, box: { x: 14, y: -150, w: 76, h: 30 } }),
  // しゃがみ
  cLP: N({ str: 0, pose: 'clp', crouch: true, startup: 3, active: 3, recovery: 7, dmg: 28, box: { x: 18, y: -92, w: 48, h: 18 }, cancel: true }),
  cMP: N({ str: 1, pose: 'cmp', crouch: true, startup: 6, active: 3, recovery: 12, dmg: 55, box: { x: 18, y: -96, w: 58, h: 20 }, cancel: true }),
  cHP: N({ str: 2, pose: 'chp', crouch: true, startup: 7, active: 5, recovery: 20, dmg: 90, box: { x: 2, y: -185, w: 50, h: 95 }, cancel: true }),
  cLK: N({ str: 0, pose: 'clk', crouch: true, startup: 4, active: 3, recovery: 8, dmg: 30, guard: 'low', box: { x: 14, y: -24, w: 60, h: 22 }, cancel: true }),
  cMK: N({ str: 1, pose: 'cmk', crouch: true, startup: 7, active: 4, recovery: 14, dmg: 55, guard: 'low', box: { x: 14, y: -24, w: 76, h: 22 }, cancel: true }),
  cHK: N({ str: 2, pose: 'chk', crouch: true, startup: 10, active: 4, recovery: 24, dmg: 85, guard: 'low', knockdown: true, box: { x: 14, y: -22, w: 86, h: 22 } }),
  // ジャンプ（中段＝立ちガードのみ）
  jLP: N({ str: 0, pose: 'jp', air: true, startup: 4, active: 8, recovery: 4, dmg: 35, guard: 'high', box: { x: 8, y: -100, w: 48, h: 44 } }),
  jMP: N({ str: 1, pose: 'jp', air: true, startup: 6, active: 6, recovery: 6, dmg: 60, guard: 'high', box: { x: 8, y: -100, w: 56, h: 48 } }),
  jHP: N({ str: 2, pose: 'jp', air: true, startup: 8, active: 6, recovery: 8, dmg: 90, guard: 'high', box: { x: 8, y: -104, w: 60, h: 56 } }),
  jLK: N({ str: 0, pose: 'jk', air: true, startup: 4, active: 8, recovery: 4, dmg: 35, guard: 'high', box: { x: 4, y: -48, w: 54, h: 54 } }),
  jMK: N({ str: 1, pose: 'jk', air: true, startup: 6, active: 7, recovery: 6, dmg: 60, guard: 'high', box: { x: 4, y: -48, w: 62, h: 56 } }),
  jHK: N({ str: 2, pose: 'jhk', air: true, startup: 8, active: 6, recovery: 8, dmg: 95, guard: 'high', box: { x: 4, y: -52, w: 68, h: 60 } }),
};
const THROW_F = normMove({ type: 'throw', name: '投げ', generic: true, dmg: 120, range: 80, startup: 0, recovery: 0 });
const THROW_B = normMove({ type: 'throw', name: '投げ', generic: true, back: true, dmg: 120, range: 80, startup: 0, recovery: 0 });

const SP_DEF = {
  projectile: { startup: 13, recovery: 30, speed: 7, dmg: 100, w: 44, h: 34, py: 112, hitstun: 20, blockstun: 16, hitstop: 8, push: 6, pose: 'proj', color: '#6cf' },
  rush: { startup: 9, active: 14, recovery: 18, vx: 9, dmg: 120, hitstun: 20, blockstun: 16, hitstop: 9, push: 6, box: { x: 4, y: -150, w: 64, h: 56 }, pose: 'rushP' },
  rising: { startup: 4, active: 12, landRec: 18, vx: 2, vy: -14, dmg: 130, hitstun: 24, blockstun: 18, hitstop: 10, push: 4, box: { x: 0, y: -200, w: 58, h: 130 }, pose: 'rise', knockdown: true },
  leap: { startup: 8, vx: 5, vy: -11.5, landRec: 14, dmg: 120, hitstun: 22, blockstun: 16, hitstop: 9, push: 5, box: { x: 0, y: -70, w: 66, h: 76 }, guard: 'high', pose: 'leap' },
  counter: { startup: 2, active: 22, recovery: 22, dmg: 130, pose: 'counter' },
  throw: { startup: 4, recovery: 28, range: 92, dmg: 180, pose: 'grab' },
};
function SP(o, isSuper) {
  const base = SP_DEF[o.type];
  const d = normMove(Object.assign({ special: true }, base, o));
  if (isSuper) { d.super = true; d.hitstop = Math.max(d.hitstop, 11); }
  return d;
}
const TYPE_LABEL = { projectile: '飛び道具', rush: '突進技', rising: '対空技', leap: '跳躍技(中段)', counter: 'カウンター技', throw: '投げ技' };

// ============================================================
//  キャラクター
// ============================================================
const CHARS = [
  {
    id: 'hayato', name: '神崎 隼', en: 'HAYATO', country: '日本', gender: '男性', style: '空手', stage: 'kyoto', rival: 'edward',
    hp: 1000, walkF: 3.4, walkB: 2.8, jumpVx: 4, power: 1.0,
    look: { skin: '#e9bc8f', hair: '#151515', hairStyle: 'spiky', top: '#f2f2f2', topStyle: 'gi', pants: '#f2f2f2', belt: '#1a1a1a', band: '#d62828', shoe: null, glove: null, bulk: 1.05 },
    specials: {
      fwd: SP({ type: 'projectile', name: '烈風弾', startup: 13, recovery: 32, speed: 7.5, dmg: 110, color: '#5cc8ff' }),
      down: SP({ type: 'rising', name: '昇天拳', startup: 4, active: 12, vy: -15, vx: 2.2, dmg: 140, invuln: 8, pose: 'rise' }),
      back: SP({ type: 'rush', name: '旋風脚', startup: 9, active: 30, recovery: 14, vx: 5.5, dmg: 120, hits: 3, hitInterval: 9, knockdown: true, pose: 'spin', box: { x: -30, y: -140, w: 110, h: 50 } }),
    },
    super: SP({ type: 'projectile', name: '真・烈風弾', startup: 10, recovery: 32, speed: 9, dmg: 340, hits: 5, hitInterval: 5, w: 90, h: 76, py: 116, color: '#3a8cff', invuln: 14 }, true),
    taunt: '押忍！ 全力で来い！',
    intro: '世界最強を決める格闘大会「ワールド・クラッシュ」。\n空手家・神崎隼は、亡き師の遺した言葉“真の強さ”の答えを求め、海を渡る。',
    ending: '激闘の果て、隼は気づいた。強さとは拳の重さではなく、己に打ち克つ心であると。\n師の墓前に優勝の報を告げた彼は、再び修行の旅へと歩き出した。'
  },
  {
    id: 'kaede', name: '霧島 楓', en: 'KAEDE', country: '日本', gender: '女性', style: '忍術', stage: 'bamboo', rival: 'meihua',
    hp: 950, walkF: 3.9, walkB: 3.2, jumpVx: 4.5, power: 0.95,
    look: { skin: '#f3cfae', hair: '#1b1030', hairStyle: 'ponytail', top: '#3b2a5a', topStyle: 'ninja', pants: '#2b1f42', belt: '#c0392b', scarf: '#d23b3b', shoe: '#1a1a1a', glove: null, bulk: 0.92, female: true },
    specials: {
      fwd: SP({ type: 'rush', name: '疾風突き', startup: 7, active: 13, recovery: 16, vx: 11, dmg: 110, pose: 'rushP', stopOnHit: true }),
      down: SP({ type: 'rising', name: '月影', startup: 3, active: 14, vy: -14, vx: 3, dmg: 120, hits: 2, hitInterval: 7, invuln: 6, pose: 'riseK' }),
      back: SP({ type: 'counter', name: '霞返し', startup: 2, active: 22, recovery: 22, dmg: 130 }),
    },
    super: SP({ type: 'rush', name: '百花繚乱', startup: 6, active: 32, recovery: 24, vx: 12, dmg: 360, hits: 6, hitInterval: 4, knockdown: true, invuln: 12, pose: 'rushP', box: { x: -10, y: -160, w: 90, h: 160 } }, true),
    taunt: '影は、光より速い。',
    intro: '伊賀の流れを汲むくノ一、霧島楓。\n大会の裏で暗躍する闇の組織の正体を探るため、彼女は一人の闘士として潜入する。',
    ending: '組織の陰謀を暴き、首領を討った楓は、誰にも告げず静かに姿を消した。\n表彰台に残されていたのは、一枚の紅い楓の葉だけだった。'
  },
  {
    id: 'jack', name: 'ジャック・ハリス', en: 'JACK', country: 'アメリカ', gender: '男性', style: 'プロレス', stage: 'newyork', rival: 'samantha',
    hp: 1150, walkF: 2.7, walkB: 2.2, jumpVx: 3.4, power: 1.12,
    look: { skin: '#e7a884', hair: '#d2a85a', hairStyle: 'flattop', top: '#1f3fa6', stripe: '#d32f2f', topStyle: 'singlet', pants: '#1f3fa6', pantsStyle: 'boots', boot: '#e9e9e9', shoe: '#e9e9e9', glove: null, bulk: 1.3 },
    specials: {
      fwd: SP({ type: 'rush', name: 'ブルドーザー・タックル', startup: 12, active: 18, recovery: 22, vx: 8, dmg: 130, knockdown: true, pose: 'rushP', box: { x: 6, y: -130, w: 64, h: 80 }, stopOnHit: true }),
      down: SP({ type: 'rising', name: 'ハンマー・ラリアット', startup: 5, active: 14, vy: -8, vx: 2.5, dmg: 130, invuln: 7, pose: 'lariat', box: { x: -30, y: -170, w: 120, h: 70 } }),
      back: SP({ type: 'throw', name: 'ジャイアント・スイング', startup: 4, recovery: 30, range: 100, dmg: 190 }),
    },
    super: SP({ type: 'throw', name: 'リバティ・ボム', startup: 3, recovery: 34, range: 115, dmg: 440, invuln: 8 }, true),
    taunt: 'リングの上じゃ、俺がルールだ！',
    intro: '“ザ・ハンマー”ジャック・ハリス。全米王座を守り続ける伝説のプロレスラー。\n世界中のファンに真の王者の姿を見せるため、彼はリングを降り、世界へ打って出る。',
    ending: '優勝ベルトを高々と掲げたジャックに、スタジアムの大歓声が降り注ぐ。\n「次は誰だ？ いつでも、どこでも受けて立つぜ！」'
  },
  {
    id: 'meihua', name: '林 美華', en: 'MEIHUA', country: '中国', gender: '女性', style: '太極拳', stage: 'shanghai', rival: 'kaede',
    hp: 950, walkF: 3.5, walkB: 3.0, jumpVx: 4.2, power: 0.97,
    look: { skin: '#f1d0ad', hair: '#141414', hairStyle: 'buns', top: '#c62828', trim: '#f4c542', topStyle: 'qipao', pants: '#1c1c1c', shoe: '#111', glove: null, bulk: 0.9, female: true },
    specials: {
      fwd: SP({ type: 'projectile', name: '気功掌', startup: 12, recovery: 30, speed: 5.5, dmg: 100, w: 54, h: 44, color: '#ffd24a' }),
      down: SP({ type: 'rising', name: '鳳凰脚', startup: 5, active: 14, vy: -13, vx: 2.5, dmg: 130, hits: 2, hitInterval: 7, invuln: 6, pose: 'riseK' }),
      back: SP({ type: 'counter', name: '化勁', startup: 2, active: 26, recovery: 20, dmg: 140 }),
    },
    super: SP({ type: 'projectile', name: '龍吼波', startup: 10, recovery: 34, speed: 11, dmg: 360, hits: 6, hitInterval: 4, w: 120, h: 84, py: 112, color: '#ff8a1e', style: 'dragon', invuln: 14 }, true),
    taunt: '柔よく剛を制す。',
    intro: '太極拳の名門・林家の継承者、林美華。\n何者かに奪われた一族の秘伝書を取り戻すため、彼女は上海を発った。',
    ending: '秘伝書を取り戻した美華。しかし頁をめくった彼女は微笑んだ。\n真の秘伝とは書物ではなく、拳と共に受け継がれる心にあったのだ。'
  },
  {
    id: 'edward', name: 'エドワード・グレイ', en: 'EDWARD', country: 'イギリス', gender: '男性', style: 'ボクシング', stage: 'london', rival: 'hayato',
    hp: 1000, walkF: 3.6, walkB: 3.1, jumpVx: 3.8, power: 1.0,
    look: { skin: '#f0c8a8', hair: '#7a4a22', hairStyle: 'slick', top: '#f0c8a8', topStyle: 'shirtless', pants: '#13235b', pantsStyle: 'trunks', stripe: '#c62828', shoe: '#f2f2f2', glove: '#c62828', bulk: 1.08 },
    specials: {
      fwd: SP({ type: 'rush', name: 'ロイヤル・ストレート', startup: 8, active: 10, recovery: 18, vx: 10, dmg: 120, pose: 'rushP', stopOnHit: true }),
      down: SP({ type: 'rising', name: 'ブリティッシュ・アッパー', startup: 3, active: 12, vy: -13, vx: 2, dmg: 130, invuln: 7, pose: 'rise' }),
      back: SP({ type: 'counter', name: 'スウェー・カウンター', startup: 2, active: 18, recovery: 18, dmg: 125 }),
    },
    super: SP({ type: 'rush', name: 'クラウン・ラッシュ', startup: 6, active: 30, recovery: 24, vx: 9, dmg: 380, hits: 7, hitInterval: 4, knockdown: true, invuln: 12, pose: 'rushP', box: { x: -10, y: -165, w: 92, h: 120 } }, true),
    taunt: '紳士の拳、受けてみたまえ。',
    intro: '英国ボクシング界の元王者、エドワード・グレイ。\n一度は引退した紳士が、失われた誇りを取り戻すため、再びグローブをはめる。',
    ending: '勝利の後の紅茶を一杯。「紳士たるもの、勝って驕らず」\nエドワードは帽子を軽く傾けると、霧に包まれたロンドンの街へと消えていった。'
  },
  {
    id: 'samantha', name: 'サマンサ・レイノルズ', en: 'SAMANTHA', country: 'アメリカ', gender: '女性', style: 'キックボクシング', stage: 'newyork', rival: 'jack',
    hp: 1000, walkF: 3.7, walkB: 3.0, jumpVx: 4.4, power: 1.0,
    look: { skin: '#d9a07a', hair: '#e9c15a', hairStyle: 'ponytail', top: '#e53935', topStyle: 'sports', pants: '#1e1e1e', pantsStyle: 'shorts', shoe: null, glove: '#2a2a2a', bulk: 0.95, female: true },
    specials: {
      fwd: SP({ type: 'rush', name: 'ローリング・ソバット', startup: 9, active: 12, recovery: 18, vx: 8, dmg: 125, knockdown: true, pose: 'rushK', box: { x: 4, y: -130, w: 74, h: 50 }, stopOnHit: true }),
      down: SP({ type: 'leap', name: 'アクセル・キック', startup: 8, vx: 5, vy: -11.5, dmg: 120, landRec: 14 }),
      back: SP({ type: 'throw', name: 'テイクダウン', startup: 5, recovery: 28, range: 92, dmg: 170 }),
    },
    super: SP({ type: 'rising', name: 'スターズ＆ストライプス', startup: 4, active: 22, vy: -15, vx: 3, dmg: 350, hits: 5, hitInterval: 4, invuln: 16, pose: 'riseK', box: { x: -10, y: -210, w: 80, h: 160 } }, true),
    taunt: 'スピードで勝負よ！',
    intro: 'ロサンゼルスが生んだ新星キックボクサー、サマンサ・レイノルズ。\n伝説の王者ジャックを倒し、新時代の到来を世界に告げるため、彼女は大会へ挑む。',
    ending: 'ついに世界の頂点に立ったサム。無数のフラッシュを浴びながら、彼女は笑った。\n「これはまだ始まりにすぎないわ！」'
  },
];
const CHAR = {}; CHARS.forEach(c => { CHAR[c.id] = c; });
function specialDir(def, type) {
  for (const k of ['fwd', 'down', 'back']) if (def.specials[k].type === type) return k;
  return null;
}

// ============================================================
//  ステージ
// ============================================================
const STAGES = [
  { id: 'kyoto', name: '京都・夕暮れの古寺', country: '日本' },
  { id: 'bamboo', name: '嵐山・月下の竹林', country: '日本' },
  { id: 'newyork', name: 'ニューヨーク・ダウンタウン', country: 'アメリカ' },
  { id: 'shanghai', name: '上海・外灘の夜市', country: '中国' },
  { id: 'london', name: 'ロンドン・テムズ河畔', country: 'イギリス' },
];
const bgCache = {};
const STAGE_STATIC = {
  kyoto(c) {
    let g = c.createLinearGradient(0, 0, 0, GROUND);
    g.addColorStop(0, '#3b1d4a'); g.addColorStop(0.45, '#c8504a'); g.addColorStop(0.8, '#f6a55a'); g.addColorStop(1, '#ffd58a');
    c.fillStyle = g; c.fillRect(0, 0, W, GROUND);
    c.fillStyle = 'rgba(255,236,170,0.95)'; c.beginPath(); c.arc(600, 330, 62, 0, 7); c.fill();
    c.fillStyle = '#8a3c4c'; c.beginPath(); c.moveTo(0, 390);
    for (let x = 0; x <= W; x += 40) c.lineTo(x, 360 - Math.sin(x * 0.01) * 40 - hash(x) * 20);
    c.lineTo(W, GROUND); c.lineTo(0, GROUND); c.fill();
    c.fillStyle = '#5a2534'; c.beginPath(); c.moveTo(0, 420);
    for (let x = 0; x <= W; x += 30) c.lineTo(x, 405 - Math.sin(x * 0.02 + 1) * 18);
    c.lineTo(W, GROUND); c.lineTo(0, GROUND); c.fill();
    // 五重塔
    c.fillStyle = '#26121c';
    const px = 160;
    c.fillRect(px - 4, 120, 8, 40);
    for (let i = 0; i < 5; i++) {
      const y = 410 - i * 52, w = 150 - i * 20;
      c.fillRect(px - w / 2 + 14, y - 40, w - 28, 40);
      c.beginPath(); c.moveTo(px - w / 2 - 18, y - 30); c.quadraticCurveTo(px, y - 48, px + w / 2 + 18, y - 30);
      c.lineTo(px + w / 2 - 4, y - 46); c.lineTo(px - w / 2 + 4, y - 46); c.fill();
    }
    // 鳥居
    c.fillStyle = '#b3261e';
    c.fillRect(760, 300, 14, 170); c.fillRect(876, 300, 14, 170);
    c.fillRect(740, 300, 170, 14); c.fillRect(750, 330, 150, 10);
    c.beginPath(); c.moveTo(728, 292); c.quadraticCurveTo(825, 300, 922, 292); c.lineTo(922, 282); c.quadraticCurveTo(825, 290, 728, 282); c.fill();
    // 地面
    g = c.createLinearGradient(0, GROUND, 0, H); g.addColorStop(0, '#7a5638'); g.addColorStop(1, '#3a2617');
    c.fillStyle = g; c.fillRect(0, GROUND, W, H - GROUND);
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 2;
    for (let i = -10; i < 20; i++) { c.beginPath(); c.moveTo(W / 2 + i * 60, GROUND); c.lineTo(W / 2 + i * 120, H); c.stroke(); }
    for (let y = GROUND + 15; y < H; y += 20) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
  },
  bamboo(c) {
    let g = c.createLinearGradient(0, 0, 0, GROUND);
    g.addColorStop(0, '#061a1a'); g.addColorStop(0.6, '#14403a'); g.addColorStop(1, '#2c6a4e');
    c.fillStyle = g; c.fillRect(0, 0, W, GROUND);
    c.fillStyle = 'rgba(240,250,220,0.95)'; c.beginPath(); c.arc(480, 110, 50, 0, 7); c.fill();
    c.fillStyle = 'rgba(240,250,220,0.15)'; c.beginPath(); c.arc(480, 110, 90, 0, 7); c.fill();
    for (let layer = 0; layer < 3; layer++) {
      const n = 14 + layer * 4;
      for (let i = 0; i < n; i++) {
        const x = hash(i * 7 + layer * 31) * W, w = 8 + layer * 5 + hash(i + layer) * 6;
        const col = ['#123b30', '#1b5440', '#2b7a50'][layer];
        c.fillStyle = col; c.fillRect(x, 0, w, GROUND);
        c.fillStyle = shade(col, -0.35);
        for (let y = 30 + hash(i) * 50; y < GROUND; y += 70 + layer * 10) c.fillRect(x - 1, y, w + 2, 3);
        c.fillStyle = shade(col, 0.15);
        for (let k = 0; k < 3; k++) {
          const ly = 40 + hash(i * 3 + k + layer) * 300;
          c.beginPath(); c.ellipse(x + w + 12, ly, 16, 4, 0.4, 0, 7); c.fill();
        }
      }
    }
    g = c.createLinearGradient(0, GROUND, 0, H); g.addColorStop(0, '#4a5a32'); g.addColorStop(1, '#1f2a14');
    c.fillStyle = g; c.fillRect(0, GROUND, W, H - GROUND);
    c.fillStyle = 'rgba(0,0,0,0.2)';
    for (let i = 0; i < 60; i++) c.fillRect(hash(i * 5) * W, GROUND + hash(i * 9) * 70, 20, 2);
  },
  newyork(c) {
    let g = c.createLinearGradient(0, 0, 0, GROUND);
    g.addColorStop(0, '#05060f'); g.addColorStop(0.7, '#1a1d3a'); g.addColorStop(1, '#3a2c4a');
    c.fillStyle = g; c.fillRect(0, 0, W, GROUND);
    for (let i = 0; i < 80; i++) { c.fillStyle = `rgba(255,255,255,${hash(i) * 0.7})`; c.fillRect(hash(i * 3) * W, hash(i * 5) * 200, 2, 2); }
    for (let layer = 0; layer < 2; layer++) {
      let x = -20;
      let i = 0;
      while (x < W) {
        const bw = 60 + hash(i * 11 + layer * 3) * 90, bh = 150 + hash(i * 13 + layer) * (layer ? 220 : 300);
        const top = GROUND - bh - (layer ? 0 : 30);
        c.fillStyle = layer ? '#151726' : '#0d0f1c'; c.fillRect(x, top, bw - 6, GROUND - top);
        for (let wy = top + 12; wy < GROUND - 20; wy += 18) for (let wx = x + 8; wx < x + bw - 16; wx += 14) {
          if (hash(wx * 0.37 + wy * 1.7 + layer) > 0.55) { c.fillStyle = hash(wx + wy) > 0.5 ? 'rgba(255,220,120,0.8)' : 'rgba(180,220,255,0.6)'; c.fillRect(wx, wy, 7, 9); }
        }
        x += bw; i++;
      }
    }
    // 非常階段
    c.strokeStyle = '#2a2a3a'; c.lineWidth = 3;
    for (let y = 200; y < 420; y += 60) { c.strokeRect(60, y, 120, 4); c.beginPath(); c.moveTo(60, y); c.lineTo(180, y + 60); c.stroke(); }
    g = c.createLinearGradient(0, GROUND, 0, H); g.addColorStop(0, '#3a3a44'); g.addColorStop(1, '#16161c');
    c.fillStyle = g; c.fillRect(0, GROUND, W, H - GROUND);
    c.fillStyle = '#d8b030'; for (let x = 0; x < W; x += 80) c.fillRect(x, GROUND + 38, 40, 4);
  },
  shanghai(c) {
    let g = c.createLinearGradient(0, 0, 0, GROUND);
    g.addColorStop(0, '#12052a'); g.addColorStop(0.55, '#4a1648'); g.addColorStop(1, '#a8325a');
    c.fillStyle = g; c.fillRect(0, 0, W, GROUND);
    // 東方明珠
    const tx = 700;
    c.fillStyle = '#20102c';
    c.fillRect(tx - 3, 40, 6, 400); c.fillRect(tx - 30, 220, 8, 220); c.fillRect(tx + 22, 220, 8, 220);
    c.beginPath(); c.arc(tx, 250, 34, 0, 7); c.fill(); c.beginPath(); c.arc(tx, 130, 20, 0, 7); c.fill(); c.beginPath(); c.arc(tx, 75, 9, 0, 7); c.fill();
    c.fillStyle = '#ff4fa0'; c.beginPath(); c.arc(tx, 250, 30, 0, 7); c.fill(); c.fillStyle = '#20102c'; c.fillRect(tx - 34, 246, 68, 8);
    c.fillStyle = '#ff7ac0'; c.beginPath(); c.arc(tx, 130, 16, 0, 7); c.fill();
    let x = -10, i = 0;
    while (x < W) {
      const bw = 50 + hash(i * 17) * 80, bh = 100 + hash(i * 19) * 180;
      if (Math.abs(x + bw / 2 - tx) > 60) {
        c.fillStyle = '#1d0c26'; c.fillRect(x, GROUND - 60 - bh, bw - 5, bh + 60);
        c.fillStyle = hash(i) > 0.5 ? '#ff3b6b' : '#3bd8ff'; c.fillRect(x, GROUND - 60 - bh, bw - 5, 3);
        for (let wy = GROUND - 50 - bh; wy < GROUND - 70; wy += 16) for (let wx = x + 6; wx < x + bw - 12; wx += 12)
          if (hash(wx * 1.3 + wy * 0.7) > 0.6) { c.fillStyle = 'rgba(255,200,140,0.7)'; c.fillRect(wx, wy, 5, 8); }
      }
      x += bw; i++;
    }
    // 屋台の屋根
    c.fillStyle = '#5a1010';
    for (let k = 0; k < 4; k++) { const sx = 40 + k * 250; c.beginPath(); c.moveTo(sx - 20, 400); c.lineTo(sx + 100, 370); c.lineTo(sx + 220, 400); c.fill(); c.fillStyle = '#3a0a0a'; c.fillRect(sx, 400, 200, 70); c.fillStyle = '#5a1010'; }
    g = c.createLinearGradient(0, GROUND, 0, H); g.addColorStop(0, '#7a2a2a'); g.addColorStop(1, '#2a0c0c');
    c.fillStyle = g; c.fillRect(0, GROUND, W, H - GROUND);
    c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 2;
    for (let yy = GROUND + 14; yy < H; yy += 18) for (let xx = (yy / 18 % 2) * 30; xx < W; xx += 60) c.strokeRect(xx, yy, 60, 18);
  },
  london(c) {
    let g = c.createLinearGradient(0, 0, 0, GROUND);
    g.addColorStop(0, '#2a3346'); g.addColorStop(0.6, '#5b6a80'); g.addColorStop(1, '#9aa6b4');
    c.fillStyle = g; c.fillRect(0, 0, W, GROUND);
    // 川
    c.fillStyle = '#3c4a5a'; c.fillRect(0, 380, W, 90);
    // ビッグ・ベン
    const bx = 760;
    c.fillStyle = '#2a2a33';
    c.fillRect(bx - 28, 120, 56, 350);
    c.beginPath(); c.moveTo(bx - 32, 120); c.lineTo(bx, 40); c.lineTo(bx + 32, 120); c.fill();
    c.fillRect(bx - 2, 20, 4, 24);
    c.fillStyle = '#e8dfb0'; c.beginPath(); c.arc(bx, 160, 20, 0, 7); c.fill();
    c.strokeStyle = '#222'; c.lineWidth = 2; c.beginPath(); c.moveTo(bx, 160); c.lineTo(bx, 146); c.moveTo(bx, 160); c.lineTo(bx + 10, 164); c.stroke();
    // 国会議事堂
    c.fillStyle = '#2f2f3a'; c.fillRect(380, 300, 360, 90);
    for (let k = 0; k < 12; k++) { c.fillRect(385 + k * 30, 280, 8, 22); c.beginPath(); c.moveTo(383 + k * 30, 282); c.lineTo(389 + k * 30, 268); c.lineTo(395 + k * 30, 282); c.fill(); }
    // 橋
    c.fillStyle = '#3a3036';
    c.fillRect(0, 370, 360, 12);
    for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(45 + k * 90, 400, 38, Math.PI, 0); c.lineTo(83 + k * 90, 382); c.lineTo(7 + k * 90, 382); c.fill(); }
    g = c.createLinearGradient(0, GROUND, 0, H); g.addColorStop(0, '#6a6a70'); g.addColorStop(1, '#2a2a30');
    c.fillStyle = g; c.fillRect(0, GROUND, W, H - GROUND);
    c.fillStyle = 'rgba(0,0,0,0.25)';
    for (let yy = GROUND + 6; yy < H; yy += 14) for (let xx = (yy % 28) ? 0 : 12; xx < W; xx += 24) c.fillRect(xx, yy, 20, 10);
    // 街灯
    for (const lx of [90, 330]) { c.fillStyle = '#1a1a1e'; c.fillRect(lx, 300, 6, 170); c.fillRect(lx - 10, 290, 26, 14); }
  },
};
const STAGE_ANIM = {
  kyoto(c, t) {
    c.fillStyle = 'rgba(255,170,200,0.85)';
    for (let i = 0; i < 28; i++) {
      const x = ((hash(i) * W + t * (0.5 + hash(i + 5))) % (W + 40)) - 20;
      const y = (hash(i + 9) * GROUND + t * (0.7 + hash(i + 3) * 0.6)) % GROUND;
      c.beginPath(); c.ellipse(x, y, 4, 2.2, t * 0.05 + i, 0, 7); c.fill();
    }
  },
  bamboo(c, t) {
    for (let i = 0; i < 18; i++) {
      const a = 0.4 + 0.6 * Math.abs(Math.sin(t * 0.03 + i));
      c.fillStyle = `rgba(220,255,140,${a * 0.8})`;
      const x = hash(i * 3) * W + Math.sin(t * 0.01 + i) * 30, y = 150 + hash(i * 7) * 280 + Math.cos(t * 0.013 + i) * 20;
      c.beginPath(); c.arc(x, y, 2.5, 0, 7); c.fill();
    }
  },
  newyork(c, t) {
    const on = Math.floor(t / 30) % 4 !== 0;
    c.fillStyle = on ? '#ff3b6b' : '#5a1a2a'; c.font = `bold 30px ${FONT}`; c.textAlign = 'center'; c.fillText('BAR', 860, 300);
    c.fillStyle = 'rgba(220,220,230,0.12)';
    for (let i = 0; i < 6; i++) { const ph = (t * 0.6 + i * 25) % 150; c.beginPath(); c.arc(480 + Math.sin(ph * 0.05 + i) * 12, GROUND + 10 - ph, 14 + ph * 0.15, 0, 7); c.fill(); }
  },
  shanghai(c, t) {
    c.strokeStyle = '#2a0a0a'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, 60); c.quadraticCurveTo(W / 2, 110, W, 60); c.stroke();
    for (let i = 0; i < 9; i++) {
      const x = 50 + i * 108, y = 60 + Math.sin(i / 8 * Math.PI) * 40 + 18, sw = Math.sin(t * 0.04 + i) * 4;
      const g = c.createRadialGradient(x + sw, y, 2, x + sw, y, 30); g.addColorStop(0, 'rgba(255,120,60,0.5)'); g.addColorStop(1, 'rgba(255,60,60,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x + sw, y, 30, 0, 7); c.fill();
      c.fillStyle = '#e8281e'; c.beginPath(); c.ellipse(x + sw, y, 14, 17, 0, 0, 7); c.fill();
      c.fillStyle = '#f4c542'; c.fillRect(x + sw - 8, y - 18, 16, 4); c.fillRect(x + sw - 8, y + 14, 16, 4);
    }
  },
  london(c, t) {
    for (let i = 0; i < 4; i++) {
      c.fillStyle = 'rgba(220,225,235,0.08)';
      const x = ((t * (0.3 + i * 0.1) + i * 300) % (W + 600)) - 300;
      c.beginPath(); c.ellipse(x, 360 + i * 25, 300, 40, 0, 0, 7); c.fill();
    }
    for (const lx of [93, 333]) { c.fillStyle = 'rgba(255,220,140,0.25)'; c.beginPath(); c.arc(lx, 298, 22, 0, 7); c.fill(); }
  },
};
function drawStage(c, id, t) {
  if (!bgCache[id]) {
    const oc = document.createElement('canvas'); oc.width = W; oc.height = H;
    STAGE_STATIC[id](oc.getContext('2d')); bgCache[id] = oc;
  }
  c.drawImage(bgCache[id], 0, 0);
  if (STAGE_ANIM[id]) STAGE_ANIM[id](c, t);
}

// ============================================================
//  キャラクター描画（関節ポーズ）
// ============================================================
// 角度: 0=真下, 90=前方, 180=真上, -90=後方（度）
const seg = (p, a, len) => ({ x: p.x + Math.sin(a * D2R) * len, y: p.y + Math.cos(a * D2R) * len });
const BASE = { torso: 175, head: 0, aF: [40, 150], aB: [25, 160], lF: [14, -2], lB: [-16, -6] };
const CROUCH = { torso: 162, lF: [78, -12], lB: [22, -72], aF: [50, 150], aB: [35, 160] };
const JUMP = { ground: false, hipY: -82, lF: [75, -15], lB: [35, -40], aF: [60, 150], aB: [40, 150], torso: 178 };
const ATK = {
  lp: { aF: [88, 95] }, mp: { aF: [90, 90], torso: 168 }, hp: { aF: [92, 88], aB: [-30, 40], torso: 158 },
  lk: { lF: [62, 72], torso: 182 }, mk: { lF: [96, 96], torso: 194 }, hk: { lF: [128, 122], torso: 208, aF: [60, 120] },
  clp: { aF: [88, 92] }, cmp: { aF: [86, 88], torso: 150 }, chp: { aF: [168, 178], torso: 180 },
  clk: { lF: [84, 92] }, cmk: { lF: [88, 90], torso: 148 }, chk: { lF: [90, 94], torso: 138, aF: [20, 40] },
  jp: { aF: [65, 70] }, jk: { lF: [62, 56] }, jhk: { lF: [86, 82], torso: 190 },
  proj: { aF: [90, 90], aB: [88, 92], torso: 165 },
  rise: { aF: [172, 178], aB: [40, 90], torso: 182, lF: [60, 0], lB: [10, -20] },
  riseK: { lF: [165, 172], lB: [-10, -30], aF: [120, 150], aB: [-60, -30], torso: 205 },
  lariat: { aF: [90, 90], aB: [-90, -90], torso: 178 },
  rushP: { aF: [90, 90], aB: [-40, 20], torso: 145, lF: [40, 10], lB: [-45, -30] },
  rushK: { lF: [96, 96], torso: 205, lB: [-10, 0] },
  spin: { lF: [92, 92], lB: [-20, -10], aF: [100, 120], aB: [-100, -110], torso: 180 },
  leap: { lF: [70, 58], lB: [10, -50], torso: 165, aF: [120, 160] },
  grab: { aF: [90, 100], aB: [85, 105] },
  counter: { aF: [110, 170], aB: [70, 150], torso: 178 },
  cstrike: { aF: [92, 90], torso: 160, aB: [-20, 30] },
};
function movePhase(f) {
  const mv = f.mv, d = mv.d, s = Math.max(1, d.startup), fr = mv.f;
  if (d.type === 'rising') return fr <= s ? fr / s : fr <= s + d.active ? 1 : 0.6;
  if (d.type === 'leap') return fr <= s ? fr / s : mv.landed ? 0.3 : 1;
  if (d.type === 'counter') return fr <= s ? fr / s : fr <= s + d.active ? 1 : Math.max(0, 1 - (fr - s - d.active) / 10);
  if (d.type === 'projectile') return fr <= s ? fr / s : Math.max(0, 1 - (fr - s) / Math.max(1, d.recovery));
  if (d.type === 'cstrike') return fr < 6 ? fr / 6 : Math.max(0, 1 - (fr - 14) / 14);
  if (d.type === 'throw') return fr <= s ? fr / s : 0.6;
  const a = Math.max(1, d.active), r = Math.max(1, d.recovery);
  return fr <= s ? fr / s : fr <= s + a ? 1 : Math.max(0, 1 - (fr - s - a) / r);
}
function computePose(f) {
  const t = f.animT || 0, st = f.state, mv = f.mv;
  const P = { torso: 175, head: 0, aF: [40, 150], aB: [25, 160], lF: [14, -2], lB: [-16, -6], rot: 0, ground: true, hipY: 0, flip: false, glow: null };
  const set = o => { for (const k in o) P[k] = Array.isArray(o[k]) ? o[k].slice() : o[k]; };
  const mix = (o, p) => {
    for (const k in o) {
      if (Array.isArray(o[k])) P[k] = [lerp(P[k][0], o[k][0], p), lerp(P[k][1], o[k][1], p)];
      else if (typeof o[k] === 'number') P[k] = lerp(P[k], o[k], p);
      else P[k] = o[k];
    }
  };
  switch (st) {
    case 'idle':
      P.torso = 175 + Math.sin(t * 0.08) * 1.5; P.aF = [40 + Math.sin(t * 0.08) * 4, 150];
      if (f.guardPose) set({ aF: [78, 172], aB: [62, 168], torso: 182 });
      break;
    case 'walk': {
      const ph = t * 0.22 * (f.walkDir || 1), s = Math.sin(ph);
      P.lF = [14 + 20 * s, -4 - 14 * Math.max(0, -s)]; P.lB = [-16 - 20 * s, -6 - 14 * Math.max(0, s)];
      P.torso = 175 + (f.walkDir > 0 ? -3 : 3);
      break;
    }
    case 'crouch': set(CROUCH); if (f.guardPose) set({ aF: [75, 170], aB: [60, 165], torso: 168 }); break;
    case 'land': case 'getup': set(CROUCH); break;
    case 'air': set(JUMP); if (f.vy < -7) set({ lF: [30, -10], lB: [-12, -22] }); break;
    case 'block': if (f.crouchBlock) set(CROUCH); set({ aF: [78, 172], aB: [62, 168], torso: f.crouchBlock ? 168 : 184 }); break;
    case 'hit': if (f.crouchHit) set(CROUCH); set({ torso: 198, aF: [20, 60], aB: [-20, 30], head: 20 }); break;
    case 'fall': set(JUMP); set({ rot: -0.5 - Math.min(1, f.t / 25) * 0.9, hipY: -50, aF: [150, 160], aB: [130, 150], lF: [40, 20], lB: [20, 10] }); break;
    case 'ko':
      if (f.air) { set(JUMP); set({ rot: -0.5 - Math.min(1, f.t / 25) * 0.9, hipY: -50, aF: [150, 160], aB: [130, 150], lF: [40, 20], lB: [20, 10] }); break; }
    // fallthrough
    case 'down':
      set({ ground: false, hipY: -14, rot: -Math.PI / 2, torso: 180, aF: [165, 175], aB: [150, 170], lF: [8, 2], lB: [-4, -2], head: 0 });
      break;
    case 'thrown': set({ ground: false, hipY: -85, torso: 200, aF: [150, 160], aB: [120, 150], lF: [30, 20], lB: [-20, -10], rot: -0.3 }); break;
    case 'throwing':
      set({ aF: [95, 110], aB: [85, 115], torso: 168 });
      if (f.throwInfo && f.throwInfo.t > 12) set({ aF: [165, 172], aB: [150, 165], torso: 196 });
      break;
    case 'win': set({ aF: [176, 178], aB: [30, 150] }); P.torso = 178; break;
    case 'lose': set({ torso: 165, head: 25, aF: [10, 5], aB: [-5, 0] }); break;
    case 'attack': case 'airAttack': {
      if (!mv) break;
      const d = mv.d;
      if (f.air) set(JUMP); else if (d.crouch) set(CROUCH);
      const tg = ATK[d.pose || (d.type === 'counter' ? 'counter' : d.type === 'throw' ? 'grab' : 'mp')];
      if (tg) mix(tg, movePhase(f));
      if (d.pose === 'spin' && mv.f > d.startup && mv.f <= d.startup + d.active) P.flip = Math.floor(mv.f / 5) % 2 === 1;
      if (d.type === 'counter' && f.countering) P.glow = 'rgba(160,220,255,0.35)';
      if (d.super && mv.f < d.startup + d.active + 4) P.glow = 'rgba(255,220,90,0.35)';
      break;
    }
  }
  return P;
}
function drawFighter(c, f, scale = 1) {
  const L = f.def.look, P = computePose(f), b = L.bulk || 1, fem = !!L.female, t = f.animT || 0;
  const flash = f.flash > 0 && (f.flash % 2 === 0);
  const C = col => flash ? '#ffffff' : col;
  const TH = 42, SH = 42, TO = fem ? 50 : 54, UA = 28, FA = 28;
  const hip = { x: 0, y: 0 };
  const kF = seg(hip, P.lF[0], TH), fF = seg(kF, P.lF[1], SH), kB = seg(hip, P.lB[0], TH), fB = seg(kB, P.lB[1], SH);
  const hy = P.ground ? -Math.max(fF.y, fB.y, kF.y + 5, kB.y + 5) : P.hipY;
  const S = seg(hip, P.torso, TO);
  const Nk = seg(S, P.torso + P.head * 0.5, 6);
  const Hc = seg(Nk, P.torso + P.head, 14);
  const eF = seg(S, P.aF[0], UA), hF = seg(eF, P.aF[1], FA);
  const eB = seg(S, P.aB[0], UA), hB = seg(eB, P.aB[1], FA);
  const ts = L.topStyle, ps = L.pantsStyle || 'long';
  const armUpper = ['gi', 'ninja', 'qipao'].includes(ts) ? L.top : L.skin;
  const armLower = ts === 'ninja' ? L.top : L.skin;
  const thighCol = ps === 'trunks' ? L.skin : L.pants;
  const shinCol = ps === 'long' ? L.pants : ps === 'boots' ? L.boot : L.skin;
  const shoeCol = L.shoe || L.skin;
  const handCol = L.glove || L.skin;
  const handR = L.glove ? 8.5 : 6;

  c.save();
  c.translate(f.x, f.y);
  c.scale(scale * f.facing, scale);
  c.translate(0, hy);
  if (P.rot) c.rotate(P.rot);
  if (P.flip) c.scale(-1, 1);
  c.lineCap = 'round'; c.lineJoin = 'round';
  if (P.glow) { c.fillStyle = P.glow; c.beginPath(); c.ellipse(0, -40, 60, 100, 0, 0, 7); c.fill(); }
  const limb = (a, p2, w, col) => { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(p2.x, p2.y); c.stroke(); };
  const foot = (k, ft, col) => { const d = seg(ft, 90 + (Math.atan2(ft.x - k.x, ft.y - k.y) / D2R - 0) * 0.3, 11); limb(ft, d, 8, col); };
  const drawLeg = (k, ft, dark) => {
    const sh = x => dark ? shade(x, -0.28) : x;
    limb(hip, k, 16 * b, C(sh(thighCol)));
    if (ps === 'trunks') limb(hip, { x: k.x * 0.45, y: k.y * 0.45 }, 19 * b, C(sh(L.pants)));
    limb(k, ft, 13 * b, C(sh(shinCol)));
    foot(k, ft, C(sh(shoeCol)));
  };
  const drawArm = (e, h, dark) => {
    const sh = x => dark ? shade(x, -0.28) : x;
    limb(S, e, 12 * b, C(sh(armUpper)));
    limb(e, h, 10.5 * b, C(sh(armLower)));
    c.fillStyle = C(sh(handCol)); c.beginPath(); c.arc(h.x, h.y, handR * b, 0, 7); c.fill();
  };
  // 後ろ側の手足
  drawArm(eB, hB, true);
  drawLeg(kB, fB, true);
  // 胴体
  {
    const dx = S.x - hip.x, dy = S.y - hip.y, ln = Math.hypot(dx, dy) || 1;
    const nx = -dy / ln, ny = dx / ln;
    const shW = (fem ? 13 : 15.5) * b, hW = (fem ? 13 : 12) * b;
    const pt = (base, w) => [{ x: base.x + nx * w, y: base.y + ny * w }, { x: base.x - nx * w, y: base.y - ny * w }];
    const [h1, h2] = pt(hip, hW), [s1, s2] = pt(S, shW);
    const body = col => { c.fillStyle = col; c.beginPath(); c.moveTo(h1.x, h1.y); c.lineTo(s1.x, s1.y); c.lineTo(s2.x, s2.y); c.lineTo(h2.x, h2.y); c.closePath(); c.fill(); };
    const mid = (a, z, k) => ({ x: lerp(a.x, z.x, k), y: lerp(a.y, z.y, k) });
    if (ts === 'shirtless') {
      body(C(L.skin));
      c.strokeStyle = C(shade(L.skin, -0.2)); c.lineWidth = 2; c.beginPath(); const p1 = mid(hip, S, 0.7); c.moveTo(p1.x, p1.y); c.lineTo(p1.x + 10, p1.y + 4); c.stroke();
    } else if (ts === 'sports') {
      body(C(L.skin));
      c.fillStyle = C(L.top); c.beginPath(); const m1 = mid(h1, s1, 0.55), m2 = mid(h2, s2, 0.55);
      c.moveTo(m1.x, m1.y); c.lineTo(s1.x, s1.y); c.lineTo(s2.x, s2.y); c.lineTo(m2.x, m2.y); c.closePath(); c.fill();
    } else {
      body(C(L.top));
      if (ts === 'gi') { c.strokeStyle = C('#bbb'); c.lineWidth = 2; const a = mid(S, hip, 0.05), z = mid(S, hip, 0.45); c.beginPath(); c.moveTo(a.x + 6, a.y); c.lineTo(z.x, z.y); c.stroke(); }
      if (ts === 'singlet') { c.strokeStyle = C(L.stripe); c.lineWidth = 6; c.beginPath(); c.moveTo(hip.x, hip.y); c.lineTo(S.x, S.y); c.stroke(); }
      if (ts === 'qipao') { c.strokeStyle = C(L.trim); c.lineWidth = 2.5; c.beginPath(); c.moveTo(s1.x, s1.y); c.lineTo(h1.x, h1.y); c.stroke(); c.fillStyle = C(L.trim); const q = mid(S, hip, 0.25); c.beginPath(); c.arc(q.x + 5, q.y, 2.5, 0, 7); c.fill(); }
    }
    if (ts === 'gi' || ts === 'ninja') { const bl = mid(hip, S, 0.12); limb({ x: bl.x + nx * hW, y: bl.y + ny * hW }, { x: bl.x - nx * hW, y: bl.y - ny * hW }, 6, C(L.belt)); }
    if (ts === 'shirtless') { const bl = mid(hip, S, 0.08); limb({ x: bl.x + nx * hW, y: bl.y + ny * hW }, { x: bl.x - nx * hW, y: bl.y - ny * hW }, 6, C(L.stripe || L.pants)); }
  }
  // 前側の脚
  drawLeg(kF, fF, false);
  // 首・頭
  limb(S, Nk, 9 * b, C(L.skin));
  if (ts === 'ninja') {
    c.strokeStyle = C(L.scarf); c.lineWidth = 6; c.beginPath(); c.moveTo(Nk.x, Nk.y);
    const sw = Math.sin(t * 0.2) * 6; c.quadraticCurveTo(Nk.x - 20, Nk.y + 4 + sw, Nk.x - 38, Nk.y + 10 - sw); c.stroke();
  }
  {
    const r = 13.5;
    c.fillStyle = C(L.skin); c.beginPath(); c.arc(Hc.x, Hc.y, r, 0, 7); c.fill();
    c.fillStyle = C(L.hair);
    const hs = L.hairStyle;
    c.beginPath(); c.arc(Hc.x - 1, Hc.y - 2, r + 1.5, Math.PI * 0.95, Math.PI * 2.05); c.fill();
    if (hs === 'spiky') {
      c.beginPath();
      for (let i = 0; i < 5; i++) { const a = -150 + i * 25, bx = Hc.x + Math.cos(a * D2R) * r, by = Hc.y + Math.sin(a * D2R) * r;
        c.moveTo(bx - 4, by); c.lineTo(Hc.x + Math.cos((a - 8) * D2R) * (r + 11), Hc.y + Math.sin((a - 8) * D2R) * (r + 11)); c.lineTo(bx + 4, by); }
      c.fill();
      c.fillRect(Hc.x - r - 1, Hc.y - 4, 6, 10);
    } else if (hs === 'ponytail') {
      const sw = Math.sin(t * 0.15) * 5;
      c.strokeStyle = C(L.hair); c.lineWidth = 8; c.beginPath(); c.moveTo(Hc.x - r * 0.7, Hc.y - r * 0.6);
      c.quadraticCurveTo(Hc.x - r - 14, Hc.y - 6 + sw, Hc.x - r - 12, Hc.y + 22 + sw); c.stroke();
      c.fillRect(Hc.x - r - 1, Hc.y - 4, 5, 12);
    } else if (hs === 'buns') {
      c.beginPath(); c.arc(Hc.x - r * 0.55, Hc.y - r * 0.95, 7, 0, 7); c.fill();
      c.beginPath(); c.arc(Hc.x + r * 0.25, Hc.y - r * 1.12, 6, 0, 7); c.fill();
      c.fillRect(Hc.x - r - 1, Hc.y - 4, 5, 9);
    } else if (hs === 'flattop') {
      c.fillRect(Hc.x - r, Hc.y - r - 7, r * 2, 10);
    } else if (hs === 'slick') {
      c.beginPath(); c.moveTo(Hc.x - r - 1, Hc.y + 2); c.quadraticCurveTo(Hc.x - r, Hc.y - r - 6, Hc.x + r + 3, Hc.y - r * 0.4); c.lineTo(Hc.x - r * 0.3, Hc.y - r * 0.5); c.fill();
    }
    if (L.band) {
      c.strokeStyle = C(L.band); c.lineWidth = 4; c.beginPath(); c.moveTo(Hc.x - r, Hc.y - r * 0.35); c.lineTo(Hc.x + r, Hc.y - r * 0.45); c.stroke();
      const sw = Math.sin(t * 0.2) * 4; c.lineWidth = 3; c.beginPath(); c.moveTo(Hc.x - r, Hc.y - r * 0.35); c.lineTo(Hc.x - r - 16, Hc.y - 2 + sw); c.moveTo(Hc.x - r, Hc.y - r * 0.35); c.lineTo(Hc.x - r - 14, Hc.y + 6 - sw); c.stroke();
    }
    c.fillStyle = C('#1a1a1a'); c.fillRect(Hc.x + r * 0.35, Hc.y - 2, 3, 3);
    if (fem) { c.fillStyle = C('#c0464a'); c.fillRect(Hc.x + r * 0.55, Hc.y + 6, 4, 2); }
  }
  // 前側の腕
  drawArm(eF, hF, false);
  c.restore();
}

// ============================================================
//  ファイター
// ============================================================
class Fighter {
  constructor(def, side) {
    this.def = def; this.side = side; this.maxHp = def.hp; this.gauge = 0; this.wins = 0;
    this.animT = 0;
    this.resetRound();
  }
  resetRound() {
    this.x = W / 2 + (this.side === 0 ? -170 : 170); this.y = GROUND; this.vx = 0; this.vy = 0; this.air = false;
    this.facing = this.side === 0 ? 1 : -1; this.hp = this.maxHp; this.redHp = this.maxHp; this.redDelay = 0;
    this.state = 'idle'; this.t = 0; this.stun = 0; this.mv = null; this.hitstop = 0; this.invuln = 0;
    this.buf = {}; this.combo = 0; this.airAttacked = false; this.pushVx = 0;
    this.inp = BLANK; this.flash = 0; this.jumpId = 0; this.countering = false; this.guardPose = false;
    this.throwInfo = null; this.juggle = false; this.crouchBlock = false; this.crouchHit = false; this.walkDir = 1;
  }
  setState(s) { this.state = s; this.t = 0; }
  keep(s) { if (this.state !== s) this.setState(s); }
  get fwd() { return this.facing === 1 ? this.inp.right : this.inp.left; }
  get back() { return this.facing === 1 ? this.inp.left : this.inp.right; }
  canAct() { return this.state === 'idle' || this.state === 'walk' || this.state === 'crouch'; }
  isCrouching() {
    return this.state === 'crouch' || this.state === 'getup' || this.state === 'land' ||
      (this.state === 'block' && this.crouchBlock) || (this.state === 'hit' && this.crouchHit) ||
      (this.state === 'attack' && this.mv && this.mv.d.crouch);
  }
  hurtbox() {
    if (this.state === 'fall' && this.juggle) return { x: this.x - 22, y: this.y - 165, w: 44, h: 130 };
    if (['down', 'getup', 'fall', 'ko', 'thrown'].includes(this.state)) return null;
    if (this.air) return { x: this.x - 22, y: this.y - 165, w: 44, h: 130 };
    if (this.isCrouching()) return { x: this.x - 24, y: this.y - 108, w: 48, h: 108 };
    return { x: this.x - 22, y: this.y - 168, w: 44, h: 168 };
  }
  hitbox() {
    if (!this.mv || !this.activeNow()) return null;
    const b = this.mv.d.box; if (!b) return null;
    const x = this.facing === 1 ? this.x + b.x : this.x - b.x - b.w;
    return { x, y: this.y + b.y, w: b.w, h: b.h };
  }
  activeNow() {
    const mv = this.mv;
    if (!mv || (this.state !== 'attack' && this.state !== 'airAttack')) return false;
    const d = mv.d;
    if (d.type === 'leap') return mv.f > d.startup && !mv.landed;
    return mv.f > d.startup && mv.f <= d.startup + d.active;
  }
  grabbable() {
    return !this.air && ['idle', 'walk', 'crouch', 'attack', 'land', 'block'].includes(this.state) && this.invuln <= 0 &&
      !(this.state === 'block' && this.stun > 0);
  }

  update(inp, g) {
    this.inp = inp; this.animT++;
    for (const k of BTNS) if (inp.pressed[k]) this.buf[k] = 7;
    if (this.flash > 0) this.flash--;
    if (this.hitstop > 0) { this.hitstop--; return; }
    for (const k of BTNS) if (this.buf[k] > 0 && !inp.pressed[k]) this.buf[k]--;
    this.t++;
    if (this.invuln > 0) this.invuln--;
    const opp = g.other(this);
    this.guardPose = false;
    switch (this.state) {
      case 'idle': case 'walk': case 'crouch': this.groundControl(g, opp); break;
      case 'air': this.airControl(g); break;
      case 'airAttack': this.updateMove(g, opp); break;
      case 'attack': if (!this.tryCancel(g, opp)) this.updateMove(g, opp); break;
      case 'hit': case 'block':
        this.vx = 0;
        if (--this.stun <= 0) { this.setState(inp.down ? 'crouch' : 'idle'); }
        break;
      case 'land': this.vx = 0; if (this.t >= 4) this.setState('idle'); break;
      case 'down': this.vx = 0; if (this.t >= 38) this.setState('getup'); break;
      case 'getup': this.vx = 0; if (this.t >= 16) { this.setState('idle'); this.invuln = 3; } break;
      case 'throwing': this.updateThrow(g); break;
      default: break; // thrown, fall, ko, win, lose
    }
    this.physics();
  }
  groundControl(g, opp) {
    if (Math.abs(opp.x - this.x) > 2) this.facing = opp.x > this.x ? 1 : -1;
    this.combo = 0;
    if (this.tryAttack(g, opp)) return;
    const inp = this.inp;
    if (inp.up) { this.jump(this.fwd ? 1 : this.back ? -1 : 0); return; }
    if (inp.down) { this.keep('crouch'); this.vx = 0; this.guardPose = this.back; return; }
    if (this.back && g.threatened(this)) { this.keep('idle'); this.vx = 0; this.guardPose = true; return; }
    if (this.fwd) { this.keep('walk'); this.walkDir = 1; this.vx = this.def.walkF * this.facing; }
    else if (this.back) { this.keep('walk'); this.walkDir = -1; this.vx = -this.def.walkB * this.facing; }
    else { this.keep('idle'); this.vx = 0; }
  }
  jump(dir) {
    this.setState('air'); this.air = true; this.vy = -14.2; this.vx = dir * this.facing * (this.def.jumpVx || 4);
    this.airAttacked = false; this.jumpId++;
  }
  airControl(g) {
    if (this.airAttacked) return;
    for (const k of ['hp', 'hk', 'mp', 'mk', 'lp', 'lk']) {
      if (this.buf[k]) { this.buf[k] = 0; this.startMove(NORMALS['j' + k.toUpperCase()], g); return; }
    }
  }
  trySpecial(g) {
    const b = this.buf, inp = this.inp;
    if (b.sa && this.gauge >= SUPER_COST) { b.sa = 0; this.startMove(this.def.super, g); return true; }
    if (b.sp) {
      b.sp = 0;
      const dir = inp.down ? 'down' : this.back ? 'back' : 'fwd';
      const d = this.def.specials[dir];
      if (d.type === 'projectile' && g.hasProj(this)) return false;
      this.startMove(d, g); return true;
    }
    return false;
  }
  tryAttack(g, opp) {
    if (this.trySpecial(g)) return true;
    const b = this.buf, inp = this.inp;
    for (const k of ['hp', 'hk', 'mp', 'mk', 'lp', 'lk']) {
      if (!b[k]) continue;
      b[k] = 0;
      if (k === 'hp' && !inp.down && (this.fwd || this.back) && g.canGenericThrow(this, opp)) {
        if (g.tryGrab(this, opp, this.back ? THROW_B : THROW_F)) return true;
      }
      this.startMove(NORMALS[(inp.down ? 'c' : 's') + k.toUpperCase()], g);
      return true;
    }
    return false;
  }
  tryCancel(g, opp) {
    const mv = this.mv; if (!mv) return false;
    const d = mv.d;
    if (d.type !== 'normal' || d.air || !(mv.connected || mv.blocked)) return false;
    if (mv.f > d.startup + d.active + Math.floor(d.recovery * 0.7)) return false;
    if (this.hitstop > 0) return false;
    if (this.trySpecial(g)) return true;
    if (!d.cancel) return false;
    for (const k of ['hp', 'hk', 'mp', 'mk', 'lp', 'lk']) {
      if (this.buf[k] && STRV[k] > d.str) {
        this.buf[k] = 0;
        this.startMove(NORMALS[(this.inp.down ? 'c' : 's') + k.toUpperCase()], g);
        return true;
      }
    }
    return false;
  }
  startMove(d, g) {
    if (d.super) { this.gauge -= SUPER_COST; g.superStart(this, d); }
    else if (d.special) { this.gauge = Math.min(GAUGE_MAX, this.gauge + 4); g.callout(this, d.name); }
    this.mv = { d, f: 0, hits: 0, last: -99, connected: false, blocked: false, landed: false, landF: 0 };
    this.setState(d.air ? 'airAttack' : 'attack');
    if (d.air) this.airAttacked = true; else this.vx = 0;
    if (d.invuln) this.invuln = Math.max(this.invuln, d.invuln);
    this.countering = false;
    if (!d.super) Sound.play(d.special ? 'sp_' + d.type : (d.kind === 'kick' ? 'kWhiff' : 'pWhiff') + (d.str || 0));
  }
  endMove() {
    this.mv = null; this.countering = false; this.vx = 0;
    if (this.air) this.setState('air'), this.airAttacked = true;
    else this.setState(this.inp.down ? 'crouch' : 'idle');
  }
  updateMove(g, opp) {
    const mv = this.mv; if (!mv) { this.endMove(); return; }
    const d = mv.d; mv.f++;
    const f = mv.f, tot = d.startup + d.active + d.recovery;
    switch (d.type) {
      case 'normal':
        if (d.air) { if (f >= tot) { this.mv = null; this.setState('air'); } }
        else if (f >= tot) this.endMove();
        break;
      case 'projectile':
        if (f === d.startup) g.spawnProj(this, d);
        if (f >= d.startup + d.recovery) this.endMove();
        break;
      case 'rush':
        if (f > d.startup && f <= d.startup + d.active) {
          this.vx = d.vx * this.facing;
          if (d.stopOnHit && (mv.connected || mv.blocked)) this.vx = 0;
        } else if (f > d.startup) this.vx *= 0.7;
        if (f >= tot) this.endMove();
        break;
      case 'rising': case 'leap':
        if (f === d.startup) { this.vy = d.vy; this.vx = d.vx * this.facing; this.air = true; }
        if (mv.landed) { this.vx = 0; if (f - mv.landF >= d.landRec) this.endMove(); }
        if (f > 300) this.endMove();
        break;
      case 'counter':
        this.countering = f > d.startup && f <= d.startup + d.active;
        if (f >= tot) this.endMove();
        break;
      case 'throw':
        if (f === Math.max(1, d.startup)) { if (g.tryGrab(this, opp, d)) return; }
        if (f >= Math.max(1, d.startup) + d.recovery) this.endMove();
        break;
      case 'cstrike':
        if (f >= 28) this.endMove();
        break;
      default: this.endMove();
    }
  }
  updateThrow(g) {
    const ti = this.throwInfo;
    if (!ti) { this.setState('idle'); return; }
    const v = ti.victim; ti.t++; this.vx = 0;
    const lift = ti.d.super ? 120 : ti.d.generic ? 40 : 70;
    if (ti.t < 20) {
      v.x = clamp(this.x + this.facing * 46, WALL_L, WALL_R);
      v.y = GROUND - Math.sin(ti.t / 20 * Math.PI * 0.9) * lift; v.air = false;
      v.facing = -this.facing;
    }
    if (ti.t === 20) {
      const dir = ti.d.back ? -this.facing : this.facing;
      v.x = clamp(this.x + dir * 46, WALL_L, WALL_R); v.y = GROUND - 20;
      g.throwHit(this, v, ti.d, dir);
    }
    if (ti.t >= 32) { this.throwInfo = null; this.setState('idle'); }
  }
  launch(dir, vx = 3.5, vy = -8) {
    this.setState(this.hp <= 0 ? 'ko' : 'fall');
    this.air = true; this.vy = vy; this.vx = dir * vx; this.mv = null; this.countering = false; this.stun = 0; this.juggle = false;
    if (this.y >= GROUND) this.y = GROUND - 1;
  }
  physics() {
    if (this.state === 'thrown') return;
    if (this.air) {
      this.vy += GRAV; this.y += this.vy; this.x += this.vx;
      if (this.y >= GROUND && this.vy >= 0) { this.y = GROUND; this.vy = 0; this.air = false; this.onLand(); }
    } else this.x += this.vx;
    if (this.pushVx) { this.x += this.pushVx; this.pushVx *= 0.82; if (Math.abs(this.pushVx) < 0.15) this.pushVx = 0; }
    this.x = clamp(this.x, WALL_L, WALL_R);
  }
  onLand() {
    switch (this.state) {
      case 'air': case 'airAttack': this.mv = null; this.setState('land'); this.vx = 0; break;
      case 'fall': this.setState('down'); this.vx = 0; this.juggle = false; Sound.play('land'); break;
      case 'ko': this.vx = 0; Sound.play('land'); break;
      case 'attack': if (this.mv) { this.mv.landed = true; this.mv.landF = this.mv.f; } this.vx = 0; break;
      default: this.vx = 0;
    }
  }
  canBlock(d, att) {
    if (this.air) return false;
    if (!['idle', 'walk', 'crouch', 'block'].includes(this.state)) return false;
    const away = att.x > this.x ? this.inp.left : this.inp.right;
    if (!away) return false;
    const crouch = this.inp.down;
    if (d.guard === 'low' && !crouch) return false;
    if (d.guard === 'high' && crouch) return false;
    return true;
  }
}
const STRV = { lp: 0, mp: 1, hp: 2, lk: 0, mk: 1, hk: 2 };

// ============================================================
//  CPU（AI）
// ============================================================
class CPU {
  constructor(level) {
    this.L = clamp(level | 0, 1, 8);
    this.hist = []; this.dir = 0; this.crouch = false; this.dirT = 0;
    this.threatRef = null; this.aaRef = -1; this.punRef = null; this.comboRef = null; this.comboGo = false;
  }
  snap(o) {
    const mv = o.mv, d = mv && mv.d;
    let attacking = false, reach = 0, recovering = false;
    if (d && (o.state === 'attack' || o.state === 'airAttack')) {
      if (d.box) {
        attacking = mv.f <= d.startup + d.active + 1 || (d.type === 'leap' && !mv.landed);
        reach = d.box.x + d.box.w + (d.type === 'rush' ? d.vx * d.active : 0);
      }
      recovering = (d.type === 'normal' && mv.f > d.startup + d.active && !d.air) ||
        (d.type === 'rising' && mv.landed) || (d.type === 'projectile' && mv.f > d.startup + 4) ||
        (d.type === 'rush' && mv.f > d.startup + d.active) || (d.type === 'counter' && mv.f > d.startup + d.active) ||
        (d.type === 'throw' && mv.f > d.startup);
    }
    return { state: o.state, x: o.x, air: o.air, vx: o.vx, vy: o.vy, jumpId: o.jumpId, attacking, reach, recovering,
      mvRef: mv, guard: d ? d.guard : 'mid', crouch: o.isCrouching(), down: o.state === 'down' || o.state === 'getup' };
  }
  get(me, opp, g) {
    const L = this.L, R = rand;
    this.hist.push(this.snap(opp)); if (this.hist.length > 30) this.hist.shift();
    const delay = Math.max(1, Math.round(22 - L * 2.6));
    const o = this.hist[Math.max(0, this.hist.length - 1 - delay)];
    const out = { fwd: false, back: false, up: false, down: false, pressed: {} };
    const dist = Math.abs(opp.x - me.x);
    const press = (b, dir) => { out.pressed[b] = true; if (dir === 'down') out.down = true; else if (dir === 'back') out.back = true; else if (dir === 'fwd') out.fwd = true; };
    const sp = type => specialDir(me.def, type);
    // 1. コンボ（キャンセル必殺技）
    if (me.state === 'attack' && me.mv && me.mv.d.type === 'normal' && me.mv.connected) {
      if (this.comboRef !== me.mv) {
        this.comboRef = me.mv; this.comboGo = R() < 0.08 + 0.11 * L;
        const opts = [];
        if (me.gauge >= SUPER_COST && me.def.super.type !== 'throw' && R() < 0.6) opts.push('sa');
        for (const ty of ['rush', 'rising', 'projectile']) { const k = sp(ty); if (k) opts.push(k); }
        this.comboChoice = opts.length ? opts[Math.floor(R() * opts.length)] : null;
      }
      if (this.comboGo && this.comboChoice) {
        if (this.comboChoice === 'sa') press('sa'); else press('sp', this.comboChoice);
      }
      return out;
    }
    if (me.air) {
      if (me.state === 'air' && !me.airAttacked && me.vy > -3 && dist < 140 && R() < 0.2 + 0.06 * L) press(R() < 0.6 ? 'hk' : 'hp');
      return out;
    }
    const actionable = me.canAct();
    if (!actionable && me.state !== 'block') return out;
    // 2. 防御
    let threat = null;
    if (o.attacking && dist < o.reach + 70) threat = { ref: o.mvRef, guard: o.guard, proj: false };
    const proj = g.projs.find(p => p.owner !== me && Math.sign(me.x - p.x) === Math.sign(p.vx) && Math.abs(me.x - p.x) < 220 + L * 10);
    if (!threat && proj) threat = { ref: proj, guard: 'mid', proj: true };
    if (threat) {
      if (threat.ref !== this.threatRef) {
        this.threatRef = threat.ref;
        this.threatBlock = R() < 0.12 + 0.11 * L;
        this.threatCorrect = R() < 0.3 + 0.09 * L;
        this.counterTry = !threat.proj && sp('counter') && R() < 0.02 * L;
        this.jumpProj = threat.proj && R() < 0.03 * L;
      }
      if (actionable && this.counterTry && dist < 130) { press('sp', sp('counter')); return out; }
      if (actionable && this.jumpProj && threat.proj && Math.abs(me.x - proj.x) > 90) { out.up = true; out.fwd = true; return out; }
      if (this.threatBlock) {
        out.back = true;
        const gd = threat.guard;
        out.down = gd === 'low' ? this.threatCorrect : gd === 'high' ? !this.threatCorrect : (opp.isCrouching() && R() < 0.5 ? true : this.crouch);
        return out;
      }
    }
    if (me.state === 'block') { out.back = true; out.down = me.crouchBlock; return out; }
    // 3. 対空
    if (o.air && !o.down && o.state !== 'fall' && dist < 240 && Math.sign(o.vx) === Math.sign(me.x - o.x) && o.vx !== 0) {
      if (o.jumpId !== this.aaRef) { this.aaRef = o.jumpId; this.aaGo = R() < 0.05 + 0.11 * L; }
      if (this.aaGo && dist < 160) {
        this.aaGo = false;
        if (me.gauge >= SUPER_COST && me.def.super.type === 'rising' && R() < 0.5) { press('sa'); return out; }
        const k = sp('rising');
        if (k && R() < 0.8) press('sp', k); else press('hp', 'down');
        return out;
      }
    }
    // 4. 確定反撃
    if (o.recovering && o.mvRef !== this.punRef && dist < 150) {
      this.punRef = o.mvRef;
      if (R() < 0.06 + 0.1 * L) {
        if (me.gauge >= SUPER_COST && R() < 0.5) press('sa');
        else if (dist < 90) { const k = sp('throw'); if (k && R() < 0.4) press('sp', k); else press('hp'); }
        else { const k = sp('rush'); if (k) press('sp', k); else press('mk', 'down'); }
        return out;
      }
    }
    // 5. 立ち回り
    if (this.dirT > 0) this.dirT--;
    else {
      const interval = Math.max(6, 34 - L * 3);
      this.dirT = Math.floor(interval * (0.5 + R()));
      this.crouch = false; this.dir = 0;
      const x = R();
      if (o.down) { this.dir = R() < 0.6 ? 1 : 0; }
      else if (dist > 360) {
        const pk = sp('projectile');
        if (pk && !g.hasProj(me) && x < 0.25 + 0.03 * L) press('sp', pk);
        else if (me.gauge >= SUPER_COST && me.def.super.type === 'projectile' && x < 0.35) press('sa');
        else if (x < 0.85) this.dir = 1;
        else { out.up = true; out.fwd = true; }
      } else if (dist > 160) {
        const pk = sp('projectile'), rk = sp('rush'), lk = sp('leap');
        if (pk && !g.hasProj(me) && x < 0.18) press('sp', pk);
        else if (rk && x < 0.26) press('sp', rk);
        else if (lk && x < 0.3 && dist < 260) press('sp', lk);
        else if (x < 0.36 + 0.01 * L) { out.up = true; out.fwd = true; }
        else if (x < 0.75) this.dir = 1;
        else if (x < 0.85) this.dir = -1;
        else if (x < 0.92) { this.crouch = true; }
        // 残りは様子見
      } else if (dist > 95) {
        if (x < 0.22) press('mk', 'down');
        else if (x < 0.34) press('hk');
        else if (x < 0.44) press('mk');
        else if (x < 0.75) this.dir = 1;
        else if (x < 0.85) { const rk = sp('rush'); if (rk) press('sp', rk); else this.dir = 1; }
        else this.dir = -1;
      } else {
        const tk = sp('throw');
        if (me.gauge >= SUPER_COST && x < 0.12 + 0.02 * L) press('sa');
        else if (x < 0.14 && !opp.air) press('hp', 'fwd');
        else if (tk && x < 0.26 && !opp.air) press('sp', tk);
        else if (x < 0.42) press('lp');
        else if (x < 0.56) press('lk', 'down');
        else if (x < 0.66) press('mp', 'down');
        else if (x < 0.74) press('hp');
        else if (x < 0.8) press('hk', 'down');
        else if (x < 0.9) this.dir = -1;
        else this.crouch = true;
      }
      if (L <= 2 && R() < 0.35) { out.pressed = {}; out.up = false; this.dir = 0; } // 低レベルはぼんやり
    }
    if (!out.fwd && !out.back) { if (this.dir > 0) out.fwd = true; else if (this.dir < 0) out.back = true; }
    if (this.crouch) out.down = true;
    return out;
  }
}

// ============================================================
//  対戦シーン
// ============================================================
class FightScene {
  constructor(cfg) {
    this.cfg = cfg;
    this.f = [new Fighter(CHAR[cfg.p1.char], 0), new Fighter(CHAR[cfg.p2.char], 1)];
    this.ctrl = [cfg.p1.cpu ? new CPU(cfg.p1.cpu) : null, cfg.p2.cpu ? new CPU(cfg.p2.cpu) : null];
    this.stage = cfg.stage; this.round = 1; this.T = 0;
    this.paused = false; this.pauseSel = 0; this.showBoxes = false;
    this.result = null;
    this.startRound();
  }
  startRound() {
    for (const f of this.f) f.resetRound();
    this.projs = []; this.fx = []; this.texts = [];
    this.phase = 'intro'; this.pt = 0; this.time = ROUND_TIME; this.timeF = 0;
    this.freeze = 0; this.freezeBy = null; this.shake = 0; this.comboShow = null; this.roundWinner = null;
    Sound.play('round');
  }
  other(f) { return f === this.f[0] ? this.f[1] : this.f[0]; }
  hasProj(f) { return this.projs.some(p => p.owner === f); }
  threatened(f) {
    const o = this.other(f);
    if ((o.state === 'attack' || o.state === 'airAttack') && o.mv && o.mv.d.box && Math.abs(o.x - f.x) < 240 &&
      o.mv.f <= o.mv.d.startup + Math.max(o.mv.d.active, 1)) return true;
    return this.projs.some(p => p.owner !== f && Math.sign(f.x - p.x) === Math.sign(p.vx) && Math.abs(f.x - p.x) < 300);
  }
  canGenericThrow(a, o) { return Math.abs(a.x - o.x) < 80 && o.grabbable(); }
  tryGrab(att, def, d) {
    if (Math.abs(att.x - def.x) > d.range || !def.grabbable() || att.air) return false;
    att.setState('throwing'); att.mv = null; att.invuln = 40; att.vx = 0;
    att.throwInfo = { d, t: 0, victim: def };
    def.setState('thrown'); def.mv = null; def.countering = false; def.vx = 0; def.vy = 0; def.pushVx = 0; def.stun = 0;
    Sound.play('throw');
    return true;
  }
  throwHit(att, def, d, dir) {
    const dmg = Math.round(d.dmg * (att.def.power || 1));
    def.hp = Math.max(0, def.hp - dmg); def.redDelay = 30; def.flash = 8;
    def.launch(dir, d.super ? 5 : 4, d.super ? -10 : -7);
    this.shake = d.super ? 22 : 10;
    att.gauge = Math.min(GAUGE_MAX, att.gauge + (d.super ? 0 : 10)); def.gauge = Math.min(GAUGE_MAX, def.gauge + 6);
    this.spark(def.x, GROUND - 40, '#ffd060', d.super ? 30 : 16);
    this.popText(d.super ? d.name + '！' : '', def.x, GROUND - 200, '#ffd060');
    Sound.play('slam');
  }
  superStart(f, d) {
    this.freeze = 45; this.freezeBy = f; this.freezeName = d.name;
    Sound.play('super');
  }
  callout(f, name) { this.texts.push({ s: name, x: f.x, y: f.y - 200, t: 0, col: '#ffe680', size: 22 }); }
  popText(s, x, y, col, size = 30) { if (s) this.texts.push({ s, x, y, t: 0, col, size }); }
  spark(x, y, col, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2, sp = 2 + rand() * 6;
      this.fx.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 14 + rand() * 10, col, r: 2 + rand() * 3 });
    }
    this.fx.push({ ring: true, x, y, life: 12, max: 12, col });
  }
  spawnProj(f, d) {
    this.projs.push({ owner: f, x: f.x + f.facing * 55, y: f.y - (d.py || 112), vx: d.speed * f.facing, w: d.w || 44, h: d.h || 34, d,
      hitsLeft: d.hits || 1, cool: 0, life: 240, t: 0 });
  }
  applyHit(att, def, d, src, dirOverride, multiState) {
    if (def.countering && src === 'melee') { this.counterHit(def, att); return; }
    const total = d.hits || 1, base = d.dmg / total;
    const dir = dirOverride || Math.sign(def.x - att.x) || att.facing;
    const hx = (att.x + def.x) / 2, hy = (src === 'proj' ? multiState.y : def.y - 110);
    const isLast = multiState && multiState.last;
    if (def.canBlock(d, att)) {
      const chip = (d.special || d.super) ? Math.max(1, Math.round(base * 0.25)) : 0;
      def.hp = Math.max(0, def.hp - chip); def.redDelay = 30;
      def.setState('block'); def.stun = d.blockstun; def.crouchBlock = !!def.inp.down; def.mv = null; def.countering = false;
      def.pushVx = dir * d.push;
      if (src === 'melee' && (def.x <= WALL_L + 2 || def.x >= WALL_R - 2)) att.pushVx = -dir * d.push * 0.7;
      const hs = Math.max(3, d.hitstop - 3);
      def.hitstop = hs; if (src === 'melee') { att.hitstop = hs; if (multiState.mv) multiState.mv.blocked = true; }
      att.gauge = Math.min(GAUGE_MAX, att.gauge + 2); def.gauge = Math.min(GAUGE_MAX, def.gauge + 3);
      this.spark(hx, hy, '#8fd0ff', 6);
      Sound.play('block');
      if (def.hp <= 0) def.launch(dir, 4, -9);
      return;
    }
    const owner = multiState && (multiState.mv || multiState.p);
    if (owner && owner.comboStart == null) owner.comboStart = def.combo;
    const cStart = owner ? owner.comboStart : def.combo;
    const scale = Math.max(0.35, 1 - 0.1 * cStart);
    const dmg = Math.max(1, Math.round(base * scale * (att.def.power || 1)));
    const wasCrouch = def.isCrouching();
    def.hp = Math.max(0, def.hp - dmg); def.redDelay = 30; def.combo++; def.flash = 6;
    if (def.combo >= 2) this.comboShow = { side: att.side, n: def.combo, t: 80 };
    if (def.hp <= 0) def.launch(dir, 4.5, -9.5);
    else if (src === 'melee' && d.type === 'rising' && total > 1 && !isLast) {
      def.launch(dir, 0, 0); def.juggle = true;
      def.x = clamp(att.x + att.facing * 30, WALL_L, WALL_R); def.y = Math.min(def.y, att.y - 10);
      def.vx = att.vx; def.vy = Math.min(att.vy, -2);
    }
    else if (def.air || (d.knockdown && (total === 1 || isLast))) def.launch(dir, 3.5, -8);
    else {
      def.setState('hit'); def.stun = d.hitstun + (total > 1 && !isLast ? 4 : 0); def.crouchHit = wasCrouch;
      def.mv = null; def.countering = false; def.pushVx = dir * (total > 1 && !isLast ? 1.5 : d.push);
      if (src === 'melee' && (def.x <= WALL_L + 2 || def.x >= WALL_R - 2)) att.pushVx = -dir * d.push * 0.8;
    }
    def.throwInfo = null;
    def.hitstop = d.hitstop; if (src === 'melee') { att.hitstop = d.hitstop; if (multiState.mv) multiState.mv.connected = true; }
    att.gauge = Math.min(GAUGE_MAX, att.gauge + (d.super ? 0 : 3 + dmg * 0.06)); def.gauge = Math.min(GAUGE_MAX, def.gauge + 2 + dmg * 0.04);
    const big = d.super || d.dmg >= 90;
    this.spark(hx, hy, d.super ? '#ffcc33' : big ? '#ffffff' : '#ffe9a0', big ? 16 : 9);
    if (big) this.shake = Math.max(this.shake, d.super ? 10 : 5);
    Sound.play(d.super ? 'saHit' : d.special ? 'spHit' : (d.kind === 'kick' ? 'kHit' : 'pHit') + (d.str || 0));
  }
  counterHit(def, att) {
    const cd = def.mv ? def.mv.d : null;
    const dmgBase = cd ? cd.dmg : 120;
    def.mv = { d: normMove({ type: 'cstrike', pose: 'cstrike', startup: 6, active: 0, recovery: 22 }), f: 0, hits: 0, connected: true };
    def.setState('attack'); def.countering = false; def.invuln = 30;
    def.facing = att.x > def.x ? 1 : -1;
    const dir = Math.sign(att.x - def.x) || def.facing;
    const dmg = Math.round(dmgBase * (def.def.power || 1));
    att.hp = Math.max(0, att.hp - dmg); att.redDelay = 30; att.flash = 8; att.combo++;
    att.throwInfo = null;
    att.launch(dir, 4.5, -9);
    def.hitstop = 14; att.hitstop = 14; this.shake = 10;
    def.gauge = Math.min(GAUGE_MAX, def.gauge + 10);
    this.popText('COUNTER!', def.x, def.y - 210, '#7fd8ff', 34);
    this.spark(att.x, att.y - 110, '#7fd8ff', 20);
    Sound.play('counter');
  }
  separate() {
    const [a, b] = this.f;
    const skip = s => s === 'down' || s === 'ko' || s === 'thrown' || s === 'throwing';
    if (skip(a.state) || skip(b.state)) return;
    const dx = b.x - a.x, min = 46;
    if (Math.abs(dx) < min && Math.abs(a.y - b.y) < 110) {
      const s = dx === 0 ? (a.facing || 1) : Math.sign(dx);
      const ov = min - Math.abs(dx);
      a.x -= s * ov / 2; b.x += s * ov / 2;
      if (a.x < WALL_L) { b.x += WALL_L - a.x; a.x = WALL_L; }
      if (a.x > WALL_R) { b.x -= a.x - WALL_R; a.x = WALL_R; }
      if (b.x < WALL_L) { a.x += WALL_L - b.x; b.x = WALL_L; }
      if (b.x > WALL_R) { a.x -= b.x - WALL_R; b.x = WALL_R; }
    }
  }
  meleeCheck(att, def) {
    const mv = att.mv; if (!mv) return null;
    const d = mv.d, hb = att.hitbox(); if (!hb) return null;
    const total = d.hits || 1;
    if (mv.hits >= total) return null;
    if (mv.hits > 0 && mv.f - mv.last < (d.hitInterval || 999)) return null;
    if (def.invuln > 0) return null;
    if (!overlap(hb, def.hurtbox())) return null;
    return { att, def, d, mv };
  }
  getInput(i, raw) {
    const me = this.f[i];
    if (this.ctrl[i]) {
      const o = this.ctrl[i].get(me, this.other(me), this);
      const r = me.facing === 1;
      return { left: r ? o.back : o.fwd, right: r ? o.fwd : o.back, up: o.up, down: o.down, pressed: o.pressed };
    }
    return { left: raw.left, right: raw.right, up: raw.up, down: raw.down, pressed: raw.pressed };
  }
  update(raw) {
    if (raw.pressed.dbg) this.showBoxes = !this.showBoxes;
    if (this.paused) { this.updatePause(raw); return; }
    if (raw.pressed.esc && (this.phase === 'fight' || this.phase === 'intro')) { this.paused = true; this.pauseSel = 0; Sound.play('select'); return; }
    this.T++; this.pt++;
    const live = this.phase === 'fight';
    const ins = [0, 1].map(i => live ? this.getInput(i, raw) : BLANK);
    // 演出（超必殺技の暗転）
    if (this.freeze > 0) {
      this.freeze--;
      for (let i = 0; i < 2; i++) for (const k of BTNS) if (ins[i].pressed[k]) this.f[i].buf[k] = 7;
      return;
    }
    if (this.phase === 'ko' && this.pt < 70 && this.pt % 2 === 1) { this.updateFx(); return; } // スロー演出
    for (let i = 0; i < 2; i++) this.f[i].update(ins[i], this);
    this.separate();
    // 打撃判定（相打ちあり）
    const h1 = this.meleeCheck(this.f[0], this.f[1]), h2 = this.meleeCheck(this.f[1], this.f[0]);
    for (const h of [h1, h2]) {
      if (!h) continue;
      const mv = h.mv;
      mv.hits++; mv.last = mv.f;
      this.applyHit(h.att, h.def, h.d, 'melee', null, { last: mv.hits >= (h.d.hits || 1), mv });
    }
    this.updateProjs();
    this.updateFx();
    for (const f of this.f) {
      if (f.redDelay > 0) f.redDelay--;
      else if (f.redHp > f.hp) f.redHp = Math.max(f.hp, f.redHp - Math.max(2, (f.redHp - f.hp) * 0.06));
      if (f.redHp < f.hp) f.redHp = f.hp;
    }
    if (this.comboShow && --this.comboShow.t <= 0) this.comboShow = null;
    this.updatePhase();
  }
  updateProjs() {
    const P = this.projs;
    for (const p of P) { if (p.hold > 0) p.hold--; else p.x += p.vx; p.t++; p.life--; if (p.cool > 0) p.cool--; }
    // 相殺
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      const a = P[i], b = P[j];
      if (a.owner === b.owner || a.hitsLeft <= 0 || b.hitsLeft <= 0) continue;
      if (overlap(projBox(a), projBox(b))) {
        const n = Math.min(a.hitsLeft, b.hitsLeft);
        a.hitsLeft -= n; b.hitsLeft -= n;
        this.spark((a.x + b.x) / 2, a.y, '#ffffff', 12); Sound.play('block');
      }
    }
    for (const p of P) {
      if (p.hitsLeft <= 0 || p.cool > 0) continue;
      const def = this.other(p.owner);
      if (def.invuln > 0) continue;
      if (overlap(projBox(p), def.hurtbox())) {
        p.hitsLeft--; p.cool = p.d.hitInterval || 5; if (p.hitsLeft > 0) p.hold = p.cool;
        this.applyHit(p.owner, def, p.d, 'proj', Math.sign(p.vx), { y: p.y, last: p.hitsLeft <= 0, p });
      }
    }
    this.projs = P.filter(p => p.hitsLeft > 0 && p.life > 0 && p.x > -100 && p.x < W + 100);
  }
  updateFx() {
    for (const e of this.fx) { e.life--; if (!e.ring) { e.x += e.vx; e.y += e.vy; e.vx *= 0.9; e.vy *= 0.9; } }
    this.fx = this.fx.filter(e => e.life > 0);
    for (const t of this.texts) t.t++;
    this.texts = this.texts.filter(t => t.t < 60);
    if (this.shake > 0) this.shake--;
  }
  settled() {
    return this.f.every(f => !f.air && f.state !== 'throwing' && f.state !== 'thrown' && f.state !== 'attack' && f.state !== 'airAttack' && f.hitstop <= 0) && this.projs.length === 0;
  }
  updatePhase() {
    const [a, b] = this.f;
    switch (this.phase) {
      case 'intro':
        if (this.pt === 75) Sound.play('confirm');
        if (this.pt >= 110) { this.phase = 'fight'; this.pt = 0; }
        break;
      case 'fight':
        if (a.hp <= 0 || b.hp <= 0) { this.phase = 'ko'; this.pt = 0; Sound.play('ko'); this.shake = 14; break; }
        if (++this.timeF >= 60) { this.timeF = 0; this.time--; if (this.time <= 0) { this.time = 0; this.phase = 'timeup'; this.pt = 0; Sound.play('round'); } }
        break;
      case 'ko': case 'timeup':
        if (this.pt >= 150 && (this.settled() || this.pt >= 400)) this.decideRound();
        break;
      case 'roundEnd':
        if (this.pt >= 150) {
          if (this.matchOver()) { this.phase = 'matchEnd'; this.pt = 0; }
          else { this.round++; this.startRound(); }
        }
        break;
      case 'matchEnd':
        if (this.pt >= 150 && this.cfg.onEnd && !this.ended) { this.ended = true; this.cfg.onEnd(this.result); }
        break;
    }
  }
  decideRound() {
    const [a, b] = this.f;
    const ra = a.hp / a.maxHp, rb = b.hp / b.maxHp;
    let w = -1;
    if (ra > rb) w = 0; else if (rb > ra) w = 1;
    this.roundWinner = w;
    if (w === -1) { a.wins++; b.wins++; }
    else this.f[w].wins++;
    this.perfect = w >= 0 && this.f[w].hp === this.f[w].maxHp;
    for (let i = 0; i < 2; i++) {
      const f = this.f[i];
      f.mv = null; f.vx = 0; f.pushVx = 0;
      if (f.state === 'ko' || f.state === 'down' || f.state === 'fall') continue;
      f.setState(w === i ? 'win' : 'lose');
    }
    this.phase = 'roundEnd'; this.pt = 0;
    Sound.play('round');
  }
  matchOver() {
    const [a, b] = this.f;
    if (a.wins >= 2 || b.wins >= 2 || this.round >= 3) {
      this.result = a.wins > b.wins ? 0 : b.wins > a.wins ? 1 : -1;
      return true;
    }
    return false;
  }
  updatePause(raw) {
    const p = raw.pressed;
    if (p.up || p.down) { this.pauseSel = 1 - this.pauseSel; Sound.play('select'); }
    if (p.esc) { this.paused = false; return; }
    if (p.start || p.lp) {
      Sound.play('confirm');
      if (this.pauseSel === 0) this.paused = false;
      else goTitle();
    }
  }
  // ---------- 描画 ----------
  draw(c) {
    c.save();
    if (this.shake > 0) c.translate((rand() - 0.5) * this.shake, (rand() - 0.5) * this.shake * 0.6);
    drawStage(c, this.stage, this.T);
    // 影
    for (const f of this.f) {
      const sc = clamp(1 - (GROUND - f.y) / 300, 0.4, 1);
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(f.x, GROUND + 2, 38 * sc, 8 * sc, 0, 0, 7); c.fill();
    }
    // 攻撃中の側を手前に
    const order = this.f[0].state === 'attack' || this.f[0].state === 'throwing' ? [this.f[1], this.f[0]] : [this.f[0], this.f[1]];
    for (const f of order) drawFighter(c, f);
    for (const p of this.projs) drawProj(c, p, this.T);
    for (const e of this.fx) {
      if (e.ring) { c.strokeStyle = e.col; c.globalAlpha = e.life / e.max; c.lineWidth = 3; c.beginPath(); c.arc(e.x, e.y, (e.max - e.life) * 3 + 6, 0, 7); c.stroke(); c.globalAlpha = 1; }
      else { c.fillStyle = e.col; c.globalAlpha = Math.min(1, e.life / 10); c.beginPath(); c.arc(e.x, e.y, e.r, 0, 7); c.fill(); c.globalAlpha = 1; }
    }
    if (this.showBoxes) this.drawBoxes(c);
    for (const t of this.texts) text(c, t.s, clamp(t.x, 120, W - 120), t.y - t.t * 0.6, t.size, t.col, 'center', 5);
    c.restore();
    if (this.freeze > 0) this.drawSuperCut(c);
    this.drawHUD(c);
    if (this.paused) this.drawPause(c);
  }
  drawBoxes(c) {
    for (const f of this.f) {
      const hb = f.hurtbox(); if (hb) { c.strokeStyle = '#3f3'; c.lineWidth = 1; c.strokeRect(hb.x, hb.y, hb.w, hb.h); }
      const ab = f.hitbox(); if (ab) { c.strokeStyle = '#f33'; c.lineWidth = 2; c.strokeRect(ab.x, ab.y, ab.w, ab.h); }
    }
    for (const p of this.projs) { const b = projBox(p); c.strokeStyle = '#f3f'; c.strokeRect(b.x, b.y, b.w, b.h); }
  }
  drawSuperCut(c) {
    const f = this.freezeBy, k = 1 - this.freeze / 45;
    c.fillStyle = 'rgba(0,0,10,0.55)'; c.fillRect(0, 0, W, H);
    c.save(); c.translate(W / 2, 250); c.rotate(-0.08);
    c.fillStyle = f.side === 0 ? 'rgba(220,60,40,0.9)' : 'rgba(40,90,220,0.9)'; c.fillRect(-W, -45, W * 2, 90);
    c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(-W, -45, W * 2, 4); c.fillRect(-W, 41, W * 2, 4);
    const x = lerp(f.side === 0 ? -200 : 200, 0, Math.min(1, k * 3));
    text(c, 'SUPER ARTS', x, -22, 18, '#ffe680', 'center', 3);
    text(c, this.freezeName, x, 12, 42, '#ffffff', 'center', 6);
    c.restore();
    drawFighter(c, f);
  }
  drawHUD(c) {
    const bw = 380, bh = 22, y = 26;
    for (let i = 0; i < 2; i++) {
      const f = this.f[i], x0 = i === 0 ? 40 : W - 40 - bw;
      c.fillStyle = '#111'; c.fillRect(x0 - 3, y - 3, bw + 6, bh + 6);
      c.fillStyle = '#400'; c.fillRect(x0, y, bw, bh);
      const wr = bw * f.redHp / f.maxHp, wh = bw * f.hp / f.maxHp;
      c.fillStyle = '#e03020';
      if (i === 0) c.fillRect(x0, y, wr, bh); else c.fillRect(x0 + bw - wr, y, wr, bh);
      const g = c.createLinearGradient(0, y, 0, y + bh);
      const low = f.hp / f.maxHp < 0.25 && this.T % 30 < 15;
      g.addColorStop(0, low ? '#ffb0a0' : '#fff38a'); g.addColorStop(1, low ? '#f05030' : '#e0a800');
      c.fillStyle = g;
      if (i === 0) c.fillRect(x0, y, wh, bh); else c.fillRect(x0 + bw - wh, y, wh, bh);
      c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.strokeRect(x0, y, bw, bh);
      const label = (this.ctrl[i] ? 'CPU' : '1P');
      text(c, `${f.def.en}`, i === 0 ? x0 : x0 + bw, y + bh + 16, 18, '#fff', i === 0 ? 'left' : 'right', 4);
      text(c, `${label}${this.ctrl[i] ? ' Lv' + this.ctrl[i].L : ''}`, i === 0 ? x0 + 130 : x0 + bw - 130, y + bh + 16, 14, this.ctrl[i] ? '#9cf' : '#f99', i === 0 ? 'left' : 'right', 3);
      for (let k = 0; k < 2; k++) {
        const cx = i === 0 ? x0 + bw - 12 - k * 22 : x0 + 12 + k * 22;
        c.fillStyle = f.wins > k ? '#ffcc33' : '#333'; c.strokeStyle = '#fff'; c.lineWidth = 1.5;
        c.beginPath(); c.arc(cx, y + bh + 16, 7, 0, 7); c.fill(); c.stroke();
      }
      // スーパーゲージ
      const gw = 220, gx = i === 0 ? 40 : W - 40 - gw, gy = H - 34;
      c.fillStyle = '#111'; c.fillRect(gx - 2, gy - 2, gw + 4, 16);
      const full = f.gauge >= SUPER_COST;
      const gg = c.createLinearGradient(gx, 0, gx + gw, 0);
      gg.addColorStop(0, full ? '#ffef60' : '#2a7cff'); gg.addColorStop(1, full ? (this.T % 20 < 10 ? '#ff8a00' : '#ffffff') : '#7ad0ff');
      c.fillStyle = gg; const ww = gw * Math.min(1, f.gauge / GAUGE_MAX);
      if (i === 0) c.fillRect(gx, gy, ww, 12); else c.fillRect(gx + gw - ww, gy, ww, 12);
      c.strokeStyle = '#ccc'; c.lineWidth = 1; c.strokeRect(gx, gy, gw, 12);
      text(c, full ? 'SUPER ARTS OK!' : 'SA', i === 0 ? gx + gw + 10 : gx - 10, gy + 6, 14, full ? '#ffe680' : '#9bd', i === 0 ? 'left' : 'right', 3);
    }
    // タイマー
    c.fillStyle = '#111'; c.fillRect(W / 2 - 32, 14, 64, 50);
    c.strokeStyle = '#fff'; c.lineWidth = 2; c.strokeRect(W / 2 - 32, 14, 64, 50);
    text(c, String(this.time).padStart(2, '0'), W / 2, 40, 36, this.time <= 10 ? '#ff6050' : '#fff', 'center', 0);
    // コンボ
    if (this.comboShow) {
      const cs = this.comboShow, x = cs.side === 0 ? 60 : W - 60;
      text(c, `${cs.n} HITS`, x, 150, 34, '#ffcf3a', cs.side === 0 ? 'left' : 'right', 6);
      text(c, 'COMBO', x, 180, 18, '#fff', cs.side === 0 ? 'left' : 'right', 4);
    }
    // 中央メッセージ
    const msg = (s, size, col, yy = 230) => text(c, s, W / 2, yy, size, col, 'center', 8);
    if (this.phase === 'intro') {
      if (this.pt < 75) msg(this.round === 3 ? 'FINAL ROUND' : `ROUND ${this.round}`, 64, '#fff');
      else msg('FIGHT!', 84, '#ffcf3a');
    } else if (this.phase === 'ko') {
      msg(this.f[0].hp <= 0 && this.f[1].hp <= 0 ? 'DOUBLE K.O.' : 'K.O.', 96, '#ff4030');
    } else if (this.phase === 'timeup') {
      msg('TIME UP', 80, '#ffcf3a');
    } else if (this.phase === 'roundEnd') {
      const w = this.roundWinner;
      const s = w === -1 ? 'DRAW' : (this.ctrl[w] ? 'CPU WIN' : '1P WIN');
      msg(s, 64, w === -1 ? '#ccc' : '#fff');
      if (this.perfect) msg('PERFECT', 40, '#ffcf3a', 290);
    } else if (this.phase === 'matchEnd') {
      const r = this.result;
      const humanSide = this.ctrl[0] ? (this.ctrl[1] ? -2 : 1) : 0;
      let s, col;
      if (r === -1) { s = 'DRAW GAME'; col = '#ccc'; }
      else if (humanSide === -2) { s = `${this.f[r].def.en} WINS`; col = '#fff'; }
      else if (r === humanSide) { s = 'YOU WIN!'; col = '#ffcf3a'; }
      else { s = 'YOU LOSE...'; col = '#7fb0ff'; }
      msg(s, 72, col);
      if (r === -1 && humanSide >= 0) msg('引き分けはプレイヤーの負け', 26, '#fff', 300);
    }
  }
  drawPause(c) {
    c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(0, 0, W, H);
    text(c, 'PAUSE', W / 2, 180, 56, '#fff', 'center', 6);
    ['再開する', 'タイトルへ戻る'].forEach((s, i) => text(c, (this.pauseSel === i ? '▶ ' : '　') + s, W / 2, 270 + i * 50, 28, this.pauseSel === i ? '#ffcf3a' : '#ccc', 'center', 4));
    text(c, '↑↓：選択　Enter/Z：決定　Esc：再開', W / 2, 420, 16, '#aaa');
  }
}
function projBox(p) { return { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h }; }
function drawProj(c, p, T) {
  const col = p.d.color || '#6cf', dir = Math.sign(p.vx);
  for (let i = 4; i >= 1; i--) {
    c.globalAlpha = 0.12 * (5 - i);
    c.fillStyle = col; c.beginPath(); c.ellipse(p.x - dir * i * 14, p.y, p.w * 0.45, p.h * 0.4, 0, 0, 7); c.fill();
  }
  c.globalAlpha = 1;
  const r = Math.max(p.w, p.h) * 0.6;
  const g = c.createRadialGradient(p.x, p.y, 2, p.x, p.y, r);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, col); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.beginPath(); c.ellipse(p.x, p.y, p.w * 0.7, p.h * 0.65, 0, 0, 7); c.fill();
  if (p.d.style === 'dragon') {
    c.strokeStyle = 'rgba(255,240,180,0.9)'; c.lineWidth = 4; c.beginPath();
    for (let i = 0; i <= 12; i++) { const xx = p.x - dir * i * 9, yy = p.y + Math.sin(T * 0.4 + i * 0.8) * 18 * (i / 12); i ? c.lineTo(xx, yy) : c.moveTo(xx, yy); }
    c.stroke();
    c.fillStyle = '#fff3c0'; c.beginPath(); c.arc(p.x + dir * 14, p.y - 8, 4, 0, 7); c.fill();
  }
}

// ============================================================
//  メニュー系シーン
// ============================================================
let scene = null;
function setScene(s) { scene = s; }
const confirmKey = p => p.start || p.lp;
const backKey = p => p.esc || p.mp;
function dim(c, a = 0.55) { c.fillStyle = `rgba(0,0,0,${a})`; c.fillRect(0, 0, W, H); }
function footer(c, s) { c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(0, H - 34, W, 34); text(c, s, W / 2, H - 17, 16, '#ddd'); }
function fakeFighter(def, x, y, facing, state, t) { return { def, x, y, facing, state, animT: t, t, mv: null, flash: 0, air: false, vy: 0 }; }

class TitleScene {
  constructor() { this.t = 0; }
  update(i) { this.t++; if (confirmKey(i.pressed)) { Sound.init(); Sound.play('confirm'); setScene(new ModeScene()); } }
  draw(c) {
    drawStage(c, 'kyoto', this.t); dim(c, 0.35);
    drawFighter(c, fakeFighter(CHAR.hayato, 300, GROUND, 1, 'idle', this.t), 1.15);
    drawFighter(c, fakeFighter(CHAR.meihua, 660, GROUND, -1, 'idle', this.t + 20), 1.15);
    c.save(); c.translate(W / 2, 140); c.rotate(-0.04);
    text(c, 'WORLD CLASH', 0, 0, 96, '#ffcf3a', 'center', 12);
    c.restore();
    text(c, '― 2D 対戦格闘ゲーム ―', W / 2, 215, 26, '#fff', 'center', 5);
    if (this.t % 60 < 40) text(c, 'PRESS ENTER', W / 2, 330, 34, '#fff', 'center', 6);
    footer(c, 'Enter / Z：決定　X / Esc：戻る　（ゲームパッド対応）');
  }
}
class ListMenu {
  constructor(title, items, onPick, onBack, sub) { this.title = title; this.items = items; this.onPick = onPick; this.onBack = onBack; this.sel = 0; this.t = 0; this.sub = sub; }
  update(i) {
    this.t++;
    const p = i.pressed;
    if (p.up) { this.sel = (this.sel + this.items.length - 1) % this.items.length; Sound.play('select'); }
    if (p.down) { this.sel = (this.sel + 1) % this.items.length; Sound.play('select'); }
    if (confirmKey(p)) { Sound.play('confirm'); this.onPick(this.sel); }
    else if (backKey(p) && this.onBack) { Sound.play('cancel'); this.onBack(); }
  }
  draw(c) {
    drawStage(c, 'london', this.t); dim(c, 0.6);
    text(c, this.title, W / 2, 90, 44, '#ffcf3a', 'center', 6);
    this.items.forEach((it, i) => {
      const y = 190 + i * 74, on = i === this.sel;
      c.fillStyle = on ? 'rgba(255,200,60,0.25)' : 'rgba(255,255,255,0.06)'; c.fillRect(W / 2 - 280, y - 30, 560, 60);
      if (on) { c.strokeStyle = '#ffcf3a'; c.lineWidth = 2; c.strokeRect(W / 2 - 280, y - 30, 560, 60); }
      text(c, it.label, W / 2, y - 6, 28, on ? '#fff' : '#bbb', 'center', 4);
      if (it.desc) text(c, it.desc, W / 2, y + 18, 14, on ? '#ffe9a0' : '#888', 'center', 0, 'normal');
    });
    footer(c, '↑↓：選択　Enter / Z：決定　X / Esc：戻る');
  }
}
function ModeScene() {
  return new ListMenu('MODE SELECT', [
    { label: 'アーケードモード', desc: 'キャラクターごとのストーリーを楽しみながら、5人のCPUと連続で戦う' },
    { label: 'バーサス（1P vs CPU）', desc: '対戦相手・ステージ・難易度を自由に選んで1試合ずつ戦う' },
    { label: '操作方法', desc: 'キー操作と必殺技の出し方' },
  ], i => { if (i === 0) startArcade(); else if (i === 1) startVersus(); else setScene(new HowToScene()); }, goTitle);
}
class HowToScene {
  constructor() { this.t = 0; }
  update(i) { this.t++; if (confirmKey(i.pressed) || backKey(i.pressed)) { Sound.play('cancel'); setScene(ModeScene()); } }
  draw(c) {
    drawStage(c, 'bamboo', this.t); dim(c, 0.72);
    text(c, '操作方法', W / 2, 50, 40, '#ffcf3a', 'center', 5);
    const rows = [
      ['移動 / ジャンプ / しゃがみ', '← → / ↑ / ↓'],
      ['パンチ　弱・中・強', 'Z ・ X ・ C'],
      ['キック　弱・中・強', 'A ・ S ・ D'],
      ['必殺技ボタン（SP）', 'Space'],
      ['超必殺技（スーパーアーツ）', 'V（SAゲージ満タン時）'],
      ['ガード', '相手と逆方向へ入力（しゃがみガードは ↙ / ↘）'],
      ['投げ', '密着して → or ← ＋ 強P（C）'],
      ['ポーズ', 'Esc / P　　（判定表示：H）'],
    ];
    rows.forEach((r, i) => { text(c, r[0], 120, 110 + i * 34, 19, '#fff', 'left', 3); text(c, r[1], 520, 110 + i * 34, 19, '#ffe9a0', 'left', 3); });
    const y = 110 + rows.length * 34 + 10;
    text(c, '必殺技：方向キー1つ ＋ 必殺技ボタン（コマンド入力不要）', W / 2, y, 20, '#7fd8ff', 'center', 4);
    text(c, '→（またはニュートラル）＋SP／↓＋SP／←＋SP　の3種類。超必殺技は V。', W / 2, y + 28, 17, '#fff', 'center', 3);
    text(c, '弱→中→強の通常技は、ヒット/ガード時に強い技や必殺技へキャンセル可能（コンボ）。', W / 2, y + 56, 16, '#ddd', 'center', 3);
    text(c, 'スマホ：左の十字パッドで移動、右のボタンで攻撃（SP＝必殺技、SA＝超必殺技）。', W / 2, y + 104, 15, '#ffe9a0', 'center', 3);
    text(c, 'ジャンプ攻撃は立ちガード、足払い等の下段はしゃがみガードでのみ防御可能。必殺技はガードしても削られる。', W / 2, y + 80, 15, '#ddd', 'center', 3);
    footer(c, 'Enter / X：戻る');
  }
}
class CharSelectScene {
  constructor(opts) { this.o = opts; this.sel = opts.initial || 0; this.t = 0; }
  update(i) {
    this.t++;
    const p = i.pressed, n = CHARS.length, cols = 3;
    if (p.left) { this.sel = (this.sel + n - 1) % n; Sound.play('select'); }
    if (p.right) { this.sel = (this.sel + 1) % n; Sound.play('select'); }
    if (p.up || p.down) { this.sel = (this.sel + cols) % n; Sound.play('select'); }
    if (confirmKey(p)) { Sound.play('confirm'); this.o.onPick(CHARS[this.sel].id, this.sel); }
    else if (backKey(p)) { Sound.play('cancel'); this.o.onBack(); }
  }
  draw(c) {
    const ch = CHARS[this.sel];
    drawStage(c, ch.stage, this.t); dim(c, 0.62);
    text(c, this.o.title, W / 2, 36, 32, '#ffcf3a', 'center', 5);
    // グリッド
    const cw = 120, chh = 140, gx = 40, gy = 70;
    CHARS.forEach((d, i) => {
      const x = gx + (i % 3) * (cw + 10), y = gy + Math.floor(i / 3) * (chh + 10), on = i === this.sel;
      c.fillStyle = on ? 'rgba(255,200,60,0.35)' : 'rgba(255,255,255,0.08)'; c.fillRect(x, y, cw, chh);
      c.strokeStyle = on ? '#ffcf3a' : '#555'; c.lineWidth = on ? 3 : 1; c.strokeRect(x, y, cw, chh);
      c.save(); c.beginPath(); c.rect(x, y, cw, chh); c.clip();
      drawFighter(c, fakeFighter(d, x + cw / 2, y + chh + 20, 1, 'idle', this.t + i * 13), 0.72);
      c.restore();
      text(c, d.en, x + cw / 2, y + chh - 12, 14, '#fff', 'center', 3);
      if (this.o.mark === d.id) text(c, '1P', x + 16, y + 14, 14, '#f88', 'center', 3);
    });
    // 詳細
    const px = 450;
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(px, 70, 480, 400);
    drawFighter(c, fakeFighter(ch, px + 380, 440, -1, 'idle', this.t), 1.2);
    text(c, ch.name, px + 20, 100, 30, '#fff', 'left', 4);
    text(c, `${ch.country}／${ch.gender}／${ch.style}`, px + 20, 136, 17, '#ffe9a0', 'left', 3);
    text(c, `体力 ${ch.hp}　攻撃力 ×${ch.power.toFixed(2)}`, px + 20, 162, 14, '#ccc', 'left', 2, 'normal');
    const dl = { fwd: '→＋SP', down: '↓＋SP', back: '←＋SP' };
    let yy = 200;
    text(c, '必殺技', px + 20, yy, 18, '#7fd8ff', 'left', 3); yy += 28;
    for (const k of ['fwd', 'down', 'back']) {
      const s = ch.specials[k];
      text(c, dl[k], px + 24, yy, 16, '#fff', 'left', 3);
      text(c, s.name, px + 100, yy, 16, '#fff', 'left', 3);
      text(c, `［${TYPE_LABEL[s.type]}］`, px + 100, yy + 20, 13, '#aaa', 'left', 2, 'normal');
      yy += 46;
    }
    text(c, '超必殺技（V）', px + 20, yy, 18, '#ffcf3a', 'left', 3); yy += 26;
    text(c, ch.super.name, px + 24, yy, 18, '#fff', 'left', 3);
    text(c, `［${TYPE_LABEL[ch.super.type]}］`, px + 24, yy + 22, 13, '#aaa', 'left', 2, 'normal');
    footer(c, '←→↑↓：選択　Enter / Z：決定　X / Esc：戻る');
  }
}
class StageSelectScene {
  constructor(opts) { this.o = opts; this.sel = opts.initial || 0; this.t = 0; }
  update(i) {
    this.t++; const p = i.pressed, n = STAGES.length;
    if (p.up || p.left) { this.sel = (this.sel + n - 1) % n; Sound.play('select'); }
    if (p.down || p.right) { this.sel = (this.sel + 1) % n; Sound.play('select'); }
    if (confirmKey(p)) { Sound.play('confirm'); this.o.onPick(STAGES[this.sel].id, this.sel); }
    else if (backKey(p)) { Sound.play('cancel'); this.o.onBack(); }
  }
  draw(c) {
    drawStage(c, STAGES[this.sel].id, this.t);
    c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0, 0, 360, H);
    text(c, 'STAGE SELECT', 180, 50, 30, '#ffcf3a', 'center', 5);
    STAGES.forEach((s, i) => {
      const y = 120 + i * 66, on = i === this.sel;
      c.fillStyle = on ? 'rgba(255,200,60,0.3)' : 'rgba(255,255,255,0.06)'; c.fillRect(20, y - 26, 320, 54);
      text(c, s.name, 34, y - 6, 18, on ? '#fff' : '#aaa', 'left', 3);
      text(c, s.country, 34, y + 15, 13, on ? '#ffe9a0' : '#777', 'left', 2, 'normal');
    });
    footer(c, '↑↓：選択　Enter / Z：決定　X / Esc：戻る');
  }
}
const LV_NAME = ['', '入門', '初級', '初級＋', '中級', '中級＋', '上級', '達人', '鬼'];
class LevelScene {
  constructor(opts) { this.o = opts; this.lv = opts.initial || 4; this.t = 0; }
  update(i) {
    this.t++; const p = i.pressed;
    if (p.left || p.down) { this.lv = Math.max(1, this.lv - 1); Sound.play('select'); }
    if (p.right || p.up) { this.lv = Math.min(8, this.lv + 1); Sound.play('select'); }
    if (confirmKey(p)) { Sound.play('confirm'); this.o.onPick(this.lv); }
    else if (backKey(p)) { Sound.play('cancel'); this.o.onBack(); }
  }
  draw(c) {
    drawStage(c, 'shanghai', this.t); dim(c, 0.6);
    text(c, this.o.title || 'CPU の強さ（レベル）', W / 2, 110, 36, '#ffcf3a', 'center', 5);
    for (let i = 1; i <= 8; i++) {
      const x = W / 2 - 350 + (i - 1) * 100, on = i === this.lv, filled = i <= this.lv;
      c.fillStyle = filled ? `hsl(${120 - i * 15},80%,${on ? 60 : 45}%)` : '#333';
      c.fillRect(x, 220 - i * 8, 80, 60 + i * 8);
      if (on) { c.strokeStyle = '#fff'; c.lineWidth = 3; c.strokeRect(x, 220 - i * 8, 80, 60 + i * 8); }
      text(c, String(i), x + 40, 300, 22, on ? '#fff' : '#999', 'center', 3);
    }
    text(c, `Lv ${this.lv}：${LV_NAME[this.lv]}`, W / 2, 370, 34, '#fff', 'center', 5);
    text(c, '反応速度・ガード率・対空・コンボ精度がレベルに応じて上昇', W / 2, 420, 17, '#ddd', 'center', 3);
    footer(c, '←→：変更　Enter / Z：決定　X / Esc：戻る');
  }
}
class StoryScene {
  constructor(o) { this.o = o; this.t = 0; }
  update(i) { this.t++; if (this.t > 20 && (confirmKey(i.pressed) || backKey(i.pressed))) { Sound.play('confirm'); this.o.onDone(); } }
  draw(c) {
    const ch = CHAR[this.o.char];
    drawStage(c, ch.stage, this.t); dim(c, 0.5);
    drawFighter(c, fakeFighter(ch, 200, GROUND, 1, this.o.win ? 'win' : 'idle', this.t), 1.4);
    text(c, this.o.title, W / 2 + 120, 70, 40, '#ffcf3a', 'center', 6);
    c.fillStyle = 'rgba(0,0,0,0.7)'; c.fillRect(360, 120, 560, 300);
    c.strokeStyle = '#ffcf3a'; c.lineWidth = 2; c.strokeRect(360, 120, 560, 300);
    text(c, ch.name, 380, 150, 24, '#fff', 'left', 3);
    const n = Math.floor(this.t * 0.8);
    let shown = 0;
    wrapText(c, this.o.body, 520, 19).forEach((ln, i) => {
      const part = ln.slice(0, Math.max(0, n - shown)); shown += ln.length;
      text(c, part, 380, 196 + i * 32, 19, '#eee', 'left', 0);
    });
    if (this.t % 60 < 40) text(c, '▼ Enter', 900, 400, 16, '#ffe9a0', 'right');
  }
}
class VsScene {
  constructor(o) { this.o = o; this.t = 0; }
  update(i) { this.t++; if (this.t >= 170 || (this.t > 30 && confirmKey(i.pressed))) this.o.onDone(); }
  draw(c) {
    const a = CHAR[this.o.p1], b = CHAR[this.o.p2];
    c.fillStyle = '#7a1010'; c.fillRect(0, 0, W / 2, H); c.fillStyle = '#10287a'; c.fillRect(W / 2, 0, W / 2, H);
    c.fillStyle = 'rgba(0,0,0,0.3)'; for (let i = 0; i < 20; i++) c.fillRect(0, i * 28 + (this.t % 28), W, 10);
    const k = Math.min(1, this.t / 20);
    drawFighter(c, fakeFighter(a, lerp(-100, 240, k), 440, 1, 'idle', this.t), 1.5);
    drawFighter(c, fakeFighter(b, lerp(W + 100, 720, k), 440, -1, 'idle', this.t), 1.5);
    text(c, 'VS', W / 2, 230, 110, '#ffcf3a', 'center', 10);
    text(c, a.name, 240, 480, 28, '#fff', 'center', 5);
    text(c, b.name, 720, 480, 28, '#fff', 'center', 5);
    if (this.o.header) text(c, this.o.header, W / 2, 50, 30, '#fff', 'center', 5);
    if (this.o.line && this.t > 40) text(c, `「${this.o.line}」`, 720, 120, 22, '#fff', 'center', 4);
    text(c, STAGES.find(s => s.id === this.o.stage).name + (this.o.level ? `　CPU Lv${this.o.level}` : ''), W / 2, 520, 16, '#ddd', 'center', 3);
  }
}
class ContinueScene {
  constructor(o) { this.o = o; this.t = 0; this.count = 10; }
  update(i) {
    this.t++;
    if (this.t % 60 === 0) { this.count--; Sound.play('select'); if (this.count < 0) { this.o.onNo(); return; } }
    if (confirmKey(i.pressed)) { Sound.play('confirm'); this.o.onYes(); }
    else if (backKey(i.pressed)) { this.o.onNo(); }
  }
  draw(c) {
    c.fillStyle = '#05050a'; c.fillRect(0, 0, W, H);
    drawFighter(c, fakeFighter(CHAR[this.o.char], W / 2, 420, 1, 'lose', this.t), 1.3);
    text(c, 'CONTINUE?', W / 2, 120, 64, '#ff5040', 'center', 6);
    text(c, String(Math.max(0, this.count)), W / 2, 210, 72, '#fff', 'center', 6);
    text(c, 'Enter / Z：コンティニュー　X / Esc：やめる', W / 2, 490, 18, '#ccc', 'center', 3);
  }
}
class ResultMenu extends ListMenu {
  constructor(title, items, onPick, bgStage, char, win) { super(title, items, onPick, null); this.bg = bgStage; this.char = char; this.win = win; }
  draw(c) {
    drawStage(c, this.bg, this.t); dim(c, 0.55);
    drawFighter(c, fakeFighter(CHAR[this.char], 160, GROUND, 1, this.win ? 'win' : 'lose', this.t), 1.3);
    text(c, this.title, W / 2, 90, 52, this.win ? '#ffcf3a' : '#7fb0ff', 'center', 6);
    this.items.forEach((it, i) => {
      const y = 220 + i * 70, on = i === this.sel;
      c.fillStyle = on ? 'rgba(255,200,60,0.25)' : 'rgba(255,255,255,0.06)'; c.fillRect(W / 2 - 200, y - 26, 400, 52);
      text(c, it.label, W / 2, y, 26, on ? '#fff' : '#aaa', 'center', 4);
    });
    footer(c, '↑↓：選択　Enter / Z：決定');
  }
}

// ============================================================
//  ゲームフロー
// ============================================================
function goTitle() { setScene(new TitleScene()); }

function startVersus(prev) {
  const st = Object.assign({ p1: 0, p2: 1, stage: 0, lv: 4 }, prev || {});
  const pickP1 = () => setScene(new CharSelectScene({ title: '1P キャラクター選択', initial: st.p1, onBack: () => setScene(ModeScene()), onPick: (id, i) => { st.p1 = i; pickP2(); } }));
  const pickP2 = () => setScene(new CharSelectScene({ title: '対戦相手（CPU）選択', initial: st.p2, mark: CHARS[st.p1].id, onBack: pickP1, onPick: (id, i) => { st.p2 = i; pickStage(); } }));
  const pickStage = () => setScene(new StageSelectScene({ initial: st.stage, onBack: pickP2, onPick: (id, i) => { st.stage = i; pickLv(); } }));
  const pickLv = () => setScene(new LevelScene({ initial: st.lv, onBack: pickStage, onPick: lv => { st.lv = lv; run(); } }));
  const run = () => {
    const p1 = CHARS[st.p1].id, p2 = CHARS[st.p2].id, stage = STAGES[st.stage].id;
    setScene(new VsScene({ p1, p2, stage, level: st.lv, line: CHAR[p2].taunt, header: 'VERSUS', onDone: () => setScene(new FightScene({
      p1: { char: p1 }, p2: { char: p2, cpu: st.lv }, stage,
      onEnd: r => {
        const win = r === 0;
        setScene(new ResultMenu(win ? 'YOU WIN!' : r === -1 ? 'DRAW GAME（負け）' : 'YOU LOSE...', [
          { label: '再戦する' }, { label: 'キャラクター選択へ' }, { label: 'タイトルへ' }
        ], i => { if (i === 0) run(); else if (i === 1) pickP1(); else goTitle(); }, stage, p1, win));
      }
    })) }));
  };
  if (prev && prev.direct) run(); else pickP1();
}

function startArcade() {
  const st = { sel: 0, lv: 3 };
  const pickChar = () => setScene(new CharSelectScene({ title: 'アーケード：キャラクター選択', initial: st.sel, onBack: () => setScene(ModeScene()), onPick: (id, i) => { st.sel = i; pickLv(); } }));
  const pickLv = () => setScene(new LevelScene({ title: 'アーケード：開始レベル', initial: st.lv, onBack: pickChar, onPick: lv => { st.lv = lv; begin(); } }));
  const begin = () => {
    const me = CHARS[st.sel];
    const others = CHARS.filter(c => c.id !== me.id && c.id !== me.rival).map(c => c.id);
    for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
    const run = { me: me.id, order: others.concat([me.rival]), idx: 0, base: st.lv };
    setScene(new StoryScene({ char: me.id, title: 'PROLOGUE', body: me.intro, onDone: () => arcadeNext(run) }));
  };
  pickChar();
}
function arcadeNext(run) {
  const opp = CHAR[run.order[run.idx]], last = run.idx === run.order.length - 1;
  const level = Math.min(8, run.base + Math.floor(run.idx / 2) + (last ? 1 : 0));
  const stage = opp.stage;
  setScene(new VsScene({
    p1: run.me, p2: opp.id, stage, level, line: opp.taunt,
    header: last ? `FINAL STAGE　－ 宿敵 －` : `STAGE ${run.idx + 1} / ${run.order.length}`,
    onDone: () => setScene(new FightScene({
      p1: { char: run.me }, p2: { char: opp.id, cpu: level }, stage,
      onEnd: r => {
        if (r === 0) {
          run.idx++;
          if (run.idx >= run.order.length) {
            setScene(new StoryScene({ char: run.me, title: 'ENDING', body: CHAR[run.me].ending, win: true, onDone: () => setScene(new StoryScene({ char: run.me, title: 'CONGRATULATIONS!', body: 'アーケードモード制覇！\nお疲れさまでした。\n\n― WORLD CLASH ―', win: true, onDone: goTitle })) }));
          } else arcadeNext(run);
        } else {
          setScene(new ContinueScene({ char: run.me, onYes: () => arcadeNext(run), onNo: () => setScene(new GameOverScene()) }));
        }
      }
    }))
  }));
}
class GameOverScene {
  constructor() { this.t = 0; }
  update(i) { this.t++; if (this.t > 180 || (this.t > 30 && confirmKey(i.pressed))) goTitle(); }
  draw(c) { c.fillStyle = '#000'; c.fillRect(0, 0, W, H); text(c, 'GAME OVER', W / 2, H / 2, 72, '#ff4030', 'center', 6); }
}

// ============================================================
//  メインループ
// ============================================================
const STEP = 1000 / 60;
let last = performance.now(), acc = 0;
function frame(now) {
  acc += Math.min(100, now - last); last = now;
  try {
    while (acc >= STEP) { scene.update(Input.poll()); acc -= STEP; }
    scene.draw(ctx);
  } catch (e) { console.error(e); acc = 0; }
  requestAnimationFrame(frame);
}
Input.init();
Touch.init();
layout();
goTitle();
requestAnimationFrame(frame);

// テスト・デバッグ用フック
window.__WC = {
  Sound, CHARS, STAGES, FightScene, CPU, Fighter, setScene, goTitle,
  get scene() { return scene; },
  step(n = 1, inp) { for (let i = 0; i < n; i++) scene.update(inp || { left: false, right: false, up: false, down: false, held: {}, pressed: {} }); },
  draw() { scene.draw(ctx); },
};
})();

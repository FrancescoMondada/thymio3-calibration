// Simulated robot ("demo mode"): same operations as the real backend, with a
// hidden, slightly imperfect robot so every wizard can be tried without
// hardware. Results the real robot can't report (drift in cm, distance
// travelled, remaining turn error…) are returned under `demo` so the UI can
// show them as a stand-in for "looking at the robot".

import { FACTORY, MOTOR_BASE, DIST_STEP, TICKS_PER_MS } from './python.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const noise = (n) => (Math.random() - 0.5) * 2 * n;

// What each "paper" gives the sensors: raw reflected IR (ground), raw RGB+clear (colour).
export const SURFACES = {
  white: { refl: 420, rgb: [11000, 14400, 13300, 30000], css: '#f4f4f0' },
  black: { refl: 38, rgb: [4200, 6000, 5300, 9000], css: '#1b1b1d' },
  grey: { refl: 190, rgb: [7600, 10200, 9300, 19000], css: '#8c8c8c' },
  red: { refl: 150, rgb: [10500, 6200, 5600, 16000], css: '#d03a3a' },
  green: { refl: 160, rgb: [5600, 12000, 6200, 18000], css: '#3aa05a' },
  blue: { refl: 120, rgb: [4800, 7400, 11800, 15000], css: '#3a62d0' },
};

const TRUE = {
  idealCorr: 6,          // motor correction that really makes this robot go straight
  fwTicksFor15: 8330000, // timer ticks to travel exactly 15 cm forward…
  bwTicksFor15: 9350000, // …and backward
  gyroOffsets: [14, -9, 6],
  turnErrorRaw: 1400,    // over-rotation of a −360° turn at the nominal scale
  nudgeRaw: 400,         // one nudge moves the robot by this much (raw angle units)
};
const RAW_PER_DEG = 16384 / 90;

export class DemoRobot {
  constructor(emit) {
    this.emit = emit;
    this.surface = 'white';
    this.state = {
      straight: [...FACTORY.motors],
      distance: [...FACTORY.distance],
      color: [11036, 14470, 13334, 4214, 6055, 5312],
      gyroOffsets: [0, 0, 0],
      gyroScale: 0,
      ground: [FACTORY.groundBlack, FACTORY.groundBlack, FACTORY.groundWhite, FACTORY.groundWhite],
    };
    this.flash = JSON.parse(JSON.stringify(this.state)); // what survives a power cycle
    this.turnErr = 0;      // remaining physical error after a full turn (raw units)
    this.angleRaw = 0;     // what the gyro integrates
    this.moving = 0;
    this.timer = null;
  }

  start() {
    this.emit('conn', { status: 'connected', device: 'THYMIO 3 (DEMO)', firmware: null });
    this.timer = setInterval(() => this.tick(), 100);
  }
  stop() { clearInterval(this.timer); this.timer = null; }

  setSurface(name) { if (SURFACES[name]) this.surface = name; }

  tick() {
    const s = SURFACES[this.surface];
    const st = this.state;
    const amb = 60 + noise(4);
    const reflL = s.refl + noise(s.refl * 0.03 + 2) + amb;
    const reflR = s.refl * 0.97 + noise(s.refl * 0.03 + 2) + amb;
    const range = (side) => Math.max(1, st.ground[2 + side] - st.ground[side]);
    const cal = (refl, side) => clamp(Math.round(((refl - amb - st.ground[side]) / range(side)) * 1023), 0, 1023);
    const raw = s.rgb.map((v) => Math.round(v + noise(v * 0.01)));
    const cw = st.color.slice(0, 3), cb = st.color.slice(3, 6);
    const norm = [0, 1, 2].map((k) => clamp((raw[k] - cb[k]) / Math.max(1, cw[k] - cb[k]), 0, 1));
    const css = `rgb(${norm.map((v) => Math.round(v * 255)).join(',')})`;
    const mx = Math.max(...norm), mn = Math.min(...norm);
    let h = 0;
    if (mx !== mn) {
      const d = mx - mn;
      if (mx === norm[0]) h = ((norm[1] - norm[2]) / d) % 6;
      else if (mx === norm[1]) h = (norm[2] - norm[0]) / d + 2;
      else h = (norm[0] - norm[1]) / d + 4;
      h = (h * 60 + 360) % 360;
    }
    this.emit('tel', {
      fresh: true,
      ground: { l: cal(reflL, 0), r: cal(reflR, 1) },
      reflected: { l: Math.round(reflL), r: Math.round(reflR) },
      ambient: { l: Math.round(amb), r: Math.round(amb) },
      colorRaw: { r: raw[0], g: raw[1], b: raw[2], c: raw[3] },
      colorCss: css,
      hsv: { h: Math.round(h), s: Math.round(mx ? ((mx - mn) / mx) * 100 : 0), v: Math.round(mx * 100) },
      gyro: { x: Math.round(noise(8) + TRUE.gyroOffsets[0] - st.gyroOffsets[0]), y: Math.round(noise(8) + TRUE.gyroOffsets[1] - st.gyroOffsets[1]), z: Math.round(noise(8) + TRUE.gyroOffsets[2] - st.gyroOffsets[2]) },
      angleDeg: Math.round(this.angleRaw / RAW_PER_DEG),
      battery: 3.92 + noise(0.01),
      buttons: {},
    });
  }

  async op(name, args = {}) {
    const f = this[`op_${name}`];
    if (!f) throw new Error(`Demo: unknown operation ${name}`);
    return f.call(this, args);
  }

  // ---- everything --------------------------------------------------------
  async op_readAll() {
    await sleep(400);
    const s = this.state;
    return {
      straight: [...s.straight], distance: [...s.distance], color: [...s.color],
      gyroOffsets: [...s.gyroOffsets], gyroScale: s.gyroScale, ground: [...s.ground],
    };
  }

  // ---- straight ----------------------------------------------------------
  async op_straightRun({ corr, dir }) {
    this.state.straight = [MOTOR_BASE + corr, MOTOR_BASE - corr];
    await sleep(1800);
    return { straight: [...this.state.straight], demo: { driftCm: (TRUE.idealCorr - corr) * 0.9 * (dir > 0 ? 1 : -1) } };
  }
  async op_straightSave({ corr }) {
    await sleep(300);
    this.state.straight = [MOTOR_BASE + corr, MOTOR_BASE - corr];
    this.flash.straight = [...this.state.straight];
    return { straight: [...this.state.straight] };
  }
  async op_straightReset() {
    await sleep(300);
    this.state.straight = [...FACTORY.motors];
    this.flash.straight = [...FACTORY.motors];
    return { straight: [...this.state.straight] };
  }

  // ---- distance ----------------------------------------------------------
  async op_distanceRun({ ticks, dir }) {
    await sleep(Math.min(2500, ticks / TICKS_PER_MS) * 0.6 + 500);
    const ideal = dir > 0 ? TRUE.fwTicksFor15 : TRUE.bwTicksFor15;
    return { demo: { cm: (ticks / ideal) * 15 } };
  }
  async op_distanceSave({ fw, bw }) {
    await sleep(300);
    this.state.distance = [fw, bw];
    this.flash.distance = [fw, bw];
    return { distance: [fw, bw] };
  }
  async op_distanceReset() {
    await sleep(300);
    this.state.distance = [...FACTORY.distance];
    this.flash.distance = [...FACTORY.distance];
    return { distance: [...this.state.distance] };
  }

  // ---- colour ------------------------------------------------------------
  async op_colorCapture({ kind }) {
    await sleep(500);
    const s = SURFACES[this.surface].rgb;
    const v = [0, 1, 2].map((k) => Math.round(s[k] + noise(40)));
    if (kind === 'black') this.state.color.splice(3, 3, ...v);
    else this.state.color.splice(0, 3, ...v);
    this.flash.color = [...this.state.color];
    return { color: [...this.state.color] };
  }

  // ---- gyro offsets ------------------------------------------------------
  async op_gyroOffsetsMeasure() {
    await sleep(2200);
    this.state.gyroOffsets = TRUE.gyroOffsets.map((v) => Math.round(v + noise(1.5)));
    return { gyroOffsets: [...this.state.gyroOffsets] };
  }
  async op_gyroOffsetsSave() {
    await sleep(300);
    this.flash.gyroOffsets = [...this.state.gyroOffsets];
    return { gyroOffsets: [...this.state.gyroOffsets] };
  }
  async op_gyroOffsetsCancel() {
    await sleep(200);
    this.state.gyroOffsets = [...this.flash.gyroOffsets];
    return { gyroOffsets: [...this.state.gyroOffsets] };
  }
  async op_gyroOffsetsReset() {
    await sleep(300);
    this.state.gyroOffsets = [...FACTORY.gyroOffsets];
    this.flash.gyroOffsets = [...FACTORY.gyroOffsets];
    return { gyroOffsets: [...this.state.gyroOffsets] };
  }

  // ---- gyro rotation scale ----------------------------------------------
  async op_gyroTurn({ measure }) {
    if (measure) this.state.gyroScale = 0;
    await sleep(2600);
    this.turnErr = TRUE.turnErrorRaw + 4 * this.state.gyroScale; // physical error left after the turn
    this.angleRaw = 0;
    return { angle: [0, 0], demo: { errDeg: this.turnErr / RAW_PER_DEG } };
  }
  async op_gyroNudge({ dir }) {
    await sleep(700);
    this.angleRaw += dir * TRUE.nudgeRaw;
    this.turnErr -= dir * TRUE.nudgeRaw;
    return { angle: [this.angleRaw, Math.round(this.angleRaw / RAW_PER_DEG)], demo: { errDeg: this.turnErr / RAW_PER_DEG } };
  }
  async op_gyroAngle() {
    await sleep(200);
    return { angle: [this.angleRaw, Math.round(this.angleRaw / RAW_PER_DEG)], demo: { errDeg: this.turnErr / RAW_PER_DEG } };
  }
  // Demo only: stands for the user turning the robot by hand (the gyroscope integrates it).
  async op_gyroHand({ dir }) {
    const step = 150;
    this.angleRaw += dir * step;
    this.turnErr -= dir * step;
    return { angle: [this.angleRaw, Math.round(this.angleRaw / RAW_PER_DEG)], demo: { errDeg: this.turnErr / RAW_PER_DEG } };
  }
  async op_gyroScaleSave() {
    await sleep(300);
    const f = clamp(Math.trunc(-this.angleRaw / 4), -32000, 32000);
    this.state.gyroScale = f;
    this.flash.gyroScale = f;
    return { gyroScale: f };
  }
  async op_gyroScaleReset() {
    await sleep(300);
    this.state.gyroScale = 0;
    this.flash.gyroScale = 0;
    return { gyroScale: 0 };
  }

  // ---- ground ------------------------------------------------------------
  async op_groundCapture({ kind }) {
    await sleep(1400);
    const s = SURFACES[this.surface];
    const v = [Math.round(s.refl + noise(4)), Math.round(s.refl * 0.97 + noise(4))];
    const g = this.state.ground;
    if (kind === 'black') { g[0] = v[0]; g[1] = v[1]; } else { g[2] = v[0]; g[3] = v[1]; }
    return { groundSample: v, ground: [...g] };
  }
  async op_groundSave() {
    await sleep(300);
    this.flash.ground = [...this.state.ground];
    return { ground: [...this.state.ground] };
  }
  async op_groundApply({ values }) {
    await sleep(200);
    this.state.ground = [...values];
    return { ground: [...values] };
  }
  async op_groundReset() {
    await sleep(300);
    this.state.ground = [FACTORY.groundBlack, FACTORY.groundBlack, FACTORY.groundWhite, FACTORY.groundWhite];
    this.flash.ground = [...this.state.ground];
    return { ground: [...this.state.ground] };
  }
}

export { DIST_STEP };

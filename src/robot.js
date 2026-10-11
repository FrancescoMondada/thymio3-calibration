// Robot access layer: one object with the same interface for the real Thymio 3
// (Web Bluetooth through thymio3-ts-api + MicroPython scripts) and the demo.
import * as thymio from 'thymio-api';
import { buildScript, parseOutput } from './python.js';
import { DemoRobot } from './demo.js';

const EV = {
  connected: 'thymio-connected',
  manualReconnect: 'thymio-prompt-manual-reconnection',
  sensors: 'thymio-sensor-values',
  other: 'thymio-sensor-other-values',
  stdout: 'thymio-std-out-values',
  pyStatus: 'thymio-python-execution-status',
};

function hsvToCss(h, s, v) {
  const hue = ((Math.max(0, Math.min(360, h)) % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(1, s / 100));
  const val = Math.max(0, Math.min(1, v / 100));
  const c = val * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = val - c;
  const [r, g, b] =
    hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return `rgb(${Math.round((r + m) * 255)},${Math.round((g + m) * 255)},${Math.round((b + m) * 255)})`;
}

const STDOUT_GRACE_MS = 4000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (promise, ms) => Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

export const supportsBluetooth = () => typeof navigator !== 'undefined' && 'bluetooth' in navigator;

export class RealRobot {
  constructor(emit) {
    this.emit = emit;
    this.chain = Promise.resolve();
    this.tel = { ground: {}, reflected: {}, ambient: {}, colorRaw: {}, hsv: {}, gyro: {}, buttons: {} };
  }

  start() {
    this.onConnected = async (e) => {
      if (e.detail) {
        // Queue the settle phase FIRST: everything that talks to the robot waits behind it (see op()),
        // including a script requested by the UI as soon as it sees the connection.
        this.chain = this.chain.then(() => this.settle()).catch(() => {});
        this.emit('conn', { status: 'connected', device: thymio.getDeviceName?.() || 'THYMIO 3', firmware: null });
        try { await thymio.startAllSensorStreaming(); } catch (err) { console.warn('sensor streaming failed', err); }
      } else {
        this.emit('conn', { status: 'disconnected' });
      }
    };
    this.onReconnect = () => this.emit('conn', { status: 'reconnect' });
    this.onMain = (e) => {
      const d = e.detail;
      if (!d) return;
      const { h, s, v } = d.colorSensor;
      Object.assign(this.tel, {
        ground: { l: d.groundSensors.left, r: d.groundSensors.right },
        hsv: { h, s, v },
        colorCss: hsvToCss(h, s, v),
        gyro: { ...d.gyroRaw },
        buttons: { ...d.buttons },
      });
      this.push();
    };
    this.onOther = (e) => {
      const d = e.detail;
      if (!d) return;
      Object.assign(this.tel, {
        reflected: { l: d.groundReflected.left, r: d.groundReflected.right },
        ambient: { l: d.groundAmbient.left, r: d.groundAmbient.right },
        colorRaw: { ...d.colorRaw },
        angleDeg: d.angleDegrees,
        battery: d.batteryVoltage / 1000,
      });
      this.push();
    };
    document.addEventListener(EV.connected, this.onConnected);
    document.addEventListener(EV.manualReconnect, this.onReconnect);
    document.addEventListener(EV.sensors, this.onMain);
    document.addEventListener(EV.other, this.onOther);
  }

  stop() {
    document.removeEventListener(EV.connected, this.onConnected);
    document.removeEventListener(EV.manualReconnect, this.onReconnect);
    document.removeEventListener(EV.sensors, this.onMain);
    document.removeEventListener(EV.other, this.onOther);
  }

  push() { this.emit('tel', { ...this.tel, fresh: true }); }

  // The robot answers some requests (device info, script upload acknowledgement…) with BLE
  // *indications*, and only one indication can be in flight at a time: when two overlap, one is lost.
  // The API itself asks for the device info right after connecting, so let that finish first, then
  // ask for the firmware version ourselves before any script is uploaded.
  async settle() {
    await sleep(1800);
    try {
      const firmware = await withTimeout(thymio.getFirmwareInfo(), 5000);
      this.emit('conn', { firmware });
    } catch { /* older firmware, or no answer: the version is simply not shown */ }
    await sleep(300);
  }

  async connect() {
    this.emit('conn', { status: 'connecting' });
    try { await thymio.requestAndConnect(); } catch (err) { this.emit('conn', { status: 'disconnected', error: String(err?.message || err) }); throw err; }
  }
  async disconnect() { await thymio.disconnect(); }

  // Scripts run one at a time: the robot refuses a second one while one runs.
  op(name, args) {
    const job = this.chain.then(() => this.runWithRetry(buildScript(name, args)));
    this.chain = job.catch(() => {});
    return job;
  }

  // A lost upload acknowledgement means the script may not have been loaded: retry once, but only
  // when nothing at all came back (a script that ran would have printed its final marker).
  async runWithRetry(script) {
    try {
      return await this.runScript(script);
    } catch (err) {
      if (!err?.retry) throw err;
      await sleep(1000);
      return this.runScript(script);
    }
  }

  async runScript(script, timeoutMs = 40000) {
    let out = '';
    let finish;
    const done = new Promise((r) => { finish = r; });
    // Finished = the robot says so, or the final marker went through (the end-of-script
    // notification can be lost when it collides with an output indication).
    const onOut = (e) => { out += e.detail; if (/@@done\b/.test(out)) finish(); };
    const onStatus = (e) => { if (e.detail === false) finish(); };
    document.addEventListener(EV.stdout, onOut);
    document.addEventListener(EV.pyStatus, onStatus);
    let timer;
    let ackLost = false;
    try {
      try {
        await thymio.sendPythonScript(script);
      } catch (err) {
        // The firmware marks the script ready even if its acknowledgement never reaches us,
        // so go on and run it; a missing end marker below tells whether it really worked.
        if (!/Timed out waiting for load ACK/i.test(String(err?.message || err))) throw err;
        ackLost = true;
      }
      await thymio.executeLoadedScript();
      await Promise.race([
        done,
        new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('Timeout: the robot did not finish the script')), timeoutMs); }),
      ]);
      // "Script terminated" can arrive well before the script's output (the firmware buffers it for up
      // to a second): wait for the end marker, or for a Python error, before reading the result.
      const t0 = Date.now();
      while (!/@@done\b|Traceback|\w+Error:/.test(out) && Date.now() - t0 < STDOUT_GRACE_MS) await sleep(50);
      await sleep(100); // trailing fragments
    } catch (err) {
      try { await thymio.stopScriptExecution(); } catch { /* ignore */ }
      throw err;
    } finally {
      clearTimeout(timer);
      document.removeEventListener(EV.stdout, onOut);
      document.removeEventListener(EV.pyStatus, onStatus);
    }
    if (/Traceback|\w+Error:/.test(out)) {
      const line = out.trim().split(/\r?\n/).filter(Boolean).pop();
      throw new Error(`Robot: ${line}`);
    }
    const result = parseOutput(out);
    if (!/@@done\b/.test(out)) {
      const e = new Error(ackLost
        ? 'The robot did not acknowledge the script upload (Bluetooth). Wait a few seconds and try again.'
        : 'The robot did not run the script to the end.');
      e.retry = ackLost && out.trim() === '';
      throw e;
    }
    return result;
  }

  async emergencyStop() {
    try { await thymio.stopScriptExecution(); } catch { /* ignore */ }
  }
}

export class DemoBackend {
  constructor(emit) { this.demo = new DemoRobot((k, v) => { if (k === 'tel') this.lastTel = v; emit(k, v); }); }
  start() { this.demo.start(); }
  stop() { this.demo.stop(); }
  async connect() {}
  async disconnect() {}
  op(name, args) { return this.demo.op(name, args); }
  setSurface(s) { this.demo.setSurface(s); }
  async emergencyStop() {}
}

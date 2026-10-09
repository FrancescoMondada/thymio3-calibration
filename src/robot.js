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
        let firmware = null;
        try { firmware = await thymio.getFirmwareInfo(); } catch { /* older firmware */ }
        this.emit('conn', { status: 'connected', device: thymio.getDeviceName?.() || 'THYMIO 3', firmware });
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

  async connect() {
    this.emit('conn', { status: 'connecting' });
    try { await thymio.requestAndConnect(); } catch (err) { this.emit('conn', { status: 'disconnected', error: String(err?.message || err) }); throw err; }
  }
  async disconnect() { await thymio.disconnect(); }

  // Scripts run one at a time: the robot refuses a second one while one runs.
  op(name, args) {
    const job = this.chain.then(() => this.runScript(buildScript(name, args)));
    this.chain = job.catch(() => {});
    return job;
  }

  async runScript(script, timeoutMs = 40000) {
    let out = '';
    const onOut = (e) => { out += e.detail; };
    let finish;
    const done = new Promise((r) => { finish = r; });
    const onStatus = (e) => { if (e.detail === false) finish(); };
    document.addEventListener(EV.stdout, onOut);
    document.addEventListener(EV.pyStatus, onStatus);
    let timer;
    try {
      await thymio.sendPythonScript(script);
      await thymio.executeLoadedScript();
      await Promise.race([
        done,
        new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('Timeout: the robot did not finish the script')), timeoutMs); }),
      ]);
      await new Promise((r) => setTimeout(r, 200)); // let the last stdout notifications arrive
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
    return parseOutput(out);
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

// Robot access layer for the real Thymio 3
// (Web Bluetooth through thymio3-ts-api + MicroPython scripts).
import * as thymio from 'thymio-api';
import { buildScript, parseOutput } from './python.js';

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
    this.t0 = Date.now();
    this.chain = Promise.resolve();
    // Live sensor streaming. The firmware pushes 50 notifications/s per stream through only 12 BLE
    // buffers (CONFIG_NIMBLE_MSYS1_BLOCK_COUNT): at 100/s a slow link runs out in about a second, and
    // then requests, indications and uploads all stall. So streaming is off by default, only ONE
    // stream runs at a time, only while a step needs it, and never during a script upload.
    this.live = null;         // wanted: 'main' | 'others' | null
    this.liveOn = null;       // what is running on the robot
    this.liveBlocked = false; // set when the firmware starts sending empty notifications (buffers exhausted)
    this.tel = { ground: {}, reflected: {}, ambient: {}, colorRaw: {}, hsv: {}, gyro: {}, buttons: {} };
  }

  // Timestamped line for the communication log shown in the UI.
  note(msg) {
    const line = `+${((Date.now() - this.t0) / 1000).toFixed(1)}s  ${msg}`;
    console.log('[Thymio calibration]', line); // also in the browser console, for bug reports
    this.emit('log', line);
  }

  start() {
    this.note('ready');
    // The API handles notifications in async handlers whose failures are otherwise silent: keep a trace.
    this.onRejection = (e) => {
      this.note(`UNHANDLED ERROR (API): ${e.reason?.name || ''} ${e.reason?.message || e.reason}`);
      // An empty sensor notification (RangeError in the API's stream handler) means the firmware ran out
      // of BLE buffers: stop streaming before it takes the whole link down.
      if (this.liveOn && e.reason?.name === 'RangeError' && !this.liveBlocked) {
        this.liveBlocked = true;
        this.note('live readings suspended: the Bluetooth link cannot keep up with the sensor stream');
        this.emit('conn', { liveBlocked: true });
        this.queueSync(0);
      }
    };
    window.addEventListener('unhandledrejection', this.onRejection);
    this.onLoadResult = (e) => this.note(`upload result: code ${e.detail?.code} (${e.detail?.message})`);
    document.addEventListener('thymio-python-load-result', this.onLoadResult);
    this.onConnected = async (e) => {
      this.note(e.detail ? 'connected' : 'disconnected');
      if (e.detail) {
        // Queue the settle phase FIRST: everything that talks to the robot waits behind it (see op()),
        // including a script requested by the UI as soon as it sees the connection.
        this.chain = this.chain.then(() => this.settle()).catch(() => {});
        this.liveOn = null;
        this.emit('conn', { status: 'connected', device: thymio.getDeviceName?.() || 'THYMIO 3', firmware: null });
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
    window.removeEventListener('unhandledrejection', this.onRejection);
    document.removeEventListener('thymio-python-load-result', this.onLoadResult);
    document.removeEventListener(EV.connected, this.onConnected);
    document.removeEventListener(EV.manualReconnect, this.onReconnect);
    document.removeEventListener(EV.sensors, this.onMain);
    document.removeEventListener(EV.other, this.onOther);
  }

  push() { this.emit('tel', { ...this.tel, fresh: true }); }

  // ---- live streaming -------------------------------------------------------------------------
  setLive(kind) { this.live = kind || null; this.queueSync(200); }   // debounced: steps change quickly
  retryLive() { this.liveBlocked = false; this.emit('conn', { liveBlocked: false }); this.queueSync(0); }
  queueSync(delay) {
    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => { this.chain = this.chain.then(() => this.syncLive()).catch(() => {}); }, delay);
  }
  async syncLive() {
    const want = this.liveBlocked ? null : this.live;
    if (want === this.liveOn) return;
    try {
      if (want === 'main') await withTimeout(thymio.startMainSensorStreaming(), 4000);
      else if (want === 'others') await withTimeout(thymio.startSecondarySensorStreaming(), 4000);
      else await withTimeout(thymio.stopSensorStreaming(), 4000);
      this.liveOn = want;
      this.note(`live readings: ${want ? `stream "${want}" on` : 'off'}`);
      if (!want) this.clearLiveTelemetry();
    } catch (err) {
      this.note(`live readings: could not switch to ${want || 'off'} (${err?.message || err})`);
    }
  }
  // Stop streaming and give the firmware time to drain what is already queued.
  async pauseLive() {
    if (!this.liveOn) return;
    try { await withTimeout(thymio.stopSensorStreaming(), 4000); } catch (err) { this.note(`could not pause streaming (${err?.message || err})`); }
    this.liveOn = null;
    this.note('live readings paused for the script');
    await sleep(500);
  }
  clearLiveTelemetry() {
    Object.assign(this.tel, { ground: {}, reflected: {}, ambient: {}, colorRaw: {}, hsv: {}, gyro: {}, buttons: {}, angleDeg: undefined, colorCss: undefined });
    this.push();
  }

  // The robot answers some requests (device info, script upload acknowledgement…) with BLE
  // *indications*, and only one indication can be in flight at a time: when two overlap, one is lost.
  // The API itself asks for the device info right after connecting, so let that finish first, then
  // ask for the firmware version ourselves before any script is uploaded.
  async settle() {
    this.emit('conn', { initializing: true });
    this.note('settling: letting the API finish its own device-info request (1.8 s)');
    await sleep(1800);
    try {
      const firmware = await withTimeout(thymio.getFirmwareInfo(), 5000);
      this.note(`firmware: ESP32 ${firmware.esp32_ver}, STM32 ${firmware.stm32_ver}`);
      this.emit('conn', { firmware });
    } catch (err) {
      this.note(`firmware version not available (${err?.message || err})`);
    }
    await sleep(300);
    this.emit('conn', { initializing: false });
  }

  async connect() {
    this.emit('conn', { status: 'connecting' });
    try { await thymio.requestAndConnect(); } catch (err) { this.emit('conn', { status: 'disconnected', error: String(err?.message || err) }); throw err; }
  }
  async disconnect() { await thymio.disconnect(); }

  // Scripts run one at a time: the robot refuses a second one while one runs.
  op(name, args) {
    const job = this.chain.then(async () => {
      await this.pauseLive();
      return this.runWithRetry(buildScript(name, args), name);
    });
    this.chain = job.catch(() => {}).then(() => this.syncLive()).catch(() => {}); // resume live readings afterwards
    return job;
  }

  // A lost upload acknowledgement means the script may not have been loaded: retry once, but only
  // when nothing at all came back (a script that ran would have printed its final marker).
  async runWithRetry(script, label) {
    try {
      return await this.runScript(script, label);
    } catch (err) {
      this.note(`${label}: FAILED: ${err?.message || err}`);
      if (!err?.retry) throw err;
      this.note(`${label}: retrying once`);
      await sleep(1000);
      return this.runScript(script, label);
    }
  }

  async runScript(script, label = 'script', timeoutMs = 40000) {
    let out = '';
    const T = Date.now();
    const dt = () => `${Date.now() - T} ms`;
    let finish;
    const done = new Promise((r) => { finish = r; });
    // Finished = the robot says so, or the final marker went through (the end-of-script
    // notification can be lost when it collides with an output indication).
    const onOut = (e) => {
      out += e.detail;
      this.note(`${label}: output +${dt()} ${JSON.stringify(e.detail)}`);
      if (/@@done\b/.test(out)) finish();
    };
    const onStatus = (e) => { this.note(`${label}: execution status ${e.detail ? 'started' : 'terminated'} +${dt()}`); if (e.detail === false) finish(); };
    document.addEventListener(EV.stdout, onOut);
    document.addEventListener(EV.pyStatus, onStatus);
    let timer;
    let ackLost = false;
    try {
      try {
        this.note(`${label}: uploading ${script.length} bytes`);
        await thymio.sendPythonScript(script);
        this.note(`${label}: upload acknowledged +${dt()}`);
      } catch (err) {
        // The firmware marks the script ready even if its acknowledgement never reaches us,
        // so go on and run it; a missing end marker below tells whether it really worked.
        if (!/Timed out waiting for load ACK/i.test(String(err?.message || err))) throw err;
        ackLost = true;
        this.note(`${label}: upload acknowledgement lost +${dt()}, running the script anyway`);
      }
      this.note(`${label}: execute`);
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
      this.note(`${label}: result read +${dt()} (${/@@done\b/.test(out) ? 'end marker seen' : 'NO end marker'})`);
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

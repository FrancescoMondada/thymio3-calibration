import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { RealRobot, DemoBackend } from './robot.js';

const RobotCtx = createContext(null);
export const useRobot = () => useContext(RobotCtx);

const STORED_KEYS = ['straight', 'distance', 'color', 'gyroOffsets', 'gyroScale', 'ground'];

export function RobotProvider({ children }) {
  // "?demo" in the URL starts the simulated robot straight away (used by the live demo link).
  const [mode, setMode] = useState(() => (new URLSearchParams(window.location.search).has('demo') ? 'demo' : 'robot')); // 'robot' | 'demo'
  const [conn, setConn] = useState({ status: 'disconnected' });
  const [tel, setTel] = useState({ fresh: false, ground: {}, reflected: {}, ambient: {}, colorRaw: {}, hsv: {}, gyro: {}, buttons: {} });
  const [stored, setStored] = useState(null);          // what the robot reported last
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [surface, setSurfaceState] = useState('white');
  const [log, setLog] = useState([]);                 // communication log (real robot only)
  const backend = useRef(null);
  const pendingConnect = useRef(false);            // connect as soon as the real backend is up (from the demo)
  const telTimer = useRef(0);
  const pendingTel = useRef(null);

  // Telemetry arrives much faster than the UI needs: render at ~10 Hz.
  const emit = useCallback((kind, value) => {
    if (kind === 'log') { setLog((l) => [...l.slice(-399), value]); return; }
    if (kind === 'conn') setConn((c) => ({ ...c, ...value, error: value.error || '' }));
    if (kind === 'tel') {
      pendingTel.current = value;
      if (!telTimer.current) {
        telTimer.current = window.setTimeout(() => {
          telTimer.current = 0;
          if (pendingTel.current) setTel(pendingTel.current);
        }, 100);
      }
    }
  }, []);

  useEffect(() => {
    const b = mode === 'demo' ? new DemoBackend(emit) : new RealRobot(emit);
    backend.current = b;
    b.start();
    if (mode === 'demo') b.setSurface(surface);
    // Deferred so a React StrictMode re-run of this effect doesn't connect twice.
    const autoConnect = mode === 'robot' && pendingConnect.current
      ? window.setTimeout(() => { pendingConnect.current = false; b.connect().catch(() => { /* reported through conn */ }); }, 0)
      : 0;
    return () => {
      window.clearTimeout(autoConnect);
      b.stop();
      window.clearTimeout(telTimer.current);
      telTimer.current = 0;
      backend.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, emit]);

  const merge = useCallback((res) => {
    setStored((prev) => {
      const next = { ...(prev || {}) };
      for (const k of STORED_KEYS) if (res && res[k] !== undefined) next[k] = res[k];
      if (res && 'errors' in res) next.readErrors = res.errors;       // settings this firmware could not read
      else if (res && Object.keys(res).some((k) => STORED_KEYS.includes(k))) delete next.readErrors;
      return next;
    });
  }, []);

  // Run one robot operation. Resolves with the result, or null after showing the error.
  const run = useCallback(async (name, args) => {
    if (!backend.current) return null;
    setBusy(true);
    setError('');
    try {
      const res = await backend.current.op(name, args);
      merge(res);
      return res || {};
    } catch (err) {
      setError(String(err?.message || err));
      return null;
    } finally {
      setBusy(false);
    }
  }, [merge]);

  const connect = useCallback(async () => {
    try { await backend.current?.connect(); } catch { /* reported through conn */ }
  }, []);
  const disconnect = useCallback(async () => {
    try { await backend.current?.disconnect(); } catch { /* ignore */ }
    setStored(null);
  }, []);

  const enterDemo = useCallback(() => { setStored(null); setError(''); setConn({ status: 'disconnected' }); setMode('demo'); }, []);
  const leaveDemo = useCallback(() => {
    setStored(null); setError(''); setConn({ status: 'disconnected' }); setMode('robot');
    try { // "?demo" must not bring the demo back on reload
      const url = new URL(window.location.href);
      url.searchParams.delete('demo');
      window.history.replaceState(null, '', url);
    } catch { /* ignore */ }
  }, []);
  // From the demo: switch to the real robot and open the Bluetooth chooser right away.
  const connectFromDemo = useCallback(() => { pendingConnect.current = true; leaveDemo(); }, [leaveDemo]);
  const setSurface = useCallback((s) => { setSurfaceState(s); backend.current?.setSurface?.(s); }, []);
  const emergencyStop = useCallback(() => backend.current?.emergencyStop?.(), []);

  const ready = conn.status === 'connected';
  // Read everything the robot stores as soon as we are connected.
  useEffect(() => {
    if (ready) run('readAll');
  }, [ready, run]);

  const value = useMemo(() => ({
    mode, conn, tel, stored, busy, error, surface, ready, log, clearLog: () => setLog([]),
    run, connect, disconnect, enterDemo, leaveDemo, connectFromDemo, setSurface, emergencyStop,
    clearError: () => setError(''),
    refresh: () => run('readAll'),
  }), [mode, conn, tel, stored, busy, error, surface, ready, log, run, connect, disconnect, enterDemo, leaveDemo, connectFromDemo, setSurface, emergencyStop]);

  return <RobotCtx.Provider value={value}>{children}</RobotCtx.Provider>;
}

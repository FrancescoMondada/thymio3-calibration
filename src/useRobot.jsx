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
  const backend = useRef(null);
  const telTimer = useRef(0);
  const pendingTel = useRef(null);

  // Telemetry arrives much faster than the UI needs: render at ~10 Hz.
  const emit = useCallback((kind, value) => {
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
    return () => {
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
  const leaveDemo = useCallback(() => { setStored(null); setError(''); setConn({ status: 'disconnected' }); setMode('robot'); }, []);
  const setSurface = useCallback((s) => { setSurfaceState(s); backend.current?.setSurface?.(s); }, []);
  const emergencyStop = useCallback(() => backend.current?.emergencyStop?.(), []);

  const ready = conn.status === 'connected';
  // Read everything the robot stores as soon as we are connected.
  useEffect(() => {
    if (ready) run('readAll');
  }, [ready, run]);

  const value = useMemo(() => ({
    mode, conn, tel, stored, busy, error, surface, ready,
    run, connect, disconnect, enterDemo, leaveDemo, setSurface, emergencyStop,
    clearError: () => setError(''),
    refresh: () => run('readAll'),
  }), [mode, conn, tel, stored, busy, error, surface, ready, run, connect, disconnect, enterDemo, leaveDemo, setSurface, emergencyStop]);

  return <RobotCtx.Provider value={value}>{children}</RobotCtx.Provider>;
}

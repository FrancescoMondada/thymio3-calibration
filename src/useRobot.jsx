import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { RealRobot } from './robot.js';

const RobotCtx = createContext(null);
export const useRobot = () => useContext(RobotCtx);

const STORED_KEYS = ['straight', 'distance', 'color', 'gyroOffsets', 'gyroScale', 'ground', 'battery'];

export function RobotProvider({ children }) {
  const [conn, setConn] = useState({ status: 'disconnected' });
  const [tel, setTel] = useState({ fresh: false, ground: {}, reflected: {}, ambient: {}, colorRaw: {}, gyro: {}, buttons: {} });
  const [stored, setStored] = useState(null);          // what the robot reported last
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [log, setLog] = useState([]);                 // communication log
  const backend = useRef(null);
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
    const b = new RealRobot(emit);
    backend.current = b;
    b.start();
    return () => {
      b.stop();
      window.clearTimeout(telTimer.current);
      telTimer.current = 0;
      backend.current = null;
    };
  }, [emit]);

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

  const emergencyStop = useCallback(() => backend.current?.emergencyStop?.(), []);
  const setLive = useCallback((kind) => backend.current?.setLive?.(kind), []);
  const retryLive = useCallback(() => backend.current?.retryLive?.(), []);

  const ready = conn.status === 'connected';
  // Read everything the robot stores as soon as we are connected.
  useEffect(() => {
    if (ready) run('readAll');
  }, [ready, run]);

  const value = useMemo(() => ({
    conn, tel, stored, busy, error, ready, log, clearLog: () => setLog([]),
    run, connect, disconnect, emergencyStop, setLive, retryLive,
    clearError: () => setError(''),
    refresh: () => run('readAll'),
  }), [conn, tel, stored, busy, error, ready, log, run, connect, disconnect, emergencyStop, setLive, retryLive]);

  return <RobotCtx.Provider value={value}>{children}</RobotCtx.Provider>;
}

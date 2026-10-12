import React from 'react';
import { useRobot } from './useRobot.jsx';
import { useT } from './i18n.js';

export function Btn({ children, onClick, kind = 'default', disabled, title, wide, big, needsRobot = true }) {
  const { ready, busy } = useRobot();
  const off = disabled || busy || (needsRobot && !ready);
  return (
    <button type="button" className={`btn btn-${kind}${wide ? ' btn-wide' : ''}${big ? ' btn-big' : ''}`} onClick={onClick} disabled={off} title={title}>
      {children}
    </button>
  );
}

// Horizontal meter, value in [0, max].
export function Meter({ label, value, max = 1023, tone = 'accent', suffix }) {
  const v = Number.isFinite(value) ? value : 0;
  const pct = Math.max(0, Math.min(100, (v / max) * 100));
  return (
    <div className="meter">
      <div className="meter-head"><span>{label}</span><b>{Number.isFinite(value) ? Math.round(v) : '–'}{suffix}</b></div>
      <div className="meter-track"><div className={`meter-fill tone-${tone}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export function Stat({ label, children, tone }) {
  return (
    <div className={`stat${tone ? ` stat-${tone}` : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{children}</div>
    </div>
  );
}

export function Notice({ tone = 'info', children }) {
  return <div className={`notice notice-${tone}`} role={tone === 'danger' ? 'alert' : 'note'}>{children}</div>;
}

export function Swatch({ css, label }) {
  return (
    <div className="swatch">
      <div className="swatch-chip" style={{ background: css || 'transparent' }} />
      <span>{label}</span>
    </div>
  );
}

export function NeedRobot() {
  const { ready } = useRobot();
  const t = useT();
  if (ready) return null;
  return <Notice tone="warn">{t('common.needRobot')}</Notice>;
}

export const fmt = (v) => (v === undefined || v === null ? '–' : Array.isArray(v) ? v.join(' / ') : String(v));

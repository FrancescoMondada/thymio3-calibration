import React, { useEffect, useMemo, useState } from 'react';
import { I18nContext, LANGS, initialLang, makeT, useT } from './i18n.js';
import { RobotProvider, useRobot } from './useRobot.jsx';
import { supportsBluetooth } from './robot.js';
import { SURFACES } from './demo.js';
import { WIZARDS } from './registry.js';
import { UiModeProvider, useUiMode } from './ui-mode.jsx';
import { Icon } from './art.jsx';
import { Notice, fmt } from './ui.jsx';
import { FACTORY } from './python.js';

const same = (a, b) => Array.isArray(a) && a.length === b.length && a.every((v, k) => v === b[k]);

function Header() {
  const t = useT();
  const r = useRobot();
  const { conn, mode, busy } = r;
  const expert = useUiMode().uiMode === 'expert';
  const status = conn.status;
  const label = { connected: t('conn.connected'), connecting: t('conn.connecting'), reconnect: t('conn.reconnect'), disconnected: t('conn.disconnected') }[status] || t('conn.disconnected');
  return (
    <div className="status">
      <span className={`pill pill-${status}`}><i />{mode === 'demo' ? `${t('mode.demo')} · ` : ''}{label}</span>
      {expert && status === 'connected' && conn.device && <span className="chip">{conn.device}</span>}
      {expert && status === 'connected' && mode === 'robot' && (
        <span className="chip" title={conn.firmware ? `ESP32 ${conn.firmware.esp32_ver} · STM32 ${conn.firmware.stm32_ver}` : undefined}>
          {t('conn.firmware')} {conn.firmware?.esp32_ver || '…'}
        </span>
      )}
      {/* Fixed width + tabular digits: the readout changes all the time and must not move the bar. */}
      {expert && status === 'connected' && (() => {
        // live value when the "others" stream runs, otherwise the one read with the settings
        const v = r.tel.battery > 0 ? r.tel.battery : (r.stored?.battery > 0 ? r.stored.battery / 1000 : 0);
        return <span className="chip chip-battery">{t('conn.battery')} {v > 0 ? v.toFixed(2) : '–.––'} V</span>;
      })()}
      {busy && <button type="button" className="btn btn-danger" onClick={r.emergencyStop}>{t('stop')}</button>}
      {mode === 'robot' && status !== 'connected' && (
        <button type="button" className="btn btn-primary" onClick={r.connect} disabled={status === 'connecting' || !supportsBluetooth()}>{t('conn.connect')}</button>
      )}
      {mode === 'robot' && status === 'connected' && <button type="button" className="btn btn-ghost" onClick={r.disconnect}>{t('conn.disconnect')}</button>}
      {expert && mode === 'robot' && status !== 'connected' && <button type="button" className="btn btn-ghost" onClick={r.enterDemo}>{t('mode.demo')}</button>}
      {mode === 'demo' && (
        <>
          <button type="button" className="btn btn-primary" onClick={r.connectFromDemo} disabled={!supportsBluetooth()}>{t('conn.connect')}</button>
          <button type="button" className="btn btn-ghost" onClick={r.leaveDemo}>{t('mode.leaveDemo')}</button>
        </>
      )}
    </div>
  );
}

// Normal (default) / Expert switch.
function ModeSwitch() {
  const t = useT();
  const { uiMode, setUiMode } = useUiMode();
  return (
    <div className="langs ui-switch" role="group" aria-label={t('mode.ui')}>
      {['normal', 'expert'].map((m) => (
        <button key={m} type="button" className={m === uiMode ? 'on' : ''} aria-pressed={m === uiMode} onClick={() => setUiMode(m)}>{t(`mode.${m}`)}</button>
      ))}
    </div>
  );
}

function DemoBar() {
  const t = useT();
  const { mode, surface, setSurface } = useRobot();
  if (mode !== 'demo') return null;
  return (
    <div className="demobar">
      <span>{t('mode.demoBanner')}</span>
      <label>{t('mode.surface')}
        <select value={surface} onChange={(e) => setSurface(e.target.value)}>
          {Object.keys(SURFACES).map((k) => <option key={k} value={k}>{t(`surface.${k}`)}</option>)}
        </select>
      </label>
    </div>
  );
}

// Web Bluetooth only exists in Chromium browsers (Chrome, Edge). Say it loudly, on every page.
function BrowserWarning() {
  const t = useT();
  const { mode, enterDemo } = useRobot();
  if (supportsBluetooth()) return null;
  return (
    <div className="browser-warning" role="alert">
      <span className="bw-icon" aria-hidden="true">!</span>
      <div>
        <h2>{t('conn.browserTitle')}</h2>
        <p>{t('conn.browserText')}</p>
        <div className="bw-links">
          <a href="https://www.google.com/chrome/" target="_blank" rel="noreferrer">{t('conn.browserGet')}</a>
          <a href="https://www.microsoft.com/edge" target="_blank" rel="noreferrer">{t('conn.browserGetEdge')}</a>
          {mode !== 'demo' && <button type="button" className="link-btn" onClick={enterDemo}>{t('conn.browserDemo')}</button>}
        </div>
      </div>
    </div>
  );
}

function Stored() {
  const t = useT();
  const { stored, ready, refresh, busy } = useRobot();
  const rows = [
    ['straight', 'val.straight', FACTORY.motors],
    ['distance', 'val.distance', FACTORY.distance],
    ['gyroOffsets', 'val.gyroOffsets', FACTORY.gyroOffsets],
    ['gyroScale', 'val.gyroScale', FACTORY.gyroScale],
    ['ground', 'val.ground', null],
    ['color', 'val.color', null],
  ];
  const groundFactory = [FACTORY.groundBlack, FACTORY.groundBlack, FACTORY.groundWhite, FACTORY.groundWhite];
  const show = (key, v) => {
    if (v === undefined) return t('home.notRead');
    if (key === 'ground') return `${v[0]} · ${v[1]}  /  ${v[2]} · ${v[3]}`;
    if (key === 'color') return `${v.slice(0, 3).join(' · ')}  /  ${v.slice(3).join(' · ')}`;
    return fmt(v);
  };
  return (
    <section className="card stored">
      <div className="card-head">
        <h3>{t('home.stored')}</h3>
        <button type="button" className="btn btn-ghost" onClick={refresh} disabled={!ready || busy}>{t('home.refresh')}</button>
      </div>
      {stored?.readErrors && (
        <Notice tone="warn">{t('home.readErrors')} {Object.keys(stored.readErrors).join(', ')}</Notice>
      )}
      <dl>
        {rows.map(([key, label, factory]) => {
          const v = stored?.[key];
          const f = key === 'ground' ? groundFactory : factory;
          const isFactory = v !== undefined && f && (Array.isArray(f) ? same(v, f) : v === f);
          return (
            <div className="kv" key={key}>
              <dt>{t(label)}</dt>
              <dd>{show(key, v)}{v !== undefined && f && <span className={`tag ${isFactory ? '' : 'tag-changed'}`}>{isFactory ? t('home.factory') : t('home.changed')}</span>}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

// Home of the normal version: connect, then pick what to adjust. No values, no jargon.
function NormalHome({ onOpen }) {
  const t = useT();
  const { ready, conn, connect, mode, enterDemo } = useRobot();
  return (
    <>
      <h2 className="n-home-title">{t('n.homeTitle')}</h2>
      {!ready && mode === 'robot' && (
        <section className="card n-connect">
          <div>
            <h3>{t('n.connectTitle')}</h3>
            <p>{t('n.connectText')}</p>
          </div>
          <button type="button" className="btn btn-primary btn-big" onClick={connect} disabled={conn.status === 'connecting' || !supportsBluetooth()}>{t('n.connect')}</button>
        </section>
      )}
      {conn.error && <Notice tone="danger">{conn.error}</Notice>}
      <div className="cards cards-normal">
        {WIZARDS.map((w) => (
          <button key={w.id} type="button" className="card card-wiz" onClick={() => onOpen(w.id)}>
            <span className="card-icon"><Icon name={w.icon} /></span>
            <span className="card-title">{t(w.nTitleKey)}</span>
            <span className="card-desc">{t(w.nDescKey)}</span>
          </button>
        ))}
      </div>
      {!ready && mode === 'robot' && <p className="n-try"><button type="button" className="link-btn" onClick={enterDemo}>{t('n.try')}</button></p>}
    </>
  );
}

function Home({ onOpen }) {
  const t = useT();
  const { ready, conn } = useRobot();
  return (
    <>
      <p className="lead">{t('home.intro')}</p>
      {!ready && supportsBluetooth() && <Notice tone="warn">{t('home.connectFirst')}</Notice>}
      {conn.error && <Notice tone="danger">{conn.error}</Notice>}
      <div className="cards">
        {WIZARDS.map((w, k) => (
          <button key={w.id} type="button" className="card card-wiz" onClick={() => onOpen(w.id)}>
            <span className="card-num">{k + 1}</span>
            <span className="card-icon"><Icon name={w.icon} /></span>
            <span className="card-title">{t(w.titleKey)}</span>
            <span className="card-desc">{t(w.descKey)}</span>
            <span className="card-go">{t('home.start')} →</span>
          </button>
        ))}
      </div>
      <p className="muted small">{t('home.order')}</p>
      <Stored />
    </>
  );
}

// Step-by-step trace of the Bluetooth exchange: to paste in a bug report when something fails.
function CommLog() {
  const t = useT();
  const { log, clearLog, mode, run, ready, busy } = useRobot();
  const [copied, setCopied] = useState(false);
  if (mode === 'demo') return null;
  const text = log.join('\n');
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };
  return (
    <details className="commlog">
      <summary>{t('log.title')}{log.length ? ` (${log.length})` : ''}</summary>
      <div className="row">
        <button type="button" className="btn btn-ghost" onClick={copy} disabled={!log.length}>{copied ? t('log.copied') : t('log.copy')}</button>
        <button type="button" className="btn btn-ghost" onClick={clearLog} disabled={!log.length}>{t('log.clear')}</button>
        <button type="button" className="btn btn-primary" onClick={() => run('ping')} disabled={!ready || busy} title={t('log.pingHint')}>{t('log.ping')}</button>
      </div>
      <pre>{text || t('log.empty')}</pre>
    </details>
  );
}

function Shell() {
  const t = useT();
  const { error, clearError, busy, conn, log, retryLive } = useRobot();
  const { uiMode } = useUiMode();
  const expert = uiMode === 'expert';
  const [view, setView] = useState('home');
  useEffect(() => { setView('home'); }, [uiMode]);       // switching version goes back to the home page
  const wiz = WIZARDS.find((w) => w.id === view);
  const Wiz = wiz ? (expert ? wiz.Comp : wiz.NComp) : null;
  return (
    <div className="shell">
      <BrowserWarning />
      <DemoBar />
      <main>
        {busy && <div className="busy" role="status"><span className="spinner" />{conn.initializing ? t('busy.init') : t('busy')}</div>}
        {expert && conn.liveBlocked && (
          <Notice tone="warn">
            {t('live.blocked')}{' '}
            <button type="button" className="link-btn" onClick={retryLive}>{t('live.retry')}</button>
          </Notice>
        )}
        {error && (
          <Notice tone="danger">
            <b>{t('error.title')}</b> — {error}{' '}
            {expert && <span className="muted small">{t('error.seeLog')}</span>}{' '}
            <button type="button" className="link-btn" onClick={clearError}>{t('error.dismiss')}</button>
            {expert && log.length > 0 && <pre className="errlog">{log.slice(-10).join('\n')}</pre>}
          </Notice>
        )}
        {Wiz ? <Wiz key={`${wiz.id}-${uiMode}`} onExit={() => setView('home')} /> : (expert ? <Home onOpen={setView} /> : <NormalHome onOpen={setView} />)}
      </main>
      {expert && <CommLog />}
      <footer className="muted small">{t('footer.credit')}</footer>
    </div>
  );
}

export default function App() {
  const [lang, setLang] = useState(initialLang);
  const t = useMemo(() => makeT(lang), [lang]);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = t('app.title');
    try { localStorage.setItem('t3cal.lang', lang); } catch { /* storage unavailable */ }
  }, [lang, t]);

  return (
    <I18nContext.Provider value={{ lang, t }}>
      <UiModeProvider>
      <RobotProvider>
        <header className="top">
          <div className="brand">
            <div className="logo" aria-hidden="true" />
            <div>
              <h1>{t('app.title')}</h1>
              <p className="muted small">{t('app.subtitle')}</p>
            </div>
          </div>
          <Header />
          <ModeSwitch />
          <div className="langs" role="group" aria-label="Language">
            {LANGS.map((l) => (
              <button key={l.id} type="button" className={l.id === lang ? 'on' : ''} onClick={() => setLang(l.id)}>{l.label}</button>
            ))}
          </div>
        </header>
        <Shell />
      </RobotProvider>
      </UiModeProvider>
    </I18nContext.Provider>
  );
}

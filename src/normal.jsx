// "Normal" version of the wizards: for non-technical users.
// Few steps, big buttons, plain questions instead of numbers: no values shown, no factory options, no
// intermediate measurements or live readings. Values are saved automatically at the end of each flow.
// The same robot operations as the expert version are used (src/python.js), so what ends up stored in
// the robot is identical.
import React, { useRef, useState } from 'react';
import { useT } from './i18n.js';
import { useRobot } from './useRobot.jsx';
import { Btn, Notice } from './ui.jsx';
import { Icon, StraightArt, DistanceArt, ColorArt, GroundArt, GyroTurnArt } from './art.jsx';
import { useSeed, useRestoreOnLeave } from './wizards.jsx';
import { MOTOR_BASE, MOTOR_CORR_MAX, DIST_STEP } from './python.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---- shared pieces -------------------------------------------------------------------------------

// Asks to connect the robot when it is not (the step buttons are disabled until then).
function NeedConnect() {
  const t = useT();
  const { ready, mode, connect, conn } = useRobot();
  if (ready) return null;
  return (
    <Notice tone="warn">
      {t('n.needConnect')}{' '}
      {mode === 'robot' && <button type="button" className="link-btn" onClick={connect} disabled={conn.status === 'connecting'}>{t('conn.connect')}</button>}
    </Notice>
  );
}

function Working({ children }) {
  const { busy } = useRobot();
  return busy && children ? <p className="n-working"><span className="spinner" />{children}</p> : null;
}

function DoneView({ icon, title, onExit }) {
  const t = useT();
  return (
    <section className="wizard normal">
      <div className="n-done">
        <div className="n-done-check" aria-hidden="true">✓</div>
        <span className="wizard-icon"><Icon name={icon} /></span>
        <h2>{t('n.doneTitle')}</h2>
        <p>{t('n.doneText', { what: title })}</p>
        <Btn kind="primary" big needsRobot={false} onClick={onExit}>{t('n.backHome')}</Btn>
      </div>
    </section>
  );
}

// steps[i](ctx) -> { art, title, text, body } ; ctx = { next, back, goTo, finish, index }
function NormalShell({ icon, title, steps, onExit }) {
  const t = useT();
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  if (finished) return <DoneView icon={icon} title={title} onExit={onExit} />;
  const ctx = {
    index,
    next: () => setIndex((i) => Math.min(i + 1, steps.length - 1)),
    back: () => setIndex((i) => Math.max(i - 1, 0)),
    goTo: (i) => setIndex(i),
    finish: () => setFinished(true),
  };
  const step = steps[index](ctx);
  return (
    <section className="wizard normal" aria-labelledby="wiz-title">
      <div className="n-top">
        <button type="button" className="link-btn" onClick={onExit}>{t('nav.home')}</button>
        <h2 id="wiz-title"><span className="wizard-icon"><Icon name={icon} /></span>{title}</h2>
        <span className="muted small">{t('n.step', { n: index + 1, total: steps.length })}</span>
      </div>
      <div className="wizard-body">
        <div className="wizard-art">{step.art}</div>
        <div className="wizard-panel n-panel">
          <h3>{step.title}</h3>
          <p>{step.text}</p>
          <div className="controls">{step.body}</div>
          {index > 0 && <button type="button" className="link-btn n-back" onClick={ctx.back}>{t('n.back')}</button>}
        </div>
      </div>
    </section>
  );
}

const readyButton = (t, c) => <Btn kind="primary" big needsRobot={false} onClick={c.next}>{t('n.ready')}</Btn>;

// =============================================================================
// Straight line: "did it go straight?" with a step that halves each time the answer flips
// =============================================================================
export function NStraight({ onExit }) {
  const t = useT();
  const { run, stored, mode } = useRobot();
  const [corr, setCorr] = useState(0);
  const [phase, setPhase] = useState('ready');           // 'ready' (to launch) | 'ran' (waiting for the answer)
  const [tries, setTries] = useState(0);
  const [drift, setDrift] = useState(null);              // demo only
  const [dirty, setDirty] = useState(false);
  const flash = useRef(null);                            // what the robot had saved when the wizard opened
  if (!flash.current && stored?.straight) flash.current = [...stored.straight];
  const size = useRef(4);                                // correction step: 4, then 2, then 1
  const last = useRef(0);
  const touch = useSeed(stored?.straight, (s) => setCorr(clamp(s[0] - MOTOR_BASE, -MOTOR_CORR_MAX, MOTOR_CORR_MAX)));
  useRestoreOnLeave(dirty, (runOp) => runOp('straightRestore', { values: flash.current }));

  const launch = async () => {
    setDirty(true);
    const res = await run('straightRun', { corr, dir: 1 });
    if (res) { setPhase('ran'); setTries((n) => n + 1); setDrift(res.demo?.driftCm ?? null); }
  };
  // dir: +1 = drifted left (more on the left motor), -1 = drifted right, 0 = straight
  const answer = async (dir, c) => {
    if (dir === 0) {
      const r = await run('straightSave', { corr });
      if (r) { flash.current = r.straight; setDirty(false); c.finish(); }
      return;
    }
    if (last.current && last.current !== dir) size.current = Math.max(1, Math.round(size.current / 2));
    last.current = dir;
    touch();
    setCorr((v) => clamp(v + dir * size.current, -MOTOR_CORR_MAX, MOTOR_CORR_MAX));
    setPhase('ready');
  };

  const steps = [
    (c) => ({ art: <StraightArt label={t('n.straight.s1.title')} />, title: t('n.straight.s1.title'), text: t('n.straight.s1.text'), body: readyButton(t, c) }),
    (c) => ({
      art: <StraightArt label={t('n.straight.s2.title')} />,
      title: t('n.straight.s2.title'),
      text: phase === 'ran' ? t('n.straight.ask') : tries ? t('n.straight.retry') : t('n.straight.launchText'),
      body: (
        <>
          <NeedConnect />
          {phase === 'ready' ? (
            <Btn kind="primary" big onClick={launch}>{tries ? t('n.straight.again') : t('n.straight.launch')}</Btn>
          ) : (
            <div className="choices">
              <Btn kind="choice" big onClick={() => answer(+1, c)}>{t('n.straight.left')}</Btn>
              <Btn kind="choice" big onClick={() => answer(-1, c)}>{t('n.straight.right')}</Btn>
              <Btn kind="ok" big onClick={() => answer(0, c)}>{t('n.straight.ok')}</Btn>
            </div>
          )}
          <Working>{t('n.working')}</Working>
          {mode === 'demo' && drift !== null && phase === 'ran' && (
            <Notice tone="demo">{Math.abs(drift) < 0.5 ? t('straight.driftNone') : drift > 0 ? t('straight.driftLeft', { cm: drift.toFixed(1) }) : t('straight.driftRight', { cm: Math.abs(drift).toFixed(1) })}</Notice>
          )}
        </>
      ),
    }),
  ];
  return <NormalShell icon="straight" title={t('n.straight.title')} steps={steps} onExit={onExit} />;
}

// =============================================================================
// Distance: forward then backward, "too short / too long / spot on"
// =============================================================================
export function NDistance({ onExit }) {
  const t = useT();
  const { run, stored, mode } = useRobot();
  const [fw, setFw] = useState(9000000);
  const [bw, setBw] = useState(9000000);
  const [phase, setPhase] = useState('ready');
  const [tries, setTries] = useState({ fw: 0, bw: 0 });
  const [cm, setCm] = useState(null);                    // demo only
  const size = useRef({ fw: 4 * DIST_STEP, bw: 4 * DIST_STEP });
  const last = useRef({ fw: 0, bw: 0 });
  const touch = useSeed(stored?.distance, (d) => { setFw(d[0]); setBw(d[1]); });

  const launch = async (key) => {
    const res = await run('distanceRun', { ticks: key === 'fw' ? fw : bw, dir: key === 'fw' ? 1 : -1 });
    if (res) { setPhase('ran'); setTries((n) => ({ ...n, [key]: n[key] + 1 })); setCm(res.demo?.cm ?? null); }
  };
  // sign: +1 = stopped short (lengthen), -1 = went too far (shorten), 0 = right on the line
  const answer = async (key, sign, c) => {
    if (sign === 0) {
      if (key === 'fw') { setPhase('ready'); c.next(); return; }
      const r = await run('distanceSave', { fw, bw });
      if (r) c.finish();
      return;
    }
    if (last.current[key] && last.current[key] !== sign) size.current[key] = Math.max(DIST_STEP, Math.round(size.current[key] / 2));
    last.current[key] = sign;
    touch();
    (key === 'fw' ? setFw : setBw)((v) => Math.max(DIST_STEP, v + sign * size.current[key]));
    setPhase('ready');
  };

  const move = (key) => (c) => ({
    art: <DistanceArt label={t(`n.distance.${key}.title`)} back={key === 'bw'} />,
    title: t(`n.distance.${key}.title`),
    text: phase === 'ran' ? t(`n.distance.${key}.ask`) : tries[key] ? t('n.distance.retry') : t(`n.distance.${key}.text`),
    body: (
      <>
        <NeedConnect />
        {phase === 'ready' ? (
          <Btn kind="primary" big onClick={() => launch(key)}>{tries[key] ? t('n.distance.again') : t('n.distance.launch')}</Btn>
        ) : (
          <div className="choices">
            <Btn kind="choice" big onClick={() => answer(key, +1, c)}>{t(`n.distance.${key}.short`)}</Btn>
            <Btn kind="choice" big onClick={() => answer(key, -1, c)}>{t(`n.distance.${key}.long`)}</Btn>
            <Btn kind="ok" big onClick={() => answer(key, 0, c)}>{t(`n.distance.${key}.ok`)}</Btn>
          </div>
        )}
        <Working>{t('n.working')}</Working>
        {mode === 'demo' && cm !== null && phase === 'ran' && <Notice tone="demo">{t('distance.travelled', { cm: cm.toFixed(1) })}</Notice>}
      </>
    ),
  });

  const steps = [
    (c) => ({ art: <DistanceArt label={t('n.distance.s1.title')} />, title: t('n.distance.s1.title'), text: t('n.distance.s1.text'), body: readyButton(t, c) }),
    move('fw'),
    move('bw'),
  ];
  return <NormalShell icon="distance" title={t('n.distance.title')} steps={steps} onExit={onExit} />;
}

// =============================================================================
// Gyroscope: one "Start" (still measurement + full turn, automatic), then "is it aligned?"
// =============================================================================
export function NGyro({ onExit }) {
  const t = useT();
  const { run, mode } = useRobot();
  const [status, setStatus] = useState('');              // '' | 'still' | 'turning'
  const [offPending, setOffPending] = useState(false);
  const [errDeg, setErrDeg] = useState(null);            // demo only
  useRestoreOnLeave(offPending, (runOp) => runOp('gyroOffsetsCancel'));

  const start = async (c) => {
    setStatus('still');
    if (!(await run('gyroOffsetsMeasure'))) { setOffPending(true); setStatus(''); return; }
    setOffPending(true);
    if (!(await run('gyroOffsetsSave'))) { setStatus(''); return; }
    setOffPending(false);
    setStatus('turning');
    const r = await run('gyroTurn', { measure: true });
    setStatus('');
    if (r) { setErrDeg(r.demo ? r.demo.errDeg : null); c.next(); }
  };
  const nudge = async (dir) => { const r = await run('gyroNudge', { dir }); if (r) setErrDeg(r.demo ? r.demo.errDeg : null); };
  const aligned = async (c) => { if (await run('gyroScaleSave')) c.finish(); };
  const shownErr = mode === 'demo' && errDeg !== null ? errDeg : 14;

  const steps = [
    (c) => ({
      art: <GyroTurnArt label={t('n.gyro.s1.title')} stage="start" />,
      title: t('n.gyro.s1.title'),
      text: status === 'still' ? t('n.gyro.still') : status === 'turning' ? t('n.gyro.turning') : t('n.gyro.s1.text'),
      body: (
        <>
          <NeedConnect />
          <Btn kind="primary" big onClick={() => start(c)}>{t('n.gyro.start')}</Btn>
          <Working>{status === 'still' ? t('n.gyro.still') : t('n.gyro.turning')}</Working>
        </>
      ),
    }),
    (c) => ({
      art: <GyroTurnArt label={t('n.gyro.s2.title')} stage="after" error={shownErr} />,
      title: t('n.gyro.s2.title'),
      text: t('n.gyro.s2.text'),
      body: (
        <>
          <div className="choices">
            <Btn kind="choice" big onClick={() => nudge(-1)}>{t('gyro.nudgeLeft')}</Btn>
            <Btn kind="choice" big onClick={() => nudge(1)}>{t('gyro.nudgeRight')}</Btn>
            <Btn kind="ok" big onClick={() => aligned(c)}>{t('n.gyro.ok')}</Btn>
          </div>
          <Working>{t('n.working')}</Working>
          {mode === 'demo' && errDeg !== null && (
            <Notice tone="demo">{Math.abs(errDeg) < 0.6 ? t('gyro.demoAligned') : t('gyro.demoErr', { deg: Math.abs(errDeg).toFixed(1) })}</Notice>
          )}
        </>
      ),
    }),
  ];
  return <NormalShell icon="gyro" title={t('n.gyro.title')} steps={steps} onExit={onExit} />;
}

// =============================================================================
// Ground sensors and colour sensor: "on white", then "on black"
// =============================================================================
export function NGround({ onExit }) {
  const t = useT();
  const { run, stored } = useRobot();
  const [pending, setPending] = useState(false);
  const [retry, setRetry] = useState(false);
  const snapshot = useRef(null);
  useRestoreOnLeave(pending, (runOp) => { if (snapshot.current) runOp('groundApply', { values: snapshot.current }); });

  const measure = async (kind, c) => {
    if (!pending && stored?.ground) snapshot.current = [...stored.ground];
    const r = await run('groundCapture', { kind });
    if (!r) return;
    setPending(true);
    if (kind === 'white') { setRetry(false); c.next(); return; }
    const g = r.ground;
    const poor = !g || g[2] - g[0] < 40 || g[3] - g[1] < 40;     // white must clearly exceed black
    if (poor) {
      if (snapshot.current) await run('groundApply', { values: snapshot.current });
      setPending(false); setRetry(true); c.goTo(0);
      return;
    }
    if (await run('groundSave')) { setPending(false); c.finish(); }
  };

  const steps = ['white', 'black'].map((kind) => (c) => ({
    art: <GroundArt label={t(`n.ground.${kind}.title`)} kind={kind} />,
    title: t(`n.ground.${kind}.title`),
    text: t(`n.ground.${kind}.text`),
    body: (
      <>
        <NeedConnect />
        {retry && kind === 'white' && <Notice tone="warn">{t('n.ground.retry')}</Notice>}
        <Btn kind="primary" big onClick={() => measure(kind, c)}>{t(`n.ground.${kind}.button`)}</Btn>
        <Working>{t('n.working')}</Working>
      </>
    ),
  }));
  return <NormalShell icon="ground" title={t('n.ground.title')} steps={steps} onExit={onExit} />;
}

export function NColor({ onExit }) {
  const t = useT();
  const { run } = useRobot();
  const measure = async (kind, c) => {
    if (!(await run('colorCapture', { kind }))) return;      // the robot stores it immediately
    if (kind === 'white') c.next(); else c.finish();
  };
  const steps = ['white', 'black'].map((kind) => (c) => ({
    art: <ColorArt label={t(`n.color.${kind}.title`)} kind={kind} />,
    title: t(`n.color.${kind}.title`),
    text: t(`n.color.${kind}.text`),
    body: (
      <>
        <NeedConnect />
        <Btn kind="primary" big onClick={() => measure(kind, c)}>{t(`n.color.${kind}.button`)}</Btn>
        <Working>{t('n.working')}</Working>
      </>
    ),
  }));
  return <NormalShell icon="color" title={t('n.color.title')} steps={steps} onExit={onExit} />;
}

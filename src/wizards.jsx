import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { useRobot } from './useRobot.jsx';
import { Btn, Meter, Stat, Notice, Swatch, NeedRobot, fmt } from './ui.jsx';
import { Wizard } from './Wizard.jsx';
import { StraightArt, DistanceArt, ColorArt, GroundArt, GyroStillArt, GyroTurnArt } from './art.jsx';
import { FACTORY, MOTOR_BASE, MOTOR_CORR_MAX, DIST_STEP, TICKS_PER_MS } from './python.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Re-initialise a local value once, when the robot's stored value first shows up.
export function useSeed(value, apply) {
  const done = useRef(false);
  useEffect(() => {
    if (value !== undefined && !done.current) { done.current = true; apply(value); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return () => { done.current = true; };
}

// Trial values are applied to the robot before being saved. If the user leaves the wizard with such
// unsaved values still applied, put back what the robot had (the firmware menu always writes on exit;
// here saving is explicit, so leaving means "cancel").
export function useRestoreOnLeave(dirty, restore) {
  const { ready, run } = useRobot();
  const ref = useRef({ dirty, restore, ready });
  ref.current = { dirty, restore, ready };
  useEffect(() => () => { const c = ref.current; if (c.dirty && c.ready) c.restore(run); }, [run]);
}

function SaveRow({ children }) { return <div className="row">{children}</div>; }

function FactoryButton({ op, onDone }) {
  const t = useT();
  const { run } = useRobot();
  return (
    <Btn kind="ghost" onClick={async () => {
      if (!window.confirm(t('common.factoryConfirm'))) return;
      const res = await run(op);
      if (res) onDone?.(res);
    }}>{t('common.factory')}</Btn>
  );
}

// =============================================================================
// Motors: straight line
// =============================================================================
export function StraightWizard({ onExit }) {
  const t = useT();
  const { run, stored, ready } = useRobot();
  const [corr, setCorr] = useState(0);
  const [saved, setSaved] = useState(false);
  const [warn, setWarn] = useState('');
  const [dirty, setDirty] = useState(false);            // a trial correction is applied but not saved
  const flash = useRef(null);                           // what the robot had saved when the wizard opened
  if (!flash.current && stored?.straight) flash.current = [...stored.straight];
  useRestoreOnLeave(dirty, (runOp) => runOp('straightRestore', { values: flash.current }));
  const touch = useSeed(stored?.straight, (s) => setCorr(clamp(s[0] - MOTOR_BASE, -MOTOR_CORR_MAX, MOTOR_CORR_MAX)));

  const adjust = (d) => { touch(); setSaved(false); setCorr((c) => clamp(c + d, -MOTOR_CORR_MAX, MOTOR_CORR_MAX)); };
  const go = async (dir) => {
    setSaved(false);
    setDirty(true);
    const res = await run('straightRun', { corr, dir });
    if (res?.straight && (res.straight[0] !== MOTOR_BASE + corr || res.straight[1] !== MOTOR_BASE - corr)) {
      setWarn(t('straight.mismatch', { got: res.straight.join(' / ') }));
    } else setWarn('');
  };

  const steps = [
    { title: t('straight.s1.title'), text: t('straight.s1.text'), tip: t('straight.s1.tip'), art: <StraightArt label={t('straight.s1.title')} /> },
    {
      title: t('straight.s2.title'), text: t('straight.s2.text'), art: <StraightArt label={t('straight.s2.title')} />,
      body: (
        <>
          <NeedRobot />
          {ready && stored && !stored.straight && <Notice tone="warn">{t('common.noCurrent')}</Notice>}
          <div className="corr">
            <input
              type="range" className="corr-range" min={-MOTOR_CORR_MAX} max={MOTOR_CORR_MAX} step="1" value={corr}
              aria-label={t('straight.correction')}
              onChange={(e) => { touch(); setSaved(false); setCorr(Number(e.target.value)); }}
            />
            <div className="corr-scale"><span>−{MOTOR_CORR_MAX}</span><span>0</span><span>+{MOTOR_CORR_MAX}</span></div>
          </div>
          <div className="stats">
            <Stat label={t('straight.correction')}>{corr > 0 ? `+${corr}` : corr}</Stat>
            <Stat label={t('straight.leftMotor')}>{MOTOR_BASE + corr}</Stat>
            <Stat label={t('straight.rightMotor')}>{MOTOR_BASE - corr}</Stat>
          </div>
          <div className="row">
            <Btn kind="primary" onClick={() => go(1)}>{t('straight.forward')}</Btn>
            <Btn onClick={() => go(-1)}>{t('straight.backward')}</Btn>
          </div>
          <div className="adjust">
            {/* Left box = the robot drifts to the left (add to the left motor: +), right box = drifts to the right (−). */}
            <div className="adjust-group">
              <span className="adjust-label">{t('straight.toRight')}</span>
              <div className="row"><Btn needsRobot={false} onClick={() => adjust(1)}>+1</Btn><Btn needsRobot={false} onClick={() => adjust(5)}>+5</Btn></div>
            </div>
            <div className="adjust-group">
              <span className="adjust-label">{t('straight.toLeft')}</span>
              <div className="row"><Btn needsRobot={false} onClick={() => adjust(-1)}>−1</Btn><Btn needsRobot={false} onClick={() => adjust(-5)}>−5</Btn></div>
            </div>
          </div>
          <p className="muted small">{t('straight.limit')}</p>
          {warn && <Notice tone="warn">{warn}</Notice>}
        </>
      ),
    },
    {
      title: t('straight.s3.title'), text: t('straight.s3.text'), art: <StraightArt label={t('straight.s3.title')} />,
      body: (
        <>
          <NeedRobot />
          <div className="stats">
            <Stat label={t('straight.correction')}>{corr > 0 ? `+${corr}` : corr}</Stat>
            <Stat label={t('common.stored')}>{fmt(stored?.straight)}</Stat>
          </div>
          <SaveRow>
            <Btn kind="primary" onClick={async () => { const r = await run('straightSave', { corr }); if (r) { flash.current = r.straight; setDirty(false); } setSaved(!!r); }}>{t('common.save')}</Btn>
            <FactoryButton op="straightReset" onDone={(r) => { flash.current = r.straight; setDirty(false); setCorr(0); setSaved(true); }} />
          </SaveRow>
          {saved ? <Notice tone="ok">{t('common.saved')}</Notice> : <p className="muted small">{t('common.leaveRestores')}</p>}
        </>
      ),
    },
  ];
  return <Wizard icon="straight" title={t('straight.title')} intro={t('straight.short')} steps={steps} onExit={onExit} />;
}

// =============================================================================
// Motors: 15 cm forward / backward
// =============================================================================
export function DistanceWizard({ onExit }) {
  const t = useT();
  const { run, stored, ready } = useRobot();
  const [fw, setFw] = useState(FACTORY.distance[0]);
  const [bw, setBw] = useState(FACTORY.distance[1]);
  const [saved, setSaved] = useState(false);
  const touch = useSeed(stored?.distance, (d) => { setFw(d[0]); setBw(d[1]); });

  const ms = (ticks) => Math.round(ticks / TICKS_PER_MS);
  const delta = (ticks) => { const p = (ticks / FACTORY.distance[0] - 1) * 100; return `${p >= 0 ? '+' : ''}${p.toFixed(0)} %`; };

  const section = (dir) => {
    const ticks = dir > 0 ? fw : bw;
    const setTicks = dir > 0 ? setFw : setBw;
    const key = dir > 0 ? 'fw' : 'bw';
    const change = (d) => { touch(); setSaved(false); setTicks((v) => Math.max(DIST_STEP, v + d)); };
    return (
      <>
        <NeedRobot />
        {ready && stored && !stored.distance && <Notice tone="warn">{t('common.noCurrent')}</Notice>}
        <div className="stats">
          <Stat label={t('distance.duration')}>{ms(ticks)} ms</Stat>
          <Stat label={t('distance.steps')}>{delta(ticks)}</Stat>
        </div>
        <div className="row">
          <Btn kind="primary" onClick={() => run('distanceRun', { ticks, dir })}>
            {dir > 0 ? t('distance.forward') : t('distance.backward')}
          </Btn>
          <Btn needsRobot={false} onClick={() => change(DIST_STEP)}>{t('distance.longer')}</Btn>
          <Btn needsRobot={false} onClick={() => change(-DIST_STEP)}>{t('distance.shorter')}</Btn>
        </div>
      </>
    );
  };

  const steps = [
    { title: t('distance.s1.title'), text: t('distance.s1.text'), tip: t('distance.s1.tip'), art: <DistanceArt label={t('distance.s1.title')} /> },
    { title: t('distance.s2.title'), text: t('distance.s2.text'), art: <DistanceArt label={t('distance.s2.title')} />, body: section(1) },
    { title: t('distance.s3.title'), text: t('distance.s3.text'), art: <DistanceArt label={t('distance.s3.title')} back />, body: section(-1) },
    {
      title: t('distance.s4.title'), text: t('distance.s4.text'), art: <DistanceArt label={t('distance.s4.title')} />,
      body: (
        <>
          <NeedRobot />
          <div className="stats">
            <Stat label={t('distance.forward')}>{ms(fw)} ms</Stat>
            <Stat label={t('distance.backward')}>{ms(bw)} ms</Stat>
            <Stat label={t('distance.ratio')}>{(bw / fw).toFixed(3)}</Stat>
          </div>
          <SaveRow>
            <Btn kind="primary" onClick={async () => setSaved(!!(await run('distanceSave', { fw, bw })))}>{t('common.save')}</Btn>
            <FactoryButton op="distanceReset" onDone={() => { setFw(FACTORY.distance[0]); setBw(FACTORY.distance[1]); setSaved(true); }} />
          </SaveRow>
          {saved && <Notice tone="ok">{t('common.saved')}</Notice>}
        </>
      ),
    },
  ];
  return <Wizard icon="distance" title={t('distance.title')} intro={t('distance.short')} steps={steps} onExit={onExit} />;
}

// =============================================================================
// Colour sensor
// =============================================================================
function ColorLive() {
  const t = useT();
  const { tel } = useRobot();
  const c = tel.colorRaw || {};
  return (
    <div className="live">
      <div className="live-title">{t('color.raw')}</div>
      <Meter label="R" value={c.r} max={16000} tone="red" />
      <Meter label="G" value={c.g} max={16000} tone="green" />
      <Meter label="B" value={c.b} max={16000} tone="blue" />
    </div>
  );
}

export function ColorWizard({ onExit }) {
  const t = useT();
  const { run, stored, tel } = useRobot();
  const [done, setDone] = useState({});
  const cal = stored?.color;
  const capture = async (kind) => { const r = await run('colorCapture', { kind }); if (r) setDone((d) => ({ ...d, [kind]: true })); };

  const steps = [
    { title: t('color.s1.title'), text: t('color.s1.text'), tip: t('color.s1.tip'), art: <ColorArt label={t('color.s1.title')} kind="white" /> },
    {
      live: 'others', title: t('color.s2.title'), text: t('color.s2.text'), art: <ColorArt label={t('color.s2.title')} kind="white" />,
      body: (
        <>
          <NeedRobot />
          <ColorLive />
          <div className="row"><Btn kind="primary" onClick={() => capture('white')}>{t('color.white')}</Btn></div>
          {cal && <p className="muted small">{t('color.storedWhite')} : R {cal[0]} · G {cal[1]} · B {cal[2]}</p>}
          {done.white && <Notice tone="ok">{t('common.saved')}</Notice>}
          <p className="muted small">{t('color.autosave')}</p>
        </>
      ),
    },
    {
      live: 'others', title: t('color.s3.title'), text: t('color.s3.text'), art: <ColorArt label={t('color.s3.title')} kind="black" />,
      body: (
        <>
          <NeedRobot />
          <ColorLive />
          <div className="row"><Btn kind="primary" onClick={() => capture('black')}>{t('color.black')}</Btn></div>
          {cal && <p className="muted small">{t('color.storedBlack')} : R {cal[3]} · G {cal[4]} · B {cal[5]}</p>}
          {done.black && <Notice tone="ok">{t('common.saved')}</Notice>}
          <p className="muted small">{t('color.autosave')}</p>
        </>
      ),
    },
    {
      live: 'main', title: t('color.s4.title'), text: t('color.s4.text'), art: <ColorArt label={t('color.s4.title')} kind="white" />,
      body: (
        <>
          <NeedRobot />
          <div className="color-check">
            <div className="color-big" style={{ background: tel.colorCss || 'transparent' }} />
            <div>
              <div className="live-title">{t('color.preview')}</div>
              <div className="stats">
                <Stat label="H">{tel.hsv?.h ?? '–'}°</Stat>
                <Stat label="S">{tel.hsv?.s ?? '–'}</Stat>
                <Stat label="V">{tel.hsv?.v ?? '–'}</Stat>
              </div>
            </div>
          </div>
          <p className="muted small">{t('color.noFactory')}</p>
        </>
      ),
    },
  ];
  return <Wizard icon="color" title={t('color.title')} intro={t('color.short')} steps={steps} onExit={onExit} />;
}

// =============================================================================
// Ground sensors
// =============================================================================
function GroundLive() {
  const t = useT();
  const { tel } = useRobot();
  return (
    <div className="live">
      <div className="live-title">{t('common.live')}</div>
      <Meter label={t('ground.left')} value={tel.ground?.l} max={1023} />
      <Meter label={t('ground.right')} value={tel.ground?.r} max={1023} />
    </div>
  );
}

export function GroundWizard({ onExit }) {
  const t = useT();
  const { run, stored } = useRobot();
  const [sample, setSample] = useState({});
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const snapshot = useRef(null);
  const g = stored?.ground;
  useRestoreOnLeave(pending, (runOp) => { if (snapshot.current) runOp('groundApply', { values: snapshot.current }); });

  const capture = async (kind) => {
    if (!pending && g) snapshot.current = [...g];
    setSaved(false);
    const r = await run('groundCapture', { kind });
    if (r) { setSample((s) => ({ ...s, [kind]: r.groundSample })); setPending(true); }
  };
  const poorRange = g && (g[2] - g[0] < 40 || g[3] - g[1] < 40);

  const captureStep = (kind) => (
    <>
      <NeedRobot />
      <GroundLive />
      <div className="row"><Btn kind="primary" onClick={() => capture(kind)}>{kind === 'white' ? t('ground.white') : t('ground.black')}</Btn></div>
      {sample[kind] && (
        <p className="muted small">{t('ground.sample')} : {t('ground.left')} {sample[kind][0]} · {t('ground.right')} {sample[kind][1]}</p>
      )}
    </>
  );

  const steps = [
    { title: t('ground.s1.title'), text: t('ground.s1.text'), tip: t('ground.s1.tip'), art: <GroundArt label={t('ground.s1.title')} kind="white" /> },
    { live: 'main', title: t('ground.s2.title'), text: t('ground.s2.text'), art: <GroundArt label={t('ground.s2.title')} kind="white" />, body: captureStep('white') },
    { live: 'main', title: t('ground.s3.title'), text: t('ground.s3.text'), art: <GroundArt label={t('ground.s3.title')} kind="black" />, body: captureStep('black') },
    {
      live: 'main', title: t('ground.s4.title'), text: t('ground.s4.text'), art: <GroundArt label={t('ground.s4.title')} kind="white" />,
      body: (
        <>
          <NeedRobot />
          <GroundLive />
          {g && (
            <div className="stats">
              <Stat label={`${t('ground.black.short')} · ${t('ground.left')} / ${t('ground.right')}`}>{g[0]} / {g[1]}</Stat>
              <Stat label={`${t('ground.white.short')} · ${t('ground.left')} / ${t('ground.right')}`}>{g[2]} / {g[3]}</Stat>
            </div>
          )}
          {poorRange && <Notice tone="warn">{t('ground.warnRange')}</Notice>}
          {pending && <Notice tone="info">{t('ground.pending')} {t('common.leaveRestores')}</Notice>}
          <SaveRow>
            <Btn kind="primary" onClick={async () => { if (await run('groundSave')) { setPending(false); setSaved(true); } }}>{t('common.save')}</Btn>
            {pending && snapshot.current && (
              <Btn kind="ghost" onClick={async () => { if (await run('groundApply', { values: snapshot.current })) setPending(false); }}>{t('ground.discard')}</Btn>
            )}
            <FactoryButton op="groundReset" onDone={() => { setPending(false); setSaved(true); }} />
          </SaveRow>
          {saved && <Notice tone="ok">{t('common.saved')}</Notice>}
        </>
      ),
    },
  ];
  return <Wizard icon="ground" title={t('ground.title')} intro={t('ground.short')} steps={steps} onExit={onExit} />;
}

// =============================================================================
// Gyroscope: offsets and rotation scale
// =============================================================================
export function GyroWizard({ onExit }) {
  const t = useT();
  const { run, stored, tel } = useRobot();
  const [offPending, setOffPending] = useState(false);
  const [offSaved, setOffSaved] = useState(false);
  const [turned, setTurned] = useState(false);
  const [angle, setAngle] = useState(null);       // [raw, deg] counted since the end of the turn
  const [scaleSaved, setScaleSaved] = useState(false);
  // while offsets are measured but not saved, the robot's automatic gyro calibration is switched off
  useRestoreOnLeave(offPending, (runOp) => runOp('gyroOffsetsCancel'));

  const gx = tel.gyro || {};
  const turn = async (measure) => {
    setScaleSaved(false);
    const r = await run('gyroTurn', { measure });
    if (r) { setTurned(true); setAngle(r.angle || null); }
  };
  const nudge = async (dir) => {
    const r = await run('gyroNudge', { dir });
    if (r) setAngle(r.angle || null);
  };
  // After a manual rotation (by hand) or a nudge, read the precise angle accumulated by the gyroscope.
  const readAngle = async () => {
    const r = await run('gyroAngle');
    if (r) setAngle(r.angle || null);
  };
  // Illustrative angle error drawn after the turn (the real one is not known).
  const shownErr = 14;

  const steps = [
    {
      live: 'main', title: t('gyro.s1.title'), text: t('gyro.s1.text'), tip: t('gyro.s1.tip'), art: <GyroStillArt label={t('gyro.s1.title')} />,
      body: (
        <div className="live">
          <div className="live-title">{t('gyro.rawNow')}</div>
          <Meter label="x" value={Math.abs(gx.x ?? 0)} max={200} tone="muted" />
          <Meter label="y" value={Math.abs(gx.y ?? 0)} max={200} tone="muted" />
          <Meter label="z" value={Math.abs(gx.z ?? 0)} max={200} tone="muted" />
        </div>
      ),
    },
    {
      title: t('gyro.s2.title'), text: t('gyro.s2.text'), art: <GyroStillArt label={t('gyro.s2.title')} />,
      body: (
        <>
          <NeedRobot />
          <div className="stats">
            <Stat label={t('gyro.offsets')}>{fmt(stored?.gyroOffsets)}</Stat>
          </div>
          <div className="row">
            <Btn kind="primary" onClick={async () => { setOffSaved(false); if (await run('gyroOffsetsMeasure')) setOffPending(true); }}>{t('gyro.measure')}</Btn>
          </div>
          {offPending && (
            <SaveRow>
              <Btn kind="primary" onClick={async () => { if (await run('gyroOffsetsSave')) { setOffPending(false); setOffSaved(true); } }}>{t('gyro.saveOffsets')}</Btn>
              <Btn kind="ghost" onClick={async () => { if (await run('gyroOffsetsCancel')) setOffPending(false); }}>{t('gyro.discardOffsets')}</Btn>
            </SaveRow>
          )}
          <SaveRow>
            <FactoryButton op="gyroOffsetsReset" onDone={() => { setOffPending(false); setOffSaved(true); }} />
          </SaveRow>
          {offSaved && <Notice tone="ok">{t('common.saved')}</Notice>}
        </>
      ),
    },
    { title: t('gyro.s3.title'), text: t('gyro.s3.text'), tip: t('gyro.s3.tip'), art: <GyroTurnArt label={t('gyro.s3.title')} stage="start" /> },
    {
      live: 'others', title: t('gyro.s4.title'), text: t('gyro.s4.text'), tip: t('gyro.s4.tip'), art: <GyroTurnArt label={t('gyro.s4.title')} stage={turned ? 'after' : 'start'} error={shownErr} />,
      body: (
        <>
          <NeedRobot />
          <div className="row"><Btn kind="primary" onClick={() => turn(true)}>{t('gyro.turn')}</Btn></div>
          <div className="row">
            <Btn disabled={!turned} onClick={() => nudge(-1)}>{t('gyro.nudgeLeft')}</Btn>
            <Btn disabled={!turned} onClick={() => nudge(1)}>{t('gyro.nudgeRight')}</Btn>
          </div>
          <div className="stats">
            <Stat label={t('gyro.liveAngle')}>{turned && Number.isFinite(tel.angleDeg) ? `${tel.angleDeg}°` : '–'}</Stat>
            <Stat label={t('gyro.measuredCorrection')}>{angle ? `${angle[0]} (${angle[1]}°)` : '–'}</Stat>
          </div>
          <div className="row"><Btn kind="ghost" disabled={!turned} onClick={readAngle}>{t('gyro.readAngle')}</Btn></div>
        </>
      ),
    },
    {
      title: t('gyro.s5.title'), text: t('gyro.s5.text'), art: <GyroTurnArt label={t('gyro.s5.title')} stage="start" />,
      body: (
        <>
          <NeedRobot />
          <div className="stats">
            <Stat label={t('gyro.scale')}>{stored?.gyroScale === undefined ? '–' : stored.gyroScale === 0 ? `0 (${t('gyro.scaleNominal')})` : stored.gyroScale}</Stat>
            <Stat label={t('gyro.measuredCorrection')}>{angle ? angle[0] : '–'}</Stat>
          </div>
          {!turned && <Notice tone="warn">{t('gyro.turnFirst')}</Notice>}
          <SaveRow>
            <Btn kind="primary" disabled={!turned} onClick={async () => { if (await run('gyroScaleSave')) { setScaleSaved(true); setTurned(false); } }}>{t('gyro.saveScale')}</Btn>
            <Btn onClick={async () => { const r = await run('gyroTurn', { measure: false }); if (r) setAngle(r.angle || null); }}>{t('gyro.verify')}</Btn>
            <FactoryButton op="gyroScaleReset" onDone={() => setScaleSaved(true)} />
          </SaveRow>
          {scaleSaved && <Notice tone="ok">{t('common.saved')}</Notice>}
          {angle && !turned && (
            <p className="muted small">{t('gyro.residual')} : {angle[0]} ({angle[1]}°)</p>
          )}
        </>
      ),
    },
  ];
  return <Wizard icon="gyro" title={t('gyro.title')} intro={t('gyro.short')} steps={steps} onExit={onExit} />;
}

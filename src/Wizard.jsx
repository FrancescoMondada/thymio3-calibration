import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { Icon } from './art.jsx';
import { Notice } from './ui.jsx';
import { useRobot } from './useRobot.jsx';

// **bold** segments in the strings become <strong>.
const rich = (text) => text.split('**').map((part, k) => (k % 2 ? <strong key={k}>{part}</strong> : part));

// Generic step-by-step shell: illustration + instructions + the controls of
// the step. `steps[i]` = { title, text, tip, art, body, live } where `live` is the sensor
// stream the step needs: 'main' | 'others' | undefined.
export function Wizard({ icon, title, intro, steps, onExit }) {
  const t = useT();
  const { setLive } = useRobot();
  const [index, setIndex] = useState(0);
  const step = steps[index];
  // Live sensor readings only while a step needs them (one stream at a time, see RealRobot).
  useEffect(() => { setLive(step.live || null); return () => setLive(null); }, [step.live, setLive]);
  const last = index === steps.length - 1;

  return (
    <section className="wizard" aria-labelledby="wiz-title">
      <div className="wizard-head">
        <button type="button" className="link-btn" onClick={onExit}>{t('nav.home')}</button>
        <div className="wizard-title">
          <span className="wizard-icon"><Icon name={icon} /></span>
          <div>
            <h2 id="wiz-title">{title}</h2>
            <p className="muted">{intro}</p>
          </div>
        </div>
      </div>

      <ol className="steps" aria-label={t('nav.step', { n: index + 1, total: steps.length })}>
        {steps.map((s, k) => (
          <li key={k} className={k === index ? 'on' : k < index ? 'past' : ''}>
            <button type="button" onClick={() => setIndex(k)} aria-current={k === index ? 'step' : undefined}>
              <span className="dot">{k < index ? '✓' : k + 1}</span>
              <span className="steps-label">{s.title}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="wizard-body">
        <div className="wizard-art">{step.art}</div>
        <div className="wizard-panel">
          <div className="kicker">{t('nav.step', { n: index + 1, total: steps.length })}</div>
          <h3>{step.title}</h3>
          <p>{rich(step.text)}</p>
          {step.tip && <Notice tone="tip">{step.tip}</Notice>}
          <div className="controls">{step.body}</div>
        </div>
      </div>

      <div className="wizard-nav">
        <button type="button" className="btn btn-ghost" onClick={() => setIndex(index - 1)} disabled={index === 0}>{t('nav.back')}</button>
        {last
          ? <button type="button" className="btn btn-primary" onClick={onExit}>{t('nav.finish')}</button>
          : <button type="button" className="btn btn-primary" onClick={() => setIndex(index + 1)}>{t('nav.next')}</button>}
      </div>
    </section>
  );
}

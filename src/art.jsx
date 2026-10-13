// Illustrations for the wizards. Language-neutral on purpose (arrows, numbers,
// symbols), so they work in every UI language. All colours come from CSS tokens.
import React from 'react';
import { RobotTop, RobotBottom, RobotSide, RobotDefs, HALF_LEN, AXLE_Y } from './robot-art.jsx';

export { RobotTop, RobotBottom, RobotSide };

const W = 640, H = 340;

function Frame({ children, label }) {
  return (
    <svg className="art" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <defs>
        {[['accent', 'var(--accent)'], ['danger', 'var(--danger)'], ['ink', 'var(--art-ink)']].map(([id, fill]) => (
          <marker key={id} id={`ar-${id}`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={fill} />
          </marker>
        ))}
        <RobotDefs />
        <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" stroke="var(--art-line)" strokeWidth="1" opacity=".5" />
        </pattern>
      </defs>
      <rect width={W} height={H} rx="14" fill="var(--art-bg)" />
      {children}
    </svg>
  );
}

const SURF = { white: ['var(--paper-white)', 'var(--robot-stroke)'], black: ['var(--paper-black)', 'var(--paper-black)'] };

function Sheet({ kind = 'white', x, y, w, h = 14 }) {
  const [fill, stroke] = SURF[kind];
  return <rect x={x} y={y} width={w} height={h} rx="3" fill={fill} stroke={stroke} strokeWidth="2" />;
}

function Badge({ x, y, children, tone = 'accent' }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r="15" fill={`var(--${tone})`} />
      <text textAnchor="middle" dy="5" fontSize="15" fontWeight="700" fill="#fff">{children}</text>
    </g>
  );
}

// ---- scenes ----------------------------------------------------------------

export function StraightArt({ label }) {
  return (
    <Frame label={label}>
      <rect x="170" y="14" width="300" height="312" rx="10" fill="var(--floor)" />
      <line x1="320" y1="34" x2="320" y2="262" stroke="var(--ok)" strokeWidth="5" strokeDasharray="12 9" />
      <path d="M320,252 C320,190 296,130 262,84" fill="none" stroke="var(--danger)" strokeWidth="5" strokeLinecap="round" markerEnd="url(#ar-danger)" />
      <RobotTop x="320" y="286" s="0.7" />
      <RobotTop x="252" y="62" s="0.7" ghost />
      <line x1="520" y1="40" x2="520" y2="300" stroke="var(--art-ink)" strokeWidth="2.5" markerStart="url(#ar-ink)" markerEnd="url(#ar-ink)" />
      <text x="534" y="176" fontSize="20" fontWeight="700" fill="var(--art-ink)">≥ 1,5 m</text>
    </Frame>
  );
}

export function DistanceArt({ label, back = false }) {
  const x0 = 170, x15 = 550; // ruler coordinates (cm 0 → 15), vertical track
  const cm = (v) => x0 + ((x15 - x0) * v) / 15;
  const robotAt = back ? 15 : 0;
  const ghostAt = back ? 0 : 15;
  return (
    <Frame label={label}>
      <rect x="40" y="70" width="570" height="200" rx="10" fill="var(--floor)" />
      {/* start and finish lines */}
      <line x1={cm(0)} y1="86" x2={cm(0)} y2="254" stroke="var(--ok)" strokeWidth="4" />
      <line x1={cm(15)} y1="86" x2={cm(15)} y2="254" stroke="var(--danger)" strokeWidth="4" />
      {/* ruler */}
      <rect x={cm(0) - 14} y="270" width={cm(15) - cm(0) + 28} height="34" rx="4" fill="var(--paper-white)" stroke="var(--robot-stroke)" strokeWidth="2" />
      {Array.from({ length: 16 }, (_, k) => (
        <g key={k}>
          <line x1={cm(k)} y1="270" x2={cm(k)} y2={k % 5 === 0 ? 292 : 284} stroke="var(--art-ink)" strokeWidth="1.5" />
          {k % 5 === 0 && <text x={cm(k)} y="302" fontSize="13" fontWeight="600" textAnchor="middle" fill="var(--art-ink)">{k}</text>}
        </g>
      ))}
      <text x={cm(15) + 22} y="297" fontSize="13" fontWeight="600" fill="var(--art-ink)">cm</text>
      {/* robot (sideways: front to the right) */}
      <g transform={`translate(${cm(robotAt) - (back ? 0 : 0)} 170) rotate(90) scale(0.9)`}>
        <RobotTop x={0} y={HALF_LEN} />
      </g>
      <g transform={`translate(${cm(ghostAt)} 170) rotate(90) scale(0.9)`}>
        <RobotTop x={0} y={HALF_LEN} ghost />
      </g>
      <path d={back ? `M${cm(15) - 60},40 L${cm(0) + 30},40` : `M${cm(0) + 30},40 L${cm(15) - 60},40`} stroke="var(--accent)" strokeWidth="5" fill="none" strokeLinecap="round" markerEnd="url(#ar-accent)" />
      <text x={cm(0)} y="62" fontSize="22" fontWeight="800" textAnchor="middle" fill="var(--ok)">0</text>
      <text x={cm(15)} y="62" fontSize="22" fontWeight="800" textAnchor="middle" fill="var(--danger)">15</text>
    </Frame>
  );
}

export function ColorArt({ label, kind = 'white' }) {
  return (
    <Frame label={label}>
      <RobotBottom x="160" y="150" s="1.9" color />
      <g transform="translate(300 0)">
        <rect x="20" y="40" width="300" height="250" rx="12" fill="var(--floor)" />
        <Sheet kind={kind} x="40" y="214" w="260" h="22" />
        <RobotSide x="176" y="214" s="2.05" beams="color" />
        <text x="170" y="270" fontSize="14" fontWeight="600" textAnchor="middle" fill="var(--art-muted)">
          {kind === 'white' ? '☀ mat' : '■ mat'}
        </text>
      </g>
    </Frame>
  );
}

export function GroundArt({ label, kind = 'white' }) {
  return (
    <Frame label={label}>
      <RobotBottom x="150" y="160" s="1.9" ground />
      <g transform="translate(290 0)">
        <rect x="20" y="40" width="320" height="250" rx="12" fill="var(--floor)" />
        <Sheet kind={kind} x="40" y="214" w="280" h="22" />
        <RobotSide x="196" y="214" s="2.05" beams="ground" />
        <text x="180" y="270" fontSize="14" fontWeight="600" textAnchor="middle" fill="var(--art-muted)">2 × IR</text>
      </g>
    </Frame>
  );
}

export function GyroStillArt({ label }) {
  return (
    <Frame label={label}>
      <rect x="60" y="214" width="520" height="26" rx="6" fill="var(--floor)" stroke="var(--robot-stroke)" strokeWidth="2" />
      <rect x="110" y="240" width="14" height="70" fill="var(--floor)" />
      <rect x="516" y="240" width="14" height="70" fill="var(--floor)" />
      <RobotSide x="320" y="214" s="2.2" />
      {/* "no touching / no vibration" */}
      <g stroke="var(--danger)" strokeWidth="5" strokeLinecap="round" fill="none">
        <path d="M150,100 q10,-16 20,0 t20,0 t20,0" />
        <path d="M430,100 q10,-16 20,0 t20,0 t20,0" />
      </g>
      <g transform="translate(320 66)">
        <circle r="34" fill="none" stroke="var(--danger)" strokeWidth="6" />
        <line x1="-24" y1="-24" x2="24" y2="24" stroke="var(--danger)" strokeWidth="6" />
      </g>
      {/* clock: ≈ 3 s */}
      <g transform="translate(560 66)">
        <circle r="26" fill="var(--paper-white)" stroke="var(--art-ink)" strokeWidth="3" />
        <path d="M0,-16 L0,0 L11,8" stroke="var(--art-ink)" strokeWidth="3" fill="none" strokeLinecap="round" />
        <text y="48" fontSize="15" fontWeight="700" textAnchor="middle" fill="var(--art-ink)">≈ 3 s</text>
      </g>
    </Frame>
  );
}

// `error` is the angle (in degrees) the robot is off the line after the turn.
// The reference line is drawn along the BACK side of the robot (the flat one), just behind it and
// sticking out on both sides: the longer it is, the easier it is to see a small angle error.
// `error` (degrees) is how far the robot is rotated after the turn; the red dashed line is its back
// side prolonged on both sides.
export function GyroTurnArt({ label, stage = 'start', error = 0, hand = false }) {
  const k = 1.25;
  const px = 320, py = 176;                        // pivot: middle of the wheel axle
  const lineY = (HALF_LEN - AXLE_Y) * k + 5;       // just behind the back edge, relative to the pivot
  const half = 112;                                // half length of the line
  const showError = stage === 'after';
  const rot = showError ? error : 0;
  return (
    <Frame label={label}>
      <rect x="150" y="14" width="340" height="312" rx="10" fill="var(--floor)" />
      <circle cx={px} cy={py} r="122" fill="none" stroke="var(--accent)" strokeWidth="3.5" strokeDasharray="12 10" opacity=".55" />
      <path d="M236,106 A118,118 0 0 0 202,176" fill="none" stroke="var(--accent)" strokeWidth="6" markerEnd="url(#ar-accent)" />
      <text x="168" y="104" fontSize="22" fontWeight="800" textAnchor="middle" fill="var(--accent)">360°</text>
      {/* reference line on the paper, behind the robot, along its back side */}
      <line x1={px - half} y1={py + lineY} x2={px + half} y2={py + lineY} stroke="var(--ok)" strokeWidth="6" strokeLinecap="round" />
      <g transform={`translate(${px} ${py}) rotate(${rot})`}>
        <RobotTop x={0} y={-AXLE_Y * k} s={k} />
        {showError && <line x1={-half} y1={lineY} x2={half} y2={lineY} stroke="var(--danger)" strokeWidth="3.5" strokeDasharray="7 5" strokeLinecap="round" />}
      </g>
      {/* "you can also turn it by hand": a hand and rotation arrows on both sides of the robot */}
      {hand && (
        <g>
          <g transform="translate(404 64) scale(1.55)"><HandShape /></g>
          <g fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round">
            <path d="M196,150 A140,140 0 0 0 176,206" markerEnd="url(#ar-accent)" />
            <path d="M444,150 A140,140 0 0 1 464,206" markerEnd="url(#ar-accent)" />
          </g>
        </g>
      )}
      {stage === 'nudge' && (
        <g fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round">
          <path d="M196,150 A140,140 0 0 0 176,206" markerEnd="url(#ar-accent)" />
          <path d="M444,150 A140,140 0 0 1 464,206" markerEnd="url(#ar-accent)" />
        </g>
      )}
    </Frame>
  );
}

// Open-hand pictogram, 48 × 56, fingers up.
export function HandShape() {
  const f = { fill: 'var(--accent-soft)', stroke: 'var(--accent)', strokeWidth: 2.4, strokeLinejoin: 'round' };
  return (
    <g {...f}>
      <rect x="9" y="10" width="7" height="26" rx="3.5" />
      <rect x="17" y="4" width="7" height="32" rx="3.5" />
      <rect x="25" y="8" width="7" height="28" rx="3.5" />
      <rect x="33" y="16" width="7" height="20" rx="3.5" />
      <rect x="-1" y="31" width="20" height="8" rx="4" transform="rotate(-35 7 35)" />
      <rect x="7" y="28" width="36" height="24" rx="10" />
    </g>
  );
}

export function HandIcon({ size = 46 }) {
  return <svg viewBox="-4 0 56 56" width={size} height={size * 56 / 56} aria-hidden="true"><HandShape /></svg>;
}

// ---- small icons for the home cards ------------------------------------------

export function Icon({ name }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const body = {
    straight: <><path d="M16 4 V44" strokeDasharray="4 4" /><rect x="9" y="20" width="14" height="18" rx="4" /><path d="M16 4 l-5 7 M16 4 l5 7" /></>,
    distance: <><path d="M4 38 H44" /><path d="M8 32 V44 M40 32 V44" /><rect x="6" y="12" width="14" height="14" rx="4" /><path d="M24 19 H40 m-5 -5 l5 5 l-5 5" /></>,
    color: <><circle cx="24" cy="24" r="16" /><path d="M24 8 A16 16 0 0 1 40 24 H24 Z" fill="currentColor" opacity=".35" /><path d="M24 24 L10 34" /></>,
    ground: <><rect x="8" y="8" width="32" height="18" rx="5" /><circle cx="17" cy="30" r="2" /><circle cx="31" cy="30" r="2" /><path d="M17 33 L12 42 M17 33 L22 42 M31 33 L26 42 M31 33 L36 42" /></>,
    gyro: <><circle cx="24" cy="24" r="6" /><path d="M24 6 A18 18 0 0 1 42 24" /><path d="M42 24 l-5 -5 M42 24 l5 -5" /><path d="M24 42 A18 18 0 0 1 6 24" /></>,
  }[name];
  return <svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true" {...common}>{body}</svg>;
}

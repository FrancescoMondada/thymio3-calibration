// Vector drawings of the Thymio 3, traced from the Mobsya 3D viewer
// (https://mobsya.github.io/thymio3-viewer/):
//  - D-shaped body, ~100 wide × 107 long: ROUND front with five proximity
//    sensors on the arc, FLAT back with two rear sensors at the corners;
//  - white shell with dark tyres, wheels at the back on both sides;
//  - touch cross in a ring near the front, Lego pins and the pen hole behind it;
//  - underneath, at the front: the sliding point of contact (third support) on the axis, the
//    colour sensor slot just behind it, and two IR ground sensors (a pair of small windows
//    each) close to the front edge and to each other.
// Units: width 100, front pointing up, origin at the centre of the outline.
import React from 'react';

export const HALF_LEN = 53.7;        // front tip / back edge distance from the centre
export const AXLE_Y = 28.7;          // wheel axle, measured from the centre towards the back
// Underside, measured on the 3D model (front = negative y):
export const SKID_Y = -35.7;         // sliding (third) point of contact, on the axis
export const COLOR_Y = -21;          // colour sensor slot: behind the skid, before the Lego plate
export const GROUND_Y = -46;         // IR ground sensors: two pairs of small windows near the front edge
export const GROUND_HOLES = [-13, -7, 7, 13]; // x of the four windows (one emitter + one receiver per side)

const BODY = 'M-50,-18 C-50,-42 -28,-53.7 0,-53.7 C28,-53.7 50,-42 50,-18 L50,47 Q50,53.7 43,53.7 L-43,53.7 Q-50,53.7 -50,47 Z';
// Lower shell: same D, but notched on both sides (x = ±29 … ±50, y = 7 … 47) so the wheels show.
const BODY_BOTTOM = 'M-50,-18 C-50,-42 -28,-53.7 0,-53.7 C28,-53.7 50,-42 50,-18 L50,7 L29,7 L29,47 L50,47 Q50,53.7 43,53.7 L-43,53.7 Q-50,53.7 -50,47 L-29,47 L-29,7 L-50,7 Z';
const arcY = (x) => -18 - 35.7 * Math.sqrt(1 - (x / 50) ** 2); // y of the front outline at a given x

export function RobotDefs() {
  return (
    <>
      <linearGradient id="t3-body" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="var(--robot-body)" />
        <stop offset="1" stopColor="var(--robot-body-2)" />
      </linearGradient>
      <radialGradient id="t3-hub" cx=".4" cy=".35" r=".8">
        <stop offset="0" stopColor="#d9dce6" />
        <stop offset="1" stopColor="#8d93a6" />
      </radialGradient>
    </>
  );
}

function Pins({ cols = 8, rows = 4 }) {
  const dots = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const px = -29 + (i * 58) / (cols - 1);
      const py = 24 - j * 7.4;
      if (Math.hypot(px + 1.5, py - 29.8) < 9) continue; // keep the pen hole free
      dots.push(<circle key={`${i}-${j}`} cx={px} cy={py} r="1.7" fill="var(--robot-hi)" opacity=".75" />);
    }
  }
  return <>{dots}</>;
}

// ---- top view ---------------------------------------------------------------
export function RobotTop({ x = 0, y = 0, r = 0, s = 1, ghost = false, glow = false }) {
  const petal = { fill: 'var(--robot-key)', stroke: 'var(--robot-hi)', strokeWidth: 0.8 };
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`} opacity={ghost ? 0.5 : 1}>
      {/* the wheels are tucked under the shell: nothing to draw here */}
      <path d={BODY} fill="url(#t3-body)" stroke="var(--robot-stroke)" strokeWidth="1.8" strokeDasharray={ghost ? '5 4' : undefined} />
      <path d={BODY} transform="scale(.93)" fill="none" stroke="var(--robot-hi)" strokeWidth=".8" opacity=".35" />
      {/* five front proximity sensors on the arc */}
      {[-38, -19, 0, 19, 38].map((px) => (
        <g key={px} transform={`translate(${px} ${arcY(px) + 4.2}) rotate(${(px / 50) * 38})`}>
          <rect x="-5" y="-1.6" width="10" height="3.2" rx="1.6" fill="var(--tire)" />
          <circle cx="0" cy="0" r="0.9" fill="var(--accent)" />
        </g>
      ))}
      {/* two rear sensors */}
      {[-29, 29].map((px) => <rect key={px} x={px - 5} y="49.2" width="10" height="3.2" rx="1.6" fill="var(--tire)" />)}
      {/* Lego pins, pen hole and small holes behind the touch cross */}
      <Pins />
      <circle cx="-1.5" cy="29.8" r="5" fill="var(--art-bg)" stroke="var(--robot-hi)" strokeWidth=".8" />
      <circle cx="-12.5" cy="24.5" r="1.8" fill="var(--tire)" />
      <circle cx="10" cy="26" r="1.8" fill="var(--tire)" />
      {/* touch cross */}
      <circle cx="0" cy="-22.8" r="25" fill="none" stroke="var(--robot-hi)" strokeWidth="1.1" opacity=".7" />
      <circle cx="0" cy="-22.8" r="23.2" fill="none" stroke={glow ? 'var(--accent)' : 'var(--robot-hi)'} strokeWidth=".6" opacity=".5" />
      <ellipse cx="0" cy="-39" rx="4.8" ry="6.6" {...petal} />
      <ellipse cx="0" cy="-6.6" rx="4.8" ry="6.6" {...petal} />
      <ellipse cx="-15" cy="-22.8" rx="6.6" ry="4.8" {...petal} />
      <ellipse cx="15" cy="-22.8" rx="6.6" ry="4.8" {...petal} />
      <circle cx="0" cy="-22.8" r="5.6" {...petal} />
    </g>
  );
}

// ---- bottom view -------------------------------------------------------------
export function RobotBottom({ x = 0, y = 0, s = 1, color = false, ground = false }) {
  const dash = { fill: 'none', stroke: 'var(--accent)', strokeWidth: 2.2, strokeDasharray: '3.5 2.5' };
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {/* the upper shell, seen from below, overhangs the wheels */}
      <path d={BODY} fill="var(--robot-body-2)" stroke="var(--robot-stroke)" strokeWidth="1.8" />
      {/* wheels in their wells: tread seen from below */}
      {[-1, 1].map((sd) => (
        <g key={sd} transform={`translate(${sd < 0 ? -45.5 : 29.5} 0)`}>
          <rect x="0" y="9.5" width="16" height="39" rx="5.5" fill="var(--tire)" />
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => <line key={k} x1="2.4" y1={14.5 + k * 3.8} x2="13.6" y2={14.5 + k * 3.8} stroke="var(--robot-hi)" strokeWidth=".6" opacity=".45" />)}
          <rect x={sd < 0 ? 0 : 13} y="17" width="3" height="24" rx="1.5" fill="url(#t3-hub)" opacity=".9" />
        </g>
      ))}
      {/* the lower shell recedes to leave room for the wheels */}
      <path d={BODY_BOTTOM} fill="url(#t3-body)" stroke="var(--robot-stroke)" strokeWidth="1.8" />
      {/* faint recesses of the shell */}
      {[-1, 1].map((sd) => <rect key={sd} x={sd * 24 - 6.5} y="-36" width="13" height="13" rx="2" fill="none" stroke="var(--robot-hi)" strokeWidth=".7" opacity=".45" />)}
      {/* two IR ground sensors: a pair of small windows each, close to the front edge */}
      {GROUND_HOLES.map((hx) => (
        <circle key={hx} cx={hx} cy={GROUND_Y} r="2.1" fill={ground ? 'var(--accent)' : 'var(--tire)'} stroke="var(--robot-hi)" strokeWidth=".6" />
      ))}
      {ground && [-1, 1].map((sd) => <rect key={sd} x={sd * 10 - 6.8} y={GROUND_Y - 4.6} width="13.6" height="9.2" rx="4.6" {...dash} />)}
      {/* sliding point of contact (the third support, on the axis) */}
      <circle cx="0" cy={SKID_Y} r="8.2" fill="var(--robot-body-2)" stroke="var(--robot-hi)" strokeWidth=".9" />
      <circle cx="0" cy={SKID_Y} r="5.2" fill="none" stroke="var(--robot-hi)" strokeWidth=".6" opacity=".6" />
      <circle cx="0" cy={SKID_Y} r="0.9" fill="var(--robot-hi)" />
      {/* colour sensor: oblong window just behind the skid */}
      <rect x="-7.2" y={COLOR_Y - 3.5} width="14.4" height="7" rx="3.5" fill={color ? 'var(--accent)' : 'var(--tire)'} stroke="var(--robot-hi)" strokeWidth=".7" />
      {color && <rect x="-11.5" y={COLOR_Y - 7} width="23" height="14" rx="7" {...dash} />}
      {/* Lego pin plate, pen hole, loudspeaker grille, screws */}
      <rect x="-15.5" y="-12" width="31" height="31" rx="2.5" fill="none" stroke="var(--robot-hi)" strokeWidth=".9" opacity=".7" />
      {[0, 1, 2].flatMap((i) => [0, 1, 2, 3].map((j) => <circle key={`${i}${j}`} cx={-9.8 + i * 9.8} cy={-5.5 + j * 7.9} r="2.5" fill="none" stroke="var(--robot-hi)" strokeWidth=".8" opacity=".85" />))}
      <circle cx="0" cy="30" r="5" fill="var(--art-bg)" stroke="var(--robot-hi)" strokeWidth=".8" />
      {[0, 1, 2, 3].map((k) => <line key={k} x1="-7" y1={41 + k * 2.4} x2="7" y2={41 + k * 2.4} stroke="var(--robot-hi)" strokeWidth=".8" opacity=".8" />)}
      {[-1, 1].map((sd) => <circle key={sd} cx={sd * 20} cy="42" r="1.8" fill="var(--tire)" />)}
    </g>
  );
}

// ---- side view ----------------------------------------------------------------
// Front on the left, ground at y = 0, ~107 long × 49 high.
// beams: 'ground' | 'color' draws the infrared / light cone of that sensor.
export function RobotSide({ x = 0, y = 0, s = 1, beams = 'none' }) {
  const g = beams === 'ground';
  const c = beams === 'color';
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {/* body */}
      <path d="M-53.7,-14 Q-53.7,-49 -44,-49 L45,-49 Q53.7,-49 53.7,-41 L53.7,-8 Q53.7,-6 51,-6 L-47,-6 Q-53.7,-6 -53.7,-14 Z"
        fill="url(#t3-body)" stroke="var(--robot-stroke)" strokeWidth="1.8" />
      {/* seam between the two shells and the Lego pins on top */}
      <line x1="-53" y1="-26" x2="53" y2="-26" stroke="var(--robot-hi)" strokeWidth=".9" opacity=".55" />
      {Array.from({ length: 9 }, (_, k) => <rect key={k} x={-8 + k * 6.2} y="-51.2" width="3.4" height="2.4" rx="1" fill="var(--robot-key)" stroke="var(--robot-hi)" strokeWidth=".5" />)}
      {/* front proximity sensor windows, edge-on */}
      <rect x="-54.4" y="-31" width="3" height="11" rx="1.5" fill="var(--tire)" />
      <circle cx="-52.9" cy="-25.5" r="1" fill="var(--accent)" />
      {/* underside: skid (third contact point), colour sensor behind it, IR ground sensors at the front edge */}
      <path d={`M${SKID_Y - 7},-6 Q${SKID_Y},6 ${SKID_Y + 7},-6 Z`} fill="var(--robot-body-2)" stroke="var(--robot-hi)" strokeWidth=".9" />
      <rect x={GROUND_Y - 3.5} y="-6.8" width="7" height="2.4" rx="1" fill={g ? 'var(--accent)' : 'var(--tire)'} />
      <rect x={COLOR_Y - 3.5} y="-6.8" width="7" height="2.4" rx="1" fill={c ? 'var(--accent)' : 'var(--tire)'} />
      {g && <path d={`M${GROUND_Y - 3},-4.4 L${GROUND_Y + 3},-4.4 L${GROUND_Y + 6},0 L${GROUND_Y - 6},0 Z`} fill="var(--accent)" opacity=".45" />}
      {c && <path d={`M${COLOR_Y - 3},-4.4 L${COLOR_Y + 3},-4.4 L${COLOR_Y + 7},0 L${COLOR_Y - 7},0 Z`} fill="var(--accent)" opacity=".45" />}
      {/* rear wheel: dark tyre, large light hub with four holes around a central boss */}
      <circle cx="26" cy="-20" r="20" fill="var(--tire)" />
      <circle cx="26" cy="-20" r="15" fill="url(#t3-hub)" />
      {[45, 135, 225, 315].map((deg) => (
        <circle key={deg} cx={26 + Math.cos((deg * Math.PI) / 180) * 8} cy={-20 + Math.sin((deg * Math.PI) / 180) * 8} r="2.6" fill="var(--tire)" opacity=".8" />
      ))}
      <circle cx="26" cy="-20" r="3.2" fill="var(--robot-hi)" opacity=".7" />
    </g>
  );
}

// Colours the robot recognises (value of `colorDetected` in the sensor stream, firmware T_Color order).
// What is displayed is a representative colour for each category, not a measurement. The categories
// follow the Thymio 3 API demo: the firmware's "yellow" matches orange samples and its "cyan" matches
// dark-green samples. The robot's own hue is NOT converted to RGB: its hue scale is the sensor's, not a
// screen's (the firmware calls 10°–30° yellow and 30°–80° green), so that conversion gives wrong colours.
const DETECTED = [
  ['red', [3.7, 100, 100, 0.37]],
  ['orange', [11, 38, 100, 0]],
  ['lightGreen', [30, 0, 100, 0]],
  ['darkGreen', [67, 0, 100, 0]],
  ['blue', [87, 76, 0, 0]],
  ['violet', [44, 84, 0, 0]],
  ['white', [0, 0, 0, 0]],
  ['black', [0, 0, 0, 100]],
];

// -> { key, css } for a recognised colour, { key: 'unknown', css: null } for "no colour", null if no data yet.
export function detectedColour(value) {
  if (!Number.isInteger(value)) return null;
  const entry = DETECTED[value];
  if (!entry) return { key: 'unknown', css: null };
  const [key, [c, m, y, k]] = entry;
  const ch = (ink) => Math.round(255 * (1 - ink / 100) * (1 - k / 100));
  return { key, css: `rgb(${ch(c)}, ${ch(m)}, ${ch(y)})` };
}

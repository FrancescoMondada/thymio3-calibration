// MicroPython snippets sent to the robot. Each calibration step is one small
// script; the result comes back on stdout as lines "@@name value".
//
// They call the same firmware functions as the on-robot settings menu
// (behavior.c → Settings_Write*), through the `thymio` MicroPython module of
// the Thymio 3 firmware (Mobsya/micropython, branch thymio3), so what is stored
// in the robot's flash is identical to what the menu would have stored.

// Constants copied from main/settings.h of the firmware.
export const FACTORY = {
  motors: [256, 256],
  distance: [9000000, 9000000], // DEFAULT_MOT15CM, in hardware timer ticks (5 ticks = 1 µs)
  groundBlack: 35,
  groundWhite: 300,
  gyroOffsets: [0, 0, 0],
  gyroScale: 0,
};
export const MOTOR_BASE = 256;        // Settings.Motors = 256 ± correction
export const MOTOR_CORR_MAX = 50;     // behavior.c bounds the correction to ±50 (≈ ±20 %)
export const DIST_STEP = 90000;       // MOT_FW_BW_CALIB_STEP = DEFAULT_MOT15CM / 100
export const TICKS_PER_MS = 5000;     // timer ticks per millisecond
export const MOVE_SPEED = 300;        // MOVEMENT_SPEED of behavior.c
export const NUDGE_SPEED = 150;       // MOVEMENT_SPEED / 2, used to fine-tune the full turn
export const NUDGE_MS = 120;          // 6 behaviour cycles of 20 ms

const HEAD = `import thymio
import time
b = thymio.BEHAVIORS()
m = thymio.MOTORS()
i = thymio.IMU()
c = thymio.COLOR_SENSOR()
g0 = thymio.GROUND(0)
g1 = thymio.GROUND(1)
def out(k, v):
    print("@@" + k + " " + str(v))
b.disable_behaviors()
`;

// Always stop the motors and give the robot back its behaviours, even when the
// script is interrupted (STOP button) or raises.
// The final `done` marker lets the app know the script really ran to the end, whatever happens to
// the Bluetooth acknowledgements (see RealRobot.runScript).
function wrap(body) {
  const indented = (body.trim() + '\nout("done", 1)').split('\n').map((l) => '    ' + l).join('\n');
  return `${HEAD}try:\n${indented}\nfinally:\n    m.set_speed(0, 0)\n    b.enable_behaviors()\n`;
}

const int = (v) => Math.round(Number(v));

const readGround = `a = g0.get_calibration()
d = g1.get_calibration()
out("ground", [a[0], d[0], a[1], d[1]])`;

const angleOut = `out("angle", [i.get_angle_raw(), i.get_angle_deg()])`;

export const SCRIPTS = {
  // ---- everything currently stored in the robot -------------------------
  readAll: () => `out("straight", m.get_straight_calibration())
out("distance", m.get_distance_calibration())
out("color", c.get_calibration())
out("gyroOffsets", list(i.get_gyro_calib()))
out("gyroScale", i.get_gyro_scale_calib())
${readGround}`,

  // ---- motors: straight line --------------------------------------------
  // Settings.Motors = [256 + correction, 256 - correction] (TuneMotors()).
  straightRun: ({ corr, dir }) => `m.set_straight_calibration(${MOTOR_BASE + int(corr)}, ${MOTOR_BASE - int(corr)})
m.set_speed(${MOVE_SPEED * dir}, ${MOVE_SPEED * dir})
time.sleep_ms(3000)
m.set_speed(0, 0)
out("straight", m.get_straight_calibration())`,
  straightSave: ({ corr }) => `m.set_straight_calibration(${MOTOR_BASE + int(corr)}, ${MOTOR_BASE - int(corr)})
m.save_straight_calibration()
out("straight", m.get_straight_calibration())`,
  straightReset: () => `m.reset_straight_calibration()
m.save_straight_calibration()
out("straight", m.get_straight_calibration())`,

  // ---- motors: 15 cm forward / backward ---------------------------------
  // The robot drives at 300 for `ticks` timer ticks; a hardware timer stops it.
  distanceRun: ({ ticks, dir }) => `m.set_speed(${MOVE_SPEED * dir}, ${MOVE_SPEED * dir})
m.distance_calib_timer_set(${int(ticks)})
m.distance_calib_timer_reset()
m.distance_calib_timer_start()
time.sleep_ms(${Math.round(ticks / TICKS_PER_MS) + 1200})
m.set_speed(0, 0)`,
  distanceSave: ({ fw, bw }) => `m.set_distance_calibration(${int(fw)}, ${int(bw)})
m.save_distance_calibration()
out("distance", m.get_distance_calibration())`,
  distanceReset: () => `m.reset_distance_calibration()
m.save_distance_calibration()
out("distance", m.get_distance_calibration())`,

  // ---- colour sensor ----------------------------------------------------
  // Like the menu, the sample is written to flash immediately.
  colorCapture: ({ kind }) => `c.calibrate_and_save_${kind === 'black' ? 'black' : 'white'}()
out("color", c.get_calibration())`,

  // ---- gyroscope: offsets -----------------------------------------------
  gyroOffsetsMeasure: () => `i.disable_gyro_auto_calib()
time.sleep_ms(1000)
i.calibrate_gyro()
out("gyroOffsets", list(i.get_gyro_calib()))`,
  gyroOffsetsSave: () => `i.save_gyro_calib()
i.enable_gyro_auto_calib()
out("gyroOffsets", list(i.get_gyro_calib()))`,
  gyroOffsetsCancel: () => `i.enable_gyro_auto_calib()
out("gyroOffsets", list(i.get_gyro_calib()))`,
  gyroOffsetsReset: () => `i.reset_gyro_calib()
i.save_gyro_calib()
i.enable_gyro_auto_calib()
out("gyroOffsets", list(i.get_gyro_calib()))`,

  // ---- gyroscope: rotation scale ----------------------------------------
  // measure=true : the scale is reset to the nominal value, the robot turns
  //                -360°, then the angle is zeroed so the nudges are counted.
  // measure=false: verification turn with the stored scale; the angle left
  //                over at the end is reported.
  gyroTurn: ({ measure }) => `${measure ? 'i.set_gyro_scale_calib(0)\n' : ''}i.reset_angle()
i.rotate_deg(-360, ${MOVE_SPEED})
t = time.ticks_ms()
while not i.rotation_completed():
    if time.ticks_diff(time.ticks_ms(), t) > 20000:
        break
    time.sleep_ms(50)
time.sleep_ms(400)
${measure ? 'i.reset_angle()\n' : ''}${angleOut}`,
  gyroNudge: ({ dir }) => `m.set_speed(${NUDGE_SPEED * dir}, ${-NUDGE_SPEED * dir})
time.sleep_ms(${NUDGE_MS})
m.set_speed(0, 0)
time.sleep_ms(400)
${angleOut}`,
  // Precise angle counted since the end of the turn (nudges and/or hand rotation).
  gyroAngle: () => angleOut,
  // factor = -angle / 4 : the residual is shared by the four quarter turns.
  gyroScaleSave: () => `a = i.get_angle_raw()
f = int(-a / 4)
f = max(-32000, min(32000, f))
i.set_gyro_scale_calib(f)
i.save_gyro_scale_calib()
out("gyroScale", i.get_gyro_scale_calib())`,
  gyroScaleReset: () => `i.set_gyro_scale_calib(0)
i.save_gyro_scale_calib()
out("gyroScale", i.get_gyro_scale_calib())`,

  // ---- ground sensors ---------------------------------------------------
  // value = reflected - ambient, as in CalibrateGround(); averaged over 10
  // samples after the same 1 s settle time. Applied at once, saved on request.
  groundCapture: ({ kind }) => `time.sleep_ms(1000)
a0 = a1 = r0 = r1 = 0
for k in range(10):
    a0 += g0.ambient()
    a1 += g1.ambient()
    r0 += g0.reflected()
    r1 += g1.reflected()
    time.sleep_ms(30)
v0 = max(0, (r0 - a0) // 10)
v1 = max(0, (r1 - a1) // 10)
a = g0.get_calibration()
d = g1.get_calibration()
bl = a[0]
br = d[0]
wl = a[1]
wr = d[1]
${kind === 'black' ? 'bl = v0\nbr = v1' : 'wl = v0\nwr = v1'}
g0.set_calibration_from_values([bl, br, wl, wr])
out("groundSample", [v0, v1])
${readGround}`,
  groundSave: () => `g0.save_calibration_from_values()
${readGround}`,
  groundApply: ({ values }) => `g0.set_calibration_from_values([${values.map(int).join(', ')}])
${readGround}`,
  groundReset: () => `g0.set_and_save_calibration_from_values([${FACTORY.groundBlack}, ${FACTORY.groundBlack}, ${FACTORY.groundWhite}, ${FACTORY.groundWhite}])
${readGround}`,
};

export function buildScript(name, args = {}) {
  const make = SCRIPTS[name];
  if (!make) throw new Error(`Unknown calibration script: ${name}`);
  return wrap(make(args));
}

// "@@straight [259, 253]" lines → { straight: [259, 253] }
export function parseOutput(text) {
  const result = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^@@(\w+) (.*)$/.exec(line.trim());
    if (!m) continue;
    try { result[m[1]] = JSON.parse(m[2].replace(/\(/g, '[').replace(/\)/g, ']')); } catch { /* ignore */ }
  }
  return result;
}

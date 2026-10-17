# Thymio 3 — Calibration

Guided web application that replaces the calibration menus of the Thymio 3 (the ones you
reach by holding ◀ ▶ for 3 s). Each calibration is a short wizard with illustrations, live
sensor readings and a **Save to robot** step that stores the values in the robot's flash,
exactly where the on-robot menu stores them.

**▶ App: <https://francescomondada.github.io/thymio3-calibration/>**

Open it in **Google Chrome or Microsoft Edge** (Web Bluetooth is not available in Firefox or Safari; the
app shows a prominent warning there), switch the robot on and click *Connect robot*. The interface is
available in French, English, German and Italian (the language follows your browser and can be changed in the top bar).

## Two versions of the interface

The switch in the top bar (**Normal | Expert**) chooses the version; the choice is remembered, and
`?mode=expert` / `?mode=normal` in the address forces it. **Normal is the default.**

| | **Normal** (default, for non-technical users) | **Expert** |
|---|---|---|
| Steps per calibration | 2–3: prepare → act → done | 3–5 with the details |
| Values | none shown | live readings, correction slider… and a collapsible *Values currently in the robot* block under every view |
| Factory values | none | explicit button in every wizard |
| Intermediate measurements | none: plain questions instead (*did it go straight?*) | live sensors, test runs with numbers |
| Saving | automatic at the end of the flow | explicit *Save* |
| Diagnostics | none | firmware, battery, communication log |

Both versions send the same operations to the robot, so the stored result is the same kind of value.
In Normal, the straight line converges by **halving the step each time the answer flips**
(*veered left → veered right* …); the distance offers **two correction sizes** on each side (*did not reach the
line – by far* = 4 % of the duration, *did not reach the line* = 1 %, same for *went past*); after each run the
test can simply be **repeated** without answering, the gyroscope runs the offsets measurement and the full turn from a
single *Start*, and the ground sensors refuse a measurement where white and black are not clearly different.
The Normal version is a first draft meant to be refined with user testing.

## The five wizards (Expert)

| # | Wizard | What it calibrates |
|---|---|---|
| 1 | **Motors: straight line** | Left/right motor correction (±50, about ±20 %) so the robot drives straight |
| 2 | **Motors: 15 cm** | Travel time for exactly 15 cm forward and backward (and the backward/forward ratio) |
| 3 | **Gyroscope** | Resting offsets (x, y, z), then the rotation scale so 360° is a real full turn: a line is drawn along the robot's back side, the robot spins 360° and is re-aligned on the line with the ↺ ↻ buttons or by hand (the gyroscope measures it) |
| 4 | **Ground sensors** | Black and white reference of the two front IR sensors (reflected − ambient) |
| 5 | **Colour sensor** | White and black reference of the colour sensor |

Suggested order: 1 → 2 → 3 → 4 → 5. Every wizard has a *factory values* button (except the
colour sensor, for which the firmware has no reset: just redo white and black), and the home
page shows what the robot currently stores, flagged *factory value* or *changed*.

The drawings are language-neutral vector illustrations of the robot (top, bottom and side
views) traced from the Mobsya [3D viewer](https://mobsya.github.io/thymio3-viewer/): white D-shaped
body with a round front and a flat back, 4-hole wheels at the back, flush with the body and set in notches of the lower shell (so they show from below), and underneath (kept simple), at the front, the
sliding point of contact, the colour-sensor slot right behind it and the two IR ground sensors
close to the front edge.

## Starting point: existing calibrations are kept and refined

Unlike the on-robot menu, which resets several settings to their defaults when you enter a mode, the
wizards **start from what the robot already stores** (read when you connect):

- **Straight line / 15 cm**: the correction and the durations start at the stored values.
- **Ground sensors / colour**: white and black are measured independently; measuring one never touches the other.
- **Gyroscope offsets**: a new resting measurement (replaces the old one, by nature).
- **Gyroscope rotation scale**: the turn is made with the stored scale and the error you compensate is
  **added** to it, so another turn refines an existing calibration (the menu restarts from the nominal scale).
  This incremental rule is a first-order assumption, not documented by the firmware: check it on hardware.
- Factory values are only applied through the explicit *Factory values* button.
- Nothing is permanent until *Save*: leaving a wizard with a trial value applied puts back what the robot had.
  If the current values cannot be read, the wizard says so and starts from the factory values.

## How values reach the robot

The firmware keeps its calibrations in flash files (`/spiffs/*.dat`, written by `settings.c`).
The Bluetooth file service only reaches the MicroPython file system, not those files — but the
firmware's MicroPython `thymio` module exposes the same `Settings_*` functions the menu uses.
The app therefore sends one tiny MicroPython script per step (see [`src/python.js`](src/python.js))
through [`thymio3-ts-api`](https://github.com/Mobsya/thymio3-ts-api)
(`sendPythonScript()` / `executeLoadedScript()`) and reads the result from stdout.

| Menu mode (`behavior.c`) | Wizard | MicroPython calls | Stored in |
|---|---|---|---|
| Motor | Motors: straight line | `MOTORS.set_straight_calibration(256+c, 256-c)`, `save_straight_calibration()` | `motors.dat` |
| MotorFwBw | Motors: 15 cm | `distance_calib_timer_*`, `set_distance_calibration`, `save_distance_calibration` | `mot_15cm.dat`, `mot_fw_bw.dat` |
| Color | Colour sensor | `COLOR_SENSOR.calibrate_and_save_white/black()` | `white.dat`, `black.dat` |
| Gyro (offsets) | Gyroscope | `IMU.calibrate_gyro()`, `save_gyro_calib()` | `zero_off_gyro.dat` |
| Gyro (rotation) | Gyroscope | `rotate_deg(-360)`, nudges, `set_gyro_scale_calib(-angle/4)`, `save_gyro_scale_calib()` | `gyro_rot.dat` |
| Ground | Ground sensors | reflected − ambient, `GROUND.set_calibration_from_values`, `save_calibration_from_values` | `ground_white.dat`, `ground_black.dat` |

Every script disables the robot's behaviours at the start and re-enables them in a `finally`
block with the motors stopped, so the **STOP** button and errors leave the robot in a clean state.
Not included: volume and Wi-Fi credential reset (menu entries that are not calibrations).

## Status — please read

The procedures come from the firmware sources, and the Bluetooth layer was checked against a mocked
robot, but **the full set of calibrations has not yet been validated on a physical robot**. Points to
check on hardware:

- `MOTORS.set_straight_calibration` is documented as ±50 but the firmware code expects raw values
  206–306; the app sends raw values (256 ± correction), reads them back and warns on mismatch.
- The gyroscope rotation scale follows the firmware formula (`-angle / 4`); the direction of the
  *a bit left / a bit right* nudges and the angle unit should be confirmed.
- Scripts disable and re-enable the behaviours around each step; the gyro angle integration is
  assumed to keep running in between.
- Ground values are averaged over 10 samples (the menu takes a single sample after the same 1 s wait).
- Positions of the underside sensors in the drawings were measured on the 3D model and may be a
  few millimetres off.

Issues and corrections are welcome.

### Troubleshooting

- **"Timed out waiting for load ACK" right after connecting.** The robot acknowledges requests with
  BLE *indications*, and only one can be in flight at a time. The app therefore waits about 2 s after
  connecting (so the API's own device-info request finishes), asks for the firmware version once, and
  only then uploads the first script. If an upload acknowledgement is still lost, the script is run
  anyway (the firmware marks it ready regardless) and checked through an end-of-script marker; if
  nothing came back, it is re-sent once. If the problem persists, please open an issue with the
  browser console log.
- **Settings cannot be read although the script ran ("Script terminated normally").** The firmware buffers
  what a script prints and only sends it once 100 bytes have accumulated or after 1 s of silence, and the
  "script terminated" notification does not wait for it. The app waits for the script's end marker (padded
  to over 100 bytes so the firmware flushes at once) before reading the result. Each setting is also read on
  its own, so a firmware that lacks one function still shows the others and lists the unreadable ones.
- **Everything stalls: device-info request without answer, upload frozen for 30 s, then the robot disconnects;
  `RangeError: Offset is outside the bounds of the DataView` in the console.** Cause (found in the firmware
  sources): each sensor stream pushes 50 notifications/s through only 12 BLE buffers
  (`CONFIG_NIMBLE_MSYS1_BLOCK_COUNT=12`). Both streams (100/s) exhaust them within about a second on a slow
  link; the firmware then sends empty notifications (the `RangeError`) and no request or indication gets
  through. The app therefore **does not stream at connection**, runs **one stream at a time and only in the
  steps that show live values**, **pauses streaming during every script**, and **suspends live readings
  automatically** (with a *Retry* button) if it sees an empty notification. The battery voltage is read with
  the settings instead of streamed.
- **Anything else.** Open *Communication log* at the bottom of the page (real robot only), press *Copy* and
  paste it in the issue: it lists every step with timestamps (connection, upload, acknowledgement, script
  output, errors raised inside the Thymio API).
- The firmware version is shown in the top bar once connected.

## Run locally

```bash
git clone https://github.com/FrancescoMondada/thymio3-calibration
cd thymio3-calibration
npm install
npm run dev          # http://localhost:5174
npm run build        # static site in dist/
```

Web Bluetooth needs a secure context: `localhost` and HTTPS pages work, a plain-HTTP network
address does not.

## Project layout

```
src/python.js      MicroPython snippets sent to the robot (one per step) + output parser
src/robot.js       RealRobot: Web Bluetooth via thymio3-ts-api, streaming and script runner
src/wizards.jsx    The five Expert wizards   src/Wizard.jsx  Expert step-by-step shell
src/normal.jsx     The five Normal wizards (short flows, no values)    src/registry.js  Both sets
src/robot-art.jsx  Robot drawings (top, bottom, side)    src/art.jsx  Illustration per step
src/i18n.js (+ i18n-de.js, i18n-it.js)  FR / EN / DE / IT strings  src/useRobot.jsx  Connection, telemetry, busy/error state
```

Deployment: every push to `main` builds the site and publishes it with GitHub Actions
([`.github/workflows/pages.yml`](.github/workflows/pages.yml)). `thymio3-ts-api` is taken from
`Mobsya/thymio3-ts-api#main`, so each build uses current upstream.

## Credits

Built on the Thymio 3 firmware and API by [Mobsya](https://www.mobsya.org). The calibrations are
written by the firmware itself; this project only drives it.

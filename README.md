# Thymio 3 — Calibration

Guided web application that replaces the calibration menus of the Thymio 3 (the ones you
reach by holding ◀ ▶ for 3 s). Each calibration is a short wizard with illustrations, live
sensor readings and a **Save to robot** step that stores the values in the robot's flash,
exactly where the on-robot menu stores them.

**▶ App: <https://francescomondada.github.io/thymio3-calibration/>** — opens ready to connect to a robot.
· **Live demo (no robot needed): <https://francescomondada.github.io/thymio3-calibration/?demo>**

The app starts **not** in demo mode: click *Connect robot* to pair a Thymio 3 (or *Demo mode*
to try it without one). The demo runs against a *simulated* robot (slightly imperfect on purpose,
so there is something to calibrate); nothing is written to any real robot in demo mode, and you can
switch to a real robot at any time with *Connect robot*. To use a real robot, open the app in **Google Chrome or Microsoft Edge** (Web Bluetooth is not
available in Firefox or Safari; the app shows a prominent warning there) and click *Connect robot*. The interface is available in French and English.

## The five wizards

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

The procedures come from the firmware sources, and the whole interface is exercised in demo
mode, but **the app has not yet been validated on a physical robot**. Points to check on
hardware:

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

## Run locally

```bash
git clone https://github.com/FrancescoMondada/thymio3-calibration
cd thymio3-calibration
npm install
npm run dev          # http://localhost:5174  (add ?demo for the simulated robot)
npm run build        # static site in dist/
```

Web Bluetooth needs a secure context: `localhost` and HTTPS pages work, a plain-HTTP network
address does not.

## Project layout

```
src/python.js      MicroPython snippets sent to the robot (one per step) + output parser
src/robot.js       RealRobot (Web Bluetooth via thymio3-ts-api) and DemoBackend
src/demo.js        Simulated robot used by the demo mode
src/wizards.jsx    The five wizards          src/Wizard.jsx  Step-by-step shell
src/robot-art.jsx  Robot drawings (top, bottom, side)    src/art.jsx  Illustration per step
src/i18n.js        French / English strings  src/useRobot.jsx  Connection, telemetry, busy/error state
```

Deployment: every push to `main` builds the site and publishes it with GitHub Actions
([`.github/workflows/pages.yml`](.github/workflows/pages.yml)). `thymio3-ts-api` is taken from
`Mobsya/thymio3-ts-api#main`, so each build uses current upstream.

## Credits

Built on the Thymio 3 firmware and API by [Mobsya](https://www.mobsya.org). The calibrations are
written by the firmware itself; this project only drives it.

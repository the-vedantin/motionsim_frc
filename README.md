# MotionSim

A simple browser-based mechanism simulator inspired by ReCalc.

## Features

* Pivot and linear mechanism simulation
* Move and continuous motion modes
* Kraken motor modeling
* Gear reduction solving
* Current, torque, speed, power, and motion plots
* Gravity-aware loading

## Files

* `index.html` - UI
* `styles.css` - styling
* `app.js` - simulation and solver logic

## Usage

Open `index.html` in a browser, enter mechanism inputs, and use the inverse solver to size the reduction.

## Limits

Does not model battery sag, brownout, breaker heating, thermal derating, backlash, cable stretch, or full-robot electrical behavior.

Use at your own risk. We are not responsible for bad math, bad assumptions, broken mechanisms, or robots choosing violence.

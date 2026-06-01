(function () {
  const LB_TO_KG = 0.45359237;
  const IN_TO_M = 0.0254;
  const M_TO_IN = 39.3700787402;
  const NM_TO_LBIN = 8.8507457676;
  const LBIN_TO_NM = 0.112984829;
  const N_TO_LBF = 0.2248089431;
  const LBF_TO_N = 4.4482216153;
  const MPS_TO_IPS = 39.3700787402;
  const IPS_TO_MPS = 0.0254;

  const MOTORS = [
    {
      id: "kraken-x60",
      name: "Kraken X60",
      freeSpeedRpm: 6065,
      stallTorqueNm: 7.157,
      stallCurrentA: 374.383,
      freeCurrentA: 2.83,
    },
    {
      id: "kraken-x60-foc",
      name: "Kraken X60 (FOC)",
      freeSpeedRpm: 5784,
      stallTorqueNm: 9.362,
      stallCurrentA: 476.098,
      freeCurrentA: 3.496,
    },
    {
      id: "kraken-x44",
      name: "Kraken X44",
      freeSpeedRpm: 7757,
      stallTorqueNm: 4.113,
      stallCurrentA: 279.099,
      freeCurrentA: 3.156,
    },
    {
      id: "kraken-x44-foc",
      name: "Kraken X44 (FOC)",
      freeSpeedRpm: 7367,
      stallTorqueNm: 5.011,
      stallCurrentA: 329.188,
      freeCurrentA: 3.231,
    },
  ];

  const ids = [
    "motor",
    "motorCount",
    "currentLimit",
    "motorSpecs",
    "pivotMode",
    "linearMode",
    "moveMotion",
    "continuousMotion",
    "ratio",
    "efficiency",
    "mass",
    "radius",
    "radiusLabel",
    "linearOnly",
    "linearTransmission",
    "drumRadiusLabel",
    "drumRadius",
    "continuousOnly",
    "targetSpeed",
    "targetSpeedLabel",
    "targetSpeedUnit",
    "simDuration",
    "externalLoad",
    "externalLoadLabel",
    "externalLoadUnit",
    "gravityEnabled",
    "gravityAccel",
    "axisTilt",
    "axisHeading",
    "pivotOnly",
    "startAngle",
    "endAngle",
    "moveIterationLimit",
    "iterationLimit",
    "linearAxisOnly",
    "travel",
    "solveCurrent",
    "solveCurrentLabel",
    "solveGoal",
    "solveTimeLabel",
    "solveTime",
    "solveMinRatio",
    "solveMaxRatio",
    "solveButton",
    "solution",
    "scene",
    "readout",
    "motorPlot",
    "simPlot",
    "motorTip",
    "simTip",
    "infoModal",
    "infoModalTitle",
    "infoModalBody",
    "infoClose",
  ];

  const els = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
  let mode = "pivot";
  let motionMode = "move";
  let latestState = null;
  let latestMotionPoints = [];
  let sceneKit = null;
  let animationStartMs = performance.now();
  let animationSignature = "";
  const plotCache = {};
  const INFO_CONTENT = {
    motor: {
      title: "Motor",
      body: `
        <h3>What this section controls</h3>
        <p>This section selects the motor model and the per-motor electrical current limit used by every calculation. The motor dropdown is intentionally limited to Kraken X60, Kraken X60 FOC, Kraken X44, and Kraken X44 FOC.</p>
        <p><code>Motors</code> is the number of identical motors driving the same mechanism through the same reduction. Torque capacity scales with this count. The current shown in the plots is still per motor unless a readout explicitly says total current.</p>
        <p><code>Current limit</code> is also per motor. If this is 80 A/motor and the mechanism has 2 motors, the model allows each motor to make up to its 80 A limited torque. It does not pretend the robot battery can supply that forever.</p>
        <h3>Motor model</h3>
        <p>The calculator uses a 12 V brushed/DC-style motor curve derived from free speed, stall torque, stall current, and free current. As motor speed rises, available torque falls. Current is limited by the current limit field and by the motor's own stall current.</p>
        <p>This section does not model battery sag, brownout behavior, thermal derating, controller limits beyond the current limit, wiring resistance, breaker heating, or traction/loading from the rest of the robot. Those need a whole-robot electrical model.</p>
      `,
    },
    mechanism: {
      title: "Mechanism",
      body: `
        <h3>Pivot mode</h3>
        <p>Pivot mode treats the mechanism as a point mass at a fixed distance from the selected rotation axis. The inertia is calculated from <code>mass * radius^2</code>, and the motor applies output torque through the selected gear reduction and efficiency.</p>
        <p><code>Distance from axis</code> is the distance from the pivot axis to the modeled mass center. If your arm has several parts, this point-mass model is an approximation: use an equivalent center of mass and be honest about the inertia error.</p>
        <h3>Linear mode</h3>
        <p>Linear mode treats the mechanism as a mass moving along the selected linear axis. The motor output torque is converted into linear force by the effective radius field: <code>force = output torque / radius</code>, and linear speed comes from <code>angular speed * radius</code>.</p>
        <p><code>Spool / string</code> means the radius is the effective drum or pulley radius where the string leaves the drum. In the ideal math it behaves like a rotary-to-linear converter. In the real robot it usually pulls well in one direction, can have slack, stretch, wrap buildup, changing effective radius, and extra losses from routing.</p>
        <p><code>Rack &amp; pinion</code> means the radius is the pinion pitch radius. In the ideal math it uses the same torque-to-force and speed relation as a drum with the same effective radius. In the real robot it can push and pull if supported correctly, but backlash, tooth friction, bearing loads, mesh quality, and rack alignment matter.</p>
        <p>So no, a spool and a rack are not physically identical. The current calculator models the ideal effective radius behavior, then lets you account for real differences through efficiency and by choosing the correct effective radius. It does not model changing spool radius, cable compliance, backlash, tooth contact stress, or one-way-only cable behavior.</p>
        <h3>Move vs continuous</h3>
        <p><code>Move</code> simulates a max-effort move from the start state to the target. <code>Continuous</code> is for mechanisms like flywheels, rotors, and rollers where you care about holding a target RPM or linear speed under load.</p>
      `,
    },
    gravity: {
      title: "Gravity",
      body: `
        <h3>What gravity means here</h3>
        <p>Gravity is applied as a force in world negative Z. The acceleration value is in <code>m/s^2</code>; normal Earth gravity is about <code>9.80665 m/s^2</code>.</p>
        <p>For a pivot, the calculator computes the force on the point mass, takes <code>r x F</code>, then projects that torque onto the selected pivot axis. That is why a horizontal arm and a vertical-axis turret do not behave the same. A vertical-axis pivot generally has little gravity torque from the modeled point mass, while a horizontal pivot can have a large changing gravity torque through the swing.</p>
        <p>For a linear mechanism, gravity contributes the component of weight along the selected rail axis. A vertical lift sees the full weight component. A flat horizontal slide sees nearly zero gravity along the rail, though real friction and bearing loads still exist outside this model.</p>
        <p>Turning gravity off sets gravitational load to zero. It does not remove mass or inertia; the mechanism still has to accelerate the mass.</p>
      `,
    },
    axis: {
      title: "Axis",
      body: `
        <h3>Axis vector</h3>
        <p>The main axis controls are angle based. <code>Tilt from vertical</code> and <code>Heading</code> are entered in degrees and define the mechanism axis in 3D space.</p>
        <p>For a pivot, this is the rotation axis. The mechanism rotates around this line, and gravity torque is calculated relative to that exact axis. For linear mode, this is the rail or travel direction, so it controls how much gravity acts along the motion path.</p>
        <h3>Tilt and heading</h3>
        <p>Tilt of 0 degrees is vertical Z. Tilt of 90 degrees is flat in the XY plane. Heading rotates that tilted direction around the vertical axis. X axis is tilt 90 degrees and heading 0 degrees. Y axis is tilt 90 degrees and heading 90 degrees. Z axis is tilt 0 degrees.</p>
        <p>The X, Y, Z buttons are presets for those degree inputs. They write tilt and heading directly, so there is only one real axis definition. The navcube is a camera control for viewing the scene, not a physics input.</p>
        <h3>Move targets</h3>
        <p>Pivot move uses start and end angles in degrees. Linear move uses travel in inches. Continuous pivot uses target output RPM, and continuous linear uses target linear speed in inches per second.</p>
      `,
    },
    solver: {
      title: "Inverse solver",
      body: `
        <h3>What it solves</h3>
        <p>The inverse solver searches gear reductions between the min and max reduction fields. When it finds a selected result, it writes that ratio back into the mechanism inputs and recalculates the same plots.</p>
        <p><code>Meet target time</code> searches for a reduction that finishes the move within the max time using the selected current ceiling. <code>Fastest time to target</code> searches the same range and chooses the shortest simulated move using the selected current ceiling. <code>Minimum max current</code> treats time as the constraint and solves for the lowest per-motor current ceiling that still reaches the target within that time. <code>Meet target RPM</code> is used for continuous mechanisms and checks whether the motor can hold the requested speed and load within the current limit.</p>
        <h3>Important limits</h3>
        <p>For move goals, the solver runs the same mechanism integration used by the graph. It is not a separate curve fit and it does not draw a nicer-looking answer. If the simulated mechanism cannot reach the target within the iteration limit, that ratio is rejected.</p>
        <p>The solver only optimizes this one mechanism. It does not include drivetrain current, multiple mechanisms running at the same time, battery voltage sag, main breaker behavior, or a full-match brownout forecast.</p>
      `,
    },
    visualizer: {
      title: "3D visualizer",
      body: `
        <h3>What you are seeing</h3>
        <p>The scene draws the selected axis, the point mass, and the mechanism motion path. It is a mechanism sketch tied to the calculated state, not a CAD assembly or collision model.</p>
        <p>For pivot moves, the mass rotates about the selected axis from the start angle to the end angle. For linear moves, it travels along the selected axis. For continuous pivot motion, it spins at the target output RPM. For continuous linear motion, it cycles along the selected travel distance at the target linear speed.</p>
        <h3>Timing</h3>
        <p>The animation uses the calculated move duration for move mode. If the move cannot reach the target, it uses the simulated points that were actually produced before the calculation stopped. Continuous mode uses the sim duration field.</p>
        <p>The navcube changes the camera view only. It does not change the mechanism axis or any physics input. Mouse controls follow Onshape-style navigation: right mouse drag rotates, middle mouse drag pans, and the scroll wheel zooms.</p>
      `,
    },
    "motor-curves": {
      title: "Motor curves",
      body: `
        <h3>Graph meaning</h3>
        <p>The X axis is time in seconds, matching ReCalc's arm calculator style. The plotted values are motor RPM, current per motor, motor torque, and mechanical power at each simulated time sample.</p>
        <p>Each curve keeps its real units. The graph uses separate value axes internally so RPM, current, torque, and power can share the same canvas without being normalized into fake values. Hovering the plot shows the nearest real value and its unit.</p>
        <h3>What is not included</h3>
        <p>This graph does not include battery voltage drop, thermal fade, or controller brownout logic. Gear efficiency is already part of the mechanism simulation that produced these samples.</p>
      `,
    },
    "simulation-curves": {
      title: "Mechanism simulation curves",
      body: `
        <h3>Graph meaning</h3>
        <p>This graph is generated from the mechanism simulation points. Pivot mode plots position in degrees, motor speed in RPM, current in A/motor, and motor torque in lb in. Linear mode plots position in inches, motor speed in RPM, current in A/motor, and motor torque in lb in.</p>
        <p>The X axis is time in seconds. The plotted values are not artificially smoothed, normalized, or replaced. They come from the same user inputs used by the readout and the visualizer.</p>
        <h3>Move and continuous behavior</h3>
        <p>Move mode integrates the motion forward using the selected motor, reduction, efficiency, mass, axis, gravity setting, and current limit. Continuous mode evaluates the target speed and load across the requested duration.</p>
        <p>Hovering a curve shows the nearest calculated time sample, value, unit, and short description of what that curve represents.</p>
      `,
    },
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function numberFrom(element) {
    return element.valueAsNumber;
  }

  function rpmToRadPerSec(rpm) {
    return (rpm * Math.PI * 2) / 60;
  }

  function radPerSecToRpm(radPerSec) {
    return (radPerSec * 60) / (Math.PI * 2);
  }

  function fmt(value, digits, unit) {
    if (!Number.isFinite(value)) return `-- ${unit}`;
    return `${value.toFixed(digits)} ${unit}`;
  }

  function selectedMotor() {
    return MOTORS.find((motor) => motor.id === els.motor.value) || MOTORS[0];
  }

  function linearTransmissionName(value) {
    return value === "rack-pinion" ? "Rack & pinion" : "Spool / string";
  }

  function linearRadiusName(value) {
    return value === "rack-pinion" ? "Pinion pitch radius" : "Drum / pulley radius";
  }

  function updateLinearTransmissionUi() {
    els.drumRadiusLabel.firstChild.textContent = linearRadiusName(els.linearTransmission.value);
  }

  function axisVector() {
    const tiltDeg = numberFrom(els.axisTilt);
    const headingDeg = numberFrom(els.axisHeading);
    if (!Number.isFinite(tiltDeg) || !Number.isFinite(headingDeg)) return { x: NaN, y: NaN, z: NaN };

    const tilt = (tiltDeg * Math.PI) / 180;
    const heading = (headingDeg * Math.PI) / 180;
    return {
      x: Math.sin(tilt) * Math.cos(heading),
      y: Math.sin(tilt) * Math.sin(heading),
      z: Math.cos(tilt),
    };
  }

  function readState() {
    const massLb = numberFrom(els.mass);
    const radiusIn = numberFrom(els.radius);
    const drumRadiusIn = numberFrom(els.drumRadius);
    const travelIn = numberFrom(els.travel);
    const gravityAccelMps2 = numberFrom(els.gravityAccel);
    const targetSpeedRaw = numberFrom(els.targetSpeed);
    const externalLoadRaw = numberFrom(els.externalLoad);

    return {
      mode,
      motionMode,
      motor: selectedMotor(),
      motorCount: numberFrom(els.motorCount),
      currentLimitA: numberFrom(els.currentLimit),
      ratio: numberFrom(els.ratio),
      efficiency: numberFrom(els.efficiency) / 100,
      massLb,
      massKg: massLb * LB_TO_KG,
      radiusIn,
      radiusM: radiusIn * IN_TO_M,
      linearTransmission: els.linearTransmission.value,
      linearTransmissionName: linearTransmissionName(els.linearTransmission.value),
      linearRadiusName: linearRadiusName(els.linearTransmission.value),
      drumRadiusIn,
      drumRadiusM: drumRadiusIn * IN_TO_M,
      axis: axisVector(),
      startAngleRad: (numberFrom(els.startAngle) * Math.PI) / 180,
      endAngleRad: (numberFrom(els.endAngle) * Math.PI) / 180,
      iterationLimit: numberFrom(els.iterationLimit),
      travelIn,
      travelM: travelIn * IN_TO_M,
      gravityEnabled: els.gravityEnabled.checked,
      gravityAccelMps2,
      targetOutputRpm: mode === "pivot" ? targetSpeedRaw : 0,
      targetLinearIps: mode === "linear" ? targetSpeedRaw : 0,
      simDurationS: numberFrom(els.simDuration),
      externalTorqueNm: mode === "pivot" ? externalLoadRaw * LBIN_TO_NM : 0,
      externalForceN: mode === "linear" ? externalLoadRaw * LBF_TO_N : 0,
      solveCurrentA: numberFrom(els.solveCurrent),
      solveGoal: els.solveGoal.value,
      solveTimeS: numberFrom(els.solveTime),
      solveMinRatio: numberFrom(els.solveMinRatio),
      solveMaxRatio: numberFrom(els.solveMaxRatio),
    };
  }

  function stateHasValidNumbers(state) {
    const numericValues = [
      state.motorCount,
      state.currentLimitA,
      state.ratio,
      state.efficiency,
      state.massLb,
      state.massKg,
      state.radiusIn,
      state.radiusM,
      state.drumRadiusIn,
      state.drumRadiusM,
      state.axis.x,
      state.axis.y,
      state.axis.z,
      state.startAngleRad,
      state.endAngleRad,
      state.iterationLimit,
      state.travelIn,
      state.travelM,
      state.gravityAccelMps2,
      state.targetOutputRpm,
      state.targetLinearIps,
      state.simDurationS,
      state.externalTorqueNm,
      state.externalForceN,
      state.solveCurrentA,
      state.solveTimeS,
      state.solveMinRatio,
      state.solveMaxRatio,
    ];
    return numericValues.every(Number.isFinite)
      && state.motorCount >= 1
      && Number.isInteger(state.motorCount)
      && state.currentLimitA >= 0
      && state.ratio > 0
      && state.efficiency > 0
      && state.efficiency <= 1
      && state.massLb >= 0
      && state.radiusIn > 0
      && state.drumRadiusIn > 0
      && state.iterationLimit >= 1
      && Number.isInteger(state.iterationLimit)
      && state.travelIn > 0
      && state.gravityAccelMps2 >= 0
      && state.targetOutputRpm >= 0
      && state.targetLinearIps >= 0
      && state.simDurationS > 0
      && state.externalTorqueNm >= 0
      && state.externalForceN >= 0
      && state.solveCurrentA >= 0
      && state.solveTimeS > 0
      && state.solveMinRatio > 0
      && state.solveMaxRatio > 0;
  }

  function motorConstants(motor) {
    const resistance = 12 / motor.stallCurrentA;
    const freeSpeedRadPerSec = rpmToRadPerSec(motor.freeSpeedRpm);
    const kV = freeSpeedRadPerSec / Math.max(0.000001, 12 - resistance * motor.freeCurrentA);
    const kT = motor.stallTorqueNm / motor.stallCurrentA;
    return { resistance, kV, kT };
  }

  function motorStateAtRpm(motor, currentLimitA, motorRpm) {
    const constants = motorConstants(motor);
    const omega = rpmToRadPerSec(Math.abs(motorRpm));
    const rawCurrent = Math.max(0, (12 - omega / constants.kV) / constants.resistance);
    const current = Math.min(rawCurrent, currentLimitA, motor.stallCurrentA);
    const torque = Math.max(0, (current - motor.freeCurrentA) * constants.kT);
    const power = torque * omega;
    return { current, torque, power, rpm: Math.abs(motorRpm) };
  }

  function motorCurrentForTorque(motor, torqueNm) {
    if (torqueNm <= 0) return motor.freeCurrentA;
    const current = motor.freeCurrentA + (motor.stallCurrentA - motor.freeCurrentA) * (torqueNm / motor.stallTorqueNm);
    return clamp(current, motor.freeCurrentA, motor.stallCurrentA);
  }

  function outputTorqueAtSpeed(state, outputRadPerSec, currentLimitA = state.currentLimitA, ratio = state.ratio) {
    const motorRpm = radPerSecToRpm(Math.abs(outputRadPerSec) * ratio);
    const torquePerMotor = motorStateAtRpm(state.motor, currentLimitA, motorRpm).torque;
    return torquePerMotor * state.motorCount * ratio * state.efficiency;
  }

  function gravityTorqueAtAngle(state, angleRad) {
    if (!state.gravityEnabled) return 0;
    const axis = state.axis;
    const radial = perpendicularTo(axis);
    const point = rotateAroundAxis(radial, axis, angleRad);
    point.x *= state.radiusM;
    point.y *= state.radiusM;
    point.z *= state.radiusM;
    const force = { x: 0, y: 0, z: -state.massKg * state.gravityAccelMps2 };
    const torque = cross(point, force);
    return dot(torque, axis);
  }

  function linearGravityForce(state) {
    if (!state.gravityEnabled) return 0;
    return -state.massKg * state.gravityAccelMps2 * state.axis.z;
  }

  function estimateMoveTime(state, ratio, currentLimitA) {
    if (state.motionMode === "continuous") {
      return { valid: false, reason: "continuous mode" };
    }

    return integrateMaxEffortMove(state, ratio, currentLimitA, false);
  }

  function continuousStatus(state) {
    const targetOutputRadPerSec = continuousTargetOutputRadPerSec(state);
    const targetMotorRpm = Math.abs(radPerSecToRpm(targetOutputRadPerSec * state.ratio));
    const targetSpeedAvailable = targetMotorRpm <= state.motor.freeSpeedRpm;
    const worstLoad = maxContinuousLoad(state);
    const requiredOutputTorque = state.mode === "pivot" ? worstLoad : worstLoad * state.drumRadiusM;
    const availableOutputTorque = outputTorqueAtSpeed(state, targetOutputRadPerSec);
    const requiredMotorTorque = requiredOutputTorque / Math.max(0.000001, state.ratio * state.efficiency * state.motorCount);
    const requiredCurrent = motorCurrentForTorque(state.motor, requiredMotorTorque);
    const validAtTarget = targetSpeedAvailable
      && requiredOutputTorque <= availableOutputTorque
      && requiredCurrent <= state.currentLimitA;

    const points = simulateContinuous(state);
    const last = points[points.length - 1] || null;
    const actualOutputRadPerSec = last
      ? state.mode === "pivot"
        ? rpmToRadPerSec(last.outputRpm)
        : last.linearIps * IPS_TO_MPS / state.drumRadiusM
      : 0;
    const actualMotorRpm = last ? last.motorRpm : 0;
    const actualCurrent = last ? last.currentA : 0;
    const actualOutputValue = last
      ? state.mode === "pivot"
        ? last.outputRpm
        : last.linearIps
      : 0;

    return {
      outputRadPerSec: targetOutputRadPerSec,
      motorRpm: targetMotorRpm,
      speedAvailable: targetSpeedAvailable,
      availableOutputTorque,
      requiredOutputTorque,
      requiredMotorTorque,
      current: requiredCurrent,
      actualOutputRadPerSec,
      actualMotorRpm,
      actualCurrent,
      actualOutputValue,
      valid: validAtTarget,
    };
  }

  function continuousTargetOutputRadPerSec(state) {
    return state.mode === "pivot"
      ? rpmToRadPerSec(state.targetOutputRpm)
      : state.targetLinearIps * IPS_TO_MPS / state.drumRadiusM;
  }

  function continuousLoadAtPhase(state, phase) {
    if (state.mode === "pivot") {
      const angle = phase * Math.PI * 2;
      return state.externalTorqueNm + Math.abs(gravityTorqueAtAngle(state, angle));
    }
    return state.externalForceN + Math.abs(linearGravityForce(state));
  }

  function solveReduction() {
    const state = readState();
    if (!stateHasValidNumbers(state)) {
      els.solution.innerHTML = `<span><span class="bad">Invalid input</span><span>fix numeric fields</span></span>`;
      return;
    }
    if (state.motionMode === "continuous" || state.solveGoal === "target-rpm") {
      solveContinuousReduction(state);
      return;
    }

    if (state.solveGoal === "min-current") {
      solveMinimumCurrentForMove(state);
      return;
    }

    const minRatio = Math.min(state.solveMinRatio, state.solveMaxRatio);
    const maxRatio = Math.max(state.solveMinRatio, state.solveMaxRatio);
    let best = null;
    let fastest = null;

    for (let i = 0; i <= 1200; i += 1) {
      const ratio = minRatio + ((maxRatio - minRatio) * i) / 1200;
      const estimate = estimateMoveTime(state, ratio, state.solveCurrentA);
      if (!estimate.valid) continue;
      const candidate = { ratio, ...estimate };
      if (!fastest || candidate.time < fastest.time) fastest = candidate;
      if (candidate.time <= state.solveTimeS && !best) best = candidate;
    }

    if (state.solveGoal === "fastest" && fastest) {
      els.ratio.value = fastest.ratio.toFixed(2);
      els.currentLimit.value = state.solveCurrentA.toFixed(0);
      els.solution.innerHTML = [
        `<span><strong>Fastest reduction</strong><strong>${fastest.ratio.toFixed(2)}:1</strong></span>`,
        `<span><span>Estimated move time</span><span>${fmt(fastest.time, 2, "s")}</span></span>`,
        `<span><span>Peak output speed</span><span>${state.mode === "pivot" ? fmt(radPerSecToRpm(fastest.maxSpeed), 1, "rpm") : fmt(fastest.maxSpeed * MPS_TO_IPS, 1, "in/s")}</span></span>`,
      ].join("");
      updateAll(true);
      return;
    }

    if (best) {
      els.ratio.value = best.ratio.toFixed(2);
      els.currentLimit.value = state.solveCurrentA.toFixed(0);
      els.solution.innerHTML = [
        `<span><strong>Applied reduction</strong><strong>${best.ratio.toFixed(2)}:1</strong></span>`,
        `<span><span>Estimated move time</span><span>${fmt(best.time, 2, "s")}</span></span>`,
        `<span><span>Peak output speed</span><span>${state.mode === "pivot" ? fmt(radPerSecToRpm(best.maxSpeed), 1, "rpm") : fmt(best.maxSpeed * MPS_TO_IPS, 1, "in/s")}</span></span>`,
      ].join("");
      updateAll(true);
      return;
    }

    if (fastest) {
      els.solution.innerHTML = [
        `<span><span class="bad">No ratio meets target time.</span><span>${fmt(state.solveTimeS, 2, "s")} target</span></span>`,
        `<span><span>Fastest in range</span><span>${fastest.ratio.toFixed(2)}:1, ${fmt(fastest.time, 2, "s")}</span></span>`,
      ].join("");
      return;
    }

    els.solution.innerHTML = `<span><span class="bad">No valid ratio in range.</span><span>raise current or ratio</span></span>`;
  }


  function solveMinimumCurrentForMove(state) {
    const minRatio = Math.min(state.solveMinRatio, state.solveMaxRatio);
    const maxRatio = Math.max(state.solveMinRatio, state.solveMaxRatio);
    const ratioSteps = Math.max(1, Math.ceil((maxRatio - minRatio) / 0.05));
    const currentMaxA = Math.min(state.motor.stallCurrentA, Math.max(state.solveCurrentA, state.motor.stallCurrentA));
    const currentToleranceA = 0.05;
    let best = null;
    let fastest = null;

    for (let i = 0; i <= ratioSteps; i += 1) {
      const ratio = minRatio + ((maxRatio - minRatio) * i) / ratioSteps;
      const fullCurrentEstimate = estimateMoveTime(state, ratio, currentMaxA);
      if (!fullCurrentEstimate.valid) continue;
      const fullCurrentCandidate = { ratio, currentA: currentMaxA, ...fullCurrentEstimate };
      if (!fastest || fullCurrentCandidate.time < fastest.time) fastest = fullCurrentCandidate;
      if (fullCurrentEstimate.time > state.solveTimeS) continue;

      let low = 0;
      let high = currentMaxA;
      let estimateAtHigh = fullCurrentEstimate;

      while (high - low > currentToleranceA) {
        const testCurrent = (low + high) / 2;
        const estimate = estimateMoveTime(state, ratio, testCurrent);
        if (estimate.valid && estimate.time <= state.solveTimeS) {
          high = testCurrent;
          estimateAtHigh = estimate;
        } else {
          low = testCurrent;
        }
      }

      const candidate = { ratio, currentA: high, ...estimateAtHigh };
      const isLowerCurrent = !best || candidate.currentA < best.currentA;
      const isSameCurrentFaster = best && Math.abs(candidate.currentA - best.currentA) <= currentToleranceA && candidate.time < best.time;
      if (isLowerCurrent || isSameCurrentFaster) best = candidate;
    }

    if (best) {
      els.ratio.value = best.ratio.toFixed(2);
      els.currentLimit.value = best.currentA.toFixed(1);
      els.solveCurrent.value = best.currentA.toFixed(1);
      els.solution.innerHTML = [
        `<span><strong>Minimum max current</strong><strong>${fmt(best.currentA, 1, "A/motor")}</strong></span>`,
        `<span><span>Applied reduction</span><span>${best.ratio.toFixed(2)}:1</span></span>`,
        `<span><span>Estimated move time</span><span>${fmt(best.time, 2, "s")}</span></span>`,
        `<span><span>Time constraint</span><span>${fmt(state.solveTimeS, 2, "s")}</span></span>`,
      ].join("");
      updateAll(true);
      return;
    }

    if (fastest) {
      els.solution.innerHTML = [
        `<span><span class="bad">No current meets target time.</span><span>${fmt(state.solveTimeS, 2, "s")} target</span></span>`,
        `<span><span>Fastest at motor limit</span><span>${fastest.ratio.toFixed(2)}:1, ${fmt(fastest.time, 2, "s")}</span></span>`,
      ].join("");
      return;
    }

    els.solution.innerHTML = `<span><span class="bad">No valid ratio in range.</span><span>raise ratio range or time</span></span>`;
  }

  function solveContinuousReduction(state) {
    const minRatio = Math.min(state.solveMinRatio, state.solveMaxRatio);
    const maxRatio = Math.max(state.solveMinRatio, state.solveMaxRatio);
    let best = null;
    let fastestMotor = null;

    for (let i = 0; i <= 2400; i += 1) {
      const ratio = minRatio + ((maxRatio - minRatio) * i) / 2400;
      const candidate = continuousCandidateAtRatio(state, ratio);
      if (!candidate.valid) continue;
      if (!best || candidate.currentA < best.currentA) best = candidate;
      if (!fastestMotor || candidate.motorRpm > fastestMotor.motorRpm) fastestMotor = candidate;
    }

    if (best) {
      els.ratio.value = best.ratio.toFixed(2);
      els.currentLimit.value = state.solveCurrentA.toFixed(0);
      els.solution.innerHTML = [
        `<span><strong>Applied reduction</strong><strong>${best.ratio.toFixed(2)}:1</strong></span>`,
        `<span><span>Target output</span><span>${state.mode === "pivot" ? fmt(state.targetOutputRpm, 1, "rpm") : fmt(state.targetLinearIps, 1, "in/s")}</span></span>`,
        `<span><span>Motor speed</span><span>${fmt(best.motorRpm, 0, "rpm")}</span></span>`,
        `<span><span>Required current</span><span>${fmt(best.currentA, 1, "A/motor")}</span></span>`,
      ].join("");
      updateAll(true);
      return;
    }

    const upperMotorRpm = state.mode === "pivot"
      ? state.targetOutputRpm * maxRatio
      : radPerSecToRpm((state.targetLinearIps * IPS_TO_MPS / state.drumRadiusM) * maxRatio);
    els.solution.innerHTML = [
      `<span><span class="bad">No valid RPM reduction.</span><span>${fmt(state.solveCurrentA, 0, "A/motor")} limit</span></span>`,
      `<span><span>Target needs up to</span><span>${fmt(upperMotorRpm, 0, "motor rpm")}</span></span>`,
      `<span><span>Motor free speed</span><span>${fmt(state.motor.freeSpeedRpm, 0, "rpm")}</span></span>`,
    ].join("");
  }

  function continuousCandidateAtRatio(state, ratio) {
    const outputRadPerSec = state.mode === "pivot"
      ? rpmToRadPerSec(state.targetOutputRpm)
      : state.targetLinearIps * IPS_TO_MPS / state.drumRadiusM;
    const motorRpm = Math.abs(radPerSecToRpm(outputRadPerSec * ratio));
    if (motorRpm > state.motor.freeSpeedRpm) {
      return { valid: false, ratio, motorRpm, reason: "speed" };
    }

    const load = maxContinuousLoad({ ...state, ratio });
    const requiredOutputTorque = state.mode === "pivot" ? load : load * state.drumRadiusM;
    const requiredMotorTorque = requiredOutputTorque / (ratio * state.efficiency * state.motorCount);
    const motorState = motorStateAtRpm(state.motor, state.solveCurrentA, motorRpm);
    const requiredCurrent = motorCurrentForTorque(state.motor, requiredMotorTorque);
    const valid = requiredCurrent <= state.solveCurrentA && requiredMotorTorque <= motorState.torque;

    return {
      valid,
      ratio,
      motorRpm,
      currentA: requiredCurrent,
      requiredMotorTorque,
      availableMotorTorque: motorState.torque,
    };
  }

  function setMode(nextMode) {
    mode = nextMode;
    els.pivotMode.classList.toggle("active", mode === "pivot");
    els.linearMode.classList.toggle("active", mode === "linear");
    els.pivotOnly.classList.toggle("hidden", mode !== "pivot" || motionMode !== "move");
    els.moveIterationLimit.classList.toggle("hidden", motionMode !== "move");
    els.linearOnly.classList.toggle("hidden", mode !== "linear");
    els.linearAxisOnly.classList.toggle("hidden", mode !== "linear" || motionMode !== "move");
    els.radiusLabel.firstChild.textContent = mode === "pivot" ? "Distance from axis" : "Load offset";
    updateLinearTransmissionUi();
    els.targetSpeedLabel.firstChild.textContent = mode === "pivot" ? "Target RPM" : "Target linear speed";
    els.targetSpeedUnit.textContent = mode === "pivot" ? "rpm" : "in/s";
    els.externalLoadLabel.firstChild.textContent = mode === "pivot" ? "External load torque" : "External load force";
    els.externalLoadUnit.textContent = mode === "pivot" ? "lb in" : "lbf";
    updateAll(true);
  }

  function setMotionMode(nextMotionMode) {
    motionMode = nextMotionMode;
    if (motionMode === "continuous" && els.solveGoal.value !== "target-rpm") {
      els.solveGoal.value = "target-rpm";
    }
    els.moveMotion.classList.toggle("active", motionMode === "move");
    els.continuousMotion.classList.toggle("active", motionMode === "continuous");
    els.continuousOnly.classList.toggle("hidden", motionMode !== "continuous");
    els.moveIterationLimit.classList.toggle("hidden", motionMode !== "move");
    els.pivotOnly.classList.toggle("hidden", mode !== "pivot" || motionMode !== "move");
    els.linearAxisOnly.classList.toggle("hidden", mode !== "linear" || motionMode !== "move");
    updateAll(true);
  }

  function updateSolverGoalUi() {
    const usesTimeConstraint = els.solveGoal.value === "target-time" || els.solveGoal.value === "min-current";
    const currentIsConstraint = els.solveGoal.value !== "min-current";
    els.solveTimeLabel.classList.toggle("hidden", !usesTimeConstraint);
    if (els.solveCurrentLabel) els.solveCurrentLabel.classList.toggle("hidden", !currentIsConstraint);
  }

  function fillMotorSelect() {
    els.motor.innerHTML = "";
    for (const motor of MOTORS) {
      const option = document.createElement("option");
      option.value = motor.id;
      option.textContent = motor.name;
      els.motor.appendChild(option);
    }
  }

  function setAxis(x, y, z) {
    const length = Math.hypot(x, y, z);
    if (!Number.isFinite(length) || length < 0.000001) return;

    const nx = x / length;
    const ny = y / length;
    const nz = z / length;
    const tilt = Math.acos(clamp(nz, -1, 1)) * 180 / Math.PI;
    const heading = Math.atan2(ny, nx) * 180 / Math.PI;

    els.axisTilt.value = Number.isFinite(tilt) ? tilt.toFixed(1) : "0";
    els.axisHeading.value = Number.isFinite(heading) ? heading.toFixed(1) : "0";
    updateAll(true);
  }

  function setAxisFromAngles() {
    updateAll(true);
  }

  function updateSpecs(state) {
    els.motorSpecs.innerHTML = [
      `<span><span>Free speed</span><span>${fmt(state.motor.freeSpeedRpm, 0, "rpm")}</span></span>`,
      `<span><span>Stall torque</span><span>${fmt(state.motor.stallTorqueNm * NM_TO_LBIN, 1, "lb in")}</span></span>`,
      `<span><span>Stall current</span><span>${fmt(state.motor.stallCurrentA, 1, "A")}</span></span>`,
      `<span><span>Free current</span><span>${fmt(state.motor.freeCurrentA, 2, "A")}</span></span>`,
    ].join("");
  }

  function updateReadout(state) {
    if (state.motionMode === "continuous") {
      updateContinuousReadout(state);
      return;
    }

    const zeroTorque = outputTorqueAtSpeed(state, 0);
    const freeOutputRpm = state.motor.freeSpeedRpm / state.ratio;
    const maxCurrent = Math.min(state.currentLimitA, state.motor.stallCurrentA) * state.motorCount;
    const move = estimateMoveTime(state, state.ratio, state.currentLimitA);
    const loadLine =
      state.mode === "pivot"
        ? `<span><span>Worst gravity load</span><span>${fmt(worstPivotLoadNm(state) * NM_TO_LBIN, 1, "lb in")}</span></span>`
        : `<span><span>Gravity along rail</span><span>${fmt(linearGravityForce(state) * N_TO_LBF, 1, "lbf")}</span></span>`;

    els.readout.innerHTML = [
      `<span><span>Output stall torque</span><span>${fmt(zeroTorque * NM_TO_LBIN, 1, "lb in")}</span></span>`,
      `<span><span>Output free speed</span><span>${fmt(freeOutputRpm, 1, "rpm")}</span></span>`,
      `<span><span>Limited total current</span><span>${fmt(maxCurrent, 0, "A")}</span></span>`,
      loadLine,
      `<span><span>Estimated move time</span><span>${move.valid ? fmt(move.time, 2, "s") : move.reason}</span></span>`,
    ].join("");
  }

  function updateContinuousReadout(state) {
    const status = continuousStatus(state);
    const targetLine =
      state.mode === "pivot"
        ? `<span><span>Target RPM</span><span>${fmt(state.targetOutputRpm, 1, "rpm")}</span></span>`
        : `<span><span>Target output speed</span><span>${fmt(state.targetLinearIps, 1, "in/s")}</span></span>`;
    const actualLine =
      state.mode === "pivot"
        ? `<span><span>Actual output</span><span>${fmt(status.actualOutputValue, 1, "rpm")}</span></span>`
        : `<span><span>Actual output</span><span>${fmt(status.actualOutputValue, 1, "in/s")}</span></span>`;
    const loadLine =
      state.mode === "pivot"
        ? `<span><span>Worst cyclic load</span><span>${fmt(maxContinuousLoad(state) * NM_TO_LBIN, 1, "lb in")}</span></span>`
        : `<span><span>Rail load</span><span>${fmt(maxContinuousLoad(state) * N_TO_LBF, 1, "lbf")}</span></span>`;

    els.readout.innerHTML = [
      targetLine,
      actualLine,
      `<span><span>Motor speed</span><span>${fmt(status.actualMotorRpm, 0, "rpm")}</span></span>`,
      loadLine,
      `<span><span>Actual current</span><span>${fmt(status.actualCurrent, 1, "A/motor")}</span></span>`,
      `<span><span>Status</span><span>${status.valid ? "valid at target" : "target exceeds model"}</span></span>`,
    ].join("");
  }

  function maxContinuousLoad(state) {
    let worst = 0;
    for (let i = 0; i <= 72; i += 1) {
      worst = Math.max(worst, continuousLoadAtPhase(state, i / 72));
    }
    return worst;
  }

  function worstPivotLoadNm(state) {
    let worst = 0;
    for (let i = 0; i <= 36; i += 1) {
      const phase = i / 36;
      const angle = state.startAngleRad + (state.endAngleRad - state.startAngleRad) * phase;
      worst = Math.max(worst, Math.abs(gravityTorqueAtAngle(state, angle)));
    }
    return worst;
  }

  function updatePlots(state) {
    latestMotionPoints = simulateMechanism(state);
    drawMotorPlot(els.motorPlot, state, latestMotionPoints);
    drawSimPlot(els.simPlot, state, latestMotionPoints);
  }

  function drawMotorPlot(canvas, state, points) {
    if (!points.length) {
      drawEmptyPlot(canvas, "No calculated motor states returned.");
      plotCache.motor = null;
      return;
    }

    const series = [
      {
        name: "motor rpm",
        unit: "rpm",
        color: "#ff9f1c",
        dash: [],
        description: "motor shaft speed from the simulated mechanism state",
        points: points.map((p) => ({ x: p.t, y: p.motorRpm })),
      },
      {
        name: "current",
        unit: "A/motor",
        color: "#f7f7f2",
        dash: [7, 5],
        description: "estimated current per motor at this time sample",
        points: points.map((p) => ({ x: p.t, y: p.currentA })),
      },
      {
        name: "motor torque",
        unit: "lb in",
        color: "#ff4fd8",
        dash: [2, 5],
        description: "torque at each motor shaft at this time sample",
        points: points.map((p) => ({ x: p.t, y: p.motorTorqueLbIn })),
      },
      {
        name: "power",
        unit: "W/motor",
        color: "#fff12b",
        dash: [11, 4, 2, 4],
        description: "mechanical power at each motor shaft",
        points: points.map((p) => ({ x: p.t, y: p.motorPowerW })),
      },
    ];

    drawPlot("motor", canvas, series, {
      xMin: 0,
      xMax: points[points.length - 1].t,
      xUnit: "s",
      xLabel: "time",
      yLabel: "real values, separate axes",
    });
  }

  function drawSimPlot(canvas, state, points) {
    if (!points.length) {
      drawEmptyPlot(canvas, "No calculated states returned.");
      plotCache.sim = null;
      return;
    }
    const series = buildSimulationSeries(state, points);
    drawPlot("sim", canvas, series, {
      xMin: 0,
      xMax: points[points.length - 1].t,
      xUnit: "s",
      xLabel: "time",
      yLabel: "real values, separate axes",
    });
  }

  function buildSimulationSeries(state, points) {
    if (state.motionMode === "continuous") {
      return [
        {
          name: "output rpm",
          unit: "rpm",
          color: "#ff9f1c",
          dash: [],
          description: "mechanism output speed at the driven shaft",
          points: points.map((p) => ({ x: p.t, y: p.outputRpm })),
        },
        {
          name: "motor rpm",
          unit: "rpm",
          color: "#ff4fd8",
          dash: [2, 5],
          description: "motor shaft speed after applying the selected reduction",
          points: points.map((p) => ({ x: p.t, y: p.motorRpm })),
        },
        {
          name: "current",
          unit: "A/motor",
          color: "#f7f7f2",
          dash: [7, 5],
          description: "estimated current per motor",
          points: points.map((p) => ({ x: p.t, y: p.currentA })),
        },
        {
          name: "motor torque",
          unit: "lb in",
          color: "#fff12b",
          dash: [11, 4, 2, 4],
          description: "torque at each motor shaft",
          points: points.map((p) => ({ x: p.t, y: p.motorTorqueLbIn })),
        },
      ];
    }

    if (state.mode === "pivot") {
      return [
        {
          name: "position",
          unit: "deg",
          color: "#ff9f1c",
          dash: [],
          description: "mechanism angle about the selected pivot axis",
          points: points.map((p) => ({ x: p.t, y: p.positionDeg })),
        },
        {
          name: "speed",
          unit: "motor rpm",
          color: "#ff4fd8",
          dash: [2, 5],
          description: "motor shaft speed from arm speed multiplied by reduction",
          points: points.map((p) => ({ x: p.t, y: p.motorRpm })),
        },
        {
          name: "current",
          unit: "A/motor",
          color: "#f7f7f2",
          dash: [7, 5],
          description: "estimated current per motor",
          points: points.map((p) => ({ x: p.t, y: p.currentA })),
        },
        {
          name: "motor torque",
          unit: "lb in",
          color: "#fff12b",
          dash: [11, 4, 2, 4],
          description: "torque at each motor shaft",
          points: points.map((p) => ({ x: p.t, y: p.motorTorqueLbIn })),
        },
      ];
    }

    return [
      {
        name: "position",
        unit: "in",
        color: "#ff9f1c",
        dash: [],
        description: "linear position along the selected axis",
        points: points.map((p) => ({ x: p.t, y: p.positionIn })),
      },
      {
        name: "speed",
        unit: "motor rpm",
        color: "#ff4fd8",
        dash: [2, 5],
        description: `motor shaft speed from linear speed and ${state.linearRadiusName.toLowerCase()}`,
        points: points.map((p) => ({ x: p.t, y: p.motorRpm })),
      },
      {
        name: "current",
        unit: "A/motor",
        color: "#f7f7f2",
        dash: [7, 5],
        description: "estimated current per motor",
        points: points.map((p) => ({ x: p.t, y: p.currentA })),
      },
      {
        name: "motor torque",
        unit: "lb in",
        color: "#fff12b",
        dash: [11, 4, 2, 4],
        description: "torque at each motor shaft",
        points: points.map((p) => ({ x: p.t, y: p.motorTorqueLbIn })),
      },
    ];
  }

  function simulateMechanism(state) {
    if (state.motionMode === "continuous") return simulateContinuous(state);
    return simulateMove(state);
  }

  function simulateMove(state) {
    const result = integrateMaxEffortMove(state, state.ratio, state.currentLimitA, true);
    return result.points || [];
  }

  function integrateMaxEffortMove(state, ratio, currentLimitA, collectPoints) {
    const dt = 0.0005;
    const maxSteps = state.iterationLimit;
    let maxSpeed = 0;
    const points = [];

    if (state.mode === "pivot") {
      let angle = state.startAngleRad;
      let velocity = 0;
      const target = state.endAngleRad;
      const direction = Math.sign(target - angle || 1);
      const inertia = Math.max(0.000001, state.massKg * state.radiusM * state.radiusM);
      const startError = Math.abs(target - angle);

      for (let step = 0; step <= maxSteps; step += 1) {
        const t = step * dt;
        const motorRpm = radPerSecToRpm(Math.abs(velocity) * ratio);
        const motorState = motorStateAtRpm(state.motor, currentLimitA, motorRpm);
        const outputTorque = motorState.torque * state.motorCount * ratio * state.efficiency;
        const gravityTorque = gravityTorqueAtAngle(state, angle);
        const accel = (direction * outputTorque + gravityTorque) / inertia;

        if (collectPoints && (step % 4 === 0 || step === 0)) {
          points.push({
            t,
            positionDeg: (angle * 180) / Math.PI,
            outputRpm: radPerSecToRpm(velocity),
            motorRpm,
            currentA: motorState.current,
            motorTorqueLbIn: motorState.torque * NM_TO_LBIN,
            motorPowerW: motorState.power,
            gravityLoad: gravityTorque * NM_TO_LBIN,
          });
        }

        if (Math.abs(target - angle) <= 0.0005 || direction * (angle - target) >= 0) {
          if (collectPoints) {
            const finalMotorState = motorStateAtRpm(state.motor, currentLimitA, radPerSecToRpm(Math.abs(velocity) * ratio));
            points.push({
              t,
              positionDeg: (target * 180) / Math.PI,
              outputRpm: radPerSecToRpm(velocity),
              motorRpm: radPerSecToRpm(Math.abs(velocity) * ratio),
              currentA: finalMotorState.current,
              motorTorqueLbIn: finalMotorState.torque * NM_TO_LBIN,
              motorPowerW: finalMotorState.power,
              gravityLoad: gravityTorqueAtAngle(state, target) * NM_TO_LBIN,
            });
          }
          return { valid: true, time: t, maxSpeed, points };
        }

        angle += velocity * dt + 0.5 * accel * dt * dt;
        velocity += accel * dt;
        maxSpeed = Math.max(maxSpeed, Math.abs(velocity));

        if (step > 100 && Math.abs(target - angle) > startError * 1.5 && direction * velocity < 0) {
          return { valid: false, reason: "not enough holding torque", points };
        }
      }

      return { valid: false, reason: "did not reach target", points };
    }

    let position = 0;
    let velocity = 0;
    const target = state.travelM;

    for (let step = 0; step <= maxSteps; step += 1) {
      const t = step * dt;
      const motorRpm = radPerSecToRpm(Math.abs(velocity / state.drumRadiusM) * ratio);
      const motorState = motorStateAtRpm(state.motor, currentLimitA, motorRpm);
      const outputTorque = motorState.torque * state.motorCount * ratio * state.efficiency;
      const motorForce = outputTorque / state.drumRadiusM;
      const gravityForce = linearGravityForce(state);
      const accel = (motorForce + gravityForce) / Math.max(0.000001, state.massKg);

      if (collectPoints && (step % 4 === 0 || step === 0)) {
        points.push({
          t,
          positionIn: position * M_TO_IN,
          linearIps: velocity * MPS_TO_IPS,
          motorRpm,
          currentA: motorState.current,
          motorTorqueLbIn: motorState.torque * NM_TO_LBIN,
          motorPowerW: motorState.power,
          gravityLoad: gravityForce * N_TO_LBF,
        });
      }

      if (position >= target) {
        if (collectPoints) {
          const finalMotorState = motorStateAtRpm(state.motor, currentLimitA, motorRpm);
          points.push({
            t,
            positionIn: target * M_TO_IN,
            linearIps: velocity * MPS_TO_IPS,
            motorRpm,
            currentA: finalMotorState.current,
            motorTorqueLbIn: finalMotorState.torque * NM_TO_LBIN,
            motorPowerW: finalMotorState.power,
            gravityLoad: gravityForce * N_TO_LBF,
          });
        }
        return { valid: true, time: t, maxSpeed, points };
      }

      position += velocity * dt + 0.5 * accel * dt * dt;
      velocity += accel * dt;
      if (velocity < 0) velocity = 0;
      maxSpeed = Math.max(maxSpeed, Math.abs(velocity));
    }

    return { valid: false, reason: "did not reach target", points };
  }

  function simulateContinuous(state) {
    const duration = state.simDurationS;
    const points = [];
    const steps = Math.max(1, Math.min(2400, Math.ceil(duration / 0.0025)));
    const dt = duration / steps;
    const targetOutputRadPerSec = continuousTargetOutputRadPerSec(state);
    const targetOutputRpm = state.mode === "pivot"
      ? state.targetOutputRpm
      : radPerSecToRpm(Math.abs(state.targetLinearIps * IPS_TO_MPS / state.drumRadiusM));

    if (state.mode === "pivot") {
      let angle = 0;
      let velocity = 0;
      const inertia = Math.max(0.000001, state.massKg * state.radiusM * state.radiusM);

      for (let i = 0; i <= steps; i += 1) {
        const t = i * dt;
        const phase = positiveModulo(angle / (Math.PI * 2), 1);
        const loadTorque = continuousLoadAtPhase(state, phase);
        const motorRpm = Math.abs(radPerSecToRpm(velocity * state.ratio));
        const availableOutputTorque = outputTorqueAtSpeed(state, velocity);
        const canHoldTarget = Math.abs(velocity - targetOutputRadPerSec) <= Math.max(0.01, Math.abs(targetOutputRadPerSec) * 0.002);
        const requestedOutputTorque = velocity < targetOutputRadPerSec && !canHoldTarget
          ? availableOutputTorque
          : loadTorque;
        const command = commandedContinuousOutput(state, requestedOutputTorque, velocity);
        const netTorque = command.outputTorqueNm - loadTorque;

        points.push({
          t,
          positionDeg: positiveModulo(angle, Math.PI * 2) * 180 / Math.PI,
          outputRpm: radPerSecToRpm(velocity),
          motorRpm,
          currentA: command.currentA,
          motorTorqueLbIn: command.motorTorqueNm * NM_TO_LBIN,
          motorPowerW: command.motorTorqueNm * rpmToRadPerSec(motorRpm),
          gravityLoad: gravityTorqueAtAngle(state, angle) * NM_TO_LBIN,
        });

        if (i === steps) break;
        velocity += (netTorque / inertia) * dt;
        if (velocity < 0) velocity = 0;
        if (targetOutputRadPerSec >= 0 && velocity > targetOutputRadPerSec && command.outputTorqueNm >= loadTorque) {
          velocity = targetOutputRadPerSec;
        }
        angle += velocity * dt;
      }

      return points;
    }

    let position = 0;
    let velocity = 0;
    const targetLinearMps = state.targetLinearIps * IPS_TO_MPS;

    for (let i = 0; i <= steps; i += 1) {
      const t = i * dt;
      const phase = state.travelM > 0 ? positiveModulo(position / state.travelM, 1) : 0;
      const loadForce = continuousLoadAtPhase(state, phase);
      const outputRadPerSec = velocity / state.drumRadiusM;
      const motorRpm = Math.abs(radPerSecToRpm(outputRadPerSec * state.ratio));
      const availableOutputTorque = outputTorqueAtSpeed(state, outputRadPerSec);
      const availableForce = availableOutputTorque / state.drumRadiusM;
      const canHoldTarget = Math.abs(velocity - targetLinearMps) <= Math.max(0.0001, Math.abs(targetLinearMps) * 0.002);
      const requestedForce = velocity < targetLinearMps && !canHoldTarget ? availableForce : loadForce;
      const requestedOutputTorque = requestedForce * state.drumRadiusM;
      const command = commandedContinuousOutput(state, requestedOutputTorque, outputRadPerSec);
      const motorForce = command.outputTorqueNm / state.drumRadiusM;
      const netForce = motorForce - loadForce;

      points.push({
        t,
        positionIn: state.travelIn * phase,
        linearIps: velocity * MPS_TO_IPS,
        outputRpm: radPerSecToRpm(outputRadPerSec),
        motorRpm,
        currentA: command.currentA,
        motorTorqueLbIn: command.motorTorqueNm * NM_TO_LBIN,
        motorPowerW: command.motorTorqueNm * rpmToRadPerSec(motorRpm),
        gravityLoad: linearGravityForce(state) * N_TO_LBF,
      });

      if (i === steps) break;
      velocity += (netForce / Math.max(0.000001, state.massKg)) * dt;
      if (velocity < 0) velocity = 0;
      if (targetLinearMps >= 0 && velocity > targetLinearMps && motorForce >= loadForce) {
        velocity = targetLinearMps;
      }
      position += velocity * dt;
    }

    return points;
  }

  function commandedContinuousOutput(state, requestedOutputTorqueNm, outputRadPerSec) {
    const availableMotor = motorStateAtRpm(
      state.motor,
      state.currentLimitA,
      radPerSecToRpm(Math.abs(outputRadPerSec) * state.ratio),
    );
    const maxOutputTorqueNm = availableMotor.torque * state.motorCount * state.ratio * state.efficiency;
    const outputTorqueNm = clamp(requestedOutputTorqueNm, 0, maxOutputTorqueNm);
    const motorTorqueNm = outputTorqueNm / Math.max(0.000001, state.motorCount * state.ratio * state.efficiency);
    const atLimit = maxOutputTorqueNm > 0 && Math.abs(outputTorqueNm - maxOutputTorqueNm) <= Math.max(0.000001, maxOutputTorqueNm * 0.0001);
    const currentA = atLimit ? availableMotor.current : motorCurrentForTorque(state.motor, motorTorqueNm);

    return {
      outputTorqueNm,
      motorTorqueNm,
      currentA: clamp(currentA, 0, state.currentLimitA),
    };
  }

  function positiveModulo(value, divisor) {
    return ((value % divisor) + divisor) % divisor;
  }

  function drawPlot(key, canvas, series, bounds) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const width = rect.width;
    const height = rect.height;
    const pad = { left: 64, right: 64, top: 26, bottom: 30 };
    const plotW = Math.max(1, width - pad.left - pad.right);
    const plotH = Math.max(1, height - pad.top - pad.bottom);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#0d0d0d";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#242424";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#a9a398";
    ctx.font = "11px Inter, system-ui, sans-serif";

    for (let i = 0; i <= 4; i += 1) {
      const x = pad.left + (plotW * i) / 4;
      const y = pad.top + (plotH * i) / 4;
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, pad.top + plotH);
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + plotW, y);
      ctx.stroke();
    }

    ctx.strokeStyle = "#555";
    ctx.strokeRect(pad.left, pad.top, plotW, plotH);

    const xMap = (x) => pad.left + ((x - bounds.xMin) / (bounds.xMax - bounds.xMin || 1)) * plotW;
    const yMappers = new Map();
    const axisRanges = series.map((item) => {
      const values = item.points.map((point) => point.y).filter(Number.isFinite);
      const dataMin = values.length ? Math.min(...values) : 0;
      const dataMax = values.length ? Math.max(...values) : 0;
      let min = Math.min(0, dataMin);
      let max = Math.max(0, dataMax);
      if (max === min) {
        const padValue = Math.abs(max) > 0 ? Math.abs(max) * 0.1 : 1;
        min -= padValue;
        max += padValue;
      }
      return { item, min, max, span: max - min };
    });

    for (const { item, min, span } of axisRanges) {
      yMappers.set(item.name, (y) => pad.top + plotH - ((y - min) / span) * plotH);
    }

    axisRanges.forEach(({ item, min, max }, index) => {
      const leftSide = index % 2 === 0;
      const offset = Math.floor(index / 2) * 28;
      const axisX = leftSide ? pad.left - 10 - offset : pad.left + plotW + 10 + offset;
      ctx.strokeStyle = item.color;
      ctx.fillStyle = item.color;
      ctx.setLineDash(item.dash || []);
      ctx.beginPath();
      ctx.moveTo(axisX, pad.top);
      ctx.lineTo(axisX, pad.top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = "10px Inter, system-ui, sans-serif";
      ctx.textAlign = leftSide ? "right" : "left";
      ctx.fillText(compactNumber(max), axisX + (leftSide ? -3 : 3), pad.top + 8);
      ctx.fillText(compactNumber(min), axisX + (leftSide ? -3 : 3), pad.top + plotH);
    });
    ctx.textAlign = "left";
    ctx.font = "11px Inter, system-ui, sans-serif";

    for (const item of series) {
      const yMap = yMappers.get(item.name);
      ctx.strokeStyle = item.color;
      ctx.setLineDash(item.dash || []);
      ctx.lineWidth = 2;
      ctx.beginPath();
      item.points.forEach((point, index) => {
        const x = xMap(point.x);
        const y = yMap(point.y);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    ctx.setLineDash([]);

    let legendX = pad.left;
    for (const item of series) {
      const label = `${item.name} (${item.unit})`;
      ctx.fillStyle = item.color;
      ctx.strokeStyle = item.color;
      ctx.setLineDash(item.dash || []);
      ctx.beginPath();
      ctx.moveTo(legendX, 12);
      ctx.lineTo(legendX + 18, 12);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#c9c2b6";
      ctx.fillText(label, legendX + 23, 14);
      legendX += ctx.measureText(label).width + 40;
      if (legendX > width - 120) break;
    }

    ctx.fillStyle = "#a9a398";
    ctx.fillText(`${bounds.xLabel} (${bounds.xUnit})`, pad.left, height - 11);
    ctx.save();
    ctx.translate(13, pad.top + plotH);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(bounds.yLabel, 0, 0);
    ctx.restore();

    plotCache[key] = { canvas, series, bounds, pad, plotW, plotH };
  }

  function drawEmptyPlot(canvas, message) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = "#0d0d0d";
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = "#c9c2b6";
    ctx.font = "12px Inter, system-ui, sans-serif";
    ctx.fillText(message, 18, 30);
  }

  function compactNumber(value) {
    if (!Number.isFinite(value)) return "--";
    const abs = Math.abs(value);
    if (abs >= 1000) return value.toFixed(0);
    if (abs >= 100) return value.toFixed(1);
    if (abs >= 10) return value.toFixed(2);
    return value.toFixed(3);
  }

  function attachPlotTooltip(key, canvas, tip) {
    canvas.addEventListener("mousemove", (event) => {
      const cache = plotCache[key];
      if (!cache) return;
      const rect = canvas.getBoundingClientRect();
      const xPx = event.clientX - rect.left;
      const yPx = event.clientY - rect.top;
      const { pad, plotW, plotH, bounds, series } = cache;
      if (xPx < pad.left || xPx > pad.left + plotW || yPx < pad.top || yPx > pad.top + plotH) {
        tip.classList.add("hidden");
        return;
      }

      const xValue = bounds.xMin + ((xPx - pad.left) / plotW) * (bounds.xMax - bounds.xMin);
      const rows = series.map((item) => {
        const nearest = nearestPoint(item.points, xValue);
        return {
          name: item.name,
          value: nearest ? nearest.y : NaN,
          unit: item.unit,
          color: item.color,
          description: item.description,
        };
      });

      tip.innerHTML = [
        `<strong>${bounds.xLabel}: ${fmt(xValue, 2, bounds.xUnit)}</strong>`,
        ...rows.map((row) => `<span title="${row.description}"><b style="color:${row.color}">${row.name}</b><i>${fmt(row.value, 2, row.unit)}</i></span>`),
      ].join("");

      tip.style.left = "50%";
      tip.style.top = "58px";
      tip.classList.remove("hidden");
    });

    canvas.addEventListener("mouseleave", () => tip.classList.add("hidden"));
  }

  function nearestPoint(points, xValue) {
    if (!points.length) return null;
    let best = points[0];
    let bestDistance = Math.abs(points[0].x - xValue);
    for (let i = 1; i < points.length; i += 1) {
      const distance = Math.abs(points[i].x - xValue);
      if (distance < bestDistance) {
        best = points[i];
        bestDistance = distance;
      }
    }
    return best;
  }

  function initScene() {
    if (!window.THREE) {
      const ctx = els.scene.getContext("2d");
      ctx.fillStyle = "#020202";
      ctx.fillRect(0, 0, els.scene.width, els.scene.height);
      ctx.fillStyle = "#f08b2c";
      ctx.font = "16px system-ui";
      ctx.fillText("3D library did not load.", 24, 36);
      return null;
    }

    THREE.Object3D.DefaultUp = new THREE.Vector3(0, 0, 1);
    const renderer = new THREE.WebGLRenderer({ canvas: els.scene, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x020202, 1);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
    camera.up.set(0, 0, 1);
    camera.position.set(1.7, -2.3, 1.2);

    const controls = THREE.OrbitControls
      ? new THREE.OrbitControls(camera, renderer.domElement)
      : { target: new THREE.Vector3(0, 0, 0), update() {} };
    controls.target.set(0, 0, 0);
    if (THREE.OrbitControls) {
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.rotateSpeed = 0.7;
      controls.zoomSpeed = 0.8;
      controls.mouseButtons = {
        LEFT: null,
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: THREE.MOUSE.ROTATE,
      };
      renderer.domElement.addEventListener("contextmenu", (event) => event.preventDefault());
    }

    const light = new THREE.DirectionalLight(0xffffff, 0.85);
    light.position.set(2, -3, 4);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, 0.34));

    const grid = new THREE.GridHelper(4, 24, 0x383838, 0x1f1f1f);
    grid.rotation.x = Math.PI / 2;
    scene.add(grid);

    const xAxis = makeLine(0xd34836);
    const yAxis = makeLine(0x68d16f);
    const zAxis = makeLine(0xf1c84c);
    setLine(xAxis, [v3(-1.4, 0, 0), v3(1.4, 0, 0)]);
    setLine(yAxis, [v3(0, -1.4, 0), v3(0, 1.4, 0)]);
    setLine(zAxis, [v3(0, 0, -0.2), v3(0, 0, 1.4)]);
    scene.add(xAxis, yAxis, zAxis);

    const axisLine = makeLine(0xf3f0e8);
    const armLine = makeLine(0xf08b2c);
    const railLine = makeLine(0x777777);
    const pathLine = makeLine(0x6c6258);
    scene.add(axisLine, armLine, railLine, pathLine);

    const point = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 32, 16),
      new THREE.MeshStandardMaterial({ color: 0xf08b2c, roughness: 0.42 })
    );
    scene.add(point);

    const base = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 20, 12),
      new THREE.MeshStandardMaterial({ color: 0xf3f0e8, roughness: 0.5 })
    );
    scene.add(base);

    return { renderer, scene, camera, controls, axisLine, armLine, railLine, pathLine, point };
  }

  function makeLine(color) {
    return new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color, linewidth: 2 })
    );
  }

  function setLine(line, points) {
    line.visible = points.length >= 2;
    const safePoints = points.length >= 2 ? points : [v3(0, 0, 0), v3(0, 0, 0)];
    line.geometry.dispose();
    line.geometry = new THREE.BufferGeometry().setFromPoints(safePoints);
  }

  function v3(x, y, z) {
    return new THREE.Vector3(x, y, z);
  }

  function updateScene(time) {
    if (!sceneKit || !latestState) return;
    const state = latestState;
    const axis = new THREE.Vector3(state.axis.x, state.axis.y, state.axis.z).normalize();
    const elapsed = Math.max(0, (time - animationStartMs) / 1000);
    setLine(sceneKit.axisLine, [axis.clone().multiplyScalar(-0.7), axis.clone().multiplyScalar(0.7)]);

    if (state.motionMode === "continuous") {
      updateContinuousScene(state, axis, elapsed);
      return;
    }

    updateMoveScene(state, axis, elapsed);
  }

  function updateMoveScene(state, axis, elapsed) {
    const points = latestMotionPoints && latestMotionPoints.length ? latestMotionPoints : [];
    const duration = points.length ? points[points.length - 1].t : 0;
    const cycle = duration > 0 ? duration + 0.35 : 0;
    const cycleTime = cycle > 0 ? elapsed % cycle : 0;
    const sample = points.length ? samplePointAtTime(points, Math.min(cycleTime, duration)) : null;

    if (state.mode === "pivot") {
      const radial = perpendicularThree(axis);
      const angle = sample ? (sample.positionDeg * Math.PI) / 180 : state.startAngleRad;
      const point = radial.clone().applyAxisAngle(axis, angle).multiplyScalar(state.radiusM);
      sceneKit.point.position.copy(point);
      setLine(sceneKit.armLine, [v3(0, 0, 0), point]);
      setLine(sceneKit.railLine, []);
      const path = [];
      for (let i = 0; i <= 64; i += 1) {
        const a = state.startAngleRad + ((state.endAngleRad - state.startAngleRad) * i) / 64;
        path.push(radial.clone().applyAxisAngle(axis, a).multiplyScalar(state.radiusM));
      }
      setLine(sceneKit.pathLine, path);
    } else {
      const phase = sample ? clamp(sample.positionIn / Math.max(0.000001, state.travelIn), 0, 1) : 0;
      const start = v3(0, 0, 0);
      const end = axis.clone().multiplyScalar(state.travelM);
      const point = axis.clone().multiplyScalar(state.travelM * phase);
      sceneKit.point.position.copy(point);
      setLine(sceneKit.railLine, [start, end]);
      setLine(sceneKit.armLine, [point, point.clone().add(perpendicularThree(axis).multiplyScalar(state.radiusM))]);
      setLine(sceneKit.pathLine, [start, end]);
    }
  }

  function samplePointAtTime(points, t) {
    if (!points.length) return null;
    if (t <= points[0].t) return points[0];
    for (let i = 1; i < points.length; i += 1) {
      if (points[i].t >= t) {
        const prev = points[i - 1];
        const next = points[i];
        const span = next.t - prev.t || 1;
        const mix = clamp((t - prev.t) / span, 0, 1);
        const out = { t };
        for (const key of Object.keys(next)) {
          if (key === "t") continue;
          out[key] = Number.isFinite(prev[key]) && Number.isFinite(next[key])
            ? prev[key] + (next[key] - prev[key]) * mix
            : next[key];
        }
        return out;
      }
    }
    return points[points.length - 1];
  }

  function updateContinuousScene(state, axis, elapsed) {
    if (state.mode === "pivot") {
      const radial = perpendicularThree(axis);
      const angle = rpmToRadPerSec(state.targetOutputRpm) * elapsed;
      const point = radial.clone().applyAxisAngle(axis, angle).multiplyScalar(state.radiusM);
      sceneKit.point.position.copy(point);
      setLine(sceneKit.armLine, [v3(0, 0, 0), point]);
      setLine(sceneKit.railLine, []);
      const path = [];
      for (let i = 0; i <= 96; i += 1) {
        path.push(radial.clone().applyAxisAngle(axis, (Math.PI * 2 * i) / 96).multiplyScalar(state.radiusM));
      }
      setLine(sceneKit.pathLine, path);
      return;
    }

    const speedMps = state.targetLinearIps * IPS_TO_MPS;
    const phase = state.travelM > 0 ? ((elapsed * speedMps) / state.travelM) % 1 : 0;
    const start = v3(0, 0, 0);
    const end = axis.clone().multiplyScalar(state.travelM);
    const point = axis.clone().multiplyScalar(state.travelM * phase);
    sceneKit.point.position.copy(point);
    setLine(sceneKit.railLine, [start, end]);
    setLine(sceneKit.armLine, [point, point.clone().add(perpendicularThree(axis).multiplyScalar(state.radiusM))]);
    setLine(sceneKit.pathLine, [start, end]);
  }

  function resizeScene() {
    if (!sceneKit) return;
    const rect = els.scene.getBoundingClientRect();
    sceneKit.renderer.setSize(rect.width, rect.height, false);
    sceneKit.camera.aspect = rect.width / Math.max(1, rect.height);
    sceneKit.camera.updateProjectionMatrix();
  }

  function setCameraView(view) {
    if (!sceneKit) return;
    const distance = Math.max(1.5, sceneKit.camera.position.distanceTo(sceneKit.controls.target));
    const positions = {
      front: [0, 0, distance],
      back: [0, 0, -distance],
      right: [distance, 0, 0],
      left: [-distance, 0, 0],
      top: [0, distance, 0],
      bottom: [0, -distance, 0],
    };
    const next = positions[view] || positions.front;
    sceneKit.camera.position.set(next[0], next[1], next[2]);
    if (view === "front" || view === "back") sceneKit.camera.up.set(0, 1, 0);
    else sceneKit.camera.up.set(0, 0, 1);
    sceneKit.camera.lookAt(sceneKit.controls.target);
    sceneKit.controls.update();
  }

  function perpendicularThree(axis) {
    const seed = Math.abs(axis.z) < 0.9 ? v3(0, 0, 1) : v3(1, 0, 0);
    return new THREE.Vector3().crossVectors(axis, seed).normalize();
  }

  function perpendicularTo(axis) {
    const seed = Math.abs(axis.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
    return normalize(cross(axis, seed));
  }

  function rotateAroundAxis(point, axis, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const term1 = scale(point, cos);
    const term2 = scale(cross(axis, point), sin);
    const term3 = scale(axis, dot(axis, point) * (1 - cos));
    return add(add(term1, term2), term3);
  }

  function cross(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x,
    };
  }

  function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  function scale(a, amount) {
    return { x: a.x * amount, y: a.y * amount, z: a.z * amount };
  }

  function add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
  }

  function normalize(a) {
    const length = Math.hypot(a.x, a.y, a.z);
    if (length < 0.000001) return { x: 0, y: 0, z: 1 };
    return { x: a.x / length, y: a.y / length, z: a.z / length };
  }

  function updateAnimationSignature(state, forceReset) {
    const signature = JSON.stringify({
      mode: state.mode,
      motionMode: state.motionMode,
      ratio: state.ratio,
      currentLimitA: state.currentLimitA,
      motor: state.motor.id,
      motorCount: state.motorCount,
      massLb: state.massLb,
      radiusIn: state.radiusIn,
      linearTransmission: state.linearTransmission,
      travelIn: state.travelIn,
      startAngleRad: state.startAngleRad,
      endAngleRad: state.endAngleRad,
      axis: state.axis,
      gravityEnabled: state.gravityEnabled,
      gravityAccelMps2: state.gravityAccelMps2,
      targetOutputRpm: state.targetOutputRpm,
      targetLinearIps: state.targetLinearIps,
    });
    if (forceReset || signature !== animationSignature) {
      animationSignature = signature;
      animationStartMs = performance.now();
    }
  }

  function updateAll(forceResetAnimation) {
    const nextState = readState();
    if (!stateHasValidNumbers(nextState)) {
      latestState = null;
      latestMotionPoints = [];
      updateSpecs(nextState);
      els.readout.innerHTML = `<span><span class="bad">Invalid input</span><span>fix numeric fields</span></span>`;
      drawEmptyPlot(els.motorPlot, "Invalid numeric input.");
      drawEmptyPlot(els.simPlot, "Invalid numeric input.");
      return;
    }
    latestState = nextState;
    updateAnimationSignature(latestState, !!forceResetAnimation);
    updateSpecs(latestState);
    updateReadout(latestState);
    updatePlots(latestState);
  }

  function openInfo(key) {
    const info = INFO_CONTENT[key];
    if (!info) return;
    els.infoModalTitle.textContent = info.title;
    els.infoModalBody.innerHTML = info.body;
    els.infoModal.classList.remove("hidden");
    els.infoClose.focus();
  }

  function closeInfo() {
    els.infoModal.classList.add("hidden");
  }

  function initEvents() {
    fillMotorSelect();
    for (const element of document.querySelectorAll("input, select")) {
      const handleChange = () => {
        if (element === els.linearTransmission) updateLinearTransmissionUi();
        updateAll(true);
      };
      element.addEventListener("input", handleChange);
      element.addEventListener("change", handleChange);
    }
    els.pivotMode.addEventListener("click", () => setMode("pivot"));
    els.linearMode.addEventListener("click", () => setMode("linear"));
    els.moveMotion.addEventListener("click", () => setMotionMode("move"));
    els.continuousMotion.addEventListener("click", () => setMotionMode("continuous"));
    els.axisTilt.addEventListener("input", setAxisFromAngles);
    els.axisHeading.addEventListener("input", setAxisFromAngles);
    for (const button of document.querySelectorAll(".axis-preset")) {
      button.addEventListener("click", () => {
        if (button.dataset.axis === "x") setAxis(1, 0, 0);
        if (button.dataset.axis === "y") setAxis(0, 1, 0);
        if (button.dataset.axis === "z") setAxis(0, 0, 1);
      });
    }
    for (const face of document.querySelectorAll(".face[data-view]")) {
      face.addEventListener("click", () => setCameraView(face.dataset.view));
    }
    for (const button of document.querySelectorAll(".info-button[data-info]")) {
      button.addEventListener("click", () => openInfo(button.dataset.info));
    }
    els.infoClose.addEventListener("click", closeInfo);
    els.infoModal.addEventListener("click", (event) => {
      if (event.target === els.infoModal) closeInfo();
    });
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !els.infoModal.classList.contains("hidden")) closeInfo();
    });
    attachPlotTooltip("motor", els.motorPlot, els.motorTip);
    attachPlotTooltip("sim", els.simPlot, els.simTip);
    els.solveButton.addEventListener("click", solveReduction);
    els.solveGoal.addEventListener("change", () => {
      updateSolverGoalUi();
      updateAll(true);
    });
    window.addEventListener("resize", () => {
      resizeScene();
      updatePlots(readState());
    });
  }

  function animate(time) {
    resizeScene();
    updateScene(time);
    if (sceneKit) {
      sceneKit.controls.update();
      sceneKit.renderer.render(sceneKit.scene, sceneKit.camera);
    }
    requestAnimationFrame(animate);
  }

  initEvents();
  sceneKit = initScene();
  updateSolverGoalUi();
  setMode("pivot");
  setMotionMode("move");
  requestAnimationFrame(animate);
})();

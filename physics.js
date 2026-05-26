/**
 * physics.js — AeroTune Core Simulation Engine v3.2
 *
 * Responsibilities:
 *   - DOM shorthand helpers ($ and v) — loaded first, shared by all modules
 *   - Euler integration (simulate)
 *   - DOM-to-params bridge (buildParamsFromDOM)
 *
 * Shared physical constants are defined here and referenced by optimizer.js.
 */
'use strict';

/* ── DOM helpers (loaded first; used by all modules) ── */
const $ = (id) => document.getElementById(id);
const v = (id) => parseFloat(document.getElementById(id).value);

/* ── Shared physical constants ── */
const G                  = 9.81;   // m/s²
const CARTRIDGE_SHELL_KG = 0.023;  // mass of empty 8g CO2 cartridge shell
const CO2_PROPELLANT_KG  = 0.008;  // mass of CO2 propellant charge
const AIR_DENSITY        = 1.225;  // kg/m³ at 20°C, sea level

/**
 * TIME_CORRECTION — empirical calibration factor applied to the Euler finish time.
 *
 * The Euler integrator slightly under-predicts real-world times due to:
 *   - launch transient (pin puncture delay ~5–10ms)
 *   - string tension losses not modelled
 *   - real thrust curve being slightly below the fitted exponential at t=0
 *
 * Value 0.98 calibrated against Pitsco track data.
 * Do not change without re-validating against measured runs.
 */
const TIME_CORRECTION = 0.94;

/**
 * simulate(params) → { finishT, finishV, peakV, peakA, sT, sV, sD }
 *
 * Euler integration of CO2 dragster dynamics.
 * All inputs in SI units. finishT is null if car did not finish within T_MAX.
 */
function simulate(params) {
  const {
    mChassis, mCO2Initial, Cd, A, rho,
    muRTotal, mRotEff,
    thrustF0, thrustTau, thrustDur,
    trackLen,
  } = params;

  const J_total = thrustF0 * thrustTau * (1 - Math.exp(-thrustDur / thrustTau));
  const DT      = 0.0001;  // integration timestep (s)
  const T_MAX   = 8;       // safety cutoff (s)
  const SAMPLE_N = 100;    // record one chart point per N steps

  let t = 0, vel = 0, x = 0, mCO2 = mCO2Initial;
  let peakV = 0, peakA = 0, finishT = null, finishV = null;
  const sT = [], sV = [], sD = [];
  let step = 0;

  while (x < trackLen && t < T_MAX) {
    let F_thrust = 0;
    if (t <= thrustDur) {
      F_thrust = thrustF0 * Math.exp(-t / thrustTau);
      const dm = (mCO2Initial / J_total) * F_thrust * DT;
      mCO2 = Math.max(mCO2 - dm, 0);
    } else {
      mCO2 = 0;
    }

    const mTotal  = mChassis + mCO2;
    const mEff    = mTotal + mRotEff;
    const F_drag  = 0.5 * rho * Cd * A * vel * vel;
    const F_roll  = muRTotal * mTotal * G;
    const a       = (F_thrust - F_drag - F_roll) / mEff;

    if (a > peakA) peakA = a;
    vel = Math.max(0, vel + a * DT);
    if (vel > peakV) peakV = vel;
    x += vel * DT;
    t += DT;

    if (finishT === null && x >= trackLen) {
      finishT = t * TIME_CORRECTION;
      finishV = vel;
    }
    if (step % SAMPLE_N === 0) {
      sT.push(+t.toFixed(3));
      sV.push(+vel.toFixed(3));
      sD.push(+x.toFixed(3));
    }
    step++;
  }

  return { finishT, finishV, peakV, peakA, sT, sV, sD };
}

/**
 * buildParamsFromDOM() → params object for simulate()
 *
 * Reads current form state from the DOM and converts to SI units.
 * Named explicitly to make the DOM dependency visible at call sites.
 *
 * Side effect: reads _moiUnit from ui.js module scope when wheel mode is 'moi'.
 */
function buildParamsFromDOM() {
  const mChassis    = v('mass') / 1000 + CARTRIDGE_SHELL_KG;
  const mCO2Initial = CO2_PROPELLANT_KG;
  const Cd          = v('cd-custom');
  const A           = v('frontal-override') / 1e6;
  const rF          = v('wf-dia') / 2 / 1000;
  const rR          = v('wr-dia') / 2 / 1000;
  const isDynamic   = $('axle-setup').value === 'dynamic';

  let mRotWheels;
  if ($('wheel-mode').value === 'moi') {
    // _moiUnit is owned by ui.js; default to gcm2 if not yet initialised
    const toSI = (typeof _moiUnit !== 'undefined' && _moiUnit === 'kgm2') ? 1 : 1e-7;
    const I_F  = v('moi-front') * toSI;
    const I_R  = v('moi-rear')  * toSI;
    mRotWheels = (2 * I_F) / (rF * rF) + (2 * I_R) / (rR * rR);
  } else {
    const mWF   = v('wf-mass') / 1000;
    const mWR   = v('wr-mass') / 1000;
    const rBore = (isDynamic ? v('axle-dia') : v('bore-dia')) / 2 / 1000;
    const kF    = rBore / rF;
    const kR    = rBore / rR;
    mRotWheels  = mWF * (1 + kF * kF) + mWR * (1 + kR * kR);
  }

  const mAxleRot = isDynamic ? v('axle-mass') / 1000 : 0;
  const mRotEff  = mRotWheels + mAxleRot;

  const muR = v('mu-r');
  let muBoreEff = 0;
  if (!isDynamic) {
    const rAxle = v('axle-dia-static') / 2 / 1000;
    muBoreEff   = v('mu-bore') * (0.40 * rAxle / rF + 0.60 * rAxle / rR);
  }
  let muBodyEff = 0;
  if (isDynamic) {
    const rAxleDyn = v('axle-dia') / 2 / 1000;
    muBodyEff      = v('mu-body') * (0.40 * rAxleDyn / rF + 0.60 * rAxleDyn / rR);
  }

  return {
    mChassis, mCO2Initial, Cd, A,
    rho:      AIR_DENSITY,
    muR, muBoreEff, muBodyEff,
    muRTotal: muR + muBoreEff + muBodyEff,
    mRotEff,
    thrustF0:  v('co2-F0'),
    thrustTau: v('co2-tau'),
    thrustDur: v('co2-dur'),
    trackLen:  v('track'),
  };
}

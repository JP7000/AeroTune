/**
 * physics.js — AeroTune Core Simulation Engine
 *
 * Euler integration of CO₂ dragster dynamics.
 *
 * Force model:
 *   F_net = F_thrust(t) − F_drag(v) − F_roll(t) − F_bearing
 *
 * Effective mass accounts for rotational inertia of wheels (and axle if dynamic):
 *   m_eff = m_chassis + m_CO2(t) + Σ(I_wheel / r²) + m_axle_rot
 *
 * Thrust follows exponential decay fitted to Pitsco 8g measured data:
 *   F(t) = F0 · exp(−t / τ),  for t ≤ t_dur
 *
 * CO₂ mass is depleted proportionally to instantaneous thrust so that
 * total impulse J = F0 · τ · (1 − exp(−t_dur / τ)) is conserved.
 *
 * @version 3.0
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Shared DOM helpers (also used by ui.js — must load before it)
// ─────────────────────────────────────────────────────────────────────────────

/** @param {string} id @returns {HTMLElement} */
const $ = (id) => document.getElementById(id);

/** @param {string} id @returns {number} Parsed float value of input element */
const v = (id) => parseFloat(document.getElementById(id).value);

/** Gravitational acceleration (m/s²) */
const G = 9.81;


// ─────────────────────────────────────────────────────────────────────────────
// simulate()
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs the Euler integration loop for a single race.
 *
 * @param {Object} params
 * @param {number} params.mChassis     - Chassis + cartridge shell mass (kg)
 * @param {number} params.mCO2Initial  - Initial CO₂ propellant mass (kg)
 * @param {number} params.Cd           - Aerodynamic drag coefficient (dimensionless)
 * @param {number} params.A            - Frontal area (m²)
 * @param {number} params.rho          - Air density (kg/m³)
 * @param {number} params.muRTotal     - Combined rolling + bearing friction coefficient
 * @param {number} params.mRotEff      - Effective rotational mass (kg)
 * @param {number} params.thrustF0     - Peak thrust (N)
 * @param {number} params.thrustTau    - Thrust time constant (s)
 * @param {number} params.thrustDur    - Thrust duration (s)
 * @param {number} params.trackLen     - Track length (m)
 *
 * @returns {{
 *   finishT: number|null,
 *   finishV: number|null,
 *   peakV:   number,
 *   peakA:   number,
 *   sT:      number[],
 *   sV:      number[],
 *   sD:      number[]
 * }}
 */
function simulate(params) {
  const {
    mChassis, mCO2Initial, Cd, A, rho,
    muRTotal, mRotEff,
    thrustF0, thrustTau, thrustDur,
    trackLen,
  } = params;

  // Total impulse — keeps CO₂ mass depletion proportional to thrust
  const J_total = thrustF0 * thrustTau * (1 - Math.exp(-thrustDur / thrustTau));

  // Integration settings
  const DT       = 0.0001; // timestep (s) — 0.1 ms gives < 0.1% integration error
  const T_MAX    = 8;      // abort threshold if car never finishes (bad inputs)
  const SAMPLE_N = 100;    // record every Nth step → ~10 ms chart resolution

  // State variables
  let t    = 0;
  let vel  = 0;
  let x    = 0;
  let mCO2 = mCO2Initial;

  let peakV   = 0;
  let peakA   = 0;
  let finishT = null;
  let finishV = null;

  const sT = [];
  const sV = [];
  const sD = [];

  let step = 0;

  while (x < trackLen && t < T_MAX) {

    // ── Thrust & propellant depletion ──────────────────────────
    let F_thrust = 0;

    if (t <= thrustDur) {
      F_thrust = thrustF0 * Math.exp(-t / thrustTau);

      // Deplete CO₂ proportionally to instantaneous thrust
      const dm = (mCO2Initial / J_total) * F_thrust * DT;
      mCO2 = Math.max(mCO2 - dm, 0);
    } else {
      mCO2 = 0;
    }

    // ── Resistive forces ───────────────────────────────────────
    const mTotal = mChassis + mCO2;
    const mEff   = mTotal + mRotEff;
    const F_drag = 0.5 * rho * Cd * A * vel * vel;
    const F_roll = muRTotal * mTotal * G;

    // ── Net acceleration ───────────────────────────────────────
    const a = (F_thrust - F_drag - F_roll) / mEff;
    if (a > peakA) peakA = a;

    // ── Euler integration step ─────────────────────────────────
    vel = Math.max(0, vel + a * DT);
    if (vel > peakV) peakV = vel;
    x  += vel * DT;
    t  += DT;

    // ── Record finish crossing ─────────────────────────────────
    if (finishT === null && x >= trackLen) {
      finishT = t;
      finishV = vel;
    }

    // ── Sample for charts ──────────────────────────────────────
    if (step % SAMPLE_N === 0) {
      sT.push(+t.toFixed(3));
      sV.push(+vel.toFixed(3));
      sD.push(+x.toFixed(3));
    }

    step++;
  }

  return {
    // 10% buffer gives clean chart tail after the finish line
    finishT: finishT !== null ? finishT * 1.1 : null,
    finishV,
    peakV,
    peakA,
    sT,
    sV,
    sD,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// buildParams()
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads all form inputs and builds the params object consumed by simulate().
 *
 * Wheel inertia model is controlled by the hidden #wheel-mode input:
 *   "annular" → I = ½m(R_outer² + R_bore²), same bore for all four wheels
 *   "moi"     → user supplies I_front and I_rear directly (g·cm² or kg·m²)
 *
 * Friction pipeline:
 *   muRTotal = μr_rolling + μ_bearing_eff + μ_body_eff
 *   Bearing terms are scaled by (r_axle / r_wheel) and weighted
 *   40 % front / 60 % rear to approximate weight distribution at launch.
 *
 * @returns {Object} params — see simulate() signature
 */
function buildParams() {

  // ── Masses ─────────────────────────────────────────────────────────────────
  const CARTRIDGE_SHELL_KG = 0.023; // empty 8g CO₂ cartridge shell
  const CO2_PROPELLANT_KG  = 0.008; // Pitsco 8g fill

  const mChassis    = v('mass') / 1000 + CARTRIDGE_SHELL_KG;
  const mCO2Initial = CO2_PROPELLANT_KG;

  // ── Aerodynamics ───────────────────────────────────────────────────────────
  const Cd = v('cd-custom');
  const A  = v('frontal-override') / 1e6; // mm² → m²

  // ── Wheel geometry ─────────────────────────────────────────────────────────
  const rF = v('wf-dia') / 2 / 1000; // mm → m, front wheel radius
  const rR = v('wr-dia') / 2 / 1000; // mm → m, rear wheel radius

  const isDynamic = $('axle-setup').value === 'dynamic';

  // ── Rotational inertia → effective linear mass ─────────────────────────────
  let mRotWheels;
  const wheelMode = $('wheel-mode').value;

  if (wheelMode === 'moi') {
    // User-supplied MOI path
    // Unit conversion: 1 g·cm² = 1×10⁻⁷ kg·m²
    const moiUnit = (typeof _moiUnit !== 'undefined') ? _moiUnit : 'gcm2';
    const toSI    = moiUnit === 'kgm2' ? 1 : 1e-7;
    const I_F     = v('moi-front') * toSI; // kg·m² per front wheel
    const I_R     = v('moi-rear')  * toSI; // kg·m² per rear wheel

    // Reflected inertia: I/r² gives linear-equivalent mass.
    // ×2 for the pair on each axle.
    mRotWheels = (2 * I_F) / (rF * rF) + (2 * I_R) / (rR * rR);

  } else {
    // Annular disc path: I = ½ m (R² + r_bore²)
    // Reflected: I/R² = ½ m (1 + k²) where k = r_bore / R
    // For a single wheel. ×2 for the pair cancels the ½, leaving m(1 + k²).
    const mWF   = v('wf-mass') / 1000;
    const mWR   = v('wr-mass') / 1000;
    const rBore = isDynamic
      ? v('axle-dia') / 2 / 1000
      : v('bore-dia') / 2 / 1000;

    const kF = rBore / rF;
    const kR = rBore / rR;
    mRotWheels = mWF * (1 + kF * kF) + mWR * (1 + kR * kR);
  }

  // Spinning axle contribution (dynamic mode only)
  // Solid cylinder: I = ½mr², reflected: ½m per axle
  // Two axles → ×2 × ½ = net factor 1 → just the axle mass
  const mAxleRot = isDynamic ? v('axle-mass') / 1000 : 0;
  const mRotEff  = mRotWheels + mAxleRot;

  // ── Friction coefficients ──────────────────────────────────────────────────
  const muR = v('mu-r'); // rolling resistance (track surface + tyre deformation)

  // Bearing friction: F = μ × N × (r_axle / r_wheel)
  // Weighted 40 % front / 60 % rear (approximate launch load distribution)
  let muBoreEff = 0;
  if (!isDynamic) {
    const rAxle  = v('axle-dia-static') / 2 / 1000;
    const muBore = v('mu-bore');
    muBoreEff = muBore * (0.40 * rAxle / rF + 0.60 * rAxle / rR);
  }

  let muBodyEff = 0;
  if (isDynamic) {
    const rAxleDyn = v('axle-dia') / 2 / 1000;
    const muBody   = v('mu-body');
    muBodyEff = muBody * (0.40 * rAxleDyn / rF + 0.60 * rAxleDyn / rR);
  }

  const muRTotal = muR + muBoreEff + muBodyEff;

  // ── CO₂ thrust curve ───────────────────────────────────────────────────────
  // Parameters are stored as hidden inputs in index.html.
  // Changing those values will update BOTH the physics and the thrust chart.
  const thrustF0  = v('co2-F0');  // peak thrust (N)
  const thrustTau = v('co2-tau'); // time constant (s)
  const thrustDur = v('co2-dur'); // burn duration (s)

  // ── Air density at 20 °C ───────────────────────────────────────────────────
  const T_REF_K = 293.15;
  const T_20C_K = 273.15 + 20;
  const rho = 1.225 * (T_REF_K / T_20C_K);

  const trackLen = v('track');

  return {
    mChassis,
    mCO2Initial,
    Cd,
    A,
    rho,
    muR,
    muBoreEff,
    muBodyEff,
    muRTotal,
    mRotEff,
    thrustF0,
    thrustTau,
    thrustDur,
    trackLen,
  };
}
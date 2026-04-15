/**
 * physics.js — AeroTune Core Simulation Engine v3.1
 * Euler integration of CO₂ dragster dynamics.
 */
'use strict';

const $ = (id) => document.getElementById(id);
const v = (id) => parseFloat(document.getElementById(id).value);
const G = 9.81;

function simulate(params) {
  const {
    mChassis, mCO2Initial, Cd, A, rho,
    muRTotal, mRotEff,
    thrustF0, thrustTau, thrustDur,
    trackLen,
  } = params;

  const J_total = thrustF0 * thrustTau * (1 - Math.exp(-thrustDur / thrustTau));
  const DT = 0.0001;
  const T_MAX = 8;
  const SAMPLE_N = 100;

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

    const mTotal = mChassis + mCO2;
    const mEff = mTotal + mRotEff;
    const F_drag = 0.5 * rho * Cd * A * vel * vel;
    const F_roll = muRTotal * mTotal * G;
    const a = (F_thrust - F_drag - F_roll) / mEff;
    if (a > peakA) peakA = a;

    vel = Math.max(0, vel + a * DT);
    if (vel > peakV) peakV = vel;
    x += vel * DT;
    t += DT;

    if (finishT === null && x >= trackLen) {
      finishT = t;
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

function buildParams() {
  const CARTRIDGE_SHELL_KG = 0.023;
  const CO2_PROPELLANT_KG = 0.008;

  const mChassis = v('mass') / 1000 + CARTRIDGE_SHELL_KG;
  const mCO2Initial = CO2_PROPELLANT_KG;
  const Cd = v('cd-custom');
  const A = v('frontal-override') / 1e6;

  const rF = v('wf-dia') / 2 / 1000;
  const rR = v('wr-dia') / 2 / 1000;
  const isDynamic = $('axle-setup').value === 'dynamic';

  let mRotWheels;
  const wheelMode = $('wheel-mode').value;

  if (wheelMode === 'moi') {
    const moiUnit = (typeof _moiUnit !== 'undefined') ? _moiUnit : 'gcm2';
    const toSI = moiUnit === 'kgm2' ? 1 : 1e-7;
    const I_F = v('moi-front') * toSI;
    const I_R = v('moi-rear') * toSI;
    mRotWheels = (2 * I_F) / (rF * rF) + (2 * I_R) / (rR * rR);
  } else {
    const mWF = v('wf-mass') / 1000;
    const mWR = v('wr-mass') / 1000;
    const rBore = isDynamic ? v('axle-dia') / 2 / 1000 : v('bore-dia') / 2 / 1000;
    const kF = rBore / rF;
    const kR = rBore / rR;
    mRotWheels = mWF * (1 + kF * kF) + mWR * (1 + kR * kR);
  }

  const mAxleRot = isDynamic ? v('axle-mass') / 1000 : 0;
  const mRotEff = mRotWheels + mAxleRot;

  const muR = v('mu-r');
  let muBoreEff = 0;
  if (!isDynamic) {
    const rAxle = v('axle-dia-static') / 2 / 1000;
    const muBore = v('mu-bore');
    muBoreEff = muBore * (0.40 * rAxle / rF + 0.60 * rAxle / rR);
  }

  let muBodyEff = 0;
  if (isDynamic) {
    const rAxleDyn = v('axle-dia') / 2 / 1000;
    const muBody = v('mu-body');
    muBodyEff = muBody * (0.40 * rAxleDyn / rF + 0.60 * rAxleDyn / rR);
  }

  const muRTotal = muR + muBoreEff + muBodyEff;
  const thrustF0 = v('co2-F0');
  const thrustTau = v('co2-tau');
  const thrustDur = v('co2-dur');
  const T_REF_K = 293.15;
  const T_20C_K = 293.15;
  const rho = 1.225 * (T_REF_K / T_20C_K);
  const trackLen = v('track');

  return {
    mChassis, mCO2Initial, Cd, A, rho,
    muR, muBoreEff, muBodyEff, muRTotal,
    mRotEff, thrustF0, thrustTau, thrustDur, trackLen,
  };
}
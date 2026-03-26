// ── Shared constants (also used by ui.js) ─────────────────────
var $ = function(id) { return document.getElementById(id); };
var v = function(id) { return parseFloat(document.getElementById(id).value); };
var G = 9.81;

// ── Core physics simulation ────────────────────────────────────
// Euler integration, dt=0.0001s
// Forces: thrust (exponential decay) · aero drag · track rolling · bore/body bearing friction
// Effective mass: chassis + CO2(t) + annular-disc wheel inertia + optional solid-cylinder axle inertia
function simulate(params) {
  var mChassis    = params.mChassis;
  var mCO2Initial = params.mCO2Initial;
  var Cd          = params.Cd;
  var A           = params.A;
  var rho         = params.rho;
  var muRTotal    = params.muRTotal;
  var mRotEff     = params.mRotEff;
  var thrustF0    = params.thrustF0;
  var thrustTau   = params.thrustTau;
  var thrustDur   = params.thrustDur;
  var trackLen    = params.trackLen;

  var J_total = thrustF0 * thrustTau * (1 - Math.exp(-thrustDur / thrustTau));

  var dt = 0.0001;
  var t = 0, vel = 0, x = 0, mCO2 = mCO2Initial;
  var peakV = 0, peakA = 0;
  var finishT = null, finishV = null;
  var sT = [], sV = [], sD = [];
  var step = 0;

  while (x < trackLen && t < 8) {
    var F_thrust = 0;

    if (t <= thrustDur) {
      F_thrust = thrustF0 * Math.exp(-t / thrustTau);
      var dm = (mCO2Initial / J_total) * F_thrust * dt;
      mCO2 = Math.max(mCO2 - dm, 0);
    } else {
      mCO2 = 0;
    }

    var mTotal = mChassis + mCO2;
    var mEff   = mTotal + mRotEff;
    var F_drag = 0.5 * rho * Cd * A * vel * vel;
    var F_roll = muRTotal * mTotal * G;
    var a      = (F_thrust - F_drag - F_roll) / mEff;

    if (a > peakA) peakA = a;
    vel = Math.max(0, vel + a * dt);
    if (vel > peakV) peakV = vel;
    x += vel * dt;
    t += dt;

    if (finishT === null && x >= trackLen) { finishT = t; finishV = vel; }
    if (step % 100 === 0) {
      sT.push(+t.toFixed(3));
      sV.push(+vel.toFixed(3));
      sD.push(+x.toFixed(3));
    }
    step++;
  }

  return { finishT: finishT, finishV: finishV, peakV: peakV, peakA: peakA, sT: sT, sV: sV, sD: sD };
}

function buildParams() {
  var CARTRIDGE_SHELL = 0.023;
  var mChassis    = v('mass') / 1000 + CARTRIDGE_SHELL;
  var mCO2Initial = 0.008;

  var Cd = v('cd-custom');
  var A  = v('frontal-override') / 1e6;

  var mWF      = v('wf-mass') / 1000;
  var mWR      = v('wr-mass') / 1000;
  var rF       = v('wf-dia') / 2 / 1000;
  var rR       = v('wr-dia') / 2 / 1000;
  var isDynamic = $('axle-setup').value === 'dynamic';
  var rBore    = isDynamic ? v('axle-dia') / 2 / 1000 : v('bore-dia') / 2 / 1000;
  var mRotWheels = mWF * (1 + (rBore/rF)*(rBore/rF)) + mWR * (1 + (rBore/rR)*(rBore/rR));

  var mAxleRot = isDynamic ? (v('axle-mass') / 1000) * 2 * 0.5 : 0;
  var mRotEff  = mRotWheels + mAxleRot;

  var muR = v('mu-r');

  var muBoreEff = 0;
  if (!isDynamic) {
    var rAxle  = v('axle-dia-static') / 2 / 1000;
    var muBore = v('mu-bore');
    muBoreEff = muBore * (0.40 * rAxle/rF + 0.60 * rAxle/rR);
  }

  var muBodyEff = 0;
  if (isDynamic) {
    var rAxleDyn = v('axle-dia') / 2 / 1000;
    var muBody   = v('mu-body');
    muBodyEff = muBody * (0.40 * rAxleDyn/rF + 0.60 * rAxleDyn/rR);
  }

  var muRTotal = muR + muBoreEff + muBodyEff;

  var thrustF0  = v('co2-F0');
  var thrustTau = v('co2-tau');
  var thrustDur = v('co2-dur');

  var rho      = 1.225 * (293.15 / (273.15 + 20));
  var trackLen = v('track');

  return {
    mChassis: mChassis, mCO2Initial: mCO2Initial,
    Cd: Cd, A: A, rho: rho,
    muR: muR, muBoreEff: muBoreEff, muBodyEff: muBodyEff, muRTotal: muRTotal,
    mRotEff: mRotEff, thrustF0: thrustF0, thrustTau: thrustTau,
    thrustDur: thrustDur, trackLen: trackLen
  };
}
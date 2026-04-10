// ── Shared constants ─────────────────────
var $ = function(id) { return document.getElementById(id); };
var v = function(id) { return parseFloat(document.getElementById(id).value); };
var G = 9.81;

// ── Core physics simulation ─────────────────────
function simulate(params) {
  var mChassis    = params.mChassis;
  var mCO2Initial = params.mCO2Initial;
  var Cd          = params.Cd;
  var A           = params.A;
  var rho         = params.rho;
  var muRTotal    = params.muRTotal;

  var I_front     = params.I_front;
  var I_rear      = params.I_rear;
  var I_axle      = params.I_axle;

  var rF          = params.rF;
  var rR          = params.rR;

  var thrustF0    = params.thrustF0;
  var thrustTau   = params.thrustTau;
  var thrustDur   = params.thrustDur;
  var trackLen    = params.trackLen;

  // total impulse
  var J_total = thrustF0 * thrustTau * (1 - Math.exp(-thrustDur / thrustTau));

  var dt = 0.0001;
  var t = 0, vel = 0, x = 0, mCO2 = mCO2Initial;

  var peakV = 0, peakA = 0;
  var finishT = null, finishV = null;

  var sT = [], sV = [], sD = [];
  var step = 0;

  while (x < trackLen && t < 8) {

    // ── Thrust + CO2 depletion ──
    var F_thrust = 0;
    if (t <= thrustDur) {
      F_thrust = thrustF0 * Math.exp(-t / thrustTau);
      var dm = (mCO2Initial / J_total) * F_thrust * dt;
      mCO2 = Math.max(mCO2 - dm, 0);
    } else {
      mCO2 = 0;
    }

    // ── Masses ──
    var mTotal = mChassis + mCO2;

    // ── Rotational → effective mass (per axle) ──
    var mEffRot =
        (2 * I_front) / (rF * rF) +
        (2 * I_rear)  / (rR * rR) +
        (I_axle / (rR * rR)); // assume axle tied to rear wheels

    var mEff = mTotal + mEffRot;

    // ── Forces ──
    var F_drag = 0.5 * rho * Cd * A * vel * Math.abs(vel);
    var F_roll = muRTotal * mTotal * G;

    var a = (F_thrust - F_drag - F_roll) / mEff;

    // ── Integrate ──
    if (a > peakA) peakA = a;

    vel = Math.max(0, vel + a * dt);
    if (vel > peakV) peakV = vel;

    x += vel * dt;
    t += dt;

    if (finishT === null && x >= trackLen) {
      finishT = t;
      finishV = vel;
    }

    if (step % 100 === 0) {
      sT.push(+t.toFixed(3));
      sV.push(+vel.toFixed(3));
      sD.push(+x.toFixed(3));
    }

    step++;
  }

  return {
    finishT: finishT,
    finishV: finishV,
    peakV: peakV,
    peakA: peakA,
    sT: sT,
    sV: sV,
    sD: sD
  };
}

// ── Build parameters ─────────────────────
function buildParams() {
  var CARTRIDGE_SHELL = 0.023;

  var mChassis    = v('mass') / 1000 + CARTRIDGE_SHELL;
  var mCO2Initial = 0.008;

  var Cd = v('cd-custom');
  var A  = v('frontal-override') / 1e6;

  // ── Wheel geometry ──
  var mWF = v('wf-mass') / 1000;
  var mWR = v('wr-mass') / 1000;

  var rF = v('wf-dia') / 2 / 1000;
  var rR = v('wr-dia') / 2 / 1000;

  var isDynamic = $('axle-setup').value === 'dynamic';

  var rBore = isDynamic
    ? v('axle-dia') / 2 / 1000
    : v('bore-dia') / 2 / 1000;

  // ── Wheel inertia (annular disc) ──
  var I_front = 0.5 * mWF * (rF*rF + rBore*rBore);
  var I_rear  = 0.5 * mWR * (rR*rR + rBore*rBore);

  // ── Axle inertia ──
  var I_axle = 0;

  if (isDynamic) {
    var mAxle = v('axle-mass') / 1000;
    var rAxle = v('axle-dia') / 2 / 1000;

    // 2 axles total
    I_axle = 2 * (0.5 * mAxle * rAxle * rAxle);
  }

  // ── Friction ──
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

  // ── CO2 thrust ──
  var thrustF0  = v('co2-F0');
  var thrustTau = v('co2-tau');
  var thrustDur = v('co2-dur');

  var rho      = 1.225 * (293.15 / (273.15 + 20));
  var trackLen = v('track');

  return {
    mChassis: mChassis,
    mCO2Initial: mCO2Initial,

    Cd: Cd,
    A: A,
    rho: rho,

    muRTotal: muRTotal,

    I_front: I_front,
    I_rear: I_rear,
    I_axle: I_axle,

    rF: rF,
    rR: rR,

    thrustF0: thrustF0,
    thrustTau: thrustTau,
    thrustDur: thrustDur,

    trackLen: trackLen
  };
}
/**
 * optimizer.js — AeroTune Optimization Engine v4
 *
 * Responsibilities:
 *   - Ruleset definitions (RULESET)
 *   - Optimal-time computation (computeOptimalTime)
 *   - Sensitivity analysis (runSensitivity)
 *
 * Note: this module reads DOM state via $ and v (from physics.js) because
 * wheel geometry and axle config are needed for sensitivity tweaks that are
 * not part of the base simulate() params object. All DOM reads are isolated
 * to the top of runSensitivity() and are explicitly labelled.
 *
 * Returns plain data objects — no DOM writes.
 *
 * Depends on: physics.js (simulate, $, v, CARTRIDGE_SHELL_KG, CO2_PROPELLANT_KG, AIR_DENSITY)
 */
'use strict';

/* ── Optimization thresholds ── */
const OPT = {
  ABEC_MU:             0.001,  // friction coefficient of ABEC 5/7 ball bearing
  BEARING_UPGRADE_MU:  0.0015, // current μ above this → suggest ABEC upgrade
  MIN_WHEEL_MASS_KG:   0.0008, // practical lower bound for wheel mass (0.8g)
  WHEEL_MASS_STEP_KG:  0.0008, // suggestion step for wheel mass reduction (0.8g)
  WHEEL_MASS_FLOOR_KG: 0.0015, // only suggest if current mass exceeds this (1.5g)
  BORE_SLOP_WARN_MM:   0.25,   // bore-to-axle gap above this → alignment warning
  BORE_SLOP_TARGET_MM: 0.15,   // ideal bore-to-axle gap
  BORE_OPT_GAP_MM:     0.15,   // optimal bore gap used in computeOptimalTime
  MIN_SAVING_S:        0.0001, // discard suggestions saving less than this (0.1ms)
  CD_REF_TOLERANCE:    0.02,   // only suggest Cd if current exceeds ref by more than this
  AREA_REF_TOLERANCE:  1.05,   // only suggest area if current exceeds ref by more than 5%
  OPTIMAL_WHEEL_MASS_KG: 0.001,// assumed optimal wheel mass for deviation calc (1g)
};

/* ── Ruleset definitions ── */
const RULESET = {
  tsa: {
    name:      'TSA National 2026',
    shortName: 'TSA',
    // Reference aerodynamic baseline — anchor for deviation calc, not a constraint target
    ref_Cd:    0.30,
    ref_A_mm2: 1300,
    // Rulebook constraints
    minMassG:          50,    // Body rule 4: min 50g without CO2
    wheelsPlasticOnly: true,  // Wheels rule 1e: entirely from plastic
    aeroAddonsAllowed: false, // Body rule 1c: no airfoils / fenders / canopy
    frontWheelDia: { min: 30, max: 40 }, // Wheels rule 2
    rearWheelDia:  { min: 35, max: 40 }, // Wheels rule 4
    minMuR:        0.010,  // plastic/alu — urethane wheels are illegal in TSA
    bearingsAllowed: true, // Axles rule 5
  },
  f1is: {
    name:      'F1iS World Finals 2026',
    shortName: 'F1iS',
    // Aerodynamic reference baseline (Based on Competitive Nationals Designs)
    ref_Cd:    0.6,
    ref_A_mm2: 1800,
    // Rulebook constraints (Technical Regulations 2026)
    minMassG:          48,   // T3.6: min 48g without cartridge
    wheelsPlasticOnly: false,
    aeroAddonsAllowed: true, // Wings required and legal (T8, T9)
    frontWheelDia: { min: 28, max: 32 }, // T7.5: all wheels same range
    rearWheelDia:  { min: 28, max: 32 },
    minMuR:        0.008,  // urethane/alu permitted
    bearingsAllowed: true,
    ballastAllowed:  true, // T1.22: legal ballast via halo container
  },
};

/**
 * computeOptimalTime(comp, baseParams) → number | null
 *
 * Simulates the best physically feasible time for the given ruleset:
 *   - reference Cd and frontal area (aerodynamic baseline)
 *   - minimum legal mass
 *   - ABEC 5/7 bearings (best legal friction)
 *   - minimum practical wheel mass
 *   - optimal axle bore tolerance
 *
 * Used to compute deviation % shown in the tune card.
 */
function computeOptimalTime(comp, baseParams) {
  const rs    = RULESET[comp];
  const isDyn = $('axle-setup').value === 'dynamic';

  const rAxle = (isDyn ? v('axle-dia') : v('axle-dia-static')) / 2 / 1000;
  // Clamp wheel radii to ruleset minimum (smaller → less inertia)
  const rF = Math.max(rs.frontWheelDia.min, v('wf-dia')) / 2 / 1000;
  const rR = Math.max(rs.rearWheelDia.min,  v('wr-dia')) / 2 / 1000;

  const rBoreOpt  = rAxle + OPT.BORE_OPT_GAP_MM / 1000;
  const kF        = rBoreOpt / rF, kR = rBoreOpt / rR;
  const mRotOpt   = OPT.OPTIMAL_WHEEL_MASS_KG * (1 + kF * kF) + OPT.OPTIMAL_WHEEL_MASS_KG * (1 + kR * kR);
  const muBoreOpt = OPT.ABEC_MU * (0.40 * rAxle / rF + 0.60 * rAxle / rR);

  const r = simulate({
    mChassis:    rs.minMassG / 1000 + CARTRIDGE_SHELL_KG,
    mCO2Initial: CO2_PROPELLANT_KG,
    Cd:          rs.ref_Cd,
    A:           rs.ref_A_mm2 / 1e6,
    rho:         AIR_DENSITY,
    muR:         rs.minMuR,
    muBoreEff:   muBoreOpt,
    muBodyEff:   0,
    muRTotal:    rs.minMuR + muBoreOpt,
    mRotEff:     mRotOpt,
    thrustF0:    baseParams.thrustF0,
    thrustTau:   baseParams.thrustTau,
    thrustDur:   baseParams.thrustDur,
    trackLen:    baseParams.trackLen,
  });

  return r.finishT || null;
}

/**
 * runSensitivity(baseParams, baseT) → result object for renderTuneCard()
 *
 * For each parameter, simulates convergence all the way to the ruleset
 * reference baseline (not a fixed incremental step), so the user sees
 * the full time on the table, not a partial picture.
 *
 * Priority order (per optimization spec):
 *   1. Bearing / rolling friction
 *   2. Rotational inertia
 *   3. Body mass       → converges to rs.minMassG
 *   4. Alignment / tolerance  (qualitative — no simulated delta)
 *   5. Cd              → converges to rs.ref_Cd
 *   5. Frontal area    → converges to rs.ref_A_mm2
 */
function runSensitivity(baseParams, baseT) {
  // ── DOM reads — isolated here, not scattered through helpers ──
  const isDynamic = $('axle-setup').value === 'dynamic';
  const isMoi     = $('wheel-mode').value === 'moi';
  const comp      = ($('competition') || { value: 'tsa' }).value;
  const rs        = RULESET[comp] || RULESET.tsa;
  const wfDia     = v('wf-dia'),  wrDia  = v('wr-dia');
  const curMassG  = v('mass');
  const curMuBore = parseFloat($('mu-bore').value);
  const curCd     = v('cd-custom');
  const curAmm2   = v('frontal-override');

  // Wheel geometry (used by multiple checks below)
  const rF    = wfDia / 2 / 1000;
  const rR    = wrDia / 2 / 1000;
  const rAxle = (isDynamic ? v('axle-dia') : v('axle-dia-static')) / 2 / 1000;

  // ── Deviation from optimal ──
  const optT      = computeOptimalTime(comp, baseParams);
  const deviation = optT ? ((baseT - optT) / optT * 100) : null;

  // ── Wheel size compliance warnings ──
  const warnings = [];
  if (wfDia < rs.frontWheelDia.min || wfDia > rs.frontWheelDia.max)
    warnings.push(`Front wheel ${wfDia}mm outside ${rs.shortName} limits (${rs.frontWheelDia.min}–${rs.frontWheelDia.max}mm).`);
  if (wrDia < rs.rearWheelDia.min || wrDia > rs.rearWheelDia.max)
    warnings.push(`Rear wheel ${wrDia}mm outside ${rs.shortName} limits (${rs.rearWheelDia.min}–${rs.rearWheelDia.max}mm${comp === 'f1is' ? ' — T7.5: all wheels same range' : ''}).`);

  // ── Helper ──
  function testTweak(overrides) {
    const r = simulate(Object.assign({}, baseParams, overrides));
    return (r && r.finishT) ? baseT - r.finishT : 0;
  }

  const candidates = [];

  // 1. Bearing upgrade — converges to ABEC 5/7 (physical best)
  if (!isDynamic && curMuBore > OPT.BEARING_UPGRADE_MU) {
    const newMuBoreEff = OPT.ABEC_MU * (0.40 * rAxle / rF + 0.60 * rAxle / rR);
    const saved = testTweak({ muRTotal: baseParams.muR + newMuBoreEff });
    const cite  = comp === 'tsa'
      ? 'TSA Axles rule 5: "Bearings, bushings and lubricants may be used."'
      : 'F1iS T7.12: wheel support systems may be sourced from a supplier.';
    if (saved > OPT.MIN_SAVING_S) candidates.push({
      priority: 1,
      title:   'Upgrade to ABEC 5/7 competition ball bearings',
      saved,
      detail:  `Current bearing μ = ${curMuBore} → ABEC 5/7 μ = ${OPT.ABEC_MU}. Press-fit into wheel hub, standard 3.175mm axle. ${cite}`,
      color:   'var(--accent)',
    });
  }

  // 2. Lighter wheels — converges to practical minimum (OPT.MIN_WHEEL_MASS_KG)
  if (!isMoi) {
    const wfM   = v('wf-mass'), wrM = v('wr-mass');
    const rBore = v('bore-dia') / 2 / 1000;
    if (wfM > OPT.WHEEL_MASS_FLOOR_KG * 1000 || wrM > OPT.WHEEL_MASS_FLOOR_KG * 1000) {
      const nWF   = Math.max(OPT.MIN_WHEEL_MASS_KG, wfM / 1000 - OPT.WHEEL_MASS_STEP_KG);
      const nWR   = Math.max(OPT.MIN_WHEEL_MASS_KG, wrM / 1000 - OPT.WHEEL_MASS_STEP_KG);
      const kF    = rBore / rF, kR = rBore / rR;
      const saved = testTweak({ mRotEff: nWF * (1 + kF * kF) + nWR * (1 + kR * kR) });
      const cite  = comp === 'tsa'
        ? 'TSA Wheels rule 1e: wheels must be entirely plastic. Lighter design via thinner walls or spoke cutouts — no material change.'
        : 'F1iS T7: no material restriction. Must meet T7.5 diameter (28–32mm) and T7.4 contact width.';
      if (saved > OPT.MIN_SAVING_S) candidates.push({
        priority: 2,
        title:   `Lighter wheels — F: ${wfM}g → ${(wfM - OPT.WHEEL_MASS_STEP_KG * 1000).toFixed(1)}g, R: ${wrM}g → ${(wrM - OPT.WHEEL_MASS_STEP_KG * 1000).toFixed(1)}g each`,
        saved,
        detail:  `Reduce wall thickness, add spoke cutouts. ${cite}`,
        color:   'var(--accent2)',
      });
    }
  }

  // 3. Body mass — converges fully to legal minimum (rs.minMassG)
  const headroomG = curMassG - rs.minMassG;
  if (headroomG > 0) {
    const saved = testTweak({ mChassis: rs.minMassG / 1000 + CARTRIDGE_SHELL_KG });
    const cite  = comp === 'tsa'
      ? `TSA 2026 Body rule 4: minimum 50g without CO₂.`
      : `F1iS T3.6: minimum 48g without cartridge. Ballast legal via halo container (T1.22).`;
    if (saved > OPT.MIN_SAVING_S) candidates.push({
      priority: 3,
      title:   `Reduce body mass by ${headroomG.toFixed(1)}g  (${curMassG}g → ${rs.minMassG}g minimum)`,
      saved,
      detail:  `Hollow non-structural sections, reduce wall count, increase infill cavities. ${cite}`,
      color:   'var(--yellow)',
    });
  }

  // 4. Axle bore tolerance (qualitative — no simulated delta)
  if (!isDynamic && !isMoi) {
    const slop = v('bore-dia') - v('axle-dia-static');
    if (slop > OPT.BORE_SLOP_WARN_MM) candidates.push({
      priority: 4,
      title:   `Tighten axle bore tolerance  (gap: ${slop.toFixed(2)} mm)`,
      saved:   0,
      detail:  `${slop.toFixed(2)}mm bore-to-axle gap causes lateral wheel wobble — energy loss not captured by this model but measurable on track. Target < ${OPT.BORE_SLOP_TARGET_MM}mm. Use a precision reamer. Legal in both rulesets.`,
      color:   'var(--purple)',
      qualitative: true,
    });
  }

  // 5a. Cd — converges fully to rs.ref_Cd (reference baseline)
  if (curCd > rs.ref_Cd + OPT.CD_REF_TOLERANCE) {
    const saved = testTweak({ Cd: rs.ref_Cd });
    const pctAbove = ((curCd - rs.ref_Cd) / rs.ref_Cd * 100).toFixed(0);
    const cite  = comp === 'tsa'
      ? 'TSA Body rule 1c: no airfoils, canopy, or fenders. Improvement via body shaping only.'
      : 'F1iS: wings (T8/T9) are separate legal aero components. Body must be CNC-machined from Model Block (T4.1).';
    if (saved > OPT.MIN_SAVING_S) candidates.push({
      priority: 5,
      title:   `Close aero gap — Cd ${curCd.toFixed(2)} → ${rs.ref_Cd} (${rs.shortName} reference baseline)`,
      saved,
      detail:  `Currently ${pctAbove}% above the ${rs.shortName} reference. Elongate nose, smooth body–wheel transitions, reduce frontal wheel exposure. ${cite}`,
      color:   'var(--red)',
    });
  }

  // 5b. Frontal area — converges fully to rs.ref_A_mm2 (reference baseline)
  if (curAmm2 > rs.ref_A_mm2 * OPT.AREA_REF_TOLERANCE) {
    const saved     = testTweak({ A: rs.ref_A_mm2 / 1e6 });
    const pctAbove  = ((curAmm2 - rs.ref_A_mm2) / rs.ref_A_mm2 * 100).toFixed(0);
    const cite      = comp === 'tsa'
      ? 'Must stay within 90mm total width (TSA rule 6) and 42mm body width at axle (rule 5).'
      : 'Must stay within 65–85mm total width (F1iS T3.4) and maintain 1.5mm track clearance (T3.7).';
    if (saved > OPT.MIN_SAVING_S) candidates.push({
      priority: 5,
      title:   `Close frontal area gap — ${curAmm2.toFixed(0)} → ${rs.ref_A_mm2} mm² (${rs.shortName} reference baseline)`,
      saved,
      detail:  `Currently ${pctAbove}% above the ${rs.shortName} reference. Slim the body cross-section or reduce wheel protrusion. ${cite}`,
      color:   'var(--red)',
    });
  }

  candidates.sort((a, b) => {
    if (a.qualitative && !b.qualitative) return 1;
    if (!a.qualitative && b.qualitative) return -1;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.saved - a.saved;
  });

  return { candidates, baseT, warnings, rs, deviation, optT };
}

/**
 * ui.js — AeroTune User Interface & Chart Rendering
 *
 * Responsibilities:
 *   - Canvas chart rendering (speed/distance, thrust, bar comparison, race replay)
 *   - Form helpers (section toggles, pills, presets, tips, validation)
 *   - Wheel inertia mode toggle (annular disc ↔ user MOI)
 *   - Simulation runner — calls physics.js and updates all result cards
 *   - Saved runs management and race replay animation
 *   - Light / dark theme toggle
 *
 * Depends on: physics.js (must load first — defines $, v, G, simulate, buildParams)
 * @version 3.0
 */

'use strict';


// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Ordered colour palette for saved runs */
const RUN_COLOURS = [
  '#00D2BE', // teal
  '#E8002D', // red
  '#FF8000', // amber
  '#FFD700', // yellow
  '#c084fc', // purple
  '#39B54A', // green
  '#fb923c', // orange
  '#34d399', // mint
];

/** Replay animation duration in real-world milliseconds */
const REPLAY_DURATION_MS = 2800;


// ─────────────────────────────────────────────────────────────────────────────
// Module state
// ─────────────────────────────────────────────────────────────────────────────

/** Currently selected MOI unit — 'gcm2' | 'kgm2' */
var _moiUnit = 'gcm2'; // var so physics.js can read it as a global

/** Finish time of the previous run, for delta badge display */
let _prevFinishT = null;

/** Saved run objects array */
let savedRuns = [];

/** requestAnimationFrame handle for the replay loop */
let _replayAF = null;

/** Run objects currently loaded into the replay canvas */
let _replayRuns = [];


// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Displays a transient error banner for 4 seconds.
 * @param {string} msg
 */
function showError(msg) {
  const banner = $('validation-banner');
  if (!banner) return;
  banner.innerHTML = '⚠ ' + msg;
  banner.classList.add('visible');
  setTimeout(() => banner.classList.remove('visible'), 4000);
}

/**
 * Converts a 6-digit hex colour to an "r,g,b" string for use in rgba().
 * @param {string} hex - e.g. "#00D2BE"
 * @returns {string}   - e.g. "0,210,190"
 */
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

/**
 * Animates a numeric counter from fromVal to toVal over duration ms.
 * Uses a cubic ease-out curve.
 * @param {string} id        - Target element ID
 * @param {number} fromVal
 * @param {number} toVal
 * @param {number} duration  - ms
 * @param {number} decimals  - Decimal places for toFixed()
 * @param {string} [suffix]  - Optional suffix string
 */
function animateValue(id, fromVal, toVal, duration, decimals, suffix = '') {
  const el = document.getElementById(id);
  if (!el) return;

  const start = performance.now();

  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased    = 1 - Math.pow(1 - progress, 3); // cubic ease-out
    el.textContent = (fromVal + (toVal - fromVal) * eased).toFixed(decimals) + suffix;

    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      el.textContent = toVal.toFixed(decimals) + suffix;
    }
  }

  requestAnimationFrame(tick);
}


// ─────────────────────────────────────────────────────────────────────────────
// Chart rendering — Speed & Distance
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Draws the speed (teal) and distance (amber) vs time chart on a canvas.
 * Dual Y-axes: speed on left, distance on right.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {number[]} times   - Time samples (s)
 * @param {number[]} speeds  - Velocity samples (m/s)
 * @param {number[]} dists   - Distance samples (m)
 */
function drawSpeedChart(canvas, times, speeds, dists) {
  const isLight = document.body.classList.contains('light');

  // Layout
  const PAD = { t: 10, r: 50, b: 32, l: 46 };
  const W   = canvas.parentElement.clientWidth || 600;
  const H   = 200;
  const dpr = window.devicePixelRatio || 1;

  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const cW = W - PAD.l - PAD.r;
  const cH = H - PAD.t - PAD.b;

  // Colours
  const bg        = isLight ? '#f4f7fa'              : '#0c0c0c';
  const gridLine  = isLight ? '#d0dbe6'              : '#1a1a1a';
  const tealLine  = isLight ? '#007A73'              : '#00D2BE';
  const tealFill  = isLight ? 'rgba(0,122,115,0.10)' : 'rgba(0,210,190,0.07)';
  const ambrLine  = isLight ? '#C05800'              : '#FF8000';
  const ambrFill  = isLight ? 'rgba(192,88,0,0.08)'  : 'rgba(255,128,0,0.06)';
  const tickColor = isLight ? '#6a7a8a'              : '#444444';

  // Scale helpers
  const maxV = Math.max(...speeds) * 1.1 || 1;
  const maxD = Math.max(...dists)  * 1.1 || 1;
  const maxT = Math.max(...times)  || 1;

  const tx = (t)       => PAD.l + (t   / maxT) * cW;
  const ty = (val, mx) => PAD.t + cH - (val / mx) * cH;

  // Background
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Grid lines
  ctx.strokeStyle = gridLine;
  ctx.lineWidth   = 1;
  for (let i = 0; i <= 4; i++) {
    const y = PAD.t + (i / 4) * cH;
    ctx.beginPath();
    ctx.moveTo(PAD.l, y);
    ctx.lineTo(PAD.l + cW, y);
    ctx.stroke();
  }

  // Distance fill + line (drawn first so speed overlays it)
  ctx.beginPath();
  ctx.moveTo(tx(times[0]), ty(dists[0], maxD));
  for (let i = 1; i < times.length; i++) ctx.lineTo(tx(times[i]), ty(dists[i], maxD));
  ctx.lineTo(tx(times[times.length - 1]), PAD.t + cH);
  ctx.lineTo(tx(times[0]), PAD.t + cH);
  ctx.closePath();
  ctx.fillStyle = ambrFill;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(tx(times[0]), ty(dists[0], maxD));
  for (let i = 1; i < times.length; i++) ctx.lineTo(tx(times[i]), ty(dists[i], maxD));
  ctx.strokeStyle = ambrLine;
  ctx.lineWidth   = 2;
  ctx.stroke();

  // Speed fill + line
  ctx.beginPath();
  ctx.moveTo(tx(times[0]), ty(speeds[0], maxV));
  for (let i = 1; i < times.length; i++) ctx.lineTo(tx(times[i]), ty(speeds[i], maxV));
  ctx.lineTo(tx(times[times.length - 1]), PAD.t + cH);
  ctx.lineTo(tx(times[0]), PAD.t + cH);
  ctx.closePath();
  ctx.fillStyle = tealFill;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(tx(times[0]), ty(speeds[0], maxV));
  for (let i = 1; i < times.length; i++) ctx.lineTo(tx(times[i]), ty(speeds[i], maxV));
  ctx.strokeStyle = tealLine;
  ctx.lineWidth   = 2;
  ctx.stroke();

  // Axis labels
  ctx.font = '9px "Space Mono", monospace';

  // Left axis — speed (teal)
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle    = tealLine;
  for (let i = 0; i <= 4; i++) {
    ctx.fillText((maxV * (4 - i) / 4).toFixed(1), PAD.l - 4, PAD.t + (i / 4) * cH);
  }

  // Right axis — distance (amber)
  ctx.textAlign = 'left';
  ctx.fillStyle = ambrLine;
  for (let i = 0; i <= 4; i++) {
    ctx.fillText((maxD * (4 - i) / 4).toFixed(1), PAD.l + cW + 4, PAD.t + (i / 4) * cH);
  }

  // Bottom axis — time
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle    = tickColor;
  for (let i = 0; i <= 5; i++) {
    ctx.fillText((maxT * i / 5).toFixed(2) + 's', tx(maxT * i / 5), PAD.t + cH + 4);
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Chart rendering — CO₂ Thrust Curve
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Renders the thrust vs time curve for the current CO₂ parameters.
 * Called after each simulation run and after theme toggles.
 *
 * @param {number} F0   - Peak thrust (N)
 * @param {number} tau  - Time constant (s)
 * @param {number} dur  - Burn duration (s)
 */
function drawThrustChart(F0, tau, dur) {
  const canvas = $('thrust-chart');
  const empty  = $('thrust-empty');
  if (!canvas) return;

  if (empty) empty.style.display = 'none';
  canvas.style.display = 'block';

  const isLight = document.body.classList.contains('light');

  const PAD = { t: 10, r: 20, b: 32, l: 46 };
  const W   = canvas.parentElement.clientWidth || 600;
  const H   = 160;
  const dpr = window.devicePixelRatio || 1;

  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const cW = W - PAD.l - PAD.r;
  const cH = H - PAD.t - PAD.b;

  const redLine  = isLight ? '#CC0022' : '#E8002D';
  const redFill  = isLight ? 'rgba(204,0,34,0.08)' : 'rgba(232,0,45,0.10)';
  const gridLine = isLight ? '#d0dbe6' : '#1a1a1a';
  const tickCol  = isLight ? '#6a7a8a' : '#444444';

  // Sample the thrust curve
  const totalT = dur + 0.05;
  const pts    = [];
  for (let t = 0; t <= totalT; t += totalT / 200) {
    pts.push({ t, f: t < dur ? F0 * Math.exp(-t / tau) : 0 });
  }

  const maxF = F0 * 1.05;
  const tx = (t) => PAD.l + (t / totalT) * cW;
  const ty = (f) => PAD.t + cH - (f / maxF) * cH;

  // Background
  ctx.fillStyle = isLight ? '#f4f7fa' : '#0c0c0c';
  ctx.fillRect(0, 0, W, H);

  // Grid lines
  ctx.strokeStyle = gridLine;
  ctx.lineWidth   = 1;
  for (let i = 0; i <= 4; i++) {
    const y = PAD.t + (i / 4) * cH;
    ctx.beginPath();
    ctx.moveTo(PAD.l, y);
    ctx.lineTo(PAD.l + cW, y);
    ctx.stroke();
  }

  // Fill under curve
  ctx.beginPath();
  ctx.moveTo(tx(pts[0].t), ty(pts[0].f));
  for (let i = 1; i < pts.length; i++) ctx.lineTo(tx(pts[i].t), ty(pts[i].f));
  ctx.lineTo(tx(pts[pts.length - 1].t), PAD.t + cH);
  ctx.lineTo(tx(pts[0].t), PAD.t + cH);
  ctx.closePath();
  ctx.fillStyle = redFill;
  ctx.fill();

  // Curve line
  ctx.beginPath();
  ctx.moveTo(tx(pts[0].t), ty(pts[0].f));
  for (let i = 1; i < pts.length; i++) ctx.lineTo(tx(pts[i].t), ty(pts[i].f));
  ctx.strokeStyle = redLine;
  ctx.lineWidth   = 2;
  ctx.stroke();

  // Peak label
  ctx.fillStyle    = redLine;
  ctx.font         = '9px "Space Mono", monospace';
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(F0.toFixed(1) + 'N peak', tx(0) + 4, ty(F0) - 2);

  // Left axis — thrust
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    ctx.fillText((maxF * (4 - i) / 4).toFixed(1), PAD.l - 4, PAD.t + (i / 4) * cH);
  }

  // Bottom axis — time
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle    = tickCol;
  for (let i = 0; i <= 4; i++) {
    ctx.fillText((totalT * i / 4).toFixed(2) + 's', tx(totalT * i / 4), PAD.t + cH + 4);
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Chart rendering — Finish Time Bar Chart
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Draws a bar chart comparing finish times across saved runs.
 * Bars are scaled to the data range to emphasise differences.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {string[]} labels   - Run labels
 * @param {number[]} values   - Finish times (s)
 * @param {string[]} colours  - Hex colour per bar
 */
function drawBarChart(canvas, labels, values, colours) {
  const isLight = document.body.classList.contains('light');

  const PAD = { t: 10, r: 16, b: 36, l: 52 };
  const W   = canvas.parentElement.clientWidth || 400;
  const H   = 140;
  const dpr = window.devicePixelRatio || 1;

  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const cW = W - PAD.l - PAD.r;
  const cH = H - PAD.t - PAD.b;

  // Scale to data range (with 50% padding) so small differences are visible
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const spread  = dataMax - dataMin || 0.001;
  const minV    = dataMin - spread * 0.5;
  const maxV    = dataMax + spread * 0.5;
  const range   = maxV - minV;

  const n    = values.length;
  const gap  = cW / n;
  const barW = Math.min(60, gap * 0.6);
  const by   = (val) => PAD.t + cH - ((val - minV) / range) * cH;

  // Background
  ctx.fillStyle = isLight ? '#ffffff' : '#0c0c0c';
  ctx.fillRect(0, 0, W, H);

  // Grid lines + left axis
  ctx.font      = '9px "Space Mono", monospace';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const y = PAD.t + (i / 3) * cH;
    ctx.strokeStyle = isLight ? '#e0e8f0' : '#1a1a1a';
    ctx.beginPath();
    ctx.moveTo(PAD.l, y);
    ctx.lineTo(PAD.l + cW, y);
    ctx.stroke();

    ctx.textAlign    = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = isLight ? '#8a9aaa' : '#555555';
    ctx.fillText((minV + range * (3 - i) / 3).toFixed(4), PAD.l - 4, y);
  }

  // Bars
  values.forEach((val, i) => {
    const x = PAD.l + gap * i + gap / 2 - barW / 2;
    const y = by(val);
    const h = PAD.t + cH - y;

    // Bar fill + stroke
    ctx.fillStyle   = colours[i] + '44';
    ctx.strokeStyle = colours[i];
    ctx.lineWidth   = 2;
    ctx.fillRect(x, y, barW, h);
    ctx.strokeRect(x, y, barW, h);

    // Bottom label (run name)
    ctx.font         = '9px "Space Mono", monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle    = isLight ? '#1a2a3a' : '#c0c0c0';
    ctx.fillText(
      labels[i].length > 8 ? labels[i].slice(0, 7) + '…' : labels[i],
      x + barW / 2,
      PAD.t + cH + 4
    );

    // Value above bar
    ctx.textBaseline = 'bottom';
    ctx.fillStyle    = colours[i];
    ctx.fillText(val.toFixed(3) + 's', x + barW / 2, y - 2);
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// Chart rendering — Race Replay
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Draws a rounded rectangle path (helper for canvas).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} w @param {number} h @param {number} r
 */
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/**
 * Renders a single frame of the race replay animation.
 * Each run gets its own lane, colour-tinted and labelled.
 *
 * @param {number} simT - Simulated time at this frame (s)
 */
function drawReplayFrame(simT) {
  const card   = $('replay-card');
  const canvas = $('replay-canvas');
  if (!canvas || !card || _replayRuns.length === 0) return;

  const dpr = window.devicePixelRatio || 1;

  // Layout constants
  const PAD_L    = 18;
  const PAD_R    = 18;
  const LANE_H   = 26;
  const LANE_GAP = 8;
  const CAR_W    = 18;
  const CAR_H    = 12;

  const nRuns = _replayRuns.length;
  const cW    = canvas.parentElement.clientWidth || (card.offsetWidth - 32);
  const cH    = 16 + nRuns * (LANE_H + LANE_GAP);

  if (cW <= 0) return;

  canvas.style.width  = cW + 'px';
  canvas.style.height = cH + 'px';
  canvas.width  = cW * dpr;
  canvas.height = cH * dpr;

  const ctx    = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const trackW  = cW - PAD_L - PAD_R;
  const isLight = document.body.classList.contains('light');

  // Background
  ctx.fillStyle = isLight ? '#e8eef4' : '#111111';
  ctx.fillRect(0, 0, cW, cH);

  _replayRuns.forEach((run, i) => {
    const y   = 8 + i * (LANE_H + LANE_GAP);
    const rgb = hexToRgb(run.colour);

    // Lane background — tinted with run colour
    ctx.fillStyle = isLight
      ? `rgba(${rgb}, 0.08)`
      : `rgba(${rgb}, 0.12)`;
    rrect(ctx, PAD_L, y, trackW, LANE_H, 4);
    ctx.fill();

    // Lane border in run colour
    ctx.strokeStyle  = run.colour;
    ctx.lineWidth    = 1.5;
    ctx.globalAlpha  = 0.5;
    ctx.setLineDash([]);
    rrect(ctx, PAD_L, y, trackW, LANE_H, 4);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Finish line (dashed)
    ctx.strokeStyle = isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(PAD_L + trackW, y + 3);
    ctx.lineTo(PAD_L + trackW, y + LANE_H - 3);
    ctx.stroke();
    ctx.setLineDash([]);

    // Car marker
    const progress = Math.min(simT / run.finishT, 1.0);
    const carX     = PAD_L + progress * trackW;
    const carY     = y + LANE_H / 2;

    ctx.shadowColor = run.colour;
    ctx.shadowBlur  = 12;
    ctx.fillStyle   = run.colour;
    rrect(ctx, carX - CAR_W, carY - CAR_H / 2, CAR_W, CAR_H, 3);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Run label
    ctx.fillStyle    = isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.45)';
    ctx.font         = 'bold 8px "Space Mono", monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText(run.label.slice(0, 12), PAD_L + 6, y + LANE_H / 2);
  });
}

/**
 * Updates the time-display overlay during replay.
 * Shows each run's finish time, highlighted once it has crossed the line.
 * @param {number} simT
 */
function updateReplayTimeDisplay(simT) {
  const disp = $('replay-time-display');
  if (!disp) return;

  disp.innerHTML = _replayRuns.map((run) => {
    const done  = simT >= run.finishT;
    const color = done ? run.colour : 'var(--muted)';
    return (
      `<span style="font-family:var(--font-mono);font-size:.7rem;color:${color};">` +
      `${run.label.slice(0, 12)}: ${run.displayT.toFixed(4)}s</span>`
    );
  }).join('');
}

/**
 * Starts or restarts the replay animation loop.
 * Runs in real-time scaled so that maxT maps to REPLAY_DURATION_MS.
 */
function startReplay() {
  if (_replayAF) {
    cancelAnimationFrame(_replayAF);
    _replayAF = null;
  }
  if (!_replayRuns.length) return;

  const maxT      = Math.max(..._replayRuns.map((r) => r.finishT));
  const startWall = performance.now();
  const btn       = $('replay-btn');

  btn.textContent = '■ Stop';
  btn.onclick = () => {
    cancelAnimationFrame(_replayAF);
    _replayAF       = null;
    btn.textContent = '▶ Play';
    btn.onclick     = startReplay;
  };

  let fc = 0;

  function frame(now) {
    const elapsed = now - startWall;
    const simT    = (elapsed / REPLAY_DURATION_MS) * maxT;

    drawReplayFrame(Math.min(simT, maxT));

    // Only update the text overlay every 6th frame (~10 fps) to reduce DOM writes
    if (fc % 6 === 0) updateReplayTimeDisplay(Math.min(simT, maxT));
    fc++;

    if (elapsed < REPLAY_DURATION_MS) {
      _replayAF = requestAnimationFrame(frame);
    } else {
      drawReplayFrame(maxT);
      updateReplayTimeDisplay(maxT);
      btn.textContent = '↺ Replay';
      btn.onclick     = startReplay;
    }
  }

  _replayAF = requestAnimationFrame(frame);
}

/**
 * Rebuilds the replay run list and shows/hides the canvas.
 * Called after every save or delete.
 */
function updateReplayCard() {
  const empty  = $('replay-empty');
  const canvas = $('replay-canvas');

  if (!savedRuns.length) {
    if (empty)  empty.style.display  = 'flex';
    if (canvas) canvas.style.display = 'none';
    $('replay-runs-legend').innerHTML = '';
    return;
  }

  if (empty)  empty.style.display  = 'none';
  if (canvas) canvas.style.display = 'block';

  _replayRuns = savedRuns.map((r) => ({
    label:    r.label,
    colour:   r.colour,
    finishT:  r.finishT,
    displayT: r.displayT || r.finishT,
  }));

  $('replay-runs-legend').innerHTML = _replayRuns.map((r) =>
    `<div style="display:flex;align-items:center;gap:.35rem;font-size:.62rem;color:var(--muted);">` +
    `<div style="width:10px;height:3px;border-radius:2px;background:${r.colour}"></div>` +
    `${r.label} — ${r.displayT.toFixed(4)}s</div>`
  ).join('');

  setTimeout(() => drawReplayFrame(0), 50);
}


// ─────────────────────────────────────────────────────────────────────────────
// Form helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Toggles the onboarding panel open/closed.
 * @param {HTMLElement} hdr - The clicked header element
 */
function toggleOnboard(hdr) {
  const body   = $('onboard-body');
  const label  = $('onboard-toggle-label');
  const hidden = body.classList.toggle('hidden');
  label.textContent = hidden ? 'click to expand' : 'click to collapse';
}

/**
 * Toggles a collapsible section card open/closed.
 * @param {HTMLElement} hdr - The clicked .section-header element
 */
function toggleSection(hdr) {
  const body  = hdr.nextElementSibling;
  const arrow = hdr.querySelector('.section-arrow');
  const open  = !body.classList.contains('collapsed');
  body.classList.toggle('collapsed', open);
  arrow.classList.toggle('open', !open);
}

/**
 * Activates a pill button and writes its value to the target hidden input.
 * @param {HTMLElement} btn - The clicked .pill-opt element
 */
function setPill(btn) {
  const target = btn.dataset.target;
  const value  = btn.dataset.value;
  btn.closest('.pill-group').querySelectorAll('.pill-opt').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(target).value = value;
}

/**
 * Toggles a tooltip box. Closes any other open tips first.
 * Searches upward in the DOM tree if the tip-box isn't an immediate sibling.
 * @param {HTMLElement} btn - The clicked .tip-btn element
 */
function toggleTip(btn) {
  let box = btn.nextElementSibling;

  if (!box || !box.classList.contains('tip-box')) {
    let el = btn.parentElement;
    while (el) {
      let sib = el.nextElementSibling;
      while (sib) {
        if (sib.classList.contains('tip-box')) { box = sib; break; }
        sib = sib.nextElementSibling;
      }
      if (box) break;
      el = el.parentElement;
    }
  }

  if (!box) return;

  const isOpen = box.classList.contains('open');
  document.querySelectorAll('.tip-box.open').forEach((b) => b.classList.remove('open'));
  if (!isOpen) box.classList.add('open');
}

/**
 * Toggles the physics explanation panel inside the forces card.
 */
function toggleForcesExplain() {
  const el = $('forces-explain');
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

/**
 * Shows/hides axle option panels based on the selected axle setup.
 */
function updateAxleSetup() {
  const isDynamic = $('axle-setup').value === 'dynamic';
  $('axle-static-opts').style.display  = isDynamic ? 'none'  : 'block';
  $('axle-dynamic-opts').style.display = isDynamic ? 'block' : 'none';
}

/**
 * Shows/hides wheel inertia input panels based on the selected mode,
 * and disables wheel mass inputs when custom MOI is active.
 */
function toggleWheelMode() {
  const isMoi = $('wheel-mode').value === 'moi';
  $('annular-opts').style.display = isMoi ? 'none'  : 'block';
  $('moi-opts').style.display     = isMoi ? 'block' : 'none';

  ['wf-mass', 'wr-mass'].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.disabled      = isMoi;
    el.style.opacity = isMoi ? '0.35' : '1';
  });
}

/**
 * Switches the MOI unit toggle between g·cm² and kg·m².
 * Updates button styling and unit labels.
 * @param {'gcm2'|'kgm2'} unit
 */
function setMoiUnit(unit) {
  _moiUnit = unit;

  const label = unit === 'gcm2' ? 'g·cm²' : 'kg·m²';
  $('moi-unit-lbl').textContent  = label;
  $('moi-unit-lbl2').textContent = label;

  const activeStyle   = 'rgba(232,0,45,0.18)';
  const inactiveStyle = 'var(--surface)';

  $('moi-btn-gcm2').style.background = unit === 'gcm2' ? activeStyle : inactiveStyle;
  $('moi-btn-gcm2').style.color      = unit === 'gcm2' ? 'var(--accent)' : 'var(--muted)';
  $('moi-btn-gcm2').style.fontWeight = unit === 'gcm2' ? '700' : '400';

  $('moi-btn-kgm2').style.background = unit === 'kgm2' ? activeStyle : inactiveStyle;
  $('moi-btn-kgm2').style.color      = unit === 'kgm2' ? 'var(--accent)' : 'var(--muted)';
  $('moi-btn-kgm2').style.fontWeight = unit === 'kgm2' ? '700' : '400';
}


// ─────────────────────────────────────────────────────────────────────────────
// Preset / sync handlers — friction selects
// ─────────────────────────────────────────────────────────────────────────────

/** Reads the bearing preset select and updates the hidden mu-bore input. */
function applyMuBorePreset() {
  const sel       = $('mu-bore-preset');
  const customRow = $('mu-bore-custom-row');
  if (!sel) return;

  if (sel.value === 'custom') {
    if (customRow) customRow.style.display = 'grid';
    $('mu-bore').value = $('mu-bore-custom').value;
  } else {
    if (customRow) customRow.style.display = 'none';
    $('mu-bore').value = sel.value;
  }
}

/** Syncs the mu-bore hidden input when the custom text field changes. */
function syncCustomMuBore() {
  $('mu-bore').value = $('mu-bore-custom').value;
}

/** Reads the body bearing preset select and updates the hidden mu-body input. */
function applyMuBodyPreset() {
  const sel       = $('mu-body-preset');
  const customRow = $('mu-body-custom-row');
  if (!sel) return;

  if (sel.value === 'custom') {
    if (customRow) customRow.style.display = 'grid';
    $('mu-body').value = $('mu-body-custom').value;
  } else {
    if (customRow) customRow.style.display = 'none';
    $('mu-body').value = sel.value;
  }
}

/** Syncs the mu-body hidden input when the custom text field changes. */
function syncCustomMuBody() {
  if ($('mu-body-custom')) $('mu-body').value = $('mu-body-custom').value;
}

/** Reads the rolling resistance preset select and updates the hidden mu-r input. */
function applyMuPreset() {
  const sel       = $('mu-r-preset');
  const customRow = $('mu-r-custom-row');
  if (!sel) return;

  if (sel.value === 'custom') {
    if (customRow) customRow.style.display = 'grid';
    $('mu-r').value = v('mu-r-custom');
  } else {
    if (customRow) customRow.style.display = 'none';
    $('mu-r').value = sel.value;
  }
}

/** Syncs the mu-r hidden input when the custom text field changes. */
function syncCustomMuR() {
  $('mu-r').value = v('mu-r-custom');
}


// ─────────────────────────────────────────────────────────────────────────────
// Input validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates all visible form inputs before a simulation run.
 * Marks invalid fields with the .invalid class and shows an error banner.
 *
 * @returns {boolean} true if all inputs are valid
 */
function validateInputs() {
  const isMoi     = $('wheel-mode').value === 'moi';
  const isDynamic = $('axle-setup').value === 'dynamic';
  const errors    = [];

  // Field definitions: id, display label, min, max, optional visibility guard
  const fields = [
    { id: 'mass',             label: 'Car mass',             min: 10,  max: 500  },
    { id: 'frontal-override', label: 'Frontal area',         min: 100, max: 9000 },
    { id: 'cd-custom',        label: 'Drag coefficient',     min: 0.05, max: 1.5 },
    { id: 'wf-dia',           label: 'Front wheel diameter', min: 5,   max: 80   },
    { id: 'wf-mass',          label: 'Front wheel mass',     min: 0.1, max: 30,  onlyIf: () => !isMoi },
    { id: 'wr-dia',           label: 'Rear wheel diameter',  min: 5,   max: 80   },
    { id: 'wr-mass',          label: 'Rear wheel mass',      min: 0.1, max: 30,  onlyIf: () => !isMoi },
    { id: 'bore-dia',         label: 'Axle bore diameter',   min: 0.5, max: 15,  onlyIf: () => !isMoi },
    { id: 'track',            label: 'Track length',         min: 5,   max: 100  },
    { id: 'axle-dia-static',  label: 'Axle diameter',        min: 1,   max: 10,  onlyIf: () => !isDynamic },
    { id: 'axle-dia',         label: 'Axle diameter',        min: 1,   max: 10,  onlyIf: () =>  isDynamic },
    { id: 'axle-mass',        label: 'Axle mass',            min: 0.5, max: 30,  onlyIf: () =>  isDynamic },
  ];

  // Clear previous error highlights
  document.querySelectorAll('.invalid').forEach((el) => el.classList.remove('invalid'));

  // Check each field
  fields.forEach((f) => {
    if (f.onlyIf && !f.onlyIf()) return;
    const el = $(f.id);
    if (!el) return;
    const val = parseFloat(el.value);

    if (isNaN(val) || val <= 0) {
      errors.push(`${f.label} can't be zero or empty.`);
      el.classList.add('invalid');
    } else if (val < f.min || val > f.max) {
      errors.push(`${f.label} looks unusual (entered ${val}, expected ${f.min}–${f.max}).`);
      el.classList.add('invalid');
    }
  });

  // Validate MOI fields when in custom MOI mode
  if (isMoi) {
    [{ id: 'moi-front', label: 'Front wheel MOI' }, { id: 'moi-rear', label: 'Rear wheel MOI' }].forEach(({ id, label }) => {
      const el  = $(id);
      const val = el ? parseFloat(el.value) : NaN;
      if (!el || isNaN(val) || val <= 0) {
        errors.push(`${label} must be a positive number.`);
        if (el) el.classList.add('invalid');
      }
    });
  }

  // Validate rolling resistance
  const muR = parseFloat($('mu-r').value);
  if (isNaN(muR) || muR <= 0) {
    errors.push("Rolling resistance μr can't be zero or empty.");
  }

  const banner = $('validation-banner');
  if (errors.length > 0) {
    banner.innerHTML = '⚠ Please fix the following:<br>' +
      errors.map((e) => '• ' + e).join('<br>');
    banner.classList.add('visible');
    return false;
  }

  banner.classList.remove('visible');
  return true;
}


// ─────────────────────────────────────────────────────────────────────────────
// Run simulation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates inputs, runs the simulation, then updates all result cards,
 * charts, and the forces breakdown panel.
 */
function runSim() {
  if (!validateInputs()) return;

  const p = buildParams();
  const r = simulate(p);

  if (!r.finishT) {
    showError('Car did not finish! Check your parameters.');
    return;
  }

  // ── Result card pop animation ──
  setTimeout(() => {
    document.querySelectorAll('.result-card').forEach((el, i) => {
      setTimeout(() => {
        el.classList.remove('pop');
        void el.offsetWidth; // force reflow to restart animation
        el.classList.add('pop');
      }, i * 80);
    });
  }, 300);

  // ── Result values ──
  const tMid = r.finishT;
  $('r-kmh').textContent = (r.peakV * 3.6).toFixed(1);
  $('r-ms2').textContent = r.peakA.toFixed(1);

  animateValue('r-time',  1.8, tMid,          600, 4);
  animateValue('r-speed', 0,   r.peakV,        600, 2);
  animateValue('r-g',     0,   r.peakA / 9.81, 600, 2);

  // ── Delta badge (change vs previous run) ──
  const badge = $('r-delta');
  if (_prevFinishT !== null) {
    const diff      = (tMid - _prevFinishT) * 1000;
    badge.textContent  = (diff > 0 ? '+' : '') + diff.toFixed(1) + 'ms';
    badge.className    = diff < 0 ? 'faster' : 'slower';
    badge.style.display = 'block';
  } else {
    badge.style.display = 'none';
  }
  _prevFinishT = tMid;

  // ── Forces breakdown ──
  const fSpinUp = p.mRotEff * r.peakA;
  const fAero   = 0.5 * p.rho * p.Cd * p.A * r.peakV * r.peakV;
  const total   = fSpinUp + fAero || 1;

  $('forces-empty-state').style.display = 'none';
  $('forces-data').style.display        = 'block';
  $('val-rot').textContent              = fSpinUp.toFixed(3) + ' N';
  $('bar-rot').style.width              = (fSpinUp / total * 100).toFixed(0) + '%';
  $('val-aero').textContent             = fAero.toFixed(3) + ' N';
  $('bar-aero').style.width             = (fAero / total * 100).toFixed(0) + '%';

  // ── Model note ──
  const inertiaNote = $('wheel-mode').value === 'moi'
    ? 'user-supplied wheel MOI'
    : 'annular-disc PLA wheel inertia';

  $('range-note').innerHTML =
    `<strong style="color:var(--teal)">${tMid.toFixed(4)}s</strong> predicted finish time<br>` +
    `<span style="color:var(--muted);font-size:.6rem;line-height:1.7;">` +
    `Model v2: 8g CO₂ depletes proportionally to thrust · dynamic m_eff · ` +
    `${inertiaNote} · μr rolling resistance. ` +
    `Thrust curve fitted to Pitsco 8g measured data. ` +
    `Predicted times are typically within 2–3% of real track times. ` +
    `Use as a relative comparison tool — not an absolute predictor.</span>`;

  // ── Speed / distance chart ──
  $('chart-empty').style.display = 'none';
  $('chart').style.display       = 'block';

  const cutIdx = r.sT.findIndex((t) => t > r.finishT + 0.05);
  const cut    = cutIdx > 0 ? cutIdx : r.sT.length;
  drawSpeedChart($('chart'), r.sT.slice(0, cut), r.sV.slice(0, cut), r.sD.slice(0, cut));

  // ── Thrust chart ──
  drawThrustChart(p.thrustF0, p.thrustTau, p.thrustDur);

  // ── Store run for save / replay ──
  window._lastRun = {
    finishT: r.finishT,
    displayT: tMid,
    finishV: r.finishV,
    peakV:   r.peakV,
    peakA:   r.peakA,
    sT:      r.sT,
    sV:      r.sV,
    sD:      r.sD,
    trackLen: p.trackLen,
  };

  // Enable save button
  const sb = $('save-btn');
  if (sb) {
    sb.disabled          = false;
    sb.style.opacity     = '1';
    sb.style.cursor      = 'pointer';
    sb.textContent       = '💾 Save Run';
  }

  updateReplayCard();
}


// ─────────────────────────────────────────────────────────────────────────────
// Saved runs management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Saves the most recent simulation result with a user-chosen label and colour.
 */
function saveRun() {
  if (!window._lastRun) {
    showError('Run the simulation first.');
    return;
  }

  const label  = $('run-label').value.trim() || ('Run ' + (savedRuns.length + 1));
  const colour = $('run-colour').value;
  const run    = Object.assign({}, window._lastRun, {
    label,
    colour,
    sT: window._lastRun.sT.slice(),
    sD: window._lastRun.sD.slice(),
  });

  savedRuns.push(run);
  window._lastRun = null;

  // Disable save button until next simulation
  const sb = $('save-btn');
  if (sb) {
    sb.disabled      = true;
    sb.style.opacity = '0.4';
    sb.style.cursor  = 'not-allowed';
    sb.textContent   = '💾 Save Run — run simulation first';
  }

  $('run-label').value  = '';
  $('run-colour').value = RUN_COLOURS[savedRuns.length % RUN_COLOURS.length];

  renderSavedRuns();
  updateReplayCard();
}

/**
 * Removes a saved run by index.
 * @param {number} idx
 */
function deleteRun(idx) {
  savedRuns.splice(idx, 1);
  renderSavedRuns();
  updateReplayCard();
}

/** Clears all saved runs and resets the colour picker. */
function clearAllRuns() {
  savedRuns            = [];
  $('run-colour').value = RUN_COLOURS[0];
  renderSavedRuns();
  updateReplayCard();
}

/**
 * Re-renders the saved runs list and the finish time bar chart.
 * The first saved run is always the baseline — all others show delta ms.
 */
function renderSavedRuns() {
  const list = $('saved-runs-list');

  if (savedRuns.length === 0) {
    list.innerHTML =
      '<div class="empty-state" id="saved-runs-empty">' +
      '<div class="empty-icon">◎</div>' +
      '<div class="empty-text">No saved runs yet</div></div>';
    return;
  }

  const refT = savedRuns[0].displayT || savedRuns[0].finishT;

  list.innerHTML = savedRuns.map((r, i) => {
    const diff  = (r.displayT || r.finishT) - refT;
    const sign  = diff > 0 ? '+' : '';
    const cls   = diff < 0 ? 'faster' : 'slower';
    const delta = i === 0
      ? `<span style="color:var(--muted);font-size:.6rem;">baseline</span>`
      : `<span class="run-delta ${cls}">${sign}${(diff * 1000).toFixed(1)}ms</span>`;

    return (
      `<div class="run-row">` +
      `<div class="run-dot" style="background:${r.colour}"></div>` +
      `<div class="run-name" title="${r.label}">${r.label}</div>` +
      `<div class="run-time">${(r.displayT || r.finishT).toFixed(4)}s</div>` +
      delta +
      `<span class="run-del" onclick="deleteRun(${i})" title="Remove">✕</span>` +
      `</div>`
    );
  }).join('');

  renderFinishTimeChart();
}

/**
 * Shows or hides the finish time bar chart based on saved run count.
 */
function renderFinishTimeChart() {
  const wrap = $('time-chart-wrap');
  if (savedRuns.length < 1) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = 'block';
  drawBarChart(
    $('time-chart'),
    savedRuns.map((r) => r.label),
    savedRuns.map((r) => r.displayT || r.finishT),
    savedRuns.map((r) => r.colour)
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Theme toggle
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Toggles light / dark mode and redraws all active canvases.
 */
function toggleTheme() {
  const isLight = document.body.classList.toggle('light');
  $('theme-btn').textContent = isLight ? '☾ Dark Mode' : '☀ Light Mode';

  // Redraw speed chart if visible
  if (window._lastRun && $('chart').style.display !== 'none') {
    const cut = window._lastRun.sT.findIndex((t) => t > window._lastRun.finishT + 0.05);
    const n   = cut > 0 ? cut : window._lastRun.sT.length;
    drawSpeedChart(
      $('chart'),
      window._lastRun.sT.slice(0, n),
      window._lastRun.sV.slice(0, n),
      window._lastRun.sD.slice(0, n)
    );
  }

  // Redraw thrust chart if visible
  if (window._lastRun && $('thrust-chart').style.display !== 'none') {
    drawThrustChart(v('co2-F0'), v('co2-tau'), v('co2-dur'));
  }

  // Redraw bar chart if there are saved runs
  if (savedRuns && savedRuns.length > 0) renderFinishTimeChart();

  // Redraw replay first frame
  if (_replayRuns.length) setTimeout(() => drawReplayFrame(0), 20);
}


// ─────────────────────────────────────────────────────────────────────────────
// Initialisation & resize handler
// ─────────────────────────────────────────────────────────────────────────────

window.addEventListener('load', () => {
  // Initialise all form state from default values
  try {
    applyMuPreset();
    applyMuBorePreset();
    applyMuBodyPreset();
    updateAxleSetup();
    toggleWheelMode();
  } catch (e) {
    console.warn('[AeroTune] Init error:', e);
  }

  // Collapse sections on small screens for a cleaner first impression
  if (window.innerWidth <= 520) {
    document.querySelectorAll('.section-body').forEach((body) => {
      body.classList.add('collapsed');
      const arrow = body.previousElementSibling?.querySelector('.section-arrow');
      if (arrow) arrow.classList.remove('open');
    });

    const ob = $('onboard-body');
    const tl = $('onboard-toggle-label');
    if (ob && tl) {
      ob.classList.add('hidden');
      tl.textContent = 'click to expand';
    }
  }
});

/** Debounced resize handler — redraws active canvases when viewport changes. */
let _resizeTimer = null;

window.addEventListener('resize', () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => {

    if (window._lastRun && $('chart').style.display !== 'none') {
      const cut = window._lastRun.sT.findIndex((t) => t > window._lastRun.finishT + 0.05);
      const n   = cut > 0 ? cut : window._lastRun.sT.length;
      drawSpeedChart(
        $('chart'),
        window._lastRun.sT.slice(0, n),
        window._lastRun.sV.slice(0, n),
        window._lastRun.sD.slice(0, n)
      );
    }

    if (window._lastRun && $('thrust-chart').style.display !== 'none') {
      drawThrustChart(v('co2-F0'), v('co2-tau'), v('co2-dur'));
    }

    if (savedRuns && savedRuns.length > 0) renderFinishTimeChart();

    if (_replayRuns.length) drawReplayFrame(0);

  }, 150);
});
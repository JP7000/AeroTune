function showError(msg) {
  const b = $('validation-banner');
  if (b) { b.innerHTML = '⚠ ' + msg; b.classList.add('visible'); setTimeout(() => b.classList.remove('visible'), 4000); }
}

// ── Canvas chart helpers ───────────────────────────────────────
function drawSpeedChart(canvas, times, speeds, dists) {
  const isLight = document.body.classList.contains('light');
  const PAD = { t:10, r:50, b:32, l:46 };
  const W = canvas.parentElement.clientWidth || 600;
  const H = 200;
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;

  const bg       = isLight ? '#f4f7fa' : '#0a0f14';
  const grid     = isLight ? '#d0dbe6' : '#111820';
  const cyanLine = isLight ? '#0099bb' : '#00d4ff';
  const cyanFill = isLight ? 'rgba(0,153,187,0.12)' : 'rgba(0,212,255,0.08)';
  const orngLine = isLight ? '#cc5500' : '#ff6b00';
  const orngFill = isLight ? 'rgba(204,85,0,0.10)' : 'rgba(255,107,0,0.07)';
  const tickX    = isLight ? '#6a7a8a' : '#4a6070';

  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  const maxV = Math.max(...speeds) * 1.1 || 1;
  const maxD = Math.max(...dists)  * 1.1 || 1;
  const maxT = Math.max(...times)  || 1;
  const tx = t => PAD.l + (t / maxT) * cW;
  const ty = (val, mx) => PAD.t + cH - (val / mx) * cH;

  ctx.strokeStyle = grid; ctx.lineWidth = 1;
  for (let i=0; i<=4; i++) {
    const y = PAD.t + (i/4)*cH;
    ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(PAD.l+cW, y); ctx.stroke();
  }

  // Distance
  ctx.beginPath(); ctx.moveTo(tx(times[0]), ty(dists[0], maxD));
  for (let i=1; i<times.length; i++) ctx.lineTo(tx(times[i]), ty(dists[i], maxD));
  ctx.lineTo(tx(times[times.length-1]), PAD.t+cH); ctx.lineTo(tx(times[0]), PAD.t+cH); ctx.closePath();
  ctx.fillStyle = orngFill; ctx.fill();
  ctx.beginPath(); ctx.moveTo(tx(times[0]), ty(dists[0], maxD));
  for (let i=1; i<times.length; i++) ctx.lineTo(tx(times[i]), ty(dists[i], maxD));
  ctx.strokeStyle = orngLine; ctx.lineWidth = 2; ctx.stroke();

  // Speed
  ctx.beginPath(); ctx.moveTo(tx(times[0]), ty(speeds[0], maxV));
  for (let i=1; i<times.length; i++) ctx.lineTo(tx(times[i]), ty(speeds[i], maxV));
  ctx.lineTo(tx(times[times.length-1]), PAD.t+cH); ctx.lineTo(tx(times[0]), PAD.t+cH); ctx.closePath();
  ctx.fillStyle = cyanFill; ctx.fill();
  ctx.beginPath(); ctx.moveTo(tx(times[0]), ty(speeds[0], maxV));
  for (let i=1; i<times.length; i++) ctx.lineTo(tx(times[i]), ty(speeds[i], maxV));
  ctx.strokeStyle = cyanLine; ctx.lineWidth = 2; ctx.stroke();

  ctx.font = '9px monospace';
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = cyanLine;
  for (let i=0; i<=4; i++) ctx.fillText((maxV*(4-i)/4).toFixed(1), PAD.l-4, PAD.t+(i/4)*cH);
  ctx.textAlign = 'left'; ctx.fillStyle = orngLine;
  for (let i=0; i<=4; i++) ctx.fillText((maxD*(4-i)/4).toFixed(1), PAD.l+cW+4, PAD.t+(i/4)*cH);
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = tickX;
  for (let i=0; i<=5; i++) ctx.fillText((maxT*i/5).toFixed(2)+'s', tx(maxT*i/5), PAD.t+cH+4);
}

function drawThrustChart(F0, tau, dur) {
  const canvas = $('thrust-chart');
  const empty  = $('thrust-empty');
  if (empty)  empty.style.display  = 'none';
  canvas.style.display = 'block';
  const isLight = document.body.classList.contains('light');
  const PAD = { t:10, r:20, b:32, l:46 };
  const W = canvas.parentElement.clientWidth || 600; const H = 160;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = W*dpr; canvas.height = H*dpr;
  canvas.style.width = W+'px'; canvas.style.height = H+'px';
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  const cW = W-PAD.l-PAD.r, cH = H-PAD.t-PAD.b;
  ctx.fillStyle = isLight ? '#f4f7fa' : '#0a0f14'; ctx.fillRect(0,0,W,H);

  const pts = [];
  const totalT = dur + 0.05;
  for (let t=0; t<=totalT; t+=totalT/200) pts.push({ t, f: t < dur ? F0*Math.exp(-t/tau) : 0 });
  const maxF = F0 * 1.05; const maxT = totalT;
  const tx = t => PAD.l + (t/maxT)*cW;
  const ty = f => PAD.t + cH - (f/maxF)*cH;

  ctx.strokeStyle = isLight ? '#d0dbe6' : '#111820'; ctx.lineWidth=1;
  for (let i=0;i<=4;i++) {
    const y = PAD.t+(i/4)*cH;
    ctx.beginPath(); ctx.moveTo(PAD.l,y); ctx.lineTo(PAD.l+cW,y); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(tx(pts[0].t), ty(pts[0].f));
  for (let i=1;i<pts.length;i++) ctx.lineTo(tx(pts[i].t), ty(pts[i].f));
  ctx.lineTo(tx(pts[pts.length-1].t), PAD.t+cH); ctx.lineTo(tx(pts[0].t), PAD.t+cH); ctx.closePath();
  ctx.fillStyle = isLight ? 'rgba(255,51,85,0.10)' : 'rgba(255,51,85,0.12)'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(tx(pts[0].t), ty(pts[0].f));
  for (let i=1;i<pts.length;i++) ctx.lineTo(tx(pts[i].t), ty(pts[i].f));
  ctx.strokeStyle = '#ff3355'; ctx.lineWidth=2; ctx.stroke();

  ctx.fillStyle = '#ff3355'; ctx.font='9px monospace';
  ctx.textAlign='left'; ctx.textBaseline='bottom';
  ctx.fillText(F0.toFixed(1)+'N peak', tx(0)+4, ty(F0)-2);
  ctx.textAlign='right'; ctx.textBaseline='middle'; ctx.fillStyle = isLight ? '#cc3355' : '#ff3355';
  for (let i=0;i<=4;i++) ctx.fillText((maxF*(4-i)/4).toFixed(1), PAD.l-4, PAD.t+(i/4)*cH);
  ctx.textAlign='center'; ctx.textBaseline='top'; ctx.fillStyle = isLight ? '#6a7a8a' : '#4a6070';
  for (let i=0;i<=4;i++) ctx.fillText((maxT*i/4).toFixed(2)+'s', tx(maxT*i/4), PAD.t+cH+4);
}

function drawBarChart(canvas, labels, values, colours) {
  const isLight = document.body.classList.contains('light');
  const PAD = { t:10, r:16, b:36, l:52 };
  const W = canvas.parentElement.clientWidth || 400; const H = 140;
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;
  ctx.fillStyle = isLight ? '#ffffff' : '#0a0f14'; ctx.fillRect(0, 0, W, H);
  const dataMin = Math.min(...values), dataMax = Math.max(...values);
  const spread = dataMax - dataMin || 0.001;
  const minV = dataMin - spread * 0.5, maxV = dataMax + spread * 0.5;
  const range = maxV - minV;
  const n = values.length, gap = cW / n, barW = Math.min(60, gap * 0.6);
  const by = val => PAD.t + cH - ((val - minV) / range) * cH;
  ctx.strokeStyle = isLight ? '#e0e8f0' : '#111820'; ctx.lineWidth = 1;
  for (let i=0; i<=3; i++) {
    const y = PAD.t + (i/3)*cH;
    ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(PAD.l+cW, y); ctx.stroke();
    ctx.font = '9px monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = isLight ? '#8a9aaa' : '#7a9ab0';
    ctx.fillText((minV + range*(3-i)/3).toFixed(4), PAD.l-4, y);
  }
  values.forEach((val, i) => {
    const x = PAD.l + gap*i + gap/2 - barW/2, y = by(val), h = PAD.t+cH-y;
    ctx.fillStyle = colours[i]+'55'; ctx.strokeStyle = colours[i]; ctx.lineWidth = 2;
    ctx.fillRect(x, y, barW, h); ctx.strokeRect(x, y, barW, h);
    ctx.font = '9px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = isLight ? '#1a2a3a' : '#c8d8e8';
    ctx.fillText(labels[i].length > 8 ? labels[i].slice(0,7)+'...' : labels[i], x+barW/2, PAD.t+cH+4);
    ctx.textBaseline = 'bottom'; ctx.fillStyle = colours[i];
    ctx.fillText(val.toFixed(3)+'s', x+barW/2, y-2);
  });
}

// ── UI helpers ─────────────────────────────────────────────────
function toggleOnboard(hdr) {
  const body  = $('onboard-body'), label = $('onboard-toggle-label');
  const hidden = body.classList.toggle('hidden');
  label.textContent = hidden ? 'click to expand' : 'click to collapse';
}

function toggleSection(hdr) {
  const body  = hdr.nextElementSibling;
  const arrow = hdr.querySelector('.section-arrow');
  const open  = !body.classList.contains('collapsed');
  body.classList.toggle('collapsed', open);
  arrow.classList.toggle('open', !open);
}

function setPill(btn) {
  const target = btn.dataset.target, value = btn.dataset.value;
  btn.closest('.pill-group').querySelectorAll('.pill-opt').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(target).value = value;
}

function toggleTip(btn) {
  let box = btn.nextElementSibling;
  if (!box || !box.classList.contains('tip-box')) {
    let el = btn.parentElement;
    while (el) {
      let sib = el.nextElementSibling;
      while (sib) { if (sib.classList.contains('tip-box')) { box = sib; break; } sib = sib.nextElementSibling; }
      if (box) break;
      el = el.parentElement;
    }
  }
  if (!box) return;
  const isOpen = box.classList.contains('open');
  document.querySelectorAll('.tip-box.open').forEach(b => b.classList.remove('open'));
  if (!isOpen) box.classList.add('open');
}

function toggleForcesExplain() {
  const el = $('forces-explain');
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function updateAxleSetup() {
  const isDynamic = $('axle-setup').value === 'dynamic';
  $('axle-static-opts').style.display  = isDynamic ? 'none'  : 'block';
  $('axle-dynamic-opts').style.display = isDynamic ? 'block' : 'none';
}

function applyMuBorePreset() {
  const sel = $('mu-bore-preset');
  if (!sel) return;
  const customRow = $('mu-bore-custom-row');
  if (sel.value === 'custom') {
    if (customRow) customRow.style.display = 'grid';
    $('mu-bore').value = $('mu-bore-custom').value;
  } else {
    if (customRow) customRow.style.display = 'none';
    $('mu-bore').value = sel.value;
  }
}

function syncCustomMuBore() {
  $('mu-bore').value = $('mu-bore-custom').value;
}

function applyMuBodyPreset() {
  const sel = $('mu-body-preset');
  if (!sel) return;
  const customRow = $('mu-body-custom-row');
  if (sel.value === 'custom') {
    if (customRow) customRow.style.display = 'grid';
    $('mu-body').value = $('mu-body-custom').value;
  } else {
    if (customRow) customRow.style.display = 'none';
    $('mu-body').value = sel.value;
  }
}

function syncCustomMuBody() {
  if ($('mu-body-custom')) $('mu-body').value = $('mu-body-custom').value;
}

function applyMuPreset() {
  const sel = $('mu-r-preset');
  if (!sel) return;
  const customRow = $('mu-r-custom-row');
  if (sel.value === 'custom') {
    if (customRow) customRow.style.display = 'grid';
    $('mu-r').value = v('mu-r-custom');
  } else {
    if (customRow) customRow.style.display = 'none';
    $('mu-r').value = sel.value;
  }
}

function syncCustomMuR() {
  $('mu-r').value = v('mu-r-custom');
}

// ── Run simulation & update UI ─────────────────────────────────
let _prevFinishT = null;

function runSim() {
  if (!validateInputs()) return;

  const p = buildParams();
  const r = simulate(p);

  if (!r.finishT) { showError('Car did not finish! Check your parameters.'); return; }

  setTimeout(() => {
    document.querySelectorAll('.result-card').forEach((el, i) => {
      setTimeout(() => { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }, i * 80);
    });
  }, 300);

  $('r-kmh').textContent = (r.peakV*3.6).toFixed(1);
  $('r-ms2').textContent = r.peakA.toFixed(1);

  // Forces breakdown
  const fSpinUp = p.mRotEff * r.peakA;
  const fRoll   = p.muR       * (p.mChassis + p.mCO2Initial) * G;
  const fBore   = p.muBoreEff * (p.mChassis + p.mCO2Initial) * G;
  const fBody   = p.muBodyEff * (p.mChassis + p.mCO2Initial) * G;
  const fAero   = 0.5 * p.rho * p.Cd * p.A * r.peakV * r.peakV;
  const maxF    = Math.max(fSpinUp, fRoll + fBore + fBody, fAero) || 1;

  $('forces-card').style.display = 'block';
  $('val-rot').textContent  = fSpinUp.toFixed(3) + ' N';
  $('bar-rot').style.width  = (fSpinUp / maxF * 100).toFixed(0) + '%';
  $('val-roll').textContent = fRoll.toFixed(3) + ' N';
  $('bar-roll').style.width = (fRoll / maxF * 100).toFixed(0) + '%';

  const boreRow = $('bore-friction-row');
  if (p.muBoreEff > 0) {
    boreRow.style.display = 'flex';
    $('val-bore').textContent = fBore.toFixed(3) + ' N';
    $('bar-bore').style.width = (fBore / maxF * 100).toFixed(0) + '%';
  } else {
    boreRow.style.display = 'none';
  }

  const bodyRow = $('body-bearing-row');
  if (p.muBodyEff > 0) {
    bodyRow.style.display = 'flex';
    $('val-body').textContent = fBody.toFixed(3) + ' N';
    $('bar-body').style.width = (fBody / maxF * 100).toFixed(0) + '%';
  } else {
    bodyRow.style.display = 'none';
  }

  $('val-aero').textContent = fAero.toFixed(3) + ' N';
  $('bar-aero').style.width = (fAero / maxF * 100).toFixed(0) + '%';

  const tMid = r.finishT;
  animateValue('r-time',  1.8,        tMid,         600, 4, '');
  animateValue('r-speed', 0,          r.peakV,      600, 2, '');
  animateValue('r-g',     0,          r.peakA/9.81, 600, 2, '');

  const badge = $('r-delta');
  if (_prevFinishT !== null) {
    const diff = (tMid - _prevFinishT) * 1000;
    badge.textContent = (diff > 0 ? '+' : '') + diff.toFixed(1) + 'ms';
    badge.className   = diff < 0 ? 'faster' : 'slower';
    badge.style.display = 'block';
  } else {
    badge.style.display = 'none';
  }
  _prevFinishT = tMid;

  $('range-note').innerHTML =
    '<strong style="color:var(--accent)">' + tMid.toFixed(4) + 's</strong> predicted finish time<br>' +
    '<span style="color:var(--muted);font-size:.6rem;line-height:1.7;">' +
    'Model v2: 8g CO\u2082 gas depletes proportionally to thrust \u00b7 dynamic m_eff \u00b7 annular-disc PLA wheel inertia \u00b7 \u03bcr rolling resistance. ' +
    'Thrust curve fitted to Pitsco 8g measured data. ' +
    'Real times can be up to 10% slower than predicted. ' +
    'Use as a relative comparison tool \u2014 not an absolute predictor.</span>';

  $('chart-empty').style.display = 'none';
  $('chart').style.display = 'block';
  const cutIdx = r.sT.findIndex(t => t > r.finishT + 0.05);
  const cut = cutIdx > 0 ? cutIdx : r.sT.length;
  drawSpeedChart($('chart'), r.sT.slice(0,cut), r.sV.slice(0,cut), r.sD.slice(0,cut));

  window._lastRun = { finishT: r.finishT, displayT: tMid, finishV: r.finishV, peakV: r.peakV, peakA: r.peakA,
                      sT: r.sT, sV: r.sV, sD: r.sD, trackLen: p.trackLen };
  const sb = $('save-btn');
  if (sb) { sb.disabled = false; sb.style.opacity = '1'; sb.style.cursor = 'pointer'; sb.textContent = '💾 Save Run'; }

  updateReplayCard();
  drawThrustChart(p.thrustF0, p.thrustTau, p.thrustDur);
}

// ── Saved runs ─────────────────────────────────────────────────
const RUN_COLOURS = ['#00d4ff','#00ff88','#ffd600','#ff6b00','#ff3355','#c084fc','#fb923c','#34d399'];
let savedRuns = [];

function saveRun() {
  if (!window._lastRun) { showError('Run the simulation first.'); return; }
  const label  = $('run-label').value.trim() || ('Run ' + (savedRuns.length + 1));
  const colour = $('run-colour').value;
  const runData = Object.assign({}, window._lastRun, { label: label, colour: colour, sT: window._lastRun.sT.slice(), sD: window._lastRun.sD.slice() });
  savedRuns.push(runData);
  window._lastRun = null;
  const sb = $('save-btn');
  if (sb) { sb.disabled = true; sb.style.opacity = '.4'; sb.style.cursor = 'not-allowed'; sb.textContent = '💾 Save Run — run simulation first'; }
  $('run-label').value = '';
  // Advance colour picker to next palette colour for convenience
  $('run-colour').value = RUN_COLOURS[(savedRuns.length) % RUN_COLOURS.length];
  renderSavedRuns(); updateReplayCard();
}

function deleteRun(idx) { savedRuns.splice(idx, 1); renderSavedRuns(); updateReplayCard(); }

function clearAllRuns() {
  savedRuns = [];
  $('run-colour').value = RUN_COLOURS[0];
  renderSavedRuns(); updateReplayCard();
}

function renderSavedRuns() {
  const list  = $('saved-runs-list');
  const empty = $('saved-runs-empty');
  if (savedRuns.length === 0) {
    list.innerHTML = '<div class="empty-state" id="saved-runs-empty"><div class="empty-icon">\u25ce</div><div class="empty-text">No saved runs yet</div></div>';
    return;
  }
  const refT = savedRuns[0].displayT || savedRuns[0].finishT;
  list.innerHTML = savedRuns.map((r, i) => {
    const diff  = (r.displayT || r.finishT) - refT;
    const sign  = diff > 0 ? '+' : '';
    const cls   = i === 0 ? '' : (diff < 0 ? 'faster' : 'slower');
    const delta = i === 0
      ? '<span style="color:var(--muted);font-size:.6rem;">baseline</span>'
      : '<span class="run-delta ' + cls + '">' + sign + (diff*1000).toFixed(1) + 'ms</span>';
    return '<div class="run-row">' +
      '<div class="run-dot" style="background:' + r.colour + '"></div>' +
      '<div class="run-name" title="' + r.label + '">' + r.label + '</div>' +
      '<div class="run-time">' + (r.displayT || r.finishT).toFixed(4) + 's</div>' +
      delta +
      '<span class="run-del" onclick="deleteRun(' + i + ')" title="Remove">\u2715</span>' +
      '</div>';
  }).join('');
  renderForceChart();
}

function renderForceChart() {
  const wrap = $('time-chart-wrap');
  if (savedRuns.length < 1) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  drawBarChart($('time-chart'), savedRuns.map(r => r.label), savedRuns.map(r => r.displayT || r.finishT), savedRuns.map(r => r.colour));
}

// ── Animation ──────────────────────────────────────────────────
function animateValue(id, fromVal, toVal, duration, decimals, suffix) {
  const el = document.getElementById(id); if (!el) return;
  const start = performance.now();
  function tick(now) {
    const p = Math.min((now - start) / duration, 1);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = (fromVal + (toVal - fromVal) * e).toFixed(decimals) + (suffix||'');
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = toVal.toFixed(decimals) + (suffix||'');
  }
  requestAnimationFrame(tick);
}

// ── Replay ─────────────────────────────────────────────────────
let _replayAF = null, _replayRuns = [];

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
  _replayRuns = savedRuns.map(r => ({ label: r.label, colour: r.colour, finishT: r.finishT, displayT: r.displayT || r.finishT }));
  $('replay-runs-legend').innerHTML = _replayRuns.map(function(r) {
    return '<div style="display:flex;align-items:center;gap:.35rem;font-size:.62rem;color:var(--muted);">' +
      '<div style="width:10px;height:3px;border-radius:2px;background:' + r.colour + '"></div>' +
      r.label + ' \u2014 ' + r.displayT.toFixed(4) + 's' +
      '</div>';
  }).join('');
  setTimeout(() => drawReplayFrame(0), 50);
}

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r);
  ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r); ctx.lineTo(x+r,y+h);
  ctx.arcTo(x,y+h,x,y+h-r,r); ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r); ctx.closePath();
}

function drawReplayFrame(simT) {
  const card = $('replay-card'), canvas = $('replay-canvas');
  if (!canvas || !card) return;
  const dpr = window.devicePixelRatio || 1;
  const PAD_L=18, PAD_R=24, LANE_H=22, LANE_GAP=10, nRuns=_replayRuns.length;
  const cW = card.offsetWidth - 56, cH = 16 + nRuns*(LANE_H+LANE_GAP);
  if (cW <= 0) return;
  canvas.style.width=cW+'px'; canvas.style.height=cH+'px';
  canvas.width=cW*dpr; canvas.height=cH*dpr;
  const ctx=canvas.getContext('2d'); ctx.scale(dpr,dpr);
  const trackW=cW-PAD_L-PAD_R;
  const isLight=document.body.classList.contains('light');
  ctx.fillStyle=isLight?'#b0bec8':'#0a0f14'; ctx.fillRect(0,0,cW,cH);
  _replayRuns.forEach((run,i)=>{
    const y=8+i*(LANE_H+LANE_GAP);
    ctx.shadowBlur=0;
    ctx.fillStyle=isLight?'#ffffff':'rgba(255,255,255,0.05)';
    rrect(ctx,PAD_L,y,trackW,LANE_H,3); ctx.fill();
    ctx.strokeStyle=isLight?'#000000':'rgba(255,255,255,0.08)'; ctx.lineWidth=1; ctx.setLineDash([]);
    rrect(ctx,PAD_L,y,trackW,LANE_H,3); ctx.stroke();
    ctx.strokeStyle=isLight?'rgba(0,0,0,0.4)':'rgba(255,255,255,0.2)'; ctx.lineWidth=1; ctx.setLineDash([3,3]);
    ctx.beginPath(); ctx.moveTo(PAD_L+trackW,y+2); ctx.lineTo(PAD_L+trackW,y+LANE_H-2); ctx.stroke();
    ctx.setLineDash([]);
    const progress=Math.min(simT/run.finishT,1.0);
    const carX=PAD_L+progress*trackW, carY=y+LANE_H/2, CAR_W=16, CAR_H=10;
    ctx.shadowColor=run.colour; ctx.shadowBlur=10; ctx.fillStyle=run.colour;
    rrect(ctx,carX-CAR_W,carY-CAR_H/2,CAR_W,CAR_H,2); ctx.fill(); ctx.shadowBlur=0;
    ctx.fillStyle=isLight?'#000000':'rgba(255,255,255,0.4)'; ctx.font='8px "Space Mono",monospace';
    ctx.textBaseline='middle'; ctx.fillText(run.label.slice(0,12),PAD_L+4,y+LANE_H/2);
  });
}

function updateReplayTimeDisplay(simT) {
  const disp=$('replay-time-display'); if(!disp) return;
  disp.innerHTML=_replayRuns.map(function(run){
    var done=simT>=run.finishT, col=done?run.colour:'var(--muted)';
    return '<span style="font-family:var(--font-display);font-size:.7rem;color:' + col + ';">' + run.label.slice(0,12) + ': ' + run.displayT.toFixed(4) + 's</span>';
  }).join('');
}

function startReplay() {
  if (_replayAF) { cancelAnimationFrame(_replayAF); _replayAF=null; }
  if (!_replayRuns.length) return;
  const maxT=Math.max(..._replayRuns.map(r=>r.finishT));
  const REAL_DURATION=2800, startWall=performance.now();
  const btn=$('replay-btn'); btn.textContent='■ Stop';
  btn.onclick=()=>{ cancelAnimationFrame(_replayAF); _replayAF=null; btn.textContent='▶ Play'; btn.onclick=startReplay; };
  let fc=0;
  function frame(now) {
    const elapsed=now-startWall, simT=(elapsed/REAL_DURATION)*maxT;
    drawReplayFrame(Math.min(simT,maxT));
    if(fc%6===0) updateReplayTimeDisplay(Math.min(simT,maxT));
    fc++;
    if(elapsed<REAL_DURATION) { _replayAF=requestAnimationFrame(frame); }
    else { drawReplayFrame(maxT); updateReplayTimeDisplay(maxT); btn.textContent='↺ Replay'; btn.onclick=startReplay; }
  }
  _replayAF=requestAnimationFrame(frame);
}

// ── Theme toggle ───────────────────────────────────────────────
function toggleTheme() {
  const isLight=document.body.classList.toggle('light');
  $('theme-btn').textContent=isLight?'☾ Dark Mode':'☀ Light Mode';
  if(window._lastRun && $('chart').style.display!=='none') {
    const cut=window._lastRun.sT.findIndex(t=>t>window._lastRun.finishT+0.05);
    const n=cut>0?cut:window._lastRun.sT.length;
    drawSpeedChart($('chart'),window._lastRun.sT.slice(0,n),window._lastRun.sV.slice(0,n),window._lastRun.sD.slice(0,n));
  }
  if(savedRuns&&savedRuns.length>0) renderForceChart();
  const cv=$('replay-canvas'); if(cv) cv.style.background=isLight?'#b0bec8':'#0a0f14';
  if(_replayRuns.length) setTimeout(()=>drawReplayFrame(0),20);
}

// ── Validation ─────────────────────────────────────────────────
function validateInputs() {
  const errors=[];
  const fields=[
    {id:'mass',             label:'Car mass',             min:10,  max:500  },
    {id:'frontal-override', label:'Frontal area',         min:100, max:9000 },
    {id:'wf-dia',           label:'Front wheel diameter', min:5,   max:80   },
    {id:'wf-mass',          label:'Front wheel mass',     min:0.1, max:30   },
    {id:'wr-dia',           label:'Rear wheel diameter',  min:5,   max:80   },
    {id:'wr-mass',          label:'Rear wheel mass',      min:0.1, max:30   },
    {id:'track',            label:'Track length',         min:5,   max:100  },
    {id:'bore-dia',         label:'Axle bore diameter',   min:0.5, max:15   },
    {id:'axle-dia-static',  label:'Axle diameter',        min:1,   max:10,  onlyIf: () => $('axle-setup').value === 'static'  },
    {id:'axle-dia',         label:'Axle diameter',        min:1,   max:10,  onlyIf: () => $('axle-setup').value === 'dynamic' },
    {id:'axle-mass',        label:'Axle mass',            min:0.5, max:30,  onlyIf: () => $('axle-setup').value === 'dynamic' },
  ];
  document.querySelectorAll('.invalid').forEach(el=>el.classList.remove('invalid'));
  fields.forEach(f=>{
    if (f.onlyIf && !f.onlyIf()) return;
    const el=$(f.id); if(!el) return;
    const val=parseFloat(el.value);
    if(isNaN(val)||val<=0) { errors.push(f.label + " can't be zero or empty."); el.classList.add('invalid'); }
    else if(val<f.min||val>f.max) { errors.push(f.label + ' looks unusual (entered ' + val + ', expected ' + f.min + '\u2013' + f.max + ').'); el.classList.add('invalid'); }
  });
  const cd=parseFloat($('cd-custom').value);
  if(isNaN(cd)||cd<=0) { errors.push("Coefficient of Drag can't be zero or empty."); $('cd-custom').classList.add('invalid'); }
  const muR=parseFloat($('mu-r').value);
  if(isNaN(muR)||muR<=0) { errors.push("Rolling resistance μr can't be zero or empty."); }
  const banner=$('validation-banner');
  if(errors.length>0) {
    banner.innerHTML='⚠ Please fix the following before running:<br>'+errors.map(function(e){ return '• '+e; }).join('<br>');
    banner.classList.add('visible'); return false;
  }
  banner.classList.remove('visible'); return true;
}

window.addEventListener('load', () => {
  try { applyMuPreset(); applyMuBorePreset(); applyMuBodyPreset(); updateAxleSetup(); } catch(e) { console.warn('Init error:', e); }

  // On mobile, collapse all sidebar sections by default to reduce scroll
  if (window.innerWidth <= 520) {
    document.querySelectorAll('.section-body').forEach(body => {
      body.classList.add('collapsed');
      const arrow = body.previousElementSibling && body.previousElementSibling.querySelector('.section-arrow');
      if (arrow) arrow.classList.remove('open');
    });
    // Also collapse onboarding
    const ob = $('onboard-body'), tl = $('onboard-toggle-label');
    if (ob && tl) { ob.classList.add('hidden'); tl.textContent = 'click to expand'; }
  }
});

// Redraw canvases on resize / orientation change
let _resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => {
    if (window._lastRun && $('chart').style.display !== 'none') {
      const cut = window._lastRun.sT.findIndex(t => t > window._lastRun.finishT + 0.05);
      const n = cut > 0 ? cut : window._lastRun.sT.length;
      drawSpeedChart($('chart'), window._lastRun.sT.slice(0,n), window._lastRun.sV.slice(0,n), window._lastRun.sD.slice(0,n));
    }
    if ($('thrust-card') && $('thrust-card').style.display !== 'none') {
      drawThrustChart(v('co2-F0'), v('co2-tau'), v('co2-dur'));
    }
    if (savedRuns && savedRuns.length > 0) renderForceChart();
    if (_replayRuns.length) drawReplayFrame(0);
  }, 150);
});
// AC//LAB — app.js
// Screen-flow controller. Owns DOM wiring, the live test loop, attempt handling,
// auto-upload, results rendering and history.

import { CONFIG, FLAG_INFO } from './config.js';
import { SESSION_FIELDS } from './schema.js';
import { LANGS } from './i18n.js';
import { PoseEngine } from './pose-engine.js';
import { LiveCounter } from './live.js';
import { analyze, classifyNorm } from './analysis.js';
import { Charts } from './charts.js';
import * as X from './export.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---- app state ----
const S = {
  participant: null,       // entry form data
  lang: null,
  visitId: null,
  attemptNo: 0,
  previous: null,          // previous attempt result (for retry)
  current: null,           // current attempt result
  engine: null,
  modelLoaded: false,
  ring: [],                // pre-roll ring buffer of records
  frames: [],              // captured records during test
  live: null,
  wakeLock: null,
  timers: {},
  practiceDone: false,
  practiceWaived: false,
  testPhase: 'idle',       // idle|framing|practice|countdown|testing|tail|done
  framingOverride: false,
  manualStop: false,
  audioCtx: null,
  paused: false
};

// =====================================================================
// Screen management
// =====================================================================
const SCREENS = ['entry', 'live', 'processing', 'results', 'history'];
function show(name) {
  for (const s of SCREENS) {
    const el = $('#screen-' + s);
    if (el) el.classList.toggle('active', s === name);
  }
  document.body.classList.toggle('live', name === 'live');
  // release camera when leaving live
  if (name !== 'live' && S.engine) S.engine.stop();
  window.scrollTo(0, 0);
}

// =====================================================================
// Sounds + haptics
// =====================================================================
function beep(freq, ms = 120) {
  if (!CONFIG.sounds.enabled) return;
  try {
    if (!S.audioCtx) S.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = S.audioCtx, osc = ctx.createOscillator(), g = ctx.createGain();
    osc.frequency.value = freq; g.gain.value = 0.15;
    osc.connect(g); g.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + ms / 1000);
  } catch {}
}
function vibrate(ms) { if (CONFIG.sounds.vibrate && navigator.vibrate) try { navigator.vibrate(ms); } catch {} }

// =====================================================================
// Dialog
// =====================================================================
function confirmDialog(title, body) {
  return new Promise(res => {
    $('#dlg-title').textContent = title;
    $('#dlg-body').textContent = body;
    const back = $('#dialog-back'); back.classList.add('active');
    const done = (v) => { back.classList.remove('active'); $('#dlg-ok').onclick = null; $('#dlg-cancel').onclick = null; res(v); };
    $('#dlg-ok').onclick = () => done(true);
    $('#dlg-cancel').onclick = () => done(false);
  });
}

// =====================================================================
// Entry screen
// =====================================================================
function initEntry() {
  $('#version-foot').textContent = `app ${CONFIG.app.version} · analysis ${CONFIG.app.analysisVersion} · schema ${CONFIG.app.schemaVersion}`;

  // consent visibility depends on webhook
  const hasWebhook = !!CONFIG.sheets.webhookUrl;
  $('#consent-wrap').hidden = !hasWebhook;
  $('#consent-note').hidden = hasWebhook;

  // auto-suggest dumbbell from sex
  $('#sex').addEventListener('change', () => {
    const dw = $('#dumbbell_kg');
    if (!dw.value) {
      const sex = $('#sex').value;
      if (sex === 'female') dw.value = CONFIG.protocol.dumbbellKgStandard.female;
      else if (sex === 'male') dw.value = CONFIG.protocol.dumbbellKgStandard.male;
    }
    validateEntry();
  });

  $$('#entry-form input, #entry-form select, #entry-form textarea').forEach(el =>
    el.addEventListener('input', validateEntry));
  $('#safety').addEventListener('change', validateEntry);
  $('#protocol_briefed').addEventListener('change', validateEntry);

  // language buttons
  $$('#lang-buttons .btn').forEach(b => b.addEventListener('click', () => selectLang(b.dataset.lang)));

  $('#btn-proceed').addEventListener('click', onProceed);
  $('#btn-history-entry').addEventListener('click', () => { renderHistory(); show('history'); });

  validateEntry();
}

function selectLang(code) {
  S.lang = code;
  const id = CONFIG.video.ids[code];
  $('#video-area').hidden = false;
  $('#lang-prompt').hidden = true;
  $('#yt').src = `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0&modestbranding=1&autoplay=1`;
  $('#yt-fallback').href = `https://www.youtube.com/shorts/${id}`;
  // language switch row
  const sw = $('#lang-switch'); sw.innerHTML = '';
  for (const l of LANGS) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn' + (l.code === code ? ' active' : '');
    b.textContent = l.native;
    b.addEventListener('click', () => selectLang(l.code));
    sw.appendChild(b);
  }
  document.documentElement.lang = (LANGS.find(l => l.code === code) || {}).htmlLang || 'en';
  // reveal proceed area + preload model
  $('#proceed-area').hidden = false;
  loadModel();
  validateEntry();
}

async function loadModel() {
  if (S.modelLoaded || S._loadingModel) return;
  S._loadingModel = true;
  const btn = $('#btn-proceed'), status = $('#model-status');
  btn.textContent = 'LOADING MODEL…';
  try {
    S.engine = S.engine || new PoseEngine($('#cam'), $('#overlay'), CONFIG);
    CONFIG.pose.model = $('#pose_model').value || CONFIG.pose.model;
    const delegate = await S.engine.loadModel((m) => { status.textContent = m; });
    S.modelLoaded = true;
    status.textContent = `Pose model ready (${delegate}).`;
    btn.textContent = 'PROCEED TO TEST';
    validateEntry();
  } catch (e) {
    status.textContent = 'Could not load the pose model. Check your connection (needs internet on first load) and try again.';
    btn.textContent = 'PROCEED TO TEST';
  } finally { S._loadingModel = false; }
}

function readEntry() {
  const g = (id) => { const el = $('#' + id); return el ? el.value.trim() : ''; };
  const num = (id) => { const v = g(id); return v === '' ? null : Number(v); };
  return {
    participant_id: g('participant_id'), age_years: num('age_years'), sex: g('sex'),
    height_cm: num('height_cm'), body_mass_kg: num('body_mass_kg'),
    test_arm: g('test_arm'), dumbbell_kg: num('dumbbell_kg'),
    chair_seat_height_cm: num('chair_seat_height_cm'), site: g('site'),
    operator_notes: g('operator_notes'), camera_facing: g('camera_facing'),
    pose_model: g('pose_model'),
    safety: $('#safety').checked, protocol_briefed: $('#protocol_briefed').checked,
    consent: $('#consent') ? $('#consent').checked : false
  };
}

function validateEntry() {
  const d = readEntry();
  const errs = {};
  if (!d.participant_id) errs.participant_id = 'Required.';
  if (d.age_years == null) errs.age_years = 'Required.';
  else if (d.age_years < 18 || d.age_years > 110) errs.age_years = 'Age must be 18–110.';
  if (!d.sex) errs.sex = 'Required.';
  const [hLo, hHi] = CONFIG.calibration.heightRangeCm;
  if (d.height_cm == null) errs.height_cm = 'Required.';
  else if (d.height_cm < hLo || d.height_cm > hHi) errs.height_cm = `Height must be ${hLo}–${hHi} cm.`;
  if (!d.test_arm) errs.test_arm = 'Required.';
  if (d.dumbbell_kg == null) errs.dumbbell_kg = 'Required.';
  else if (d.dumbbell_kg <= 0) errs.dumbbell_kg = 'Must be > 0.';

  $$('.err[data-err]').forEach(e => e.textContent = errs[e.dataset.err] || '');

  const checksOk = d.safety && d.protocol_briefed;
  const langOk = !!S.lang;
  const formOk = Object.keys(errs).length === 0 && checksOk;
  const canProceed = formOk && langOk && S.modelLoaded;

  const btn = $('#btn-proceed');
  if (btn) btn.disabled = !canProceed;

  const missing = [];
  if (Object.keys(errs).length) missing.push('participant details');
  if (!checksOk) missing.push('confirmations');
  if (!langOk) missing.push('language selection');
  if (!S.modelLoaded) missing.push('pose model loading');
  $('#proceed-err').textContent = canProceed ? '' : (missing.length ? 'Still needed: ' + missing.join(', ') + '.' : '');
  return canProceed;
}

async function onProceed() {
  if (!validateEntry()) return;
  S.participant = readEntry();
  if (!S.visitId) { S.visitId = uuid(); S.attemptNo = 0; }
  // start camera + framing
  show('live');
  await startFraming();
}

// =====================================================================
// LIVE: framing -> practice -> countdown -> test -> tail
// =====================================================================
async function startFraming() {
  S.testPhase = 'framing';
  S.frames = []; S.ring = []; S.manualStop = false; S.framingOverride = false;
  const eng = S.engine;
  eng.side = S.participant.test_arm;
  eng.showArc = true;
  try {
    await eng.startCamera(S.participant.camera_facing);
  } catch (e) {
    await confirmDialog('Camera error', 'Could not access the camera. On iOS/Android, allow camera permission in the browser settings. Camera needs HTTPS.');
    show('entry'); return;
  }
  await requestWakeLock();

  $('#readiness').hidden = false; $('#chips').hidden = false;
  $('#hud-time').hidden = true; $('#hud-count').hidden = true; $('#hud-angles').hidden = false; $('#hud-msg').hidden = true;

  let ready = false;
  eng.onFrame = (rec) => {
    // keep ring buffer
    pushRing(rec);
    updateAngles(rec);
    // auto-detect near side for the mismatch chip
    const near = eng.detectSide(rec);
    const r = eng.readiness(rec);
    ready = r.ok;
    $('#readiness').textContent = r.msg;
    $('#readiness').classList.toggle('ready', r.ok);
    renderChips(rec, near, r);
  };
  eng.start();
  renderFramingControls(() => ready);
}

function pushRing(rec) {
  if (!rec) return;
  S.ring.push(rec);
  const maxMs = CONFIG.camera.ringBufferS * 1000;
  const cutoff = rec.t - maxMs;
  while (S.ring.length && S.ring[0].t < cutoff) S.ring.shift();
}

function renderChips(rec, near, r) {
  const chips = $('#chips');
  const checks = [
    { k: 'Body in frame', ok: !!(rec && rec.lm.nose && rec.lm[(S.participant.test_arm === 'left' ? 'l_' : 'r_') + 'kn']) },
    { k: 'Arm visible', ok: !!(rec && rec.lm[(S.participant.test_arm === 'left' ? 'l_' : 'r_') + 'wr'] && rec.lm[(S.participant.test_arm === 'left' ? 'l_' : 'r_') + 'wr'].v >= 0.5) },
    { k: 'Side-on', ok: r.msg !== 'Turn so the tested-arm side faces the camera.' },
    { k: 'Arm hanging', ok: r.ok || r.msg !== 'Let the arm hang straight down to start.' },
    { k: near === S.participant.test_arm ? 'Correct arm' : 'Arm mismatch', ok: near === S.participant.test_arm }
  ];
  chips.innerHTML = checks.map(c => `<span class="chip ${c.ok ? 'ok' : 'warn'}">${c.k}</span>`).join('');
}

function updateAngles(rec) {
  const eng = S.engine;
  const flex = eng.elbowFlex(rec);
  $('#a-elbow').textContent = isFinite(flex) ? flex.toFixed(0) + '°' : '—';
  $('#a-fps').textContent = eng.fps ? eng.fps.toFixed(0) : '—';
  if (rec) {
    const p = S.participant.test_arm === 'left' ? 'l_' : 'r_';
    const sh = rec.lm[p + 'sh'], el = rec.lm[p + 'el'], hip = rec.lm[p + 'hip'];
    if (sh && el && hip) {
      const sa = angle3(hip, sh, el);
      $('#a-shoulder').textContent = isFinite(sa) ? sa.toFixed(0) + '°' : '—';
      const tr = Math.atan2(Math.abs(sh.x - hip.x), Math.abs(hip.y - sh.y)) * 180 / Math.PI;
      $('#a-trunk').textContent = tr.toFixed(0) + '°';
    }
  }
}

function renderFramingControls(isReady) {
  const bar = $('#live-controls');
  bar.innerHTML = '';
  const mk = (label, cls, fn) => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = label; b.onclick = fn; bar.appendChild(b); return b; };
  mk('Flip cam', 'btn-ghost', () => S.engine.flipCamera());
  mk('Labels', 'btn-ghost', () => { S.engine.showLabels = !S.engine.showLabels; });
  mk('All pts', 'btn-ghost', () => { S.engine.showAll = !S.engine.showAll; });
  mk('Exit', 'btn-danger', async () => { if (await confirmDialog('Exit test', 'Leave the test and return to the form?')) { cleanupLive(); show('entry'); } });
  const start = mk('START TEST ▸', 'btn-primary', async () => {
    if (!isReady()) {
      if (!await confirmDialog('Framing not ready', 'The framing checks are failing. Start anyway? This adds a quality flag.')) return;
      S.framingOverride = true;
    }
    beginPracticeOrTest();
  });
}

async function beginPracticeOrTest() {
  // Offer practice unless already done/waived
  if (!S.practiceDone && !S.practiceWaived) {
    const doPractice = await confirmDialog('Practice', `Do 1–2 practice reps now? (Not scored.) Tap OK to practice, Cancel to skip and start the scored test.`);
    if (doPractice) { return runPractice(); }
    S.practiceWaived = true;
  }
  startCountdown();
}

function runPractice() {
  S.testPhase = 'practice';
  $('#readiness').hidden = false; $('#readiness').textContent = 'PRACTICE — reps are shown but not scored.';
  $('#hud-count').hidden = false; $('#hud-count-n').textContent = '0';
  const live = new LiveCounter(CONFIG);
  live.onRep = (n) => { $('#hud-count-n').textContent = n; beep(800, 80); vibrate(30); };
  S.engine.onFrame = (rec) => { pushRing(rec); updateAngles(rec); if (rec) { const f = S.engine.elbowFlex(rec); live.update(f, 0.001); S.engine.setProgress(0); } };
  // controls: finish practice
  const bar = $('#live-controls'); bar.innerHTML = '';
  const b = document.createElement('button'); b.className = 'btn btn-primary'; b.textContent = 'START SCORED TEST ▸';
  b.onclick = () => { S.practiceDone = true; startCountdown(); };
  bar.appendChild(b);
  const skip = document.createElement('button'); skip.className = 'btn btn-ghost'; skip.textContent = 'Exit';
  skip.onclick = async () => { if (await confirmDialog('Exit', 'Leave the test?')) { cleanupLive(); show('entry'); } };
  bar.appendChild(skip);
}

function startCountdown() {
  S.testPhase = 'countdown';
  $('#readiness').hidden = true; $('#chips').hidden = true;
  $('#hud-count').hidden = false; $('#hud-count-n').textContent = '0';
  $('#hud-msg').hidden = false;
  $('#live-controls').innerHTML = '';
  const abort = document.createElement('button'); abort.className = 'btn btn-danger'; abort.textContent = 'Abort';
  abort.onclick = async () => { if (await confirmDialog('Abort', 'Abort the countdown?')) { clearTimers(); startFraming(); } };
  $('#live-controls').appendChild(abort);

  let n = CONFIG.protocol.countdownS;
  const tick = () => {
    if (S.paused) { S.timers.cd = setTimeout(tick, 200); return; }
    if (n > 0) { $('#hud-msg').textContent = n; beep(600, 150); vibrate(40); n--; S.timers.cd = setTimeout(tick, 1000); }
    else { $('#hud-msg').textContent = 'GO'; beep(1000, 250); vibrate(80); S.timers.cd = setTimeout(() => { $('#hud-msg').hidden = true; beginTest(); }, 600); }
  };
  tick();
}

function beginTest() {
  S.testPhase = 'testing';
  S.frames = [...S.ring]; // seed with pre-roll ring buffer
  S.manualStop = false;
  const t0 = performance.now();
  S._t0 = t0;
  // GO reference time in record-ms: use last ring record time as "now", preRoll already in ring
  S._goRecMs = S.ring.length ? S.ring[S.ring.length - 1].t : 0;

  const live = new LiveCounter(CONFIG);
  S.live = live;
  $('#hud-time').hidden = false; $('#hud-time').classList.add('counting');
  $('#hud-count').hidden = false; $('#hud-count-n').textContent = '0';
  live.onRep = (nn) => { $('#hud-count-n').textContent = nn; beep(800, 80); vibrate(30); };

  S.engine.onFrame = (rec) => {
    if (!rec) { $('#hud-msg').hidden = false; $('#hud-msg').textContent = 'NO POSE'; return; }
    $('#hud-msg').hidden = true;
    S.frames.push(rec);
    const tGo = (rec.t - S._goRecMs) / 1000;
    const flex = S.engine.elbowFlex(rec);
    live.update(flex, tGo);
    // progress for arc + readout
    updateAngles(rec);
    $('#a-prog').textContent = '';
  };

  // controls
  $('#live-controls').innerHTML = '';
  const stop = document.createElement('button'); stop.className = 'btn btn-danger'; stop.textContent = 'Stop (safety)';
  stop.onclick = async () => { if (await confirmDialog('Stop test', 'Stop early for safety? The attempt is marked as a manual stop.')) { S.manualStop = true; finishTest(); } };
  $('#live-controls').appendChild(stop);

  // timer HUD
  const dur = CONFIG.protocol.durationS;
  const start = performance.now();
  const update = () => {
    if (S.testPhase !== 'testing' && S.testPhase !== 'tail') return;
    if (S.paused) { S.timers.hud = setTimeout(update, 100); return; }
    const el = (performance.now() - start) / 1000;
    const remain = Math.max(0, Math.ceil(dur - el));
    $('#hud-time').textContent = remain;
    if (el >= dur && S.testPhase === 'testing') {
      S.testPhase = 'tail';
      beep(1200, 300); vibrate(120);
      $('#hud-msg').hidden = false; $('#hud-msg').textContent = 'TIME! Stay still…';
      $('#hud-time').textContent = '0';
      setTimeout(() => finishTest(), CONFIG.protocol.tailS * 1000);
    }
    if (S.testPhase === 'testing' || S.testPhase === 'tail') S.timers.hud = setTimeout(update, 100);
  };
  update();
}

let _finished = false;
function finishTest() {
  if (_finished) return; _finished = true;
  clearTimers();
  const liveCount = S.live ? S.live.count : 0;
  S.testPhase = 'done';
  S.engine.stop();
  releaseWakeLock();
  show('processing');
  runAnalysis(liveCount, 'completed').finally(() => { _finished = false; });
}

async function runAnalysis(liveCount, testOutcome) {
  const bar = $('#proc-bar'); bar.style.width = '15%';
  $('#proc-status').textContent = 'Analysing…';
  await sleep(50); bar.style.width = '55%';

  const meta = {
    manualStop: S.manualStop, liveCount, framingOverride: S.framingOverride,
    practiceCompleted: S.practiceDone, practiceWaived: S.practiceWaived,
    testOutcome, effectiveFps: S.engine.fps, goRecMs: S._goRecMs
  };
  let result;
  try {
    result = analyze({ frames: S.frames, participant: S.participant, meta });
  } catch (e) {
    result = { ok: false, error: { code: 'ANALYSIS_ERROR', message: String(e && e.message || e) } };
  }
  bar.style.width = '90%';
  await sleep(50);

  if (!result.ok) {
    bar.style.width = '100%';
    return showFailure(result.error);
  }

  // assemble full summary row (participant + device + analysis)
  const summary = buildSummary(result.summary, { liveCount, testOutcome });
  result.summary = summary;
  result.rawFrames = S.frames.map(f => ({ t_ms: f.t, lm: f.lm }));

  S.attemptNo += 1;
  summary.attempt_no = S.attemptNo;

  S.current = result;
  bar.style.width = '100%';
  Charts.clearAll();
  renderResults(result);
  show('results');

  // save to local history + auto-upload
  X.saveHistory(summary);
  await autoUpload(result);
}

function showFailure(err) {
  const isMovement = err.code === 'NOT_ENOUGH_MOVEMENT';
  $('#proc-status').textContent = isMovement ? 'Not enough movement' : 'Analysis problem';
  const panel = $('#screen-processing .panel');
  // append message + try again
  let msg = panel.querySelector('.fail-msg');
  if (!msg) { msg = document.createElement('p'); msg.className = 'note fail-msg'; panel.appendChild(msg); }
  msg.textContent = isMovement
    ? 'We could not detect enough elbow movement to measure curls. Reframe side-on and try again.'
    : ('Something went wrong analysing this attempt: ' + err.message);
  let ctrls = panel.querySelector('.controls.fail-ctrls');
  if (!ctrls) {
    ctrls = document.createElement('div'); ctrls.className = 'controls fail-ctrls';
    const again = document.createElement('button'); again.className = 'btn btn-primary'; again.textContent = 'TRY AGAIN';
    again.onclick = () => { msg.remove(); ctrls.remove(); show('live'); startFraming(); };
    ctrls.appendChild(again);
    panel.appendChild(ctrls);
  }
}

// =====================================================================
// Build the full Sessions row
// =====================================================================
function buildSummary(analysisSummary, extra) {
  const p = S.participant;
  const now = new Date();
  const sex = p.sex;
  const stdW = sex === 'female' ? CONFIG.protocol.dumbbellKgStandard.female
    : sex === 'male' ? CONFIG.protocol.dumbbellKgStandard.male : null;
  const base = {
    session_id: uuid(),
    visit_id: S.visitId,
    attempt_no: S.attemptNo + 1, // provisional; caller sets the authoritative value
    final_attempt: 'FALSE',
    selected_attempt: '',
    timestamp_utc: now.toISOString(),
    utc_offset_min: -now.getTimezoneOffset(),
    app_version: CONFIG.app.version,
    analysis_version: CONFIG.app.analysisVersion,
    schema_version: CONFIG.app.schemaVersion,
    participant_id: p.participant_id, age_years: p.age_years, sex: p.sex,
    height_cm: p.height_cm, body_mass_kg: p.body_mass_kg ?? '',
    test_arm: p.test_arm, dumbbell_kg: p.dumbbell_kg,
    chair_seat_height_cm: p.chair_seat_height_cm ?? '',
    site: p.site, operator_notes: p.operator_notes,
    instruction_language: S.lang || '',
    practice_completed: S.practiceDone ? 'TRUE' : 'FALSE',
    dumbbell_standard: (stdW != null && Math.abs(p.dumbbell_kg - stdW) <= 0.1) ? 'TRUE' : 'FALSE',
    pose_model: CONFIG.pose.model, pose_delegate: S.engine ? S.engine.delegate : '',
    camera_facing: p.camera_facing,
    video_width_px: S.engine ? S.engine.video.videoWidth : '',
    video_height_px: S.engine ? S.engine.video.videoHeight : '',
    screen_w_px: screen.width, screen_h_px: screen.height,
    device_pixel_ratio: window.devicePixelRatio || 1,
    user_agent: navigator.userAgent,
    test_duration_s: CONFIG.protocol.durationS,
    manual_stop: S.manualStop ? 'TRUE' : 'FALSE',
    test_outcome: extra.testOutcome,
    protocol_briefed_confirmed: p.protocol_briefed ? 'TRUE' : 'FALSE'
  };
  return { ...base, ...analysisSummary };
}

// =====================================================================
// Cannot-do-this-test flow (0 reps)
// =====================================================================
async function cannotDoTest() {
  // record an attempt with 0 reps, outcome cannot_do
  const now = new Date();
  const summary = {};
  for (const f of SESSION_FIELDS) summary[f.key] = '';
  Object.assign(summary, buildSummary({
    curls_count: 0, live_count: 0, count_difference: 0, half_rule_applied: 'FALSE',
    incomplete_attempts: 0, curls_first_half: 0, curls_second_half: 0,
    norm_reference: CONFIG.norm.reference, norm_range_low: '', norm_range_high: '',
    norm_classification: 'Not classified', qc_flags: 'MANUAL_STOP', qc_pass: 'FALSE',
    valid_for_norm: 'FALSE'
  }, { liveCount: 0, testOutcome: 'cannot_do' }));
  S.attemptNo += 1; summary.attempt_no = S.attemptNo;
  const result = { ok: true, summary, reps: [], frames: [], rawFrames: [], series: null };
  S.current = result;
  X.saveHistory(summary);
  await autoUpload(result);
  renderResults(result);
  show('results');
}

// =====================================================================
// Results rendering
// =====================================================================
function renderResults(result) {
  const sm = result.summary;
  $('#res-count').textContent = sm.curls_count ?? 0;

  // badges
  const badges = $('#res-badges'); badges.innerHTML = '';
  const mkBadge = (txt, cls) => { const b = document.createElement('span'); b.className = 'badge ' + cls; b.textContent = txt; badges.appendChild(b); };
  mkBadge(sm.qc_pass === 'TRUE' ? 'QC PASS' : 'QC: REVIEW', sm.qc_pass === 'TRUE' ? 'pass' : 'review');
  if (sm.norm_classification && sm.norm_classification !== 'Not classified') {
    mkBadge(`${sm.norm_classification} (${sm.norm_range_low}–${sm.norm_range_high})`, 'norm');
  } else mkBadge('Not classified', 'norm');
  if (sm.half_rule_applied === 'TRUE') mkBadge('½-rule applied', 'half');
  if (sm.live_count !== '') mkBadge(`live ${sm.live_count} / offline ${sm.curls_count} (Δ${sm.count_difference})`, 'review');

  // tiles
  const tiles = $('#res-tiles'); tiles.innerHTML = '';
  const tileDefs = [
    ['Cycle time', sm.cycle_time_mean, 's'], ['Cycle CV', sm.cycle_time_cv_pct, '%'],
    ['Curl ROM', sm.elbow_rom_mean_deg, '°'], ['Top flexion', sm.elbow_flex_top_mean_deg, '°'],
    ['Peak vel', sm.elbow_flex_peak_vel_mean_deg_s, '°/s'], ['Tempo ratio', sm.tempo_ratio_mean, ''],
    ['Upper-arm swing', sm.upper_arm_swing_mean_deg, '°'], ['Trunk sway', sm.trunk_sway_range_deg, '°'],
    ['Wrist speed', sm.wrist_peak_speed_mean_m_s, 'm/s'], ['Work-rate proxy', sm.load_work_rate_proxy_mean_w, 'W'],
    ['1st half', sm.curls_first_half, ''], ['2nd half', sm.curls_second_half, '']
  ];
  for (const [k, v, u] of tileDefs) {
    const t = document.createElement('div'); t.className = 'tile';
    t.innerHTML = `<div class="v">${fmtv(v)}</div><div class="k">${k}</div><div class="u">${u}</div>`;
    tiles.appendChild(t);
  }

  renderCharts(result);
  renderRepTable(result);
  renderFlags(sm);
  renderQuality(sm);
  renderAllMetrics(sm);
  renderResultControls(result);

  // norm note for out-of-range
  const lim = $('#res-limits');
  if (!(sm.age_years >= 60 && sm.age_years <= 94)) {
    lim.innerHTML = 'Norms apply to ages 60–94. For this participant the count and metrics are shown without a classification. Research / screening instrument — not a medical device.';
  }
}

function renderCharts(result) {
  if (!result.series) { ['chart-progress', 'chart-angles', 'chart-vel', 'chart-cycle', 'chart-rom', 'chart-swing'].forEach(id => { const c = $('#' + id); if (c) c.style.display = 'none'; }); return; }
  const s = result.series;
  const pts = (arr) => s.t.map((t, i) => ({ x: t, y: arr[i] }));
  const dur = CONFIG.protocol.durationS;

  Charts.line($('#chart-progress'), {
    title: 'Curl progress', windowS: dur,
    series: [{ name: 'progress', color: '#ff6a00', points: pts(s.progress) }],
    yMin: 0, yMax: 1.1, refLines: [{ y: 0.5, label: '½' }, { y: 0.85 }]
  });
  Charts.line($('#chart-angles'), {
    title: 'Elbow / shoulder / trunk (°)', windowS: dur,
    series: [
      { name: 'elbow', color: '#ff6a00', points: pts(s.elbowFlex) },
      { name: 'shoulder', color: '#00d4ff', points: pts(s.shoulderAng) },
      { name: 'trunk', color: '#4cdf7c', points: pts(s.trunkIncl) }
    ]
  });
  Charts.line($('#chart-vel'), {
    title: 'Elbow angular velocity (°/s)', windowS: dur,
    series: [{ name: 'elbow vel', color: '#00d4ff', points: pts(s.elbowVel) }]
  });

  const counted = result.reps.filter(r => r.counted === 'TRUE');
  Charts.line($('#chart-cycle'), {
    title: 'Cycle time per rep (s)', xMin: 1, xMax: Math.max(2, counted.length),
    series: [{ name: 'cycle', color: '#00d4ff', markers: true, points: counted.map((r, i) => ({ x: i + 1, y: Number(r.cycle_time_s) })) }]
  });
  Charts.line($('#chart-rom'), {
    title: 'Elbow ROM per rep (°)', xMin: 1, xMax: Math.max(2, counted.length),
    series: [{ name: 'ROM', color: '#4cdf7c', markers: true, points: counted.map((r, i) => ({ x: i + 1, y: Number(r.elbow_rom_deg) })) }]
  });
  Charts.line($('#chart-swing'), {
    title: 'Upper-arm swing per rep (°)', xMin: 1, xMax: Math.max(2, result.reps.length),
    series: [{ name: 'swing', color: '#ffa500', markers: true, points: result.reps.map((r, i) => ({ x: i + 1, y: Number(r.upper_arm_swing_deg) })) }],
    refLines: [{ y: CONFIG.form.swingThresholdDeg, color: '#ff3b30', label: 'flag' }]
  });
}

function renderRepTable(result) {
  const cols = [['curl_number', '#'], ['counted', '✓'], ['t_top_s', 't_top'], ['curl_time_s', 'curl'], ['lower_time_s', 'lower'], ['cycle_time_s', 'cycle'], ['elbow_rom_deg', 'ROM'], ['elbow_flex_peak_vel_deg_s', 'peak v'], ['upper_arm_swing_deg', 'swing']];
  const t = $('#res-reps');
  t.innerHTML = '<tr>' + cols.map(c => `<th>${c[1]}</th>`).join('') + '</tr>' +
    result.reps.map(r => {
      const uncounted = r.counted !== 'TRUE';
      return `<tr class="${uncounted ? 'uncounted' : ''}">` + cols.map(c => {
        let v = r[c[0]];
        if (c[0] === 'counted') v = r.counted === 'TRUE' ? '✓' : '·';
        const half = (c[0] === 'curl_number' && r.counted_by_half_rule === 'TRUE');
        return `<td class="${half ? 'half' : ''}">${v === '' || v == null ? '' : v}</td>`;
      }).join('') + '</tr>';
    }).join('');
}

function renderFlags(sm) {
  const flags = (sm.qc_flags || '').split(';').filter(Boolean);
  const panel = $('#flags-panel'), ul = $('#res-flags');
  if (!flags.length) { panel.hidden = true; return; }
  panel.hidden = false;
  ul.innerHTML = flags.map(f => {
    const blocking = CONFIG.qc.blocking.includes(f);
    return `<li class="${blocking ? 'blocking' : ''}"><span class="code">${f}</span><br>${FLAG_INFO[f] || ''}</li>`;
  }).join('');
}

function renderQuality(sm) {
  const q = [
    ['Detector rate', sm.effective_fs_hz, 'Hz'], ['Valid frames', sm.valid_frame_pct, '%'],
    ['Imputed', sm.imputed_sample_pct, '%'], ['Longest gap', sm.longest_gap_s, 's'],
    ['Arm visibility', sm.median_arm_visibility, ''], ['Obliquity', sm.view_obliquity_median, ''],
    ['2D vs 3D elbow', sm.elbow_2d_3d_diff_deg, '°'], ['Scale', sm.scale_m_per_px, 'm/px'],
    ['Scale drift', sm.scale_check_diff_pct, '%'], ['Calibrated ROM', sm.calib_rom_deg, '°']
  ];
  $('#res-quality').innerHTML = q.map(([k, v, u]) => `<div>${k}: <strong>${fmtv(v)}</strong> ${u}</div>`).join('');
}

function renderAllMetrics(sm) {
  const t = $('#res-allmetrics');
  t.innerHTML = '<tr><th>Field</th><th>Value</th></tr>' +
    SESSION_FIELDS.map(f => `<tr><td style="text-align:left">${f.key}</td><td>${sm[f.key] === '' || sm[f.key] == null ? '' : sm[f.key]}</td></tr>`).join('');
}

function renderResultControls(result) {
  const bar = $('#res-controls'); bar.innerHTML = '';
  const mk = (label, cls, fn) => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = label; b.onclick = fn; bar.appendChild(b); return b; };

  const isRetry = !!S.previous;
  if (isRetry) {
    mk(`Keep previous (${S.previous.summary.curls_count})`, 'btn-ghost', () => finalizeAttempt('previous'));
    mk(`Use current (${result.summary.curls_count})`, 'btn-primary', () => finalizeAttempt('current'));
  } else {
    mk('Submit results', 'btn-primary', () => finalizeAttempt('current'));
  }
  mk('Try again', 'btn-ghost', async () => {
    if (!await confirmDialog('Try again', 'Record another attempt? The current one is kept until you confirm.')) return;
    S.previous = result;
    show('live'); startFraming();
  });
  mk('I cannot do this test', 'btn-danger', async () => {
    if (!await confirmDialog('Cannot do test', 'Record this as "cannot do" with 0 curls?')) return;
    await cannotDoTest();
  });
  mk('Download ZIP', 'btn-ghost', () => {
    const z = X.buildResultZip(result);
    X.downloadBlob(z.bytes, z.filename);
  });
  if (CONFIG.sheets.webhookUrl) mk('Upload to Sheets', 'btn-ghost', () => manualUpload(result));
  mk('New participant', 'btn-primary', () => resetForNewParticipant());
  mk('Home', 'btn-ghost', () => { cleanupLive(); show('entry'); });
}

async function finalizeAttempt(selected) {
  const chosen = selected === 'previous' ? S.previous : S.current;
  const other = selected === 'previous' ? S.current : S.previous;
  chosen.summary.final_attempt = 'TRUE';
  chosen.summary.selected_attempt = selected;
  if (other) { other.summary.final_attempt = 'FALSE'; }
  // local
  X.setFinalLocal(S.visitId, chosen.summary.session_id, selected);
  // remote finalize
  if (CONFIG.sheets.webhookUrl && S.participant.consent) {
    const payload = X.buildFinalizePayload(S.visitId, chosen.summary.session_id, selected);
    const r = await X.uploadSheets(payload);
    if (r.status === 'failed') X.queueOutbox(payload);
    setUploadStatus(`Finalised attempt. ${uploadMsg(r)}`);
  } else {
    setUploadStatus('Attempt finalised locally.');
  }
  // settle: this becomes the "previous" baseline cleared
  S.previous = null;
}

function resetForNewParticipant() {
  S.participant = null; S.visitId = null; S.attemptNo = 0; S.previous = null; S.current = null;
  S.practiceDone = false; S.practiceWaived = false;
  $('#entry-form').reset();
  // keep model loaded
  show('entry'); validateEntry();
}

// =====================================================================
// Upload
// =====================================================================
function uploadMsg(r) {
  switch (r.status) {
    case 'saved': return 'Google Sheets: saved.';
    case 'duplicate': return 'Google Sheets: saved (already present).';
    case 'sent_unconfirmed': return 'Google Sheets: sent, but the response could not be confirmed (CORS). It is treated as sent.';
    case 'failed': return 'Google Sheets: upload failed — queued; retry from History.';
    case 'not_configured': return 'Cloud upload not configured.';
    default: return '';
  }
}
function setUploadStatus(msg, cls = '') { const el = $('#res-upload'); el.textContent = msg; el.className = 'status-line ' + cls; }

async function autoUpload(result) {
  if (!CONFIG.sheets.webhookUrl) { setUploadStatus('Cloud upload not configured — results saved locally. Download the ZIP to keep a copy.'); return; }
  if (!S.participant || !S.participant.consent) { setUploadStatus('Upload not consented for this participant — saved locally.'); return; }
  setUploadStatus('Uploading to Google Sheets…');
  const payload = X.buildPayload(result);
  const r = await X.uploadSheets(payload);
  if (r.status === 'failed') X.queueOutbox(payload);
  setUploadStatus(uploadMsg(r), (r.status === 'saved' || r.status === 'duplicate') ? 'ok' : 'fail');
}

async function manualUpload(result) {
  // recovery/fallback; de-dup handled server-side by session_id
  setUploadStatus('Uploading to Google Sheets…');
  const r = await X.uploadSheets(X.buildPayload(result));
  if (r.status === 'failed') X.queueOutbox(X.buildPayload(result));
  setUploadStatus(uploadMsg(r), (r.status === 'saved' || r.status === 'duplicate') ? 'ok' : 'fail');
}

// =====================================================================
// History
// =====================================================================
function renderHistory() {
  const list = $('#hist-list');
  const h = X.getHistory();
  if (!h.length) { list.innerHTML = '<p class="note">No saved sessions yet.</p>'; }
  else list.innerHTML = h.map(item => `
    <div class="hist-item">
      <div><div><strong>${item.participant_id || '—'}</strong> <span class="meta">#${(item.session_id || '').slice(0, 8)}</span></div>
      <div class="meta">${new Date(item.timestamp_utc).toLocaleString()} · ${item.norm_classification || ''} · QC ${item.qc_pass} · cyc ${item.cycle_time_mean ?? ''}${item.final_attempt === 'TRUE' ? ' · FINAL' : ''}</div></div>
      <div class="cnt">${item.curls_count}</div>
    </div>`).join('');
  const ob = X.outboxCount();
  $('#hist-status').textContent = ob ? `${ob} result(s) waiting to upload.` : '';
}

function initHistory() {
  $('#btn-history-back').addEventListener('click', () => show('entry'));
  $('#btn-retry-outbox').addEventListener('click', async () => {
    $('#hist-status').textContent = 'Retrying…';
    const r = await X.flushOutbox();
    $('#hist-status').textContent = `Sent ${r.sent}, remaining ${r.remaining}.`;
  });
  $('#btn-clear-history').addEventListener('click', async () => {
    if (!await confirmDialog('Clear history', 'Remove all saved sessions on this device? Unsent uploads are kept.')) return;
    X.clearHistory(); renderHistory();
  });
}

// =====================================================================
// Wake lock + lifecycle + rotate guard
// =====================================================================
async function requestWakeLock() {
  try { if (navigator.wakeLock) S.wakeLock = await navigator.wakeLock.request('screen'); } catch {}
}
function releaseWakeLock() { try { if (S.wakeLock) { S.wakeLock.release(); S.wakeLock = null; } } catch {} }

function cleanupLive() {
  clearTimers();
  if (S.engine) S.engine.releaseCamera();
  releaseWakeLock();
  S.testPhase = 'idle';
  document.body.classList.remove('live');
}

function clearTimers() { for (const k of Object.keys(S.timers)) { clearTimeout(S.timers[k]); } S.timers = {}; }

function initLifecycle() {
  // orientation lock attempt (best-effort, after a gesture)
  document.addEventListener('click', () => {
    try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('portrait').catch(() => {}); } catch {}
  }, { once: true });

  // rotate overlay pauses a running test
  const checkOrient = () => {
    const landscape = window.matchMedia('(orientation: landscape)').matches && window.innerWidth < 900;
    if (landscape && (S.testPhase === 'testing' || S.testPhase === 'tail' || S.testPhase === 'countdown')) {
      S.paused = true;
    } else if (!landscape) {
      S.paused = false;
    }
  };
  window.addEventListener('orientationchange', checkOrient);
  window.addEventListener('resize', checkOrient);

  // release on pagehide
  window.addEventListener('pagehide', () => cleanupLive());
  // tab hidden during a test -> abort with notice
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (S.testPhase === 'testing' || S.testPhase === 'tail' || S.testPhase === 'countdown' || S.testPhase === 'practice' || S.testPhase === 'framing')) {
      cleanupLive();
      show('entry');
      setTimeout(() => alert('The test was stopped because the app lost focus. Please start again.'), 50);
    }
  });

  // online -> flush outbox
  window.addEventListener('online', async () => { if (CONFIG.sheets.webhookUrl) await X.flushOutbox(); });
}

// =====================================================================
// Helpers
// =====================================================================
function uuid() { return (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); })); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function fmtv(v) { if (v === '' || v == null || Number.isNaN(v)) return '—'; return v; }
function angle3(a, b, c) {
  const v1x = a.x - b.x, v1y = a.y - b.y, v2x = c.x - b.x, v2y = c.y - b.y;
  const dot = v1x * v2x + v1y * v2y, m1 = Math.hypot(v1x, v1y), m2 = Math.hypot(v2x, v2y);
  if (!m1 || !m2) return NaN;
  return Math.acos(Math.max(-1, Math.min(1, dot / (m1 * m2)))) * 180 / Math.PI;
}

// =====================================================================
// Boot
// =====================================================================
function boot() {
  initEntry();
  initHistory();
  initLifecycle();
  show('entry');
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

if (typeof globalThis !== 'undefined') globalThis.AC_APP = { S, show };

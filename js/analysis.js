// AC//LAB — analysis.js
// Offline biomechanics engine. PURE functions, no DOM, no globals.
// Works in the browser (ES module) and in Node for the unit tests.
//
// Pipeline (Part D):
//   raw frames -> validity -> interpolate gaps -> resample 30 Hz
//   -> filtfilt Butterworth -> scale (m/px) -> angles -> progress
//   -> state machine -> events -> per-rep + summary metrics -> QC -> norms
//
// Coordinate conventions: image coords x-right, y-down. "Up" in metrics is
// positive-up, so vertical rises use (startY - y). Time zero = GO.

import { CONFIG } from './config.js';

const DEG = 180 / Math.PI;

// ---------------------------------------------------------------------------
// Small math helpers
// ---------------------------------------------------------------------------
function mean(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN; }
function sd(a) {
  if (a.length < 2) return NaN;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1));
}
function median(a) {
  if (!a.length) return NaN;
  const b = [...a].sort((x, y) => x - y);
  const h = Math.floor(b.length / 2);
  return b.length % 2 ? b[h] : (b[h - 1] + b[h]) / 2;
}
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function round(x, n = 4) {
  if (x == null || Number.isNaN(x) || !Number.isFinite(x)) return '';
  const p = Math.pow(10, n);
  return Math.round(x * p) / p;
}

// Angle at point b formed by a-b-c, degrees in [0,180].
function angleAt(a, b, c) {
  const v1x = a.x - b.x, v1y = a.y - b.y;
  const v2x = c.x - b.x, v2y = c.y - b.y;
  const dot = v1x * v2x + v1y * v2y;
  const m1 = Math.hypot(v1x, v1y), m2 = Math.hypot(v2x, v2y);
  if (m1 === 0 || m2 === 0) return NaN;
  return Math.acos(clamp(dot / (m1 * m2), -1, 1)) * DEG;
}

function angle3D(a, b, c) {
  const v1 = [a.x - b.x, a.y - b.y, a.z - b.z];
  const v2 = [c.x - b.x, c.y - b.y, c.z - b.z];
  const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
  const m1 = Math.hypot(...v1), m2 = Math.hypot(...v2);
  if (m1 === 0 || m2 === 0) return NaN;
  return Math.acos(clamp(dot / (m1 * m2), -1, 1)) * DEG;
}

// Ordinary least squares slope of y vs index.
function olsSlope(y) {
  const n = y.length;
  if (n < 2) return NaN;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += i; sy += y[i]; sxx += i * i; sxy += i * y[i]; }
  const d = n * sxx - sx * sx;
  if (d === 0) return NaN;
  return (n * sxy - sx * sy) / d;
}

// ---------------------------------------------------------------------------
// Resampling to a uniform rate (linear interpolation on timestamps in seconds)
// ---------------------------------------------------------------------------
function resampleSeries(ts, vals, fs) {
  // ts seconds (monotonic), vals array of numbers; returns {t, y} at fs Hz.
  const t0 = ts[0], t1 = ts[ts.length - 1];
  const n = Math.max(2, Math.round((t1 - t0) * fs) + 1);
  const out = { t: new Array(n), y: new Array(n) };
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + i / fs;
    while (j < ts.length - 2 && ts[j + 1] < t) j++;
    const ta = ts[j], tb = ts[j + 1];
    const frac = tb === ta ? 0 : (t - ta) / (tb - ta);
    out.t[i] = t;
    out.y[i] = vals[j] + (vals[j + 1] - vals[j]) * clamp(frac, 0, 1);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Zero-lag 2nd-order Butterworth low-pass, applied forward+backward (filtfilt).
// Design cutoff corrected by 1/0.802 for the double pass (Winter).
// ---------------------------------------------------------------------------
function butter2(y, fs, cutoffHz) {
  if (y.length < 4) return y.slice();
  const fc = (cutoffHz / 0.802);
  const wc = Math.tan(Math.PI * fc / fs);
  const k1 = Math.SQRT2 * wc, k2 = wc * wc;
  const a0 = 1 + k1 + k2;
  const b0 = k2 / a0, b1 = 2 * b0, b2 = b0;
  const a1 = 2 * (k2 - 1) / a0, a2 = (1 - k1 + k2) / a0;

  const pass = (sig) => {
    const out = new Array(sig.length);
    let x1 = sig[0], x2 = sig[0], y1 = sig[0], y2 = sig[0];
    for (let i = 0; i < sig.length; i++) {
      const x0 = sig[i];
      const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      out[i] = y0;
      x2 = x1; x1 = x0; y2 = y1; y1 = y0;
    }
    return out;
  };

  // reflect-pad to reduce edge transients
  const pad = Math.min(CONFIG.signal.padSamples, y.length - 1);
  const head = [], tail = [];
  for (let i = 1; i <= pad; i++) { head.unshift(2 * y[0] - y[i]); tail.push(2 * y[y.length - 1] - y[y.length - 1 - i]); }
  let s = head.concat(y, tail);
  s = pass(s);
  s.reverse();
  s = pass(s);
  s.reverse();
  return s.slice(pad, pad + y.length);
}

// ---------------------------------------------------------------------------
// Marker helpers — pick the tested-side triples from a frame of named landmarks.
// A frame is { t: ms, lm: { key: {x,y,z,v, wx,wy,wz} } }.
// ---------------------------------------------------------------------------
function sidePick(side) {
  const p = side === 'left' ? 'l_' : 'r_';
  return { sh: p + 'sh', el: p + 'el', wr: p + 'wr', hip: p + 'hip', kn: p + 'kn', idx: p + 'idx' };
}

function detectNearSide(frames, preRollEndMs) {
  let lv = 0, rv = 0, n = 0;
  for (const f of frames) {
    if (f.t > preRollEndMs) break;
    const l = f.lm.l_el, r = f.lm.r_el;
    const lw = f.lm.l_wr, rw = f.lm.r_wr;
    if (l && lw) lv += (l.v + lw.v) / 2;
    if (r && rw) rv += (r.v + rw.v) / 2;
    n++;
  }
  if (n === 0) {
    for (const f of frames) {
      const l = f.lm.l_el, r = f.lm.r_el;
      if (l) lv += l.v; if (r) rv += r.v;
    }
  }
  return lv >= rv ? 'left' : 'right';
}

// ---------------------------------------------------------------------------
// Main entry.
// opts: { frames, participant, meta } where
//   frames: array of {t(ms), lm:{key:{x,y,z,v,wx,wy,wz}}}
//   participant: { age_years, sex, height_cm, body_mass_kg, test_arm,
//                  dumbbell_kg, ... all session inputs }
//   meta: { manualStop, liveCount, framingOverride, practiceCompleted,
//           testOutcome, effectiveFps, ... }
// Returns { summary, reps, frames (analysed), ok, error }.
// ---------------------------------------------------------------------------
export function analyze(opts) {
  const { frames, participant = {}, meta = {} } = opts;
  const C = CONFIG;
  const flags = new Set();

  try {
    if (!frames || frames.length < 10) {
      return fail('NOT_ENOUGH_MOVEMENT', 'Too few frames were captured to analyse.');
    }

    const fs = C.signal.resampleHz;
    const preRollMs = C.protocol.preRollS * 1000;
    const t0ms = frames[0].t;
    // GO reference: prefer the controller-supplied GO timestamp (meta.goRecMs,
    // the real "Go" moment) so the scored window matches what the operator saw.
    // Fall back to t0 + preRollS for standalone/test callers.
    const goMs = Number.isFinite(meta.goRecMs) ? meta.goRecMs : (t0ms + preRollMs);
    const goOffsetS = (goMs - t0ms) / 1000; // seconds of pre-roll actually present

    // ----- side selection -----
    const nearSide = detectNearSide(frames, goMs);
    const testArm = (participant.test_arm === 'left' || participant.test_arm === 'right')
      ? participant.test_arm : nearSide;
    if (nearSide !== testArm) flags.add('ARM_SIDE_MISMATCH');
    const S = sidePick(testArm);
    const otherSide = testArm === 'left' ? 'right' : 'left';
    const O = sidePick(otherSide);

    // ----- validity + raw signals in seconds -----
    const tsRaw = frames.map(f => (f.t - t0ms) / 1000); // seconds from capture start
    const minVis = C.signal.minVisibility;

    const chan = {}; // name -> { ts:[], val:[] }
    const need = ['sh', 'el', 'wr', 'hip'];
    const build = (coord, keyName) => {
      const ts = [], val = [], valid = [];
      for (let i = 0; i < frames.length; i++) {
        const lm = frames[i].lm[S[keyName]];
        const ok = lm && lm.v >= minVis && isFinite(lm.x) && isFinite(lm.y);
        ts.push(tsRaw[i]);
        val.push(ok ? lm[coord] : NaN);
        valid.push(ok);
      }
      return { ts, val, valid };
    };

    // Pixel coords per joint (x and y), bridging gaps via interpolation.
    const px = {};
    let totalValid = 0, totalFrames = 0, imputed = 0, longestGap = 0;
    for (const k of ['sh', 'el', 'wr', 'hip', 'kn', 'idx']) {
      const bx = build('x', k), by = build('y', k);
      const { x, gapInfo } = bridge(bx.val, tsRaw);
      const { x: y } = bridge(by.val, tsRaw);
      px[k] = { x, y, valid: bx.valid };
      if (k === 'el' || k === 'wr' || k === 'sh') {
        for (let i = 0; i < bx.valid.length; i++) { totalFrames++; if (bx.valid[i]) totalValid++; else imputed++; }
        longestGap = Math.max(longestGap, gapInfo.longestGapS);
      }
    }

    // ----- world coords for the 3-D cross-check (elbow) -----
    const worldAngle = [];
    for (const f of frames) {
      const sh = f.lm[S.sh], el = f.lm[S.el], wr = f.lm[S.wr];
      if (sh && el && wr && sh.wx != null) {
        const a = { x: sh.wx, y: sh.wy, z: sh.wz };
        const b = { x: el.wx, y: el.wy, z: el.wz };
        const c = { x: wr.wx, y: wr.wy, z: wr.wz };
        worldAngle.push(180 - angle3D(a, b, c));
      } else worldAngle.push(NaN);
    }

    // ----- resample everything to uniform 30 Hz -----
    const R = {};
    for (const k of ['sh', 'el', 'wr', 'hip', 'kn', 'idx']) {
      R[k] = {
        x: resampleSeries(tsRaw, px[k].x, fs).y,
        y: resampleSeries(tsRaw, px[k].y, fs).y
      };
    }
    const tUni = resampleSeries(tsRaw, px.sh.x, fs).t.map(t => t - goOffsetS); // seconds from GO

    // filter pixel coords
    for (const k of ['sh', 'el', 'wr', 'hip', 'kn', 'idx']) {
      R[k].x = butter2(R[k].x, fs, C.signal.cutoffHz);
      R[k].y = butter2(R[k].y, fs, C.signal.cutoffHz);
    }

    const N = tUni.length;

    // ----- scale (m/px) using Winter segment fractions -----
    const Hcm = Number(participant.height_cm) || 170;
    const Hm = Hcm / 100;
    const upperArmPx = [], chainPx = [];
    for (let i = 0; i < N; i++) {
      const ua = Math.hypot(R.sh.x[i] - R.el.x[i], R.sh.y[i] - R.el.y[i]);
      const fa = Math.hypot(R.el.x[i] - R.wr.x[i], R.el.y[i] - R.wr.y[i]);
      upperArmPx.push(ua);
      chainPx.push(ua + fa);
    }
    const medChain = median(chainPx);
    const scale = (0.186 * Hm + 0.146 * Hm) / (medChain || 1); // m per px
    const medUpperArm = median(upperArmPx) || 1;
    // scale drift check: first 2 s vs median
    const early = chainPx.slice(0, Math.min(N, Math.round(2 * fs)));
    const scaleDiffPct = Math.abs((median(early) - medChain) / (medChain || 1)) * 100;
    if (scaleDiffPct > C.qc.maxScaleDiffPct) flags.add('SCALE_INCONSISTENT');

    // ----- per-frame angles & signals -----
    // facing direction: +1 if shoulder is to the right of hip in image, else -1
    const facing = (median(R.sh.x) - median(R.hip.x)) >= 0 ? 1 : -1;

    const elbowFlex = new Array(N), shoulderAng = new Array(N), trunkIncl = new Array(N),
      forearmIncl = new Array(N), wristAngle = new Array(N), obliquity = new Array(N),
      elbow3d = resampleSeries(tsRaw, worldAngle, fs).y;

    for (let i = 0; i < N; i++) {
      const sh = { x: R.sh.x[i], y: R.sh.y[i] };
      const el = { x: R.el.x[i], y: R.el.y[i] };
      const wr = { x: R.wr.x[i], y: R.wr.y[i] };
      const hip = { x: R.hip.x[i], y: R.hip.y[i] };
      const idx = { x: R.idx.x[i], y: R.idx.y[i] };

      elbowFlex[i] = 180 - angleAt(sh, el, wr);
      shoulderAng[i] = angleAt(hip, sh, el); // trunk axis vs upper arm
      trunkIncl[i] = Math.atan2(facing * (sh.x - hip.x), (hip.y - sh.y)) * DEG;
      // forearm inclination vs vertical (y-down): angle of el->wr from vertical
      forearmIncl[i] = Math.atan2(Math.abs(wr.x - el.x), Math.abs(wr.y - el.y)) * DEG;
      wristAngle[i] = angleAt(el, wr, idx);
      // obliquity: horizontal shoulder-hip offset normalised by trunk length
      const trunkLen = Math.hypot(sh.x - hip.x, sh.y - hip.y) || 1;
      obliquity[i] = Math.abs((R.sh.x[i] - R.sh.x[i])) / trunkLen; // placeholder, refined below
    }

    // obliquity using L/R shoulder separation when both available
    const obliqMedian = computeObliquity(frames, S, O);
    if (obliqMedian > C.qc.maxObliquity) flags.add('OBLIQUE_VIEW');

    // smooth elbow flex a touch more for progress (already filtered)
    // ----- calibration (auto): e_bottom/e_top from troughs/peaks -----
    const { peaks, troughs } = findExtrema(elbowFlex);
    const eTop = troughs.length && peaks.length ? median(peaks.map(i => elbowFlex[i])) : Math.max(...elbowFlex);
    const eBottom = troughs.length ? median(troughs.map(i => elbowFlex[i])) : Math.min(...elbowFlex);
    const calibRom = eTop - eBottom;

    // pre-roll start posture (frames before GO)
    const preIdx = tUni.map((t, i) => (t < 0 ? i : -1)).filter(i => i >= 0);
    const startElbow = preIdx.length ? median(preIdx.map(i => elbowFlex[i])) : elbowFlex[0];
    if (startElbow > C.calibration.startMaxElbowFlexDeg) flags.add('NOT_AT_START_POSITION');

    // moved before GO?
    if (preIdx.length) {
      const preMax = Math.max(...preIdx.map(i => elbowFlex[i]));
      if (preMax - startElbow > C.qc.movedBeforeGoFlexDeg) flags.add('MOVED_BEFORE_GO');
    }

    if (calibRom < C.calibration.minRomDeg) flags.add('INSUFFICIENT_ROM');

    // ----- progress signal -----
    const progress = elbowFlex.map(e => clamp((e - eBottom) / (calibRom || 1), -0.2, 1.3));

    // ----- velocities -----
    const dt = 1 / fs;
    const elbowVel = derivative(elbowFlex, dt);
    const wristSpeed = new Array(N);
    for (let i = 0; i < N; i++) {
      if (i === 0) { wristSpeed[i] = 0; continue; }
      const dpx = Math.hypot(R.wr.x[i] - R.wr.x[i - 1], R.wr.y[i] - R.wr.y[i - 1]);
      wristSpeed[i] = dpx * scale / dt;
    }
    const startWristY = median(preIdx.length ? preIdx.map(i => R.wr.y[i]) : R.wr.y.slice(0, 5));
    const wristHeight = R.wr.y.map(y => (startWristY - y) * scale); // positive-up metres

    // ----- state machine over the TEST WINDOW (0..durationS) with tail -----
    const durationS = C.protocol.durationS;
    const windowEnd = durationS;
    const reps = detectReps({
      t: tUni, progress, elbowFlex, elbowVel, shoulderAng, trunkIncl,
      forearmIncl, wristAngle, wristSpeed, wristHeight, px: R, scale,
      eBottom, eTop, upperArmPx: medUpperArm, facing, windowEnd,
      halfwayProgress: C.protocol.halfwayProgress, cfg: C
    });

    // ----- count -----
    const dumbbell = Number(participant.dumbbell_kg) || 0;
    let curlNo = 0, halfRuleApplied = false, incomplete = 0;
    for (const r of reps) {
      // work-rate proxy
      r.load_work_rate_proxy_w = (dumbbell > 0 && r.curl_time_s > 0)
        ? dumbbell * 9.81 * Math.max(0, r.wrist_rise_m) / r.curl_time_s : 0;
      if (r.counted) { curlNo++; r.curl_number = curlNo; if (r.counted_by_half_rule) halfRuleApplied = true; }
      else { incomplete++; r.curl_number = ''; }
    }
    const curlsCount = curlNo;

    // ----- QC gates that depend on counts/fps -----
    const effFps = Number(meta.effectiveFps) || (frames.length / Math.max(0.001, (frames[frames.length - 1].t - t0ms) / 1000));
    if (effFps < C.qc.minEffectiveFps) flags.add('LOW_FPS');
    const validPct = 100 * totalValid / Math.max(1, totalFrames);
    if (validPct < C.qc.minValidFramePct) flags.add('LOW_VALID_FRAMES');
    const imputedPct = 100 * imputed / Math.max(1, totalFrames);
    if (imputedPct > C.qc.maxImputedPct || longestGap > C.qc.maxGapS) flags.add('TRACKING_GAPS');
    if (meta.manualStop) flags.add('MANUAL_STOP');
    if (meta.framingOverride) flags.add('FRAMING_OVERRIDE');
    if (curlsCount === 0) flags.add('NO_REPS_DETECTED');

    // form QC
    const swingReps = reps.filter(r => r.swing_flag).length;
    if (reps.length && swingReps / reps.length >= C.form.swingRepFrac) flags.add('UPPER_ARM_SWING');
    const trunkSwayRange = Math.max(...trunkIncl) - Math.min(...trunkIncl);
    if (trunkSwayRange > C.form.trunkSwayMaxDeg) flags.add('TRUNK_SWAY');

    // 2D vs 3D
    const diffs = [];
    for (let i = 0; i < N; i++) if (isFinite(elbow3d[i])) diffs.push(Math.abs(elbowFlex[i] - elbow3d[i]));
    const elbow2d3d = mean(diffs);
    if (isFinite(elbow2d3d) && elbow2d3d > C.qc.maxElbow2D3DDiffDeg) flags.add('ELBOW_2D_3D_DISAGREE');

    // participant plausibility
    const [hLo, hHi] = C.calibration.heightRangeCm;
    if (!(Hcm >= hLo && Hcm <= hHi)) flags.add('HEIGHT_IMPLAUSIBLE');

    // standard weight
    const sex = participant.sex;
    const stdW = sex === 'female' ? C.protocol.dumbbellKgStandard.female
      : sex === 'male' ? C.protocol.dumbbellKgStandard.male : null;
    const dumbbellStandard = stdW != null && Math.abs(dumbbell - stdW) <= 0.1;
    if (!dumbbellStandard) flags.add('NONSTANDARD_WEIGHT');

    // Insufficient ROM failure view (blocking + no reps)
    if (flags.has('INSUFFICIENT_ROM') && curlsCount === 0) {
      return fail('NOT_ENOUGH_MOVEMENT', 'The elbow did not move through enough range to measure curls.');
    }

    // ----- QC pass / valid_for_norm -----
    const blocking = C.qc.blocking;
    const raised = [...flags];
    const qcPass = !raised.some(f => blocking.includes(f));
    const fullDuration = !meta.manualStop && (meta.testOutcome !== 'cannot_do');
    const ageOk = participant.age_years >= 60 && participant.age_years <= 94;
    const sexOk = sex === 'male' || sex === 'female';
    const practiceOk = meta.practiceCompleted || meta.practiceWaived;
    const validForNorm = qcPass && fullDuration && ageOk && sexOk && dumbbellStandard && practiceOk
      && meta.testOutcome !== 'cannot_do';

    // ----- norm classification -----
    const norm = classifyNorm(curlsCount, participant.age_years, sex, validForNorm);

    // ----- summary metrics -----
    const counted = reps.filter(r => r.counted);
    const cyc = counted.map(r => r.cycle_time_s).filter(isFinite);
    const curlT = counted.map(r => r.curl_time_s).filter(isFinite);
    const lowerT = counted.map(r => r.lower_time_s).filter(isFinite);
    const roms = counted.map(r => r.elbow_rom_deg).filter(isFinite);
    const peakVelC = counted.map(r => r.elbow_flex_peak_vel_deg_s).filter(isFinite);
    const peakVelE = counted.map(r => r.elbow_ext_peak_vel_deg_s).filter(isFinite);

    const firstThird = (arr) => arr.slice(0, Math.floor(arr.length / 3));
    const lastThird = (arr) => arr.slice(arr.length - Math.floor(arr.length / 3));
    const changePct = (arr) => {
      if (arr.length < 6) return '';
      const a = mean(firstThird(arr)), b = mean(lastThird(arr));
      return a ? round(100 * (b - a) / a) : '';
    };

    const summary = {};
    const put = (k, v) => { summary[k] = (typeof v === 'number') ? round(v) : v; };

    // participant & session fields filled by caller; here analysis-derived:
    put('curls_count', curlsCount);
    put('live_count', meta.liveCount == null ? '' : meta.liveCount);
    put('count_difference', meta.liveCount == null ? '' : meta.liveCount - curlsCount);
    put('half_rule_applied', bool(halfRuleApplied));
    put('incomplete_attempts', incomplete);
    put('curls_first_half', counted.filter(r => r._anchor < durationS / 2).length);
    put('curls_second_half', counted.filter(r => r._anchor >= durationS / 2).length);
    put('norm_reference', C.norm.reference);
    put('norm_range_low', norm.low);
    put('norm_range_high', norm.high);
    put('norm_classification', norm.label);

    put('time_to_first_curl_s', counted.length ? counted[0].t_top_s : '');
    put('cycle_time_mean', mean(cyc));
    put('cycle_time_sd', sd(cyc));
    put('cycle_time_cv_pct', cyc.length > 1 ? 100 * sd(cyc) / mean(cyc) : '');
    put('cycle_time_min', cyc.length ? Math.min(...cyc) : '');
    put('cycle_time_max', cyc.length ? Math.max(...cyc) : '');
    put('cycle_time_slope_s_per_rep', cyc.length >= 4 ? olsSlope(cyc) : '');
    put('cycle_time_change_pct', changePct(cyc));
    put('curl_time_mean_s', mean(curlT));
    put('curl_time_sd_s', sd(curlT));
    put('lower_time_mean_s', mean(lowerT));
    put('lower_time_sd_s', sd(lowerT));
    put('tempo_ratio_mean', mean(counted.map(r => r.tempo_ratio).filter(isFinite)));
    put('top_dwell_mean_s', mean(counted.map(r => r.top_dwell_s).filter(isFinite)));
    put('bottom_dwell_mean_s', mean(counted.map(r => r.bottom_dwell_s).filter(isFinite)));

    put('elbow_flex_bottom_mean_deg', mean(counted.map(r => r.elbow_flex_onset_deg).filter(isFinite)));
    put('elbow_flex_top_mean_deg', mean(counted.map(r => r.elbow_flex_top_deg).filter(isFinite)));
    put('elbow_rom_mean_deg', mean(roms));
    put('elbow_rom_sd_deg', sd(roms));
    put('elbow_rom_change_pct', changePct(roms));

    put('elbow_flex_peak_vel_mean_deg_s', mean(peakVelC));
    put('elbow_flex_peak_vel_max_deg_s', peakVelC.length ? Math.max(...peakVelC) : '');
    put('elbow_ext_peak_vel_mean_deg_s', mean(peakVelE));
    put('wrist_peak_speed_mean_m_s', mean(counted.map(r => r.wrist_peak_speed_m_s).filter(isFinite)));
    put('wrist_rise_mean_m', mean(counted.map(r => r.wrist_rise_m).filter(isFinite)));
    put('peak_velocity_change_pct', changePct(peakVelC));
    put('load_work_rate_proxy_mean_w', mean(counted.map(r => r.load_work_rate_proxy_w).filter(isFinite)));

    put('upper_arm_swing_mean_deg', mean(reps.map(r => r.upper_arm_swing_deg).filter(isFinite)));
    put('upper_arm_swing_max_deg', reps.length ? Math.max(...reps.map(r => r.upper_arm_swing_deg)) : '');
    put('elbow_drift_mean_ul', mean(reps.map(r => r.elbow_drift_ul).filter(isFinite)));
    put('trunk_sway_range_deg', trunkSwayRange);
    put('trunk_incl_mean_deg', mean(trunkIncl));
    put('shoulder_shrug_mean_tl', mean(reps.map(r => r.shoulder_shrug_tl).filter(isFinite)));
    put('forearm_incl_top_mean_deg', mean(reps.map(r => r.forearm_incl_top_deg).filter(isFinite)));
    put('wrist_angle_range_mean_deg', mean(reps.map(r => r.wrist_angle_range_deg).filter(isFinite)));
    put('swing_reps', swingReps);

    put('dominant_side', nearSide);
    put('facing_direction', facing);
    put('scale_m_per_px', scale);
    put('scale_check_diff_pct', scaleDiffPct);
    put('calib_arm_chain_px', medChain);
    put('calib_elbow_flex_bottom_deg', eBottom);
    put('calib_elbow_flex_top_deg', eTop);
    put('calib_rom_deg', calibRom);
    put('calib_start_elbow_flex_deg', startElbow);

    put('effective_fs_hz', effFps);
    put('valid_frame_pct', validPct);
    put('imputed_sample_pct', imputedPct);
    put('longest_gap_s', longestGap);
    put('median_arm_visibility', medianVisibility(frames, S));
    put('view_obliquity_median', obliqMedian);
    put('elbow_2d_3d_diff_deg', isFinite(elbow2d3d) ? elbow2d3d : '');
    put('qc_flags', raised.join(';'));
    put('qc_pass', bool(qcPass));
    put('valid_for_norm', bool(validForNorm));

    put('filter_cutoff_hz', C.signal.cutoffHz);
    put('resample_hz', fs);
    put('planned_duration_s', durationS);

    // analysed frames (for charts + export)
    const framesOut = buildFrameRows(tUni, progress, elbowFlex, elbowVel, shoulderAng,
      trunkIncl, forearmIncl, wristAngle, wristHeight, wristSpeed, elbow3d, obliqMedian, R, reps);

    // drop internal-only numeric helpers before export
    for (const r of reps) delete r._anchor;

    return { ok: true, summary, reps, frames: framesOut, series: {
      t: tUni, progress, elbowFlex, shoulderAng, trunkIncl, elbowVel, eBottom, eTop
    } };
  } catch (e) {
    return fail('ANALYSIS_ERROR', (e && e.message) ? e.message : String(e));
  }

  function fail(code, message) { return { ok: false, error: { code, message } }; }
}

// ---------------------------------------------------------------------------
// Gap bridging: linear-interpolate NaNs; report longest gap in seconds.
// ---------------------------------------------------------------------------
function bridge(vals, ts) {
  const x = vals.slice();
  let longest = 0;
  let i = 0;
  // leading NaNs -> first valid
  while (i < x.length && Number.isNaN(x[i])) i++;
  if (i === x.length) return { x: x.map(() => 0), gapInfo: { longestGapS: Infinity } };
  for (let k = 0; k < i; k++) x[k] = x[i];
  // interior
  let last = i;
  for (let j = i + 1; j < x.length; j++) {
    if (Number.isNaN(x[j])) continue;
    if (j - last > 1) {
      const span = ts[j] - ts[last];
      longest = Math.max(longest, span);
      for (let k = last + 1; k < j; k++) {
        const f = (k - last) / (j - last);
        x[k] = x[last] + (x[j] - x[last]) * f;
      }
    }
    last = j;
  }
  for (let k = last + 1; k < x.length; k++) x[k] = x[last];
  return { x, gapInfo: { longestGapS: longest } };
}

function derivative(y, dt) {
  const n = y.length, d = new Array(n);
  for (let i = 0; i < n; i++) {
    if (i === 0) d[i] = (y[1] - y[0]) / dt;
    else if (i === n - 1) d[i] = (y[n - 1] - y[n - 2]) / dt;
    else d[i] = (y[i + 1] - y[i - 1]) / (2 * dt);
  }
  return d;
}

// local extrema indices of a smoothed signal
function findExtrema(y) {
  const peaks = [], troughs = [];
  for (let i = 1; i < y.length - 1; i++) {
    if (y[i] > y[i - 1] && y[i] >= y[i + 1]) peaks.push(i);
    if (y[i] < y[i - 1] && y[i] <= y[i + 1]) troughs.push(i);
  }
  // keep only prominent peaks (top 60% of amplitude)
  if (peaks.length > 2) {
    const vals = peaks.map(i => y[i]).sort((a, b) => a - b);
    const thr = vals[Math.floor(vals.length * 0.3)];
    return { peaks: peaks.filter(i => y[i] >= thr), troughs };
  }
  return { peaks, troughs };
}

function computeObliquity(frames, S, O) {
  const vals = [];
  for (const f of frames) {
    const sh = f.lm[S.sh], osh = f.lm[O.sh], hip = f.lm[S.hip];
    if (sh && osh && hip && sh.v >= 0.3 && osh.v >= 0.3) {
      const sep = Math.abs(sh.x - osh.x);
      const trunk = Math.hypot(sh.x - hip.x, sh.y - hip.y) || 1;
      vals.push(sep / trunk);
    }
  }
  return vals.length ? median(vals) : 0;
}

function medianVisibility(frames, S) {
  const v = [];
  for (const f of frames) {
    const sh = f.lm[S.sh], el = f.lm[S.el], wr = f.lm[S.wr];
    if (sh && el && wr) v.push((sh.v + el.v + wr.v) / 3);
  }
  return v.length ? median(v) : 0;
}

// ---------------------------------------------------------------------------
// Rep detection state machine with hysteresis (Part D.5).
// ---------------------------------------------------------------------------
function detectReps(d) {
  const { t, progress, elbowFlex, elbowVel, shoulderAng, trunkIncl, forearmIncl,
    wristAngle, wristSpeed, wristHeight, px, scale, eBottom, eTop, upperArmPx,
    windowEnd, halfwayProgress, cfg } = d;
  const C = cfg;
  const N = t.length;
  const reps = [];

  let state = 'idle'; // idle -> rising -> falling
  let seg = null;

  const crossUp = (i, thr) => progress[i - 1] < thr && progress[i] >= thr;
  const crossDown = (i, thr) => progress[i - 1] > thr && progress[i] <= thr;

  for (let i = 1; i < N; i++) {
    if (state === 'idle') {
      if (crossUp(i, C.events.stateHi)) {
        state = 'rising';
        seg = { startIdx: i, iOnset: findBack(progress, i, C.events.lowPct) };
      }
    } else if (state === 'rising') {
      if (crossDown(i, C.events.stateLo)) {
        seg.endIdx = i;
        finalizeSeg(seg, i);
        state = 'idle';
        seg = null;
      }
    }
  }
  // trailing open segment (tail window, half-way rule)
  if (seg) { seg.endIdx = N - 1; finalizeSeg(seg, N - 1); }

  function finalizeSeg(s, endIdx) {
    const a = s.iOnset, b = endIdx;
    // peak within segment
    let iTop = a, pk = -Infinity;
    for (let k = a; k <= b; k++) if (progress[k] > pk) { pk = progress[k]; iTop = k; }
    const peakProgress = pk;
    // events
    const iHalf = findForward(progress, a, iTop, 0.5);
    const iTop90 = findForward(progress, a, iTop, C.events.highPct);
    const iLowerStart = findForwardDown(progress, iTop, b, C.events.highPct);
    const iBottom = findForwardDown(progress, iLowerStart, b, C.events.lowPct);

    const tOnset = t[a];
    const haveHalf = iHalf >= 0;
    const tHalf = haveHalf ? t[iHalf] : NaN;          // blank if 50% never crossed
    const tTop = t[iTop90 >= 0 ? iTop90 : iTop];      // peak index always exists
    const tLowerStart = t[iLowerStart >= 0 ? iLowerStart : iTop];
    const tBottom = t[iBottom >= 0 ? iBottom : b];

    const eTopRep = Math.max(...elbowFlex.slice(a, b + 1));
    const eBottomRep = Math.min(elbowFlex[a], elbowFlex[iBottom >= 0 ? iBottom : b]);
    const rom = eTopRep - elbowFlex[a];

    // counted logic. Window reference is GO (t=0). A small negative tolerance
    // admits a rep whose 50% sits just before GO. If 50% was never crossed the
    // peak time is used as the window anchor instead.
    const windowAnchor = haveHalf ? tHalf : tTop;
    const inWindow = windowAnchor >= -0.001 && windowAnchor <= windowEnd;
    const fullRom = peakProgress >= C.events.fullCurlProgress && eTopRep >= C.calibration.minTopFlexDeg;
    const fullExt = eBottomRep <= eBottom + C.events.extensionToleranceDeg;
    const halfRule = tTop > windowEnd && peakProgress >= halfwayProgress;
    const counted = (inWindow && fullRom && fullExt) || halfRule;

    // velocities within phases
    const curlVel = elbowVel.slice(a, (iTop90 >= 0 ? iTop90 : iTop) + 1).filter(isFinite);
    const peakCurlVel = curlVel.length ? Math.max(...curlVel) : NaN;
    const iPeakVel = curlVel.length ? a + curlVel.indexOf(peakCurlVel) : a;
    const lowVel = elbowVel.slice(iLowerStart >= 0 ? iLowerStart : iTop, (iBottom >= 0 ? iBottom : b) + 1).filter(isFinite);
    const peakExtVel = lowVel.length ? Math.abs(Math.min(...lowVel)) : NaN;

    // wrist rise / speed
    const whSeg = wristHeight.slice(a, b + 1);
    const wristRise = Math.max(...whSeg) - Math.min(...whSeg);
    const wsSeg = wristSpeed.slice(a, b + 1).filter(isFinite);
    const wristPeakSpeed = wsSeg.length ? Math.max(...wsSeg) : NaN;

    // form
    const shSeg = shoulderAng.slice(a, b + 1).filter(isFinite);
    const swing = shSeg.length ? Math.max(...shSeg) - Math.min(...shSeg) : NaN;
    const trSeg = trunkIncl.slice(a, b + 1).filter(isFinite);
    const trunkSway = trSeg.length ? Math.max(...trSeg) - Math.min(...trSeg) : NaN;
    // elbow drift: elbow displacement relative to shoulder, in upper-arm lengths
    let driftPx = 0;
    const relx = [], rely = [];
    for (let k = a; k <= b; k++) { relx.push(px.el.x[k] - px.sh.x[k]); rely.push(px.el.y[k] - px.sh.y[k]); }
    driftPx = Math.hypot(Math.max(...relx) - Math.min(...relx), Math.max(...rely) - Math.min(...rely));
    const elbowDriftUl = driftPx / (upperArmPx || 1);
    // shoulder shrug: shoulder-y range / trunk length
    const shyRange = Math.max(...px.sh.y.slice(a, b + 1)) - Math.min(...px.sh.y.slice(a, b + 1));
    const trunkLen = Math.hypot(px.sh.x[a] - px.hip.x[a], px.sh.y[a] - px.hip.y[a]) || 1;
    const shrugTl = shyRange / trunkLen;
    const forearmInclTop = forearmIncl[iTop90 >= 0 ? iTop90 : iTop];
    const waSeg = wristAngle.slice(a, b + 1).filter(isFinite);
    const wristAngRange = waSeg.length ? Math.max(...waSeg) - Math.min(...waSeg) : NaN;

    const curlTime = tTop - tOnset;
    const lowerTime = tBottom - tLowerStart;
    const topDwell = tLowerStart - tTop;

    const rep = {
      rep_index: reps.length,
      curl_number: '',
      counted: bool(counted),
      counted_by_half_rule: bool(halfRule && counted),
      full_rom_flag: bool(fullRom),
      full_extension_flag: bool(fullExt),
      t_onset_s: round(tOnset), t_half_s: round(tHalf), t_top_s: round(tTop),
      t_lower_start_s: round(tLowerStart), t_bottom_s: round(tBottom),
      curl_time_s: round(curlTime), top_dwell_s: round(Math.max(0, topDwell)),
      lower_time_s: round(lowerTime), bottom_dwell_s: '',
      cycle_time_s: '', tempo_ratio: round(curlTime > 0 ? lowerTime / curlTime : NaN),
      elbow_flex_onset_deg: round(elbowFlex[a]), elbow_flex_top_deg: round(eTopRep),
      elbow_rom_deg: round(rom),
      elbow_flex_peak_vel_deg_s: round(peakCurlVel),
      time_to_peak_vel_s: round(t[iPeakVel] - tOnset),
      elbow_ext_peak_vel_deg_s: round(peakExtVel),
      wrist_rise_m: round(wristRise), wrist_peak_speed_m_s: round(wristPeakSpeed),
      load_work_rate_proxy_w: 0,
      peak_progress: round(peakProgress),
      upper_arm_swing_deg: round(swing), elbow_drift_ul: round(elbowDriftUl),
      trunk_sway_deg: round(trunkSway), shoulder_shrug_tl: round(shrugTl),
      forearm_incl_top_deg: round(forearmInclTop), wrist_angle_range_deg: round(wristAngRange),
      swing_flag: bool(isFinite(swing) && swing > C.form.swingThresholdDeg),
      tracking_gap_flag: bool(false),
      _tHalfNum: tHalf, _tTop: tTop
    };
    // numeric fields for post-processing: cycle times + a reliable time anchor
    // for the first/second-half split (half-time if available, else peak time).
    rep._onset = tOnset; rep._bottom = tBottom;
    rep._anchor = windowAnchor;
    reps.push(rep);
  }

  // cycle & bottom dwell: onset-to-next-onset
  for (let i = 0; i < reps.length; i++) {
    const r = reps[i];
    if (i < reps.length - 1) {
      r.cycle_time_s = round(reps[i + 1]._onset - r._onset);
      r.bottom_dwell_s = round(Math.max(0, reps[i + 1]._onset - r._bottom));
    } else {
      r.cycle_time_s = round(r._bottom - r._onset);
    }
    // expose numeric t_half for summary filters; keep _anchor (numeric) for the
    // half-split so a half-rule rep with blank t_half still buckets correctly.
    r.t_half_s = round(r._tHalfNum);
    delete r._tHalfNum; delete r._onset; delete r._bottom; delete r._tTop;
  }
  return reps;
}

function findBack(progress, i, thr) {
  for (let k = i; k > 0; k--) if (progress[k - 1] < thr && progress[k] >= thr) return k - 1;
  // fallback: earliest point below thr
  for (let k = i; k > 0; k--) if (progress[k] <= thr) return k;
  return 0;
}
function findForward(p, from, to, thr) {
  for (let k = Math.max(1, from); k <= to; k++) if (p[k - 1] < thr && p[k] >= thr) return k;
  return -1; // not found (callers must guard with >= 0)
}
function findForwardDown(p, from, to, thr) {
  for (let k = Math.max(1, from); k <= to; k++) if (p[k - 1] >= thr && p[k] < thr) return k;
  return -1;
}

function buildFrameRows(t, progress, elbowFlex, elbowVel, shoulderAng, trunkIncl,
  forearmIncl, wristAngle, wristHeight, wristSpeed, elbow3d, obliq, R, reps) {
  const rows = [];
  // phase assignment from reps
  const phaseAt = new Array(t.length).fill('BOTTOM');
  for (const r of reps) {
    // approximate: use event times to shade
  }
  for (let i = 0; i < t.length; i++) {
    let phase = 'BOTTOM';
    const p = progress[i];
    if (p >= 0.9) phase = 'TOP';
    else if (p >= 0.1 && (elbowVel[i] || 0) > 0) phase = 'CURL';
    else if (p >= 0.1 && (elbowVel[i] || 0) <= 0) phase = 'LOWER';
    rows.push({
      t_s: round(t[i]), phase, tracking_gap: bool(false),
      progress: round(progress[i]), elbow_flex_deg: round(elbowFlex[i]),
      elbow_vel_deg_s: round(elbowVel[i]), shoulder_angle_deg: round(shoulderAng[i]),
      trunk_incl_deg: round(trunkIncl[i]), forearm_incl_deg: round(forearmIncl[i]),
      wrist_angle_deg: round(wristAngle[i]), wrist_height_m: round(wristHeight[i]),
      wrist_speed_m_s: round(wristSpeed[i]), elbow_flex_3d_deg: round(elbow3d[i]),
      obliquity: round(obliq),
      sh_x: round(R.sh.x[i], 2), sh_y: round(R.sh.y[i], 2),
      el_x: round(R.el.x[i], 2), el_y: round(R.el.y[i], 2),
      wr_x: round(R.wr.x[i], 2), wr_y: round(R.wr.y[i], 2),
      hip_x: round(R.hip.x[i], 2), hip_y: round(R.hip.y[i], 2)
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Norm classification (Part D.8).
// ---------------------------------------------------------------------------
export function ageBand(age) {
  if (age < 60 || age > 94) return null;
  const bands = ['60-64', '65-69', '70-74', '75-79', '80-84', '85-89', '90-94'];
  const idx = Math.min(bands.length - 1, Math.floor((age - 60) / 5));
  return bands[idx];
}

export function classifyNorm(count, age, sex, validForNorm) {
  const C = CONFIG;
  if (!C.norm.enabled || !validForNorm) return { label: 'Not classified', low: '', high: '' };
  const band = ageBand(age);
  const table = sex === 'male' ? C.norm.men : sex === 'female' ? C.norm.women : null;
  if (!band || !table || !table[band]) return { label: 'Not classified', low: '', high: '' };
  const [low, high] = table[band];
  let label;
  if (count < low) label = 'Below average';
  else if (count > high) label = 'Above average';
  else label = 'Average';
  return { label, low, high };
}

function bool(b) { return b ? 'TRUE' : 'FALSE'; }

export const ACAnalysis = { analyze, classifyNorm, ageBand };
if (typeof globalThis !== 'undefined') globalThis.ACAnalysis = ACAnalysis;
export default ACAnalysis;

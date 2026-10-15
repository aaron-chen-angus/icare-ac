// AC//LAB — tests/run.js
// Plain Node test runner (no deps). Run:  node tests/run.js
// Covers Acceptance #13 (counting / flags) and #15 (norms).

import { analyze, classifyNorm, ageBand } from '../js/analysis.js';
import { CONFIG } from '../js/config.js';
import { SESSION_FIELDS, REP_FIELDS, FRAME_FIELDS } from '../js/schema.js';
import { framesFromFlexion, curlTrain } from './synth.js';

let pass = 0, fail = 0;
const results = [];
function ok(name, cond, extra = '') {
  if (cond) { pass++; results.push(`  PASS  ${name}`); }
  else { fail++; results.push(`  FAIL  ${name}${extra ? '  -> ' + extra : ''}`); }
}
function approx(a, b, tol) { return Math.abs(a - b) <= tol; }

const baseParticipant = {
  age_years: 70, sex: 'female', height_cm: 165, body_mass_kg: 65,
  test_arm: 'right', dumbbell_kg: 2.27
};
const baseMeta = { manualStop: false, liveCount: null, framingOverride: false,
  practiceCompleted: true, testOutcome: 'completed', effectiveFps: 30 };

function run(profileOpts, part = {}, meta = {}, synthOpts = {}) {
  const prof = curlTrain(profileOpts);
  const frames = framesFromFlexion(prof, { fps: 30, durationS: 30, preRollS: 1, tailS: 2, side: part.test_arm || 'right', ...synthOpts });
  return analyze({ frames, participant: { ...baseParticipant, ...part }, meta: { ...baseMeta, ...meta } });
}

// --- Exact counts at 10 / 20 / 30 reps ---
for (const r of [10, 20, 30]) {
  const res = run({ reps: r, topDeg: 150 });
  ok(`count == ${r} reps`, res.ok && res.summary.curls_count === r,
    res.ok ? `got ${res.summary.curls_count} (flags: ${res.summary.qc_flags})` : res.error && res.error.code);
}

// --- Varying pace (reps unevenly spaced) ---
{
  const res = run({ reps: 15, topDeg: 150, fatigue: 0.0 });
  ok('varying pace: 15 reps', res.ok && res.summary.curls_count === 15,
    res.ok ? `got ${res.summary.curls_count}` : res.error.code);
}

// --- Fatigue slowdown: later reps slower -> positive cycle-time slope ---
{
  const res = run({ reps: 12, topDeg: 150, fatigue: 0.8 });
  ok('fatigue: count 12', res.ok && res.summary.curls_count === 12,
    res.ok ? `got ${res.summary.curls_count}` : res.error.code);
  ok('fatigue: positive cycle-time slope', res.ok && res.summary.cycle_time_slope_s_per_rep > 0,
    res.ok ? `slope ${res.summary.cycle_time_slope_s_per_rep}` : '');
}

// --- Partial-ROM reps not counted ---
{
  const res = run({ reps: 8, topDeg: 150, partialReps: 3, partialTopDeg: 45 });
  ok('partial-ROM reps excluded (count 8)', res.ok && res.summary.curls_count === 8,
    res.ok ? `got ${res.summary.curls_count}, incomplete ${res.summary.incomplete_attempts}` : res.error.code);
  ok('partial-ROM: incomplete_attempts > 0', res.ok && res.summary.incomplete_attempts >= 1);
}

// --- Swing injection raises UPPER_ARM_SWING ---
{
  const res = run({ reps: 10, topDeg: 150 }, {}, {}, { swingDeg: 25 });
  ok('swing flag raised', res.ok && res.summary.qc_flags.includes('UPPER_ARM_SWING'),
    res.ok ? res.summary.qc_flags : res.error.code);
}

// --- Dropout gaps -> TRACKING_GAPS, still analyses ---
{
  const res = run({ reps: 10, topDeg: 150 }, {}, {}, { dropouts: [{ startS: 5, endS: 5.8 }] });
  ok('dropout gap flagged', res.ok && res.summary.qc_flags.includes('TRACKING_GAPS'),
    res.ok ? res.summary.qc_flags : res.error.code);
}

// --- Half-way rule: peak after 30 s counts ---
{
  const resNo = run({ reps: 10, topDeg: 150, halfAtEnd: false });
  const resHalf = run({ reps: 10, topDeg: 150, halfAtEnd: true });
  ok('half-way rule adds a rep', resHalf.ok && resNo.ok &&
    resHalf.summary.curls_count === resNo.summary.curls_count + 1 &&
    resHalf.summary.half_rule_applied === 'TRUE',
    resHalf.ok ? `no=${resNo.summary.curls_count} half=${resHalf.summary.curls_count} applied=${resHalf.summary.half_rule_applied}` : '');
}

// --- Noise +-3 px: count robust ---
{
  const res = run({ reps: 14, topDeg: 150 }, {}, {}, { noisePx: 3 });
  ok('noise +-3px: count 14', res.ok && approx(res.summary.curls_count, 14, 1),
    res.ok ? `got ${res.summary.curls_count}` : res.error.code);
}

// --- Insufficient ROM -> failure view ---
{
  const res = run({ reps: 10, topDeg: 35, bottomDeg: 10 });
  ok('insufficient ROM -> not ok', !res.ok && res.error.code === 'NOT_ENOUGH_MOVEMENT',
    res.ok ? `unexpected ok, count ${res.summary.curls_count}` : res.error.code);
}

// --- Left arm works too ---
{
  const res = run({ reps: 10, topDeg: 150 }, { test_arm: 'left' });
  ok('left arm count 10', res.ok && res.summary.curls_count === 10,
    res.ok ? `got ${res.summary.curls_count}` : res.error.code);
}

// --- Norm classification boundaries (Acceptance #15) ---
// Women 70-74 band = [12,17]. 11 below, 12 average, 17 average, 18 above.
function nclass(count, age, sex) { return classifyNorm(count, age, sex, true).label; }
ok('norm band lookup 70 -> 70-74', ageBand(70) === '70-74');
ok('norm women 70 count 11 -> Below', nclass(11, 70, 'female') === 'Below average');
ok('norm women 70 count 12 -> Average', nclass(12, 70, 'female') === 'Average');
ok('norm women 70 count 17 -> Average', nclass(17, 70, 'female') === 'Average');
ok('norm women 70 count 18 -> Above', nclass(18, 70, 'female') === 'Above average');
// Men 60-64 = [16,22]
ok('norm men 62 count 15 -> Below', nclass(15, 62, 'male') === 'Below average');
ok('norm men 62 count 23 -> Above', nclass(23, 62, 'male') === 'Above average');
// not classified when invalid or out of range
ok('norm not classified when invalid', classifyNorm(20, 70, 'female', false).label === 'Not classified');
ok('norm not classified age < 60', classifyNorm(20, 55, 'female', true).label === 'Not classified');
ok('norm not classified age > 94', classifyNorm(20, 99, 'female', true).label === 'Not classified');

// --- valid_for_norm false for nonstandard weight ---
{
  const res = run({ reps: 15, topDeg: 150 }, { dumbbell_kg: 5.0 });
  ok('nonstandard weight -> valid_for_norm FALSE', res.ok && res.summary.valid_for_norm === 'FALSE' &&
    res.summary.qc_flags.includes('NONSTANDARD_WEIGHT'),
    res.ok ? `${res.summary.valid_for_norm} ${res.summary.qc_flags}` : '');
  ok('nonstandard weight -> Not classified', res.ok && res.summary.norm_classification === 'Not classified');
}

// --- valid_for_norm true for standard case ---
{
  const res = run({ reps: 15, topDeg: 150 });
  ok('standard case valid_for_norm TRUE', res.ok && res.summary.valid_for_norm === 'TRUE',
    res.ok ? `${res.summary.valid_for_norm} flags=${res.summary.qc_flags}` : '');
}

// --- Schema completeness: every field has desc/calc/unit ---
{
  const allFields = [...SESSION_FIELDS, ...REP_FIELDS, ...FRAME_FIELDS];
  const bad = allFields.filter(f => !f.key || !f.desc || !f.calc || f.unit == null || !f.type || !f.group);
  ok('schema: every field has key/group/type/unit/desc/calc', bad.length === 0,
    bad.map(f => f.key).join(','));
  // uniqueness within each table
  const dup = (arr) => { const s = new Set(); const d = []; for (const f of arr) { if (s.has(f.key)) d.push(f.key); s.add(f.key); } return d; };
  ok('schema: session keys unique', dup(SESSION_FIELDS).length === 0, dup(SESSION_FIELDS).join(','));
  ok('schema: rep keys unique', dup(REP_FIELDS).length === 0, dup(REP_FIELDS).join(','));
  ok('schema: frame keys unique', dup(FRAME_FIELDS).length === 0, dup(FRAME_FIELDS).join(','));
}

// --- Rep rows carry required fields ---
{
  const res = run({ reps: 5, topDeg: 150 });
  const r0 = res.ok && res.reps[0];
  ok('rep row has event times', !!r0 && r0.t_onset_s !== undefined && r0.t_top_s !== undefined);
  ok('counted rep has curl_number', !!r0 && res.reps.filter(r => r.counted === 'TRUE')[0].curl_number === 1);
}

const report = ['AC//LAB analysis tests', '='.repeat(40), results.join('\n'),
  '='.repeat(40), `${pass} passed, ${fail} failed`].join('\n');

// Node: print and set exit code. Browser: expose the report + counts.
if (typeof process !== 'undefined' && process.exit) {
  console.log('\n' + report + '\n');
  process.exit(fail ? 1 : 0);
} else if (typeof globalThis !== 'undefined') {
  globalThis.__AC_TEST_REPORT__ = { report, pass, fail, results };
  if (typeof document !== 'undefined') {
    const pre = document.getElementById('out');
    if (pre) pre.textContent = report;
    document.title = `AC//LAB tests: ${pass} pass / ${fail} fail`;
  } else {
    console.log(report);
  }
}

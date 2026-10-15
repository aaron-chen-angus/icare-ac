// AC//LAB — tools/build-dictionary.js
// Generates DATA_DICTIONARY.md from schema.js + config.js.
// Run:  node tools/build-dictionary.js   (writes ../DATA_DICTIONARY.md)

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SESSION_FIELDS, REP_FIELDS, FRAME_FIELDS, MARKERS, RAW_CHANNELS, SCHEMA_VERSION } from '../js/schema.js';
import { CONFIG, FLAG_INFO } from '../js/config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function fieldTable(fields) {
  // group preserving first-seen order
  const groups = [];
  const map = new Map();
  for (const f of fields) { if (!map.has(f.group)) { map.set(f.group, []); groups.push(f.group); } map.get(f.group).push(f); }
  let out = '', n = 0;
  for (const g of groups) {
    out += `\n#### ${g}\n\n`;
    out += '| # | Column | Type | Unit | Description | Calculation |\n|---|---|---|---|---|---|\n';
    for (const f of map.get(g)) {
      n++;
      out += `| ${n} | \`${f.key}\` | ${f.type} | ${f.unit} | ${esc(f.desc)} | ${esc(f.calc)} |\n`;
    }
  }
  return out;
}
function esc(s) { return String(s).replace(/\|/g, '\\|'); }

function tune(obj, path = '') {
  // list config values; mark [TUNE] where the key is in a known tune set
  const tuneKeys = ['cutoffHz', 'maxGapS', 'preRollS', 'minRomDeg', 'minTopFlexDeg',
    'startMaxElbowFlexDeg', 'fullCurlProgress', 'extensionToleranceDeg', 'swingThresholdDeg',
    'swingRepFrac', 'trunkSwayMaxDeg', 'minEffectiveFps'];
  let out = '';
  for (const [k, v] of Object.entries(obj)) {
    const p = path ? path + '.' + k : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) out += tune(v, p);
    else {
      const mark = tuneKeys.includes(k) ? ' `[TUNE]`' : '';
      out += `| \`${p}\` | ${Array.isArray(v) ? JSON.stringify(v) : v}${mark} |\n`;
    }
  }
  return out;
}

const md = `# AC//LAB — Data Dictionary

*Generated from \`js/schema.js\` + \`js/config.js\` by \`tools/build-dictionary.js\`. Schema version ${SCHEMA_VERSION}.*

Research / screening instrument — **not a medical device**. Values marked \`[TUNE]\` are unvalidated engineering defaults.

## 1. Conventions
- **Time zero = GO.** Pre-roll samples have negative \`t_s\`.
- **Image coordinates:** x increases right, y increases down (pixels).
- **Vertical rises** (wrist height etc.) are reported positive-up, i.e. computed as \`(startY - y) * scale\`.
- **World landmarks** (\`_wx,_wy,_wz\`) are MediaPipe metric estimates used only for the 2-D/3-D elbow cross-check.
- **Sign conventions:** elbow flexion 0° = straight arm; trunk inclination + = forward lean; shoulder (upper-arm) angle measured between the trunk axis and the upper arm.
- **Booleans** are stored as \`TRUE\`/\`FALSE\`.
- **Scale** (m/px) from Winter (2009) segment fractions: upper arm 0.186 H, forearm 0.146 H.

## 2. Sessions (one row per attempt)
${fieldTable(SESSION_FIELDS)}

## 3. Reps (one row per detected attempt)
${fieldTable(REP_FIELDS)}

## 4. Frames (optional, uniform ${CONFIG.signal.resampleHz} Hz, filtered)
${fieldTable(FRAME_FIELDS)}

## 5. Raw frames (ZIP only)
\`t_ms\` plus ${MARKERS.length} markers × ${RAW_CHANNELS.length} channels (${RAW_CHANNELS.join(', ')}) = ${1 + MARKERS.length * RAW_CHANNELS.length} columns.

## 6. Tracked pose markers
| Key | MediaPipe idx | Role |
|---|---|---|
${MARKERS.map(m => `| \`${m.key}\` | ${m.idx} | ${esc(m.role)} |`).join('\n')}

## 7. Derived quantities
- **Elbow flexion** \`e(t) = 180° − ∠(shoulder, elbow, wrist)\`.
- **Shoulder (upper-arm) angle** \`s(t) = ∠(trunk axis, upper arm)\`.
- **Trunk inclination** \`tr(t) = atan2(d·(shoulder.x − hip.x), hip.y − shoulder.y)\`, d = facing sign.
- **Forearm inclination** = angle of elbow→wrist vs vertical.
- **Curl progress** \`p(t) = (e − e_bottom)/(e_top − e_bottom)\`, 0 = extended, 1 = full flexion.
- **Calibration:** \`e_bottom\` = median of troughs, \`e_top\` = median of peaks (auto, Option A). Needs ROM ≥ ${CONFIG.calibration.minRomDeg}°.
- **Rep events:** onset (${CONFIG.events.lowPct * 100}%), t50 (50%), top (${CONFIG.events.highPct * 100}%), lowering-start, bottom. State machine hysteresis stateHi=${CONFIG.events.stateHi}, stateLo=${CONFIG.events.stateLo}.
- **Counted curl:** t50 ∈ [0, ${CONFIG.protocol.durationS}] s AND peak p ≥ ${CONFIG.events.fullCurlProgress} AND e_top ≥ ${CONFIG.calibration.minTopFlexDeg}° AND return to within ${CONFIG.events.extensionToleranceDeg}° of e_bottom; OR half-way rule (peak after ${CONFIG.protocol.durationS} s with p ≥ ${CONFIG.protocol.halfwayProgress}).
- **Tempo ratio** = lowering time / curl time.
- **Elbow drift** = elbow displacement relative to shoulder, in upper-arm lengths.
- **Trunk sway** = range of \`tr(t)\`.
- **Load work-rate proxy** = \`weight_kg × 9.81 × wrist_rise(m) / curl_time(s)\` (W) — proxy only, not validated power.
- **Filter:** zero-lag 2nd-order Butterworth, forward+backward (filtfilt), effective cutoff ${CONFIG.signal.cutoffHz} Hz, design cutoff corrected by 1/0.802.

## 8. QC flags
| Flag | Blocking | Explanation |
|---|---|---|
${Object.keys(FLAG_INFO).map(f => `| \`${f}\` | ${CONFIG.qc.blocking.includes(f) ? 'yes' : 'no'} | ${esc(FLAG_INFO[f])} |`).join('\n')}

Blocking flags set \`valid_for_norm = FALSE\`.

## 9. Algorithm parameters (config.js)
| Key | Value |
|---|---|
${tune(CONFIG)}

## 10. Limitations
- 2-D sagittal estimates from a single side-on camera; no bilateral symmetry.
- Supination/palm rotation cannot be verified reliably in 2-D (exploratory proxy only; never gates a count).
- Thresholds marked \`[TUNE]\` are engineering defaults pending the validation plan.
- Norm values are from secondary reproductions of Jones & Rikli (2002) and carry a \`[VERIFY vs SFT Manual 2nd ed.]\` marker.

## 11. References
- Rikli & Jones (1999) *J Aging Phys Act* 7, 162–181.
- Jones & Rikli (2002) Measuring functional fitness of older adults, *J Active Aging*.
- Rikli & Jones (2013) *Senior Fitness Test Manual* 2nd ed., Human Kinetics.
- PhenX Toolkit protocol 150202 (Integrated Fitness – Older Adult).
- Winter (2009) *Biomechanics and Motor Control of Human Movement*.
- Bazarevsky et al. (2020) BlazePose. Needham et al. (2021) pose-estimation accuracy.
`;

writeFileSync(join(__dirname, '..', 'DATA_DICTIONARY.md'), md);
console.log('Wrote DATA_DICTIONARY.md (' + md.length + ' bytes)');

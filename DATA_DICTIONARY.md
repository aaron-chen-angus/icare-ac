# AC//LAB — Data Dictionary

*Generated from `js/schema.js` + `js/config.js` by `tools/build-dictionary.js`. Schema version 1.0.*
*This copy was authored by hand to mirror the generator output; re-run `node tools/build-dictionary.js` to regenerate after any schema change.*

Research / screening instrument — **not a medical device**. Values marked `[TUNE]` are unvalidated engineering defaults.

## 1. Conventions
- **Time zero = GO.** Pre-roll samples have negative `t_s`.
- **Image coordinates:** x increases right, y increases down (pixels).
- **Vertical rises** (wrist height etc.) are reported positive-up, i.e. computed as `(startY - y) * scale`.
- **World landmarks** (`_wx,_wy,_wz`) are MediaPipe metric estimates used only for the 2-D/3-D elbow cross-check.
- **Sign conventions:** elbow flexion 0° = straight arm; trunk inclination + = forward lean; shoulder (upper-arm) angle measured between the trunk axis and the upper arm.
- **Booleans** are stored as `TRUE`/`FALSE`.
- **Scale** (m/px) from Winter (2009) segment fractions: upper arm 0.186 H, forearm 0.146 H.

## 2. Sessions (one row per attempt)

Grouped as in `schema.js`: Session & participant · Device & model · Protocol · Primary outcome · Temporal · Range of motion · Velocity · Form / stability · Calibration · Quality control. Each field carries Type / Unit / Description / Calculation in `schema.js` (single source of truth). The complete, authoritative list of columns and their descriptions is the `SESSION_FIELDS` array in `js/schema.js`; running the generator renders it as a numbered table here.

Key primary-outcome fields:

| Column | Type | Unit | Description |
|---|---|---|---|
| `curls_count` | int | reps | Authoritative offline curl count (0–30 s window + half-way rule). |
| `live_count` | int | reps | Live causal count shown during the test. |
| `count_difference` | int | reps | `live_count − curls_count`. |
| `half_rule_applied` | bool | - | A half-way rep was counted at time-up. |
| `norm_classification` | enum | - | Below average / Average / Above average / Not classified. |
| `norm_range_low` / `norm_range_high` | int | reps | Average-band bounds for the age/sex group. |
| `qc_pass` | bool | - | No blocking QC flag raised. |
| `valid_for_norm` | bool | - | Eligible for norm classification. |

## 3. Reps (one row per detected attempt)

Authoritative list = `REP_FIELDS` in `js/schema.js`. Includes: identity (`session_id`, `rep_index`, `curl_number`), status (`counted`, `counted_by_half_rule`, `full_rom_flag`, `full_extension_flag`), event times (`t_onset_s`, `t_half_s`, `t_top_s`, `t_lower_start_s`, `t_bottom_s`), durations (`curl_time_s`, `top_dwell_s`, `lower_time_s`, `bottom_dwell_s`, `cycle_time_s`, `tempo_ratio`), kinematics (`elbow_flex_onset_deg`, `elbow_flex_top_deg`, `elbow_rom_deg`, `elbow_flex_peak_vel_deg_s`, `time_to_peak_vel_s`, `elbow_ext_peak_vel_deg_s`, `wrist_rise_m`, `wrist_peak_speed_m_s`, `load_work_rate_proxy_w`, `peak_progress`), form (`upper_arm_swing_deg`, `elbow_drift_ul`, `trunk_sway_deg`, `shoulder_shrug_tl`, `forearm_incl_top_deg`, `wrist_angle_range_deg`, `swing_flag`), tracking (`tracking_gap_flag`).

## 4. Frames (optional, uniform 30 Hz, filtered)

Authoritative list = `FRAME_FIELDS` in `js/schema.js`: `session_id`, `t_s`, `phase` (BOTTOM/CURL/TOP/LOWER), `tracking_gap`, `progress`, `elbow_flex_deg`, `elbow_vel_deg_s`, `shoulder_angle_deg`, `trunk_incl_deg`, `forearm_incl_deg`, `wrist_angle_deg`, `wrist_height_m`, `wrist_speed_m_s`, `elbow_flex_3d_deg`, `obliquity`, and filtered pixel coordinates `sh_x/sh_y/el_x/el_y/wr_x/wr_y/hip_x/hip_y`.

## 5. Raw frames (ZIP only)
`t_ms` plus 17 markers × 7 channels (x, y, z, v, wx, wy, wz) = **120 columns**.

## 6. Tracked pose markers
| Key | MediaPipe idx | Role |
|---|---|---|
| `nose` | 0 | Frame-fit; head-in-frame check |
| `l_sh` | 11 | Left shoulder: upper-arm origin, trunk top, scale |
| `r_sh` | 12 | Right shoulder: upper-arm origin, trunk top, scale |
| `l_el` | 13 | Left elbow: primary joint |
| `r_el` | 14 | Right elbow: primary joint |
| `l_wr` | 15 | Left wrist: forearm end, wrist path/speed |
| `r_wr` | 16 | Right wrist: forearm end, wrist path/speed |
| `l_pinky` | 17 | Left pinky: hand orientation |
| `r_pinky` | 18 | Right pinky: hand orientation |
| `l_idx` | 19 | Left index: hand orientation (supination proxy) |
| `r_idx` | 20 | Right index: hand orientation (supination proxy) |
| `l_thumb` | 21 | Left thumb: supination cue |
| `r_thumb` | 22 | Right thumb: supination cue |
| `l_hip` | 23 | Left hip: trunk axis, seated check |
| `r_hip` | 24 | Right hip: trunk axis, seated check |
| `l_kn` | 25 | Left knee: seated-posture check |
| `r_kn` | 26 | Right knee: seated-posture check |

## 7. Derived quantities
- **Elbow flexion** `e(t) = 180° − ∠(shoulder, elbow, wrist)`.
- **Shoulder (upper-arm) angle** `s(t) = ∠(trunk axis, upper arm)`.
- **Trunk inclination** `tr(t) = atan2(d·(shoulder.x − hip.x), hip.y − shoulder.y)`, d = facing sign.
- **Forearm inclination** = angle of elbow→wrist vs vertical.
- **Curl progress** `p(t) = (e − e_bottom)/(e_top − e_bottom)`, 0 = extended, 1 = full flexion.
- **Calibration:** `e_bottom` = median of troughs, `e_top` = median of peaks (auto, Option A). Needs ROM ≥ 60°.
- **Rep events:** onset (10%), t50 (50%), top (90%), lowering-start, bottom. State machine hysteresis stateHi=0.6, stateLo=0.4.
- **Counted curl:** t50 ∈ [0, 30] s AND peak p ≥ 0.85 AND e_top ≥ 90° AND return to within 20° of e_bottom; OR half-way rule (peak after 30 s with p ≥ 0.5).
- **Tempo ratio** = lowering time / curl time.
- **Elbow drift** = elbow displacement relative to shoulder, in upper-arm lengths.
- **Trunk sway** = range of `tr(t)`.
- **Load work-rate proxy** = `weight_kg × 9.81 × wrist_rise(m) / curl_time(s)` (W) — proxy only, not validated power.
- **Filter:** zero-lag 2nd-order Butterworth, forward+backward (filtfilt), effective cutoff 8 Hz, design cutoff corrected by 1/0.802.

## 8. QC flags
| Flag | Blocking | Explanation |
|---|---|---|
| `LOW_FPS` | yes | The camera/detector ran below 15 frames per second, so timing and velocity may be unreliable. |
| `LOW_VALID_FRAMES` | yes | The shoulder-elbow-wrist of the tested arm was clearly visible in fewer than 90% of frames. |
| `TRACKING_GAPS` | yes | Pose tracking dropped out for too long; too much of the signal had to be filled in. |
| `ARM_SIDE_MISMATCH` | yes | The arm that faced the camera does not match the dominant arm you selected. |
| `NOT_AT_START_POSITION` | yes | At the start the arm was not hanging straight down (elbow was already bent). |
| `MOVED_BEFORE_GO` | yes | The arm started curling before the GO signal. |
| `MANUAL_STOP` | yes | The test was stopped before the full 30 seconds elapsed. |
| `INSUFFICIENT_ROM` | yes | The elbow did not move through enough range to measure full curls. |
| `NO_REPS_DETECTED` | no | No complete curls were detected in the 30-second window. |
| `UPPER_ARM_SWING` | no | The upper arm swung during a notable share of reps instead of staying still. |
| `TRUNK_SWAY` | no | The trunk leaned or rocked more than expected during the test. |
| `OBLIQUE_VIEW` | no | The camera was not fully side-on to the body, which reduces 2-D accuracy. |
| `SCALE_INCONSISTENT` | no | The measured arm length drifted during the test. |
| `ELBOW_2D_3D_DISAGREE` | no | The 2-D and 3-D elbow-angle estimates disagree, suggesting an off-axis view. |
| `FRAMING_OVERRIDE` | no | The operator started the test while the framing checks were still failing. |
| `HEIGHT_IMPLAUSIBLE` | no | The entered height is outside the plausible 120-210 cm range. |
| `NONSTANDARD_WEIGHT` | no | The dumbbell weight differs from the standard SFT load (sets `valid_for_norm = FALSE`). |

Blocking flags set `valid_for_norm = FALSE`.

## 9. Algorithm parameters (config.js)
| Key | Value |
|---|---|
| `protocol.durationS` | 30 |
| `protocol.countdownS` | 3 |
| `protocol.preRollS` | 1 `[TUNE]` |
| `protocol.tailS` | 2 |
| `protocol.halfwayProgress` | 0.5 |
| `protocol.practiceReps` | 2 |
| `protocol.dumbbellKgStandard.female` | 2.27 |
| `protocol.dumbbellKgStandard.male` | 3.63 |
| `signal.resampleHz` | 30 |
| `signal.cutoffHz` | 8 `[TUNE]` |
| `signal.maxGapS` | 0.25 `[TUNE]` |
| `signal.minVisibility` | 0.5 |
| `signal.padSamples` | 30 |
| `calibration.minRomDeg` | 60 `[TUNE]` |
| `calibration.minTopFlexDeg` | 90 `[TUNE]` |
| `calibration.startMaxElbowFlexDeg` | 30 `[TUNE]` |
| `calibration.heightRangeCm` | [120,210] |
| `events.stateHi` | 0.6 |
| `events.stateLo` | 0.4 |
| `events.lowPct` | 0.1 |
| `events.highPct` | 0.9 |
| `events.fullCurlProgress` | 0.85 `[TUNE]` |
| `events.extensionToleranceDeg` | 20 `[TUNE]` |
| `form.swingThresholdDeg` | 20 `[TUNE]` |
| `form.swingRepFrac` | 0.3 `[TUNE]` |
| `form.trunkSwayMaxDeg` | 15 `[TUNE]` |
| `qc.minEffectiveFps` | 15 `[TUNE]` |
| `qc.minValidFramePct` | 90 |
| `qc.maxImputedPct` | 10 |
| `qc.maxGapS` | 0.5 |
| `qc.maxObliquity` | 0.2 |
| `qc.maxScaleDiffPct` | 10 |
| `qc.maxElbow2D3DDiffDeg` | 10 |
| `live.emaAlpha` | 0.4 |
| `live.curlAt` | 0.85 |
| `live.extendAt` | 0.25 |
| `norm.enabled` | true |

Norm "average" bands (middle 50%), `[VERIFY vs SFT Manual 2nd ed.]`:

| Age | Men [low, high] | Women [low, high] |
|---|---|---|
| 60-64 | [16, 22] | [13, 19] |
| 65-69 | [15, 21] | [12, 18] |
| 70-74 | [14, 21] | [12, 17] |
| 75-79 | [13, 19] | [11, 17] |
| 80-84 | [13, 19] | [10, 16] |
| 85-89 | [11, 17] | [10, 15] |
| 90-94 | [10, 14] | [8, 13] |

## 10. Limitations
- 2-D sagittal estimates from a single side-on camera; no bilateral symmetry.
- Supination/palm rotation cannot be verified reliably in 2-D (exploratory proxy only; never gates a count).
- Thresholds marked `[TUNE]` are engineering defaults pending the validation plan (Part H).
- Norm values are from secondary reproductions of Jones & Rikli (2002) and carry a `[VERIFY vs SFT Manual 2nd ed.]` marker.

## 11. References
- Rikli & Jones (1999) *J Aging Phys Act* 7, 162–181.
- Jones & Rikli (2002) Measuring functional fitness of older adults, *J Active Aging*.
- Rikli & Jones (2013) *Senior Fitness Test Manual* 2nd ed., Human Kinetics.
- PhenX Toolkit protocol 150202 (Integrated Fitness – Older Adult).
- Winter (2009) *Biomechanics and Motor Control of Human Movement*.
- Bazarevsky et al. (2020) BlazePose. Needham et al. (2021) pose-estimation accuracy.

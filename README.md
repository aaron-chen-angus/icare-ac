<div align="center">

# AC//LAB — TRON Arm Curl Biomechanics Lab

### A browser-based computer-vision implementation of the Senior Fitness Test 30-Second Arm Curl

**Scientific, Clinical & Technical Manual · Version 1.0**

[**▶ Launch the App**](https://aaron-chen-angus.github.io/icare-ac/) · [**📊 Live Data (Google Sheet)**](https://docs.google.com/spreadsheets/d/1Tso4o_l7TkhVtZKNvsgIVZV8IpNSe3Xpsa5h9yJBgMQ/) · [**📖 Data Dictionary**](DATA_DICTIONARY.md)

</div>

> [!IMPORTANT]
> **AC//LAB is a research and screening instrument — it is not a medical device.** It produces two-dimensional (2-D) sagittal estimates from a single camera. Many thresholds are unvalidated engineering defaults marked `[TUNE]`. Nothing here constitutes medical, diagnostic, or treatment advice. Use the published normative classifications as screening indicators only, and confirm all values against the primary sources before any research or clinical use.

---

## Table of contents

**Part I — Overview**
1. [What AC//LAB does](#1-what-aclab-does)
2. [Quick links](#2-quick-links)

**Part II — Scientific & Clinical Manual**
3. [The 30-Second Arm Curl Test: origin and purpose](#3-the-30-second-arm-curl-test-origin-and-purpose)
4. [Clinical and sports-medicine basis](#4-clinical-and-sports-medicine-basis)
5. [Standardised test protocol](#5-standardised-test-protocol)
6. [Published normative data](#6-published-normative-data)
7. [Biomechanical basis](#7-biomechanical-basis)
8. [Metrics captured and their scientific rationale](#8-metrics-captured-and-their-scientific-rationale)

**Part III — Technical Manual**
9. [System overview and architecture](#9-system-overview-and-architecture)
10. [Computer-vision pipeline](#10-computer-vision-pipeline)
11. [Signal processing and analysis engine](#11-signal-processing-and-analysis-engine)
12. [Repetition-counting algorithm](#12-repetition-counting-algorithm)
13. [Quality control](#13-quality-control)
14. [Data model, export and Google Sheets integration](#14-data-model-export-and-google-sheets-integration)
15. [Privacy, security and data governance](#15-privacy-security-and-data-governance)
16. [Responsive design and accessibility](#16-responsive-design-and-accessibility)

**Part IV — Operations**
17. [Installation and deployment](#17-installation-and-deployment)
18. [Operator guide](#18-operator-guide)
19. [Configuration and tuning](#19-configuration-and-tuning)
20. [Testing](#20-testing)
21. [Validation plan](#21-validation-plan)
22. [Limitations](#22-limitations)
23. [Project structure](#23-project-structure)
24. [Glossary](#24-glossary)
25. [References (APA)](#25-references-apa-7th-edition)

---
---

# Part I — Overview

## 1. What AC//LAB does

AC//LAB turns an ordinary phone or laptop camera into an instrumented assessment station for the **Senior Fitness Test (SFT) 30-Second Arm Curl** (Rikli & Jones, 1999, 2013). It:

- **Counts repetitions** of a seated biceps curl performed in a 30-second window, applying the official half-way rule at time-up.
- **Estimates upper-limb biomechanics** — elbow range of motion, angular velocity, movement tempo, fatigue trends, and form faults (upper-arm swing, trunk sway, elbow drift) — none of which the traditional stopwatch-and-tally method captures.
- **Overlays a live pose skeleton** so the operator can confirm framing and the participant gets real-time feedback.
- **Classifies** the result against published age- and sex-specific norms for community-dwelling adults aged 60–94.
- **Exports** a complete, analysis-ready dataset (CSV + ZIP) and optionally posts numeric results to a Google Sheet.

All computer vision runs **on-device in the browser**. The video stream never leaves the device; only numeric results may be uploaded, and only with explicit consent.

The application is a successor to a legacy mobile app that recorded a 30-second video, uploaded it to a server, and returned a single number (`counts`). AC//LAB replaces that server round-trip with a fully client-side analysis engine, and adds the biomechanical and quality-control layer that the legacy pipeline lacked.

## 2. Quick links

| Resource | Link |
|---|---|
| **Live application** | https://aaron-chen-angus.github.io/icare-ac/ |
| **Live results (Google Sheet)** | https://docs.google.com/spreadsheets/d/1Tso4o_l7TkhVtZKNvsgIVZV8IpNSe3Xpsa5h9yJBgMQ/ |
| **Data dictionary** | [`DATA_DICTIONARY.md`](DATA_DICTIONARY.md) |
| **Source repository** | `aaron-chen-angus/icare-ac` |

---
---

# Part II — Scientific & Clinical Manual

## 3. The 30-Second Arm Curl Test: origin and purpose

The 30-Second Arm Curl Test (also called the Biceps Curl Test) is one of six items in the **Senior Fitness Test** battery developed and validated by Roberta Rikli and C. Jessie Jones at California State University, Fullerton (Rikli & Jones, 1999). The SFT was designed to assess the physiological parameters that underpin functional mobility and independence in later life, using equipment and procedures feasible in community settings rather than a laboratory.

The arm curl item specifically measures **upper-body (biceps/elbow-flexor) muscular strength and endurance**. In the SFT framework, upper-body strength is the physical capacity that supports everyday tasks such as carrying groceries, lifting a grandchild, handling luggage, and performing household chores (Rikli & Jones, 1999, 2013). It complements the 30-Second Chair Stand (lower-body strength), the 2-Minute Step (aerobic endurance), the Chair Sit-and-Reach and Back Scratch (flexibility), and the 8-Foot Up-and-Go (agility/dynamic balance).

The test was normed on a national United States sample of **7,183 community-dwelling adults aged 60–94** (Rikli & Jones, 1999), and the practitioner-facing norms and procedures were later disseminated in Jones and Rikli (2002) and consolidated in the second edition of the *Senior Fitness Test Manual* (Rikli & Jones, 2013). The protocol is reproduced in freely usable public-health instruments such as the PhenX Toolkit's "Integrated Fitness – Older Adult" protocol.

## 4. Clinical and sports-medicine basis

**Why upper-limb strength matters.** Muscular strength declines with age as part of **sarcopenia** — the progressive, age-related loss of skeletal muscle mass and function. Sarcopenia is clinically important because reduced strength and physical function are consistently associated with increased risk of disability, falls, loss of independence, and all-cause mortality in community-dwelling older adults (Cruz-Jentoft et al., 2019; a 2026 systematic review and meta-analysis reported sarcopenia significantly associated with all-cause mortality and functional decline). Performance-based functional tests contribute independent prognostic information alongside measures of muscle mass (Harris-Love et al., 2018).

**Where the arm curl fits.** The SFT arm curl is a *performance-based* functional measure: rather than isolating peak force (as isokinetic dynamometry or one-repetition-maximum testing would), it captures the ability to repeatedly generate submaximal force against a standardised external load over a fixed interval. This "strength-endurance" quality maps closely onto real-world upper-limb tasks, which are rarely single maximal efforts. The test is quick, low-cost, requires minimal equipment, and has established feasibility in group and community screening settings.

**Sports-medicine and rehabilitation relevance.** Beyond geriatric screening, repetition-based elbow-flexion assessment is used in exercise physiology, rehabilitation progress tracking, and training monitoring. The *additional* kinematic variables AC//LAB captures — concentric vs. eccentric tempo, angular velocity, range-of-motion decline across a set, and movement-quality flags — align with constructs used in resistance-training science: **velocity-based training** monitors bar/limb velocity as a proxy for relative load and neuromuscular fatigue, and **repetition-to-repetition kinematic drift** is a recognised within-set fatigue signature. AC//LAB operationalises these for a bodyweight-plus-dumbbell field test, acknowledging that the 2-D single-camera estimates are coarser than laboratory motion capture or a linear position transducer.

> [!NOTE]
> AC//LAB reports *screening* classifications and research metrics. It does not diagnose sarcopenia, frailty, or any condition. Diagnosis requires a qualified clinician using validated criteria (e.g., EWGSOP2; Cruz-Jentoft et al., 2019), typically combining muscle-mass measurement with strength and performance testing.

## 5. Standardised test protocol

AC//LAB implements the official SFT protocol (Rikli & Jones, 1999, 2013; as reproduced in the PhenX Toolkit). Operators should follow it precisely for results to be comparable with published norms.

**Equipment**
- A straight-backed or folding chair **without arms**, placed against a wall for stability.
- A hand weight: **5 lb (2.27 kg) for women**, **8 lb (3.63 kg) for men** (Rikli & Jones, 1999).
- A 30-second timer (provided by the app).

**Starting position**
- The participant sits upright, back straight, feet flat on the floor, with the **dominant side of the body close to the edge of the chair seat**.
- The weight is held in the **dominant hand in a handshake grip**, arm fully extended and hanging beside the chair, **perpendicular to the floor**.

**Movement**
- On "go", the participant **curls the forearm up through a full range of motion while turning the palm upward (supination)**, then **lowers back to full extension**, returning to the handshake-grip position at the bottom.
- The **upper arm must remain still** throughout (in the manual protocol the examiner braces the mid-biceps with their fingers; AC//LAB substitutes a computer-vision upper-arm-swing check).
- **No swinging** of the trunk or upper arm is permitted.

**Administration**
- The examiner demonstrates, then the participant performs **1–2 practice repetitions** to confirm correct form.
- One **30-second scored trial** follows.

**Scoring**
- The score is the **number of full, controlled curls** completed in 30 seconds.
- **Half-way rule:** if the forearm is more than halfway up when time expires, that repetition counts.
- AC//LAB tests the **dominant arm only** (one arm per participant), consistent with the standard protocol.

**How AC//LAB substitutes for the examiner's hands.** In the manual test the examiner uses their fingers on the biceps (to detect a full curl and stop upper-arm movement) and a hand behind the elbow (to mark full extension and prevent back-swing). AC//LAB replaces these tactile cues with vision-based rules: a peak-flexion threshold (full curl), a return-to-extension criterion (full extension), and upper-arm-swing / elbow-drift / trunk-sway flags. **Forearm supination cannot be reliably measured in 2-D and is recorded only as an exploratory proxy; it never affects the count.**

## 6. Published normative data

AC//LAB classifies a participant's count against the Rikli & Jones normative ranges. In this framework, **"average" is the middle 50%** of the reference age/sex group (i.e., the interquartile range); a score **below** that range is *Below average* and **above** it is *Above average* (Jones & Rikli, 2002; Rikli & Jones, 2013).

**Arm curl "average" range (repetitions in 30 s), by age and sex**

| Age band | Men (reps) | Women (reps) |
|---|---|---|
| 60–64 | 16–22 | 13–19 |
| 65–69 | 15–21 | 12–18 |
| 70–74 | 14–21 | 12–17 |
| 75–79 | 13–19 | 11–17 |
| 80–84 | 13–19 | 10–16 |
| 85–89 | 11–17 | 10–15 |
| 90–94 | 10–14 | 8–13 |

*Source: Rikli & Jones (1999); practitioner tables in Jones & Rikli (2002) and Rikli & Jones (2013).*

> [!WARNING]
> **Verification required.** The values in this table and in `js/config.js` were transcribed from widely-circulated secondary reproductions of Jones & Rikli (2002). They are marked `[VERIFY vs SFT Manual 2nd ed.]` in the code. **Confirm them against your own copy of the *Senior Fitness Test Manual*, 2nd edition, before using the classification for research or reporting.**

**Classification eligibility.** A result is classified only when it is *valid for norms*: the quality-control check passed (no blocking flag), the full 30 seconds were completed, the participant is aged **60–94**, sex is recorded as male or female, the **dominant arm** was tested with the **standard dumbbell weight** for that sex, and a practice trial was completed (or explicitly waived by the operator). Participants outside the 60–94 range (for example, students or younger adults) receive the raw count and all biomechanical metrics but **no normative classification**, because no validated norms exist for them in this battery.

## 7. Biomechanical basis

The arm curl is, mechanically, a **single-degree-of-freedom rotation of the forearm about the elbow (humeroulnar) joint**, driven primarily by the elbow flexors (biceps brachii, brachialis, brachioradialis), with the upper arm held static against gravity by the shoulder stabilisers. AC//LAB models this in the **sagittal plane** from a side-on camera.

**Coordinate conventions.** Image coordinates follow the screen convention (x increases to the right, y increases downward). Vertical "rises" (e.g., wrist height) are reported *positive-up* by inverting y. All timing is referenced to **"Go" (t = 0)**.

**Primary joint-angle definitions**

| Quantity | Definition | Zero reference |
|---|---|---|
| **Elbow flexion** `e(t)` | `180° − ∠(shoulder, elbow, wrist)` | 0° = fully straight arm |
| **Shoulder (upper-arm) angle** `s(t)` | Angle between the trunk axis (shoulder→hip) and the upper arm (shoulder→elbow) | arm hanging along the trunk |
| **Trunk inclination** `tr(t)` | `atan2(d·(shoulder.x − hip.x), hip.y − shoulder.y)`, d = facing direction | vertical; positive = forward lean |
| **Forearm inclination** `f(t)` | Angle of the forearm (elbow→wrist) relative to vertical | hanging vertically |

**Anthropometric scaling.** To express wrist displacement and velocity in metres rather than pixels, AC//LAB converts pixels to metres using **segment-length fractions of stature** from Winter (2009): upper-arm length ≈ 0.186 × height, forearm length ≈ 0.146 × height. The scale factor is:

```
scale (m/px) = (0.186·H + 0.146·H) / median pixel length(shoulder→elbow + elbow→wrist)
```

This is posture-invariant and assumes a side-on view. The engine records a `scale_check_diff_pct` that compares the arm-chain length over the trial against the first two seconds; large drift (the participant moving toward or away from the camera) raises a quality flag.

**Curl progress (self-calibrating).** Because elbow-flexion range varies between people and the absolute metre scale is irrelevant for counting, the engine computes a **normalised progress** signal:

```
p(t) = (e(t) − e_bottom) / (e_top − e_bottom)      0 = extended, 1 = full flexion
```

`e_bottom` and `e_top` are derived automatically from the medians of the per-trial troughs and peaks (no separate calibration step). A plausibility floor requires the calibrated range to exceed a minimum and the top flexion to reach ≥ 90° for a movement to qualify as a "full" curl, preventing small wobbles from being scored.

**Why these biomechanical choices.** The 2-D sagittal model is appropriate because the arm curl is predominantly a planar flexion/extension task and a side-on camera captures the elbow angle with minimal out-of-plane error when the participant is correctly oriented. A world-landmark 3-D cross-check is computed as a quality indicator (`elbow_2d_3d_diff_deg`); large disagreement flags an off-axis view. True three-dimensional kinematics, forearm supination/pronation, and bilateral symmetry are **not** recoverable from a single 2-D side view and are documented as limitations (§22).

## 8. Metrics captured and their scientific rationale

AC//LAB records far more than the single count. Each metric maps to a construct in exercise science or clinical assessment. The full, authoritative field list — with type, unit, description and calculation for every column — is in the [**Data Dictionary**](DATA_DICTIONARY.md).

### 8.1 Primary outcome
| Metric | Rationale |
|---|---|
| `curls_count` | The authoritative offline count; the SFT outcome used for norm classification. |
| `live_count`, `count_difference` | The real-time (causal) count shown during the test and its difference from the offline count — a transparency check on the live feedback. |
| `half_rule_applied` | Whether a half-way repetition was counted at time-up, per protocol. |
| `curls_first_half`, `curls_second_half` | Split of the count across the two 15-second halves — a simple within-test pacing/fatigue descriptor. |

### 8.2 Temporal and fatigue metrics
Repetition timing is a sensitive marker of **neuromuscular fatigue**. As fatigue accumulates, repetitions typically slow and become more variable.
| Metric | Rationale |
|---|---|
| `cycle_time_{mean,sd,cv_pct,min,max}` | Central tendency and variability of full-cycle duration; the coefficient of variation indexes rhythm consistency. |
| `cycle_time_slope_s_per_rep` | Ordinary-least-squares trend across reps — a positive slope indicates progressive slowing (fatigue). |
| `cycle_time_change_pct` | First-third vs. last-third change — a robust fatigue descriptor less sensitive to single outliers. |
| `curl_time_mean_s`, `lower_time_mean_s`, `tempo_ratio_mean` | Concentric (lifting) vs. eccentric (lowering) durations and their ratio; movement tempo is a core resistance-training descriptor. |
| `top_dwell_mean_s`, `bottom_dwell_mean_s` | Pauses at the top and bottom — pacing strategy and control. |
| `time_to_first_curl_s` | Reaction/initiation latency after "Go". |

### 8.3 Range of motion
Full ROM is a protocol requirement; ROM decline across a set is a fatigue and movement-quality signal.
| Metric | Rationale |
|---|---|
| `elbow_flex_bottom_mean_deg`, `elbow_flex_top_mean_deg` | Mean start and peak elbow flexion — confirms full extension and full flexion. |
| `elbow_rom_mean_deg`, `elbow_rom_sd_deg` | Mean and variability of per-rep ROM. |
| `elbow_rom_change_pct` | ROM decline first-third → last-third — "range creep" under fatigue. |

### 8.4 Velocity and power proxy
Movement velocity reflects neuromuscular capacity and, under a fixed load, relative effort (the basis of velocity-based training).
| Metric | Rationale |
|---|---|
| `elbow_flex_peak_vel_{mean,max}_deg_s` | Concentric peak angular velocity — explosive strength indicator. |
| `elbow_ext_peak_vel_mean_deg_s` | Eccentric peak angular velocity — lowering control. |
| `wrist_peak_speed_mean_m_s`, `wrist_rise_mean_m` | Linear wrist kinematics (scaled to metres). |
| `peak_velocity_change_pct` | Velocity decline across the set — a recognised fatigue signature. |
| `load_work_rate_proxy_mean_w` | `weight × 9.81 × wrist_rise / curl_time` — a **proxy** for mechanical work-rate. **Not validated mechanical power**; reported for exploratory comparison only. |

### 8.5 Form and movement quality (the value AC//LAB adds)
These capture *how* the curl was performed — the examiner-cue substitutes that the legacy app could not record.
| Metric | Rationale |
|---|---|
| `upper_arm_swing_{mean,max}_deg`, `swing_reps` | Range of the upper-arm angle per rep; swinging recruits momentum and shoulder movement, violating protocol. |
| `elbow_drift_mean_ul` | Elbow displacement relative to the shoulder (in upper-arm lengths) — detects the elbow travelling forward/back. |
| `trunk_sway_range_deg`, `trunk_incl_mean_deg` | Trunk rocking used to assist the lift (compensation). |
| `shoulder_shrug_mean_tl` | Shoulder elevation relative to the hip (in trunk lengths) — accessory compensation. |
| `forearm_incl_top_mean_deg`, `wrist_angle_range_mean_deg` | Forearm/wrist orientation descriptors (exploratory). |

### 8.6 Calibration and quality
Transparency metrics describing how the signal was calibrated and how trustworthy it is: `scale_m_per_px`, `calib_*` (auto-calibrated bottom/top/ROM), `effective_fs_hz`, `valid_frame_pct`, `imputed_sample_pct`, `view_obliquity_median`, `elbow_2d_3d_diff_deg`, and the full `qc_flags` string (see §13).

### 8.7 Not available
**Bilateral symmetry** cannot be computed from a single side-on view (only one arm is in-plane). A future frontal-view mode could add this. **Supination/pronation** is exploratory only.

---
---

# Part III — Technical Manual

## 9. System overview and architecture

AC//LAB is a **dependency-free, build-free static web application**. It is authored in vanilla HTML, CSS and JavaScript (ES modules) and served as static files from GitHub Pages. There is no server, no bundler, and no backend database; the only network calls at runtime are (a) loading the pose model from a CDN on first use, (b) the YouTube instruction embed, and (c) optional result uploads to a Google Apps Script endpoint.

```
┌──────────────────────────────────────────────────────────────────────┐
│                           Browser (on-device)                          │
│                                                                        │
│  Camera ──▶ pose-engine.js ──▶ per-frame landmarks ──▶ live.js (live)  │
│   (getUserMedia)   │                     │                             │
│                    │ overlay canvas      └──▶ ring buffer (pre-roll)   │
│                    ▼                                   │               │
│               skeleton draw                            ▼               │
│                                            analysis.js (offline, pure) │
│                                                        │               │
│                             ┌──────────────────────────┼─────────────┐ │
│                             ▼                           ▼             │ │
│                        charts.js                   schema.js         │ │
│                     (canvas charts)         (field definitions)      │ │
│                             │                           │             │ │
│                             ▼                           ▼             │ │
│                          app.js  ◀── config.js    export.js          │ │
│                   (screen-flow controller)       (CSV / ZIP / Sheets)│ │
│                                                        │             │ │
└────────────────────────────────────────────────────────┼─────────────┘ │
                                                           ▼               │
                                      Google Apps Script  ──▶  Google Sheet│
                                      (apps-script/Code.gs)                 │
└──────────────────────────────────────────────────────────────────────┘
```

**Module responsibilities**

| Module | Responsibility |
|---|---|
| `js/app.js` | Screen-flow controller and the only broad DOM owner. Orchestrates the entry form, framing, countdown, test loop, results, history, attempt handling and upload. |
| `js/pose-engine.js` | Camera acquisition, MediaPipe inference, overlay rendering, framing-readiness logic. Emits per-frame landmark records. |
| `js/live.js` | Causal (real-time) rep counter for on-screen feedback only. |
| `js/analysis.js` | The authoritative offline biomechanics engine. **Pure functions, no DOM** — unit-testable in Node. |
| `js/schema.js` | Single source of truth for every exported field (`key, group, type, unit, desc, calc`). |
| `js/config.js` | All tunable parameters (`[TUNE]`), norms, flag explanations, and the Sheets webhook URL. |
| `js/charts.js` | Dependency-free canvas line charts that redraw on layout changes. |
| `js/export.js` | CSV, dependency-free ZIP (STORE + CRC32), Sheets POST, local outbox and history. |
| `js/i18n.js` | Language metadata for the trilingual instruction video. |
| `apps-script/Code.gs` | Google Sheets receiver (append, de-duplicate, finalise). |
| `tools/build-dictionary.js` | Regenerates `DATA_DICTIONARY.md` from `schema.js` + `config.js`. |
| `tests/` | Synthetic-motion generator and unit tests for the analysis engine. |

**Design principles**
- **Separation of concerns:** the analysis engine is environment-agnostic and never touches the DOM, so it can be tested headlessly and reused.
- **Single source of truth:** every exported column is declared once in `schema.js`; the export, the dictionary and a completeness test all read from it.
- **Causal vs. authoritative counting:** the live counter is deliberately simple and may differ slightly from the offline engine; the offline count is authoritative and both are stored with their difference.
- **Fail-soft:** camera, model, upload and analysis failures each surface a specific, recoverable UI state rather than crashing.

## 10. Computer-vision pipeline

**Pose model.** AC//LAB uses the **MediaPipe Pose Landmarker** task running the **BlazePose GHUM** model (Bazarevsky et al., 2020; Grishchenko et al., 2022). BlazePose is a lightweight convolutional architecture that produces 33 body keypoints in real time on mobile hardware and is explicitly designed for fitness-tracking use cases. The task runs in `VIDEO` mode for a single pose with detection/presence/tracking confidence thresholds of 0.5. The model is loaded via dynamic import of the `@mediapipe/tasks-vision` bundle from a CDN; the GPU delegate is attempted first with automatic fallback to CPU.

**Model variants.** Lite / Full / Heavy are selectable; the default is **Full**, balancing accuracy and throughput. Lite is recommended on low-end phones to maintain ≥ 15 fps.

**Landmarks recorded.** Of the 33 landmarks, AC//LAB stores **17** relevant to the arm curl (nose; left/right shoulder, elbow, wrist, pinky, index, thumb, hip, knee), each with image coordinates (x, y, z), visibility, and MediaPipe world coordinates (wx, wy, wz) — 7 channels × 17 markers = 119 columns plus a timestamp.

**Camera and overlay alignment.** The camera is requested in a portrait-oriented stream (ideal 720 × 1280). The overlay `<canvas>` is given the **same intrinsic size as the video** (`canvas.width = video.videoWidth`) and identical CSS `object-fit: cover`, so normalised landmarks map directly onto pixel coordinates at any screen aspect ratio — avoiding the common bug of hand-mapping normalised coordinates onto a differently-cropped box. For the front camera, the video and overlay are mirrored for display (`scaleX(-1)`) and the drawing flips x only; **stored data is never mirrored.**

**Frame loop.** Detection is driven by `requestVideoFrameCallback` where available (falling back to `requestAnimationFrame`), with strictly increasing timestamps required by VIDEO mode, an exponential-moving-average FPS estimate, and try/catch isolation so a single detection error does not stop the loop.

**Pre-roll ring buffer.** During the framing and countdown phases a rolling 2.5-second buffer of frames is retained so that the recording includes a short seated baseline before "Go". This supports the start-posture and premature-movement quality checks and the half-way rule at the tail.

## 11. Signal processing and analysis engine

The offline engine (`analysis.js`) transforms raw per-frame landmarks into clean kinematic signals and then into metrics. The chain mirrors standard biomechanical practice (Winter, 2009):

1. **Validity gating.** A landmark is valid when its visibility ≥ 0.5 and it lies within the frame. Invalid samples become missing.
2. **Gap bridging.** Missing samples are linearly interpolated. The longest contiguous gap is recorded; gaps beyond threshold raise a quality flag.
3. **Uniform resampling.** Signals are resampled to a uniform **30 Hz** using linear interpolation on the frame timestamps, so downstream filtering and differentiation are well-defined despite variable camera frame rates.
4. **Zero-lag low-pass filtering.** A **2nd-order Butterworth filter applied forward and backward (filtfilt)** removes jitter without introducing phase lag. The design cutoff is corrected by the standard 1/0.802 factor for the dual pass (Winter, 2009); the effective cutoff is 8 Hz (curl harmonics lie well below ~5 Hz). Signals are reflect-padded to suppress edge transients.
5. **Anthropometric scaling.** Pixels are converted to metres using the Winter segment fractions (§7).
6. **Angle computation.** Elbow flexion, shoulder angle, trunk inclination and forearm inclination are computed per frame, plus a 3-D elbow angle from world landmarks for cross-checking.
7. **Progress and events.** The normalised progress signal drives the rep state machine (§12).
8. **Metrics, QC and norms.** Per-rep and summary metrics are computed, quality flags evaluated, and the normative classification applied.

The engine returns a schema-keyed `summary` object, a `reps` array, an analysed `frames` array (for charts and export), and the raw time-series used to draw the result charts — or, on failure, a structured error (`NOT_ENOUGH_MOVEMENT` or `ANALYSIS_ERROR`) that the UI renders as a recoverable failure screen.

**GO-time anchoring.** The controller passes the true "Go" timestamp into the engine so that the scored 0–30 s window is aligned exactly with what the operator and participant experienced, independent of how much pre-roll the ring buffer happened to hold.

## 12. Repetition-counting algorithm

Counting uses a **finite-state machine with hysteresis** over the normalised progress signal `p(t)`:

- An attempt **begins** when `p` rises through `stateHi = 0.6` and **ends** when it falls through `stateLo = 0.4`. The two thresholds prevent noise near a single boundary from producing phantom reps.
- Within each attempt the engine locates the **events**: onset (10%), 50% crossing, top-reached (90%), lowering-start, and bottom-reached, dividing the cycle into **CURL → TOP → LOWER → BOTTOM** phases.

A repetition is **counted** when:

```
(its 50% crossing falls within the 0–30 s window)
   AND peak progress ≥ 0.85
   AND peak elbow flexion ≥ 90°
   AND it returns to within 20° of the calibrated bottom (full extension)
OR
(the half-way rule: the peak occurs after 30 s with progress ≥ 0.5)
```

Attempts that fail the full-range criteria are logged as `incomplete_attempts` rather than discarded, so partial reps are visible in the data. Only reps inside the test window (Go → Go + 30 s), plus the half-way exception, contribute to `curls_count`.

**Live counter.** `live.js` runs a simpler causal version: an EMA-smoothed progress estimate (using a running min/max of elbow flexion as a reference before calibration is known) feeding a top/bottom state machine. It exists purely for on-screen feedback; the offline count is authoritative.

## 13. Quality control

Every attempt is scored against a battery of quality checks. **Blocking** flags set `valid_for_norm = FALSE` (the result is still reported, but not classified against norms). **Non-blocking** flags are advisory. Each flag carries a plain-language explanation shown on the Results screen.

| Flag | Blocking | Trigger (defaults `[TUNE]`) |
|---|---|---|
| `LOW_FPS` | yes | Detector throughput < 15 fps |
| `LOW_VALID_FRAMES` | yes | < 90% of frames have a valid shoulder–elbow–wrist |
| `TRACKING_GAPS` | yes | Imputed samples > 10% or any gap > 0.5 s |
| `ARM_SIDE_MISMATCH` | yes | Auto-detected near side ≠ selected dominant arm |
| `NOT_AT_START_POSITION` | yes | Median pre-roll elbow flexion > 30° (arm not hanging) |
| `MOVED_BEFORE_GO` | yes | Elbow flexed > 20° before "Go" |
| `MANUAL_STOP` | yes | Operator stopped before 30 s |
| `INSUFFICIENT_ROM` | yes | Calibrated ROM < 60° |
| `NO_REPS_DETECTED` | no | Zero counted curls |
| `UPPER_ARM_SWING` | no | Shoulder-angle range > 20° in ≥ 30% of reps |
| `TRUNK_SWAY` | no | Trunk inclination range > 15° |
| `OBLIQUE_VIEW` | no | View obliquity > 0.2 |
| `SCALE_INCONSISTENT` | no | Arm-chain length drift > 10% |
| `ELBOW_2D_3D_DISAGREE` | no | Mean 2-D vs 3-D elbow difference > 10° |
| `FRAMING_OVERRIDE` | no | Operator started with failing framing checks |
| `HEIGHT_IMPLAUSIBLE` | no | Height outside 120–210 cm |
| `NONSTANDARD_WEIGHT` | no (but blocks norms) | Dumbbell ≠ standard load for sex (±0.1 kg) |

## 14. Data model, export and Google Sheets integration

**Three tables.** Results are organised as **Sessions** (one row per attempt), **Reps** (one row per detected attempt), and optional **Frames** (uniform 30 Hz analysed samples). A **Raw** table (17 markers × 7 channels = 120 columns) is included in the ZIP export only. Every column is defined in [`DATA_DICTIONARY.md`](DATA_DICTIONARY.md).

**Attempt handling.** Every attempt is stored as its own row sharing a `visit_id`. The attempt the participant confirms is marked `final_attempt = TRUE` with `selected_attempt = current|previous`; the others are `FALSE`. No data is lost; analysts simply filter on `final_attempt`. Because confirmation happens *after* upload, each attempt first uploads with `final_attempt = FALSE`, and a small **finalise** message later sets the flag on the chosen row.

**ZIP export.** A dependency-free, STORE-method ZIP with CRC32 checksums contains `*_summary.csv`, `*_reps.csv`, `*_frames_analysis.csv`, `*_frames_raw.csv`, and `*_session.json` (including a configuration snapshot). CSV uses CRLF line endings, `TRUE`/`FALSE` booleans, and 4-decimal rounding.

**Google Sheets upload.**
- The receiver is a Google Apps Script Web App (`apps-script/Code.gs`) deployed to execute as the owner with "Anyone" access. Its `/exec` URL is set in `config.js → sheets.webhookUrl`.
- Payloads are POSTed as `text/plain` JSON. The script appends a Sessions row and the Reps rows, **matching columns by name** and **auto-appending** any new schema columns, and **de-duplicates by `session_id`**.
- **Auto-upload** happens automatically when the Results screen appears, provided a webhook is configured **and** the participant ticked the consent box. No button click is required. A manual "Upload to Sheets" button is available as a fallback.
- On failure the payload is queued to a local **outbox** and retried automatically when the device comes back online, or manually from the History screen.
- If the browser cannot read the response (a common Apps Script CORS situation), the upload is reported as "sent (unconfirmed)" and the operator should confirm the row landed in the sheet.

> **Current configuration:** this build is wired to the live Apps Script endpoint and the Google Sheet linked at the top of this document. Rotate the endpoint or add a shared-secret token if the repository is public and write-abuse is a concern.

## 15. Privacy, security and data governance

- **Video never leaves the device.** Frames are processed in memory and are neither stored nor transmitted. Only numeric results may be uploaded.
- **Consent-gated upload.** The consent checkbox appears only when a webhook is configured; uploading occurs only if the participant consents for that session.
- **No direct identifiers by design.** Operators are instructed to use non-identifying participant IDs and to keep notes free of identifying information.
- **Local storage.** A capped local history and the retry outbox are kept in `localStorage`; raw frames are never persisted locally.
- **HTTPS required.** Camera access (`getUserMedia`) requires a secure context, which GitHub Pages provides.
- **Open endpoint caveat.** A public Apps Script `/exec` URL accepts unauthenticated writes to the backing sheet. For stricter governance, add a shared-secret token check in `Code.gs` and `config.js`, and treat the sheet as the system of record under your institution's data-protection policy.

## 16. Responsive design and accessibility

- **Portrait-first, fluid layout.** The manifest requests portrait orientation; an orientation lock is attempted after a user gesture, with a full-screen "rotate your phone" overlay and a paused timer as the fallback in landscape. Layout uses `100dvh`, safe-area insets (notches/home bars), and `clamp()`-based fluid typography and spacing with no fixed pixel widths. Tap targets are ≥ 48 px and there is no horizontal page scroll across the 320–430 px width range.
- **Device matrix.** Visually verified targets span 320×568 through 430×932 and a 768×1024 portrait tablet, on iOS Safari and Android Chrome, including 130% text scaling.
- **Accessibility.** `aria-live` regions announce readiness and status text, confirmation dialogs use `role="dialog"`, focus is visible, and the `lang` attribute switches for the Chinese-language instruction content. The animated backdrop is disabled during the live test and under `prefers-reduced-motion`; contrast targets ≥ 4.5:1.

---
---

# Part IV — Operations

## 17. Installation and deployment

**Run locally** (any static server; ES modules and the camera require http(s), not `file://`):
```powershell
npx serve .          # or:  python -m http.server 8000
```

**Deploy to GitHub Pages**
1. Push the project to a public repository (`icare-ac`).
2. Settings → Pages → Deploy from a branch → `main` / root.
3. Open `https://<user>.github.io/icare-ac/` on the device. The live app for this build is at **https://aaron-chen-angus.github.io/icare-ac/**.

**Set up Google Sheets** (already configured for this build)
1. Create a Google Sheet (this build uses the sheet linked above).
2. Extensions → Apps Script, paste `apps-script/Code.gs`, save.
3. Deploy → New deployment → Web app → *Execute as* **Me**, *Who has access* **Anyone**.
4. Put the `/exec` URL in `js/config.js → sheets.webhookUrl`, commit, and let Pages redeploy.
5. After changing `Code.gs`, create a **new deployment version** so the `finalize` handler is live.

## 18. Operator guide

1. **Entry.** Complete the participant form (ID, age, sex, height, dominant arm, dumbbell weight — auto-suggested from sex). Tick the safety and protocol-briefed confirmations, and consent if uploading. Choose an instruction-video language; the video appears and **Proceed to Test** unlocks once the pose model has loaded and the form is valid.
2. **Framing.** Position the phone side-on to the dominant arm, 1.5–2.5 m away, around shoulder height, with the participant's head-to-knees in frame. Watch the readiness chips turn green. Flip camera / toggle labels / toggle all points as needed.
3. **Practice.** Run 1–2 unscored practice reps (or skip).
4. **Test.** Start the scored trial: a 3-2-1-GO countdown, 30-second timer, live count, and beeps/vibration. Use **Stop (safety)** only if necessary (marks a manual stop).
5. **Results.** Review the count, badges, charts, per-rep table and any quality flags. Choose **Submit / Keep previous / Use current / Try again / I cannot do this test**. **Download ZIP** for a local copy; upload status shows the Sheets outcome.
6. **History.** Review saved sessions and retry any queued uploads.

## 19. Configuration and tuning

All adjustable parameters live in `js/config.js`, each marked `[TUNE]` where it is an unvalidated default. Common adjustments:

| Goal | Parameter(s) |
|---|---|
| Count too strict / lenient | `events.fullCurlProgress`, `calibration.minTopFlexDeg`, `events.extensionToleranceDeg` |
| Live count out of step | `live.curlAt`, `live.extendAt`, `live.emaAlpha` |
| Smoothing | `signal.cutoffHz` |
| Swing/sway sensitivity | `form.swingThresholdDeg`, `form.trunkSwayMaxDeg` |
| Low-end device throughput | `pose.model` (set to `lite`) |

After any schema change, regenerate the dictionary: `node tools/build-dictionary.js`.

## 20. Testing

The analysis engine ships with a synthetic-motion generator (`tests/synth.js`) and a unit-test suite (`tests/run.js`) covering exact counts at 10/20/30 reps, varying pace, fatigue slowdown, partial-ROM exclusion, swing-flag raising, dropout gaps, the half-way rule, noise robustness, insufficient-ROM failure, left/right arms, every norm-band boundary, and schema completeness.

```powershell
node tests/run.js            # headless
```
No Node available? Open `tests/index.html` over http(s) to run the identical suite in the browser.

> [!NOTE]
> The engine is reviewed and the suite is written, but the unit tests should be executed in your environment before any real-world use (institutional devices often disallow Node installs — the browser harness is provided for exactly that case).

## 21. Validation plan

Before any research or clinical use (per the development brief):
1. Record ≥ 20 sessions across arm sides, speeds, clothing and lighting, with two independent manual counters as ground truth.
2. Report agreement of `curls_count` vs. the manual count using the **intraclass correlation coefficient (ICC)** and **Bland–Altman** limits of agreement.
3. Tune the `[TUNE]` parameters to minimise disagreement, then freeze `analysis_version`.
4. Confirm ≥ 15 fps effective throughput on target low-end devices and iPhone Safari.

## 22. Limitations

- **2-D single-camera estimates.** Out-of-plane motion, true 3-D joint angles, and forearm supination/pronation are not reliably recoverable; supination is exploratory only and never affects the count.
- **No bilateral symmetry** from a side-on view.
- **Unvalidated thresholds.** All `[TUNE]` values are engineering defaults pending the validation plan.
- **Norm transcription.** Normative values require verification against the SFT Manual, 2nd ed.
- **Pose-estimation error.** Marker-less pose estimation carries inherent error relative to marker-based motion capture (Needham et al., 2021); accuracy degrades with poor lighting, loose clothing, occlusion and oblique views.
- **Not a medical device.** No diagnostic claim is made or implied.

## 23. Project structure

```
index.html                      single page, all screens
manifest.webmanifest            portrait PWA manifest
css/styles.css, css/icon.svg    TRON theme + icon
js/config.js                    parameters, norms, flag text, webhook
js/schema.js                    single source of truth for all fields
js/i18n.js                      instruction-video languages
js/pose-engine.js               camera + MediaPipe + overlay
js/live.js                      causal live counter
js/analysis.js                  offline biomechanics engine (pure)
js/charts.js                    canvas charts
js/export.js                    CSV / ZIP / Sheets / outbox / history
js/app.js                       screen-flow controller
tests/synth.js, tests/run.js    synthetic-motion unit tests
tests/index.html                browser test harness
tools/build-dictionary.js       regenerates DATA_DICTIONARY.md
apps-script/Code.gs             Google Sheets receiver
README.md                       this manual
DATA_DICTIONARY.md              full field reference
```

## 24. Glossary

| Term | Meaning |
|---|---|
| **SFT** | Senior Fitness Test (Rikli & Jones battery). |
| **Concentric / eccentric** | The lifting (shortening) and lowering (lengthening) phases of a muscle action. |
| **ROM** | Range of motion. |
| **filtfilt** | Zero-phase filtering by applying a filter forward then backward. |
| **BlazePose GHUM** | The MediaPipe pose model producing 33 landmarks. |
| **Sarcopenia** | Age-related loss of muscle mass and function. |
| **ICC** | Intraclass correlation coefficient, an agreement/reliability statistic. |
| **Half-way rule** | A rep counts if the forearm is more than halfway up at time-up. |

## 25. References (APA 7th edition)

Bazarevsky, V., Grishchenko, I., Raveendran, K., Zhu, T., Zhang, F., & Grundmann, M. (2020). *BlazePose: On-device real-time body pose tracking* [Preprint]. arXiv. https://arxiv.org/abs/2006.10204

Cruz-Jentoft, A. J., Bahat, G., Bauer, J., Boirie, Y., Bruyère, O., Cederholm, T., Cooper, C., Landi, F., Rolland, Y., Sayer, A. A., Schneider, S. M., Sieber, C. C., Topinkova, E., Vandewoude, M., Visser, M., & Zamboni, M. (2019). Sarcopenia: Revised European consensus on definition and diagnosis. *Age and Ageing, 48*(1), 16–31. https://doi.org/10.1093/ageing/afy169

Grishchenko, I., Bazarevsky, V., Zanfir, A., Bazavan, E. G., Zanfir, M., Yee, R., Raveendran, K., Zhdanovich, M., Grundmann, M., & Sminchisescu, C. (2022). *BlazePose GHUM Holistic: Real-time 3D human landmarks and pose estimation* [Preprint]. arXiv. https://arxiv.org/abs/2206.11678

Harris-Love, M. O., Benson, K., Leasure, E., Adams, B., & McIntosh, V. (2018). The influence of upper and lower extremity strength on performance-based sarcopenia assessment tests. *Journal of Functional Morphology and Kinesiology, 3*(4), 53. https://doi.org/10.3390/jfmk3040053

Jones, C. J., & Rikli, R. E. (2002). Measuring functional fitness of older adults. *The Journal on Active Aging, 1*(2), 24–30.

Needham, L., Evans, M., Cosker, D. P., Wade, L., McGuigan, P. M., Bilzon, J. L., & Colyer, S. L. (2021). The accuracy of several pose estimation methods for 3D joint centre localisation. *Scientific Reports, 11*, 20673. https://doi.org/10.1038/s41598-021-00212-x

Rikli, R. E., & Jones, C. J. (1999). Development and validation of a functional fitness test for community-residing older adults. *Journal of Aging and Physical Activity, 7*(2), 129–161. https://doi.org/10.1123/japa.7.2.129

Rikli, R. E., & Jones, C. J. (1999). Functional fitness normative scores for community-residing older adults, ages 60–94. *Journal of Aging and Physical Activity, 7*(2), 162–181. https://doi.org/10.1123/japa.7.2.162

Rikli, R. E., & Jones, C. J. (2013). *Senior fitness test manual* (2nd ed.). Human Kinetics.

Winter, D. A. (2009). *Biomechanics and motor control of human movement* (4th ed.). John Wiley & Sons. https://doi.org/10.1002/9780470549148

*Supplementary protocol source:* PhenX Toolkit. (n.d.). *Integrated fitness – older adult protocol (Protocol 150202)*. Retrieved from https://www.phenxtoolkit.org/

---

<div align="center">

**AC//LAB v1.0** · Research / screening instrument — not a medical device · 2-D sagittal estimates · `[TUNE]` thresholds unvalidated

Owner: Aaron Chen Angus (Republic Polytechnic, SSH) · Built with Kiro

</div>

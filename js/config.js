// AC//LAB — configuration. All values marked [TUNE] are engineering defaults
// pending the validation plan (Part H) and are NOT clinically validated.
//
// Single place to tune the analysis engine, protocol, UI thresholds, norms and
// the Google Sheets webhook. config.js is environment-agnostic (works in Node
// for the unit tests): it exports CONFIG as an ES module and also attaches it to
// globalThis so non-module consumers can read it.

export const CONFIG = {
  protocol: {
    durationS: 30,            // scored trial length
    countdownS: 3,            // 3-2-1 before GO
    preRollS: 1,              // seated baseline captured before GO           [TUNE]
    tailS: 2,                 // extra capture after 30 s for the half-way rule
    halfwayProgress: 0.5,     // half-way rule: peak progress after 30 s counts if >= this
    practiceReps: 2,          // suggested practice reps (1-2)
    dumbbellKgStandard: { female: 2.27 /* 5 lb */, male: 3.63 /* 8 lb */ }
  },

  video: {
    // Instruction YouTube Shorts IDs by language
    ids: { en: 'HGp7ku3u7uc', zh: 'htQIVkK-XDQ', yue: 'P-9CqU8zkkA' }
  },

  signal: {
    resampleHz: 30,           // uniform resample rate for analysis
    cutoffHz: 8,              // effective zero-lag Butterworth cutoff        [TUNE]
    maxGapS: 0.25,            // bridged by interpolation; longer gaps flagged [TUNE]
    minVisibility: 0.5,       // landmark validity threshold
    padSamples: 30            // reflect-pad length for filtfilt
  },

  calibration: {
    minRomDeg: 60,            // calibrated elbow ROM below this -> re-record  [TUNE]
    minTopFlexDeg: 90,        // a full curl must reach >= this elbow flexion  [TUNE]
    startMaxElbowFlexDeg: 30, // pre-roll arm-hanging check (NOT_AT_START)     [TUNE]
    heightRangeCm: [120, 210] // plausible participant height
  },

  events: {
    stateHi: 0.6,             // progress rising through this begins an attempt
    stateLo: 0.4,             // progress falling through this ends an attempt
    lowPct: 0.1,              // onset / bottom event threshold (progress)
    highPct: 0.9,            // top-reached / lowering-start event threshold
    fullCurlProgress: 0.85,   // peak progress needed for a counted full curl  [TUNE]
    extensionToleranceDeg: 20 // return-to-extension tolerance above e_bottom  [TUNE]
  },

  form: {
    swingThresholdDeg: 20,    // per-rep upper-arm (shoulder) angle range flag [TUNE]
    swingRepFrac: 0.3,        // UPPER_ARM_SWING if >= this fraction of reps swing
    trunkSwayMaxDeg: 15       // TRUNK_SWAY if trunk inclination range exceeds  [TUNE]
  },

  qc: {
    minEffectiveFps: 15,      // LOW_FPS below this                            [TUNE]
    minValidFramePct: 90,     // LOW_VALID_FRAMES below this
    maxImputedPct: 10,        // TRACKING_GAPS above this
    maxGapS: 0.5,             // TRACKING_GAPS if any single gap exceeds this
    maxObliquity: 0.2,        // OBLIQUE_VIEW above this (QC); readiness uses 0.3
    maxScaleDiffPct: 10,      // SCALE_INCONSISTENT above this
    maxElbow2D3DDiffDeg: 10,  // ELBOW_2D_3D_DISAGREE above this
    movedBeforeGoFlexDeg: 20, // MOVED_BEFORE_GO if elbow flexes > this pre-GO
    // Blocking flags set valid_for_norm = FALSE.
    blocking: [
      'LOW_FPS', 'LOW_VALID_FRAMES', 'TRACKING_GAPS', 'ARM_SIDE_MISMATCH',
      'NOT_AT_START_POSITION', 'MOVED_BEFORE_GO', 'MANUAL_STOP', 'INSUFFICIENT_ROM'
    ]
  },

  live: {
    emaAlpha: 0.4,            // live counter smoothing
    curlAt: 0.85,             // live: progress above this = top reached
    extendAt: 0.25            // live: progress below this = returned to bottom
  },

  readiness: {
    obliquity: 0.3,           // framing readiness uses a looser obliquity than QC
    minVisibility: 0.5
  },

  norm: {
    enabled: true,
    reference: 'Rikli & Jones (1999); Jones & Rikli (2002); SFT Manual 2e (2013)',
    // [VERIFY vs SFT Manual 2nd ed.] values = middle-50% "average" range [low, high].
    // Below low = Below average; within = Average; above high = Above average.
    men: {
      '60-64': [16, 22], '65-69': [15, 21], '70-74': [14, 21], '75-79': [13, 19],
      '80-84': [13, 19], '85-89': [11, 17], '90-94': [10, 14]
    },
    women: {
      '60-64': [13, 19], '65-69': [12, 18], '70-74': [12, 17], '75-79': [11, 17],
      '80-84': [10, 16], '85-89': [10, 15], '90-94': [8, 13]
    }
  },

  pose: {
    model: 'full',            // lite | full | heavy  (default full)
    minDetectionConfidence: 0.5,
    minPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    // CDN for @mediapipe/tasks-vision and the pose model assets.
    tasksVisionVersion: '0.10.14',
    wasmBase: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
    modelUrls: {
      lite: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
      full: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
      heavy: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task'
    }
  },

  camera: {
    facing: 'rear',           // rear | front (user selectable)
    ringBufferS: 2.5          // pre-roll ring buffer during position/countdown
  },

  sounds: { enabled: true, vibrate: true },

  sheets: { webhookUrl: '', uploadFrames: false },

  storage: { historyKey: 'acLab_history', outboxKey: 'acLab_outbox', historyCap: 300 },

  app: { version: '1.0.0', analysisVersion: '1.0.0', schemaVersion: '1.0' }
};

// Human-readable explanations for every QC flag (shown on Results, Part K #24).
export const FLAG_INFO = {
  LOW_FPS: 'The camera/detector ran below 15 frames per second, so timing and velocity may be unreliable.',
  LOW_VALID_FRAMES: 'The shoulder-elbow-wrist of the tested arm was clearly visible in fewer than 90% of frames.',
  TRACKING_GAPS: 'Pose tracking dropped out for too long; too much of the signal had to be filled in.',
  ARM_SIDE_MISMATCH: 'The arm that faced the camera does not match the dominant arm you selected.',
  NOT_AT_START_POSITION: 'At the start the arm was not hanging straight down (elbow was already bent).',
  MOVED_BEFORE_GO: 'The arm started curling before the GO signal.',
  MANUAL_STOP: 'The test was stopped before the full 30 seconds elapsed.',
  INSUFFICIENT_ROM: 'The elbow did not move through enough range to measure full curls.',
  NO_REPS_DETECTED: 'No complete curls were detected in the 30-second window.',
  UPPER_ARM_SWING: 'The upper arm swung during a notable share of reps instead of staying still.',
  TRUNK_SWAY: 'The trunk leaned or rocked more than expected during the test.',
  OBLIQUE_VIEW: 'The camera was not fully side-on to the body, which reduces 2-D accuracy.',
  SCALE_INCONSISTENT: 'The measured arm length drifted during the test, suggesting the person moved toward/away from the camera.',
  ELBOW_2D_3D_DISAGREE: 'The 2-D and 3-D elbow-angle estimates disagree, suggesting an off-axis view.',
  FRAMING_OVERRIDE: 'The operator started the test while the framing checks were still failing.',
  HEIGHT_IMPLAUSIBLE: 'The entered height is outside the plausible 120-210 cm range.',
  NONSTANDARD_WEIGHT: 'The dumbbell weight differs from the standard SFT load, so norm classification does not apply.'
};

// Non-module consumers (plain scripts / older tooling) can read globalThis.CONFIG.
if (typeof globalThis !== 'undefined') {
  globalThis.CONFIG = CONFIG;
  globalThis.FLAG_INFO = FLAG_INFO;
}

export default CONFIG;

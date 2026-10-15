// AC//LAB — schema.js
// SINGLE SOURCE OF TRUTH for every exported field. Each field entry must have:
//   key   : column name (snake_case)
//   group : logical grouping (drives tiles, dictionary sections)
//   type  : string | number | int | bool | enum
//   unit  : physical unit or '' / '-' when not applicable
//   desc  : human-readable description
//   calc  : how it is computed (formula / source)
//
// The export, the data dictionary and the schema-completeness test all read
// from here. If you add a metric to analysis.js, add its field here too.

export const SCHEMA_VERSION = '1.0';

// ---------------------------------------------------------------------------
// SESSIONS — one row per attempt
// ---------------------------------------------------------------------------
export const SESSION_FIELDS = [
  // --- Session & participant ---
  { key: 'session_id', group: 'Session & participant', type: 'string', unit: '-', desc: 'Unique id for this attempt (UUID).', calc: 'crypto.randomUUID() at test start.' },
  { key: 'visit_id', group: 'Session & participant', type: 'string', unit: '-', desc: 'Shared id across attempts of the same participant visit.', calc: 'UUID generated at first attempt of a visit; reused on retries.' },
  { key: 'attempt_no', group: 'Session & participant', type: 'int', unit: '-', desc: 'Attempt number within the visit (1-based).', calc: 'Incremented per attempt.' },
  { key: 'final_attempt', group: 'Session & participant', type: 'bool', unit: '-', desc: 'TRUE for the attempt the participant confirmed.', calc: 'Set on finalize; others set FALSE.' },
  { key: 'selected_attempt', group: 'Session & participant', type: 'enum', unit: '-', desc: 'Which attempt was selected (current|previous|"").', calc: 'Chosen at Keep previous / Use current.' },
  { key: 'timestamp_utc', group: 'Session & participant', type: 'string', unit: 'ISO8601', desc: 'Attempt start time in UTC.', calc: 'new Date().toISOString() at test start.' },
  { key: 'utc_offset_min', group: 'Session & participant', type: 'int', unit: 'min', desc: 'Local UTC offset in minutes.', calc: '-new Date().getTimezoneOffset().' },
  { key: 'app_version', group: 'Session & participant', type: 'string', unit: '-', desc: 'App version.', calc: 'CONFIG.app.version.' },
  { key: 'analysis_version', group: 'Session & participant', type: 'string', unit: '-', desc: 'Analysis engine version.', calc: 'CONFIG.app.analysisVersion.' },
  { key: 'schema_version', group: 'Session & participant', type: 'string', unit: '-', desc: 'Schema version.', calc: 'CONFIG.app.schemaVersion.' },
  { key: 'participant_id', group: 'Session & participant', type: 'string', unit: '-', desc: 'Participant identifier (no identifying info).', calc: 'Entry form.' },
  { key: 'age_years', group: 'Session & participant', type: 'int', unit: 'years', desc: 'Participant age.', calc: 'Entry form.' },
  { key: 'sex', group: 'Session & participant', type: 'enum', unit: '-', desc: 'Participant sex (male|female|other).', calc: 'Entry form.' },
  { key: 'height_cm', group: 'Session & participant', type: 'number', unit: 'cm', desc: 'Participant height; sets the metre scale.', calc: 'Entry form.' },
  { key: 'body_mass_kg', group: 'Session & participant', type: 'number', unit: 'kg', desc: 'Participant body mass (optional).', calc: 'Entry form.' },
  { key: 'test_arm', group: 'Session & participant', type: 'enum', unit: '-', desc: 'Tested (dominant) arm (right|left).', calc: 'Entry form.' },
  { key: 'dumbbell_kg', group: 'Session & participant', type: 'number', unit: 'kg', desc: 'Dumbbell weight used.', calc: 'Entry form (auto-suggested from sex).' },
  { key: 'chair_seat_height_cm', group: 'Session & participant', type: 'number', unit: 'cm', desc: 'Chair seat height (optional).', calc: 'Entry form.' },
  { key: 'site', group: 'Session & participant', type: 'string', unit: '-', desc: 'Site / session label.', calc: 'Entry form.' },
  { key: 'operator_notes', group: 'Session & participant', type: 'string', unit: '-', desc: 'Operator notes (no identifying info).', calc: 'Entry form.' },
  { key: 'instruction_language', group: 'Session & participant', type: 'enum', unit: '-', desc: 'Instruction video language chosen (en|zh|yue).', calc: 'Entry screen selection.' },
  { key: 'practice_completed', group: 'Session & participant', type: 'bool', unit: '-', desc: 'Whether a practice trial was run.', calc: 'Test screen.' },
  { key: 'dumbbell_standard', group: 'Session & participant', type: 'bool', unit: '-', desc: 'Whether the dumbbell matches the SFT standard load for the sex.', calc: '|dumbbell_kg - standard| <= 0.1 kg.' },

  // --- Device & model ---
  { key: 'pose_model', group: 'Device & model', type: 'enum', unit: '-', desc: 'Pose model used (lite|full|heavy).', calc: 'Entry form / CONFIG.pose.model.' },
  { key: 'pose_delegate', group: 'Device & model', type: 'enum', unit: '-', desc: 'Compute delegate used (GPU|CPU).', calc: 'Pose engine init (GPU with CPU fallback).' },
  { key: 'camera_facing', group: 'Device & model', type: 'enum', unit: '-', desc: 'Camera used (rear|front).', calc: 'Entry form.' },
  { key: 'video_width_px', group: 'Device & model', type: 'int', unit: 'px', desc: 'Camera stream intrinsic width.', calc: 'video.videoWidth.' },
  { key: 'video_height_px', group: 'Device & model', type: 'int', unit: 'px', desc: 'Camera stream intrinsic height.', calc: 'video.videoHeight.' },
  { key: 'screen_w_px', group: 'Device & model', type: 'int', unit: 'px', desc: 'Screen width.', calc: 'screen.width.' },
  { key: 'screen_h_px', group: 'Device & model', type: 'int', unit: 'px', desc: 'Screen height.', calc: 'screen.height.' },
  { key: 'device_pixel_ratio', group: 'Device & model', type: 'number', unit: '-', desc: 'Device pixel ratio.', calc: 'window.devicePixelRatio.' },
  { key: 'user_agent', group: 'Device & model', type: 'string', unit: '-', desc: 'Browser user agent.', calc: 'navigator.userAgent.' },

  // --- Protocol ---
  { key: 'planned_duration_s', group: 'Protocol', type: 'number', unit: 's', desc: 'Planned trial duration.', calc: 'CONFIG.protocol.durationS.' },
  { key: 'test_duration_s', group: 'Protocol', type: 'number', unit: 's', desc: 'Actual captured trial duration.', calc: 'Elapsed from GO to stop.' },
  { key: 'manual_stop', group: 'Protocol', type: 'bool', unit: '-', desc: 'Whether the operator stopped early.', calc: 'Stop button before 30 s.' },
  { key: 'test_outcome', group: 'Protocol', type: 'enum', unit: '-', desc: 'completed | cannot_do.', calc: 'Results flow.' },
  { key: 'protocol_briefed_confirmed', group: 'Protocol', type: 'bool', unit: '-', desc: 'Protocol-briefed checkbox state.', calc: 'Entry form.' },
  { key: 'filter_cutoff_hz', group: 'Protocol', type: 'number', unit: 'Hz', desc: 'Effective low-pass cutoff used.', calc: 'CONFIG.signal.cutoffHz.' },
  { key: 'resample_hz', group: 'Protocol', type: 'number', unit: 'Hz', desc: 'Resample rate used.', calc: 'CONFIG.signal.resampleHz.' },

  // --- Primary outcome ---
  { key: 'curls_count', group: 'Primary outcome', type: 'int', unit: 'reps', desc: 'Authoritative offline curl count.', calc: 'Counted reps in the 0-30 s window + half-way rule.' },
  { key: 'live_count', group: 'Primary outcome', type: 'int', unit: 'reps', desc: 'Live (causal) count shown during the test.', calc: 'live.js state machine.' },
  { key: 'count_difference', group: 'Primary outcome', type: 'int', unit: 'reps', desc: 'live_count - curls_count.', calc: 'Difference of the two.' },
  { key: 'half_rule_applied', group: 'Primary outcome', type: 'bool', unit: '-', desc: 'Whether a half-way rep was counted at time-up.', calc: 'See half-way rule.' },
  { key: 'incomplete_attempts', group: 'Primary outcome', type: 'int', unit: 'reps', desc: 'Detected partial-ROM attempts not counted.', calc: 'State-machine attempts failing full-ROM.' },
  { key: 'curls_first_half', group: 'Primary outcome', type: 'int', unit: 'reps', desc: 'Counted curls in 0-15 s.', calc: 'Counted reps with t50 < 15 s.' },
  { key: 'curls_second_half', group: 'Primary outcome', type: 'int', unit: 'reps', desc: 'Counted curls in 15-30 s.', calc: 'Counted reps with t50 >= 15 s.' },
  { key: 'norm_reference', group: 'Primary outcome', type: 'string', unit: '-', desc: 'Norm source citation.', calc: 'CONFIG.norm.reference.' },
  { key: 'norm_range_low', group: 'Primary outcome', type: 'int', unit: 'reps', desc: 'Lower bound of the average band for age/sex.', calc: 'CONFIG.norm[sex][band][0].' },
  { key: 'norm_range_high', group: 'Primary outcome', type: 'int', unit: 'reps', desc: 'Upper bound of the average band for age/sex.', calc: 'CONFIG.norm[sex][band][1].' },
  { key: 'norm_classification', group: 'Primary outcome', type: 'enum', unit: '-', desc: 'Below average | Average | Above average | Not classified.', calc: 'Compare curls_count to the band if valid_for_norm.' },

  // --- Temporal ---
  { key: 'time_to_first_curl_s', group: 'Temporal', type: 'number', unit: 's', desc: 'Time from GO to first counted curl top.', calc: 't_top of first counted rep.' },
  { key: 'cycle_time_mean', group: 'Temporal', type: 'number', unit: 's', desc: 'Mean rep cycle time.', calc: 'mean(cycle_time_s).' },
  { key: 'cycle_time_sd', group: 'Temporal', type: 'number', unit: 's', desc: 'SD of cycle time.', calc: 'sd(cycle_time_s).' },
  { key: 'cycle_time_cv_pct', group: 'Temporal', type: 'number', unit: '%', desc: 'Coefficient of variation of cycle time.', calc: '100*sd/mean.' },
  { key: 'cycle_time_min', group: 'Temporal', type: 'number', unit: 's', desc: 'Minimum cycle time.', calc: 'min(cycle_time_s).' },
  { key: 'cycle_time_max', group: 'Temporal', type: 'number', unit: 's', desc: 'Maximum cycle time.', calc: 'max(cycle_time_s).' },
  { key: 'cycle_time_slope_s_per_rep', group: 'Temporal', type: 'number', unit: 's/rep', desc: 'OLS slope of cycle time across reps (>=4 reps).', calc: 'Least-squares slope.' },
  { key: 'cycle_time_change_pct', group: 'Temporal', type: 'number', unit: '%', desc: 'First-third vs last-third cycle-time change (>=6 reps).', calc: '100*(last3-first3)/first3.' },
  { key: 'curl_time_mean_s', group: 'Temporal', type: 'number', unit: 's', desc: 'Mean concentric (curl) time.', calc: 'mean(curl_time_s).' },
  { key: 'curl_time_sd_s', group: 'Temporal', type: 'number', unit: 's', desc: 'SD concentric time.', calc: 'sd(curl_time_s).' },
  { key: 'lower_time_mean_s', group: 'Temporal', type: 'number', unit: 's', desc: 'Mean eccentric (lowering) time.', calc: 'mean(lower_time_s).' },
  { key: 'lower_time_sd_s', group: 'Temporal', type: 'number', unit: 's', desc: 'SD eccentric time.', calc: 'sd(lower_time_s).' },
  { key: 'tempo_ratio_mean', group: 'Temporal', type: 'number', unit: '-', desc: 'Mean lowering/curl time ratio.', calc: 'mean(lower_time/curl_time).' },
  { key: 'top_dwell_mean_s', group: 'Temporal', type: 'number', unit: 's', desc: 'Mean dwell at the top.', calc: 'mean(top_dwell_s).' },
  { key: 'bottom_dwell_mean_s', group: 'Temporal', type: 'number', unit: 's', desc: 'Mean dwell at the bottom.', calc: 'mean(bottom_dwell_s).' },

  // --- Range of motion ---
  { key: 'elbow_flex_bottom_mean_deg', group: 'Range of motion', type: 'number', unit: 'deg', desc: 'Mean elbow flexion at the bottom.', calc: 'mean(elbow_flex at bottom).' },
  { key: 'elbow_flex_top_mean_deg', group: 'Range of motion', type: 'number', unit: 'deg', desc: 'Mean elbow flexion at the top.', calc: 'mean(elbow_flex_top_deg).' },
  { key: 'elbow_rom_mean_deg', group: 'Range of motion', type: 'number', unit: 'deg', desc: 'Mean per-rep elbow ROM.', calc: 'mean(elbow_rom_deg).' },
  { key: 'elbow_rom_sd_deg', group: 'Range of motion', type: 'number', unit: 'deg', desc: 'SD of per-rep elbow ROM.', calc: 'sd(elbow_rom_deg).' },
  { key: 'elbow_rom_change_pct', group: 'Range of motion', type: 'number', unit: '%', desc: 'ROM change first-third vs last-third.', calc: '100*(last3-first3)/first3.' },

  // --- Velocity ---
  { key: 'elbow_flex_peak_vel_mean_deg_s', group: 'Velocity', type: 'number', unit: 'deg/s', desc: 'Mean concentric peak angular velocity.', calc: 'mean(elbow_flex_peak_vel_deg_s).' },
  { key: 'elbow_flex_peak_vel_max_deg_s', group: 'Velocity', type: 'number', unit: 'deg/s', desc: 'Max concentric peak angular velocity.', calc: 'max(elbow_flex_peak_vel_deg_s).' },
  { key: 'elbow_ext_peak_vel_mean_deg_s', group: 'Velocity', type: 'number', unit: 'deg/s', desc: 'Mean eccentric peak angular velocity.', calc: 'mean(elbow_ext_peak_vel_deg_s).' },
  { key: 'wrist_peak_speed_mean_m_s', group: 'Velocity', type: 'number', unit: 'm/s', desc: 'Mean per-rep peak wrist linear speed.', calc: 'mean(wrist_peak_speed_m_s).' },
  { key: 'wrist_rise_mean_m', group: 'Velocity', type: 'number', unit: 'm', desc: 'Mean wrist vertical rise per rep.', calc: 'mean(wrist_rise_m).' },
  { key: 'peak_velocity_change_pct', group: 'Velocity', type: 'number', unit: '%', desc: 'Peak velocity change first-third vs last-third.', calc: '100*(last3-first3)/first3.' },
  { key: 'load_work_rate_proxy_mean_w', group: 'Velocity', type: 'number', unit: 'W', desc: 'Mean load work-rate proxy (NOT validated power).', calc: 'mean(weight*9.81*wrist_rise/curl_time).' },

  // --- Form / stability ---
  { key: 'upper_arm_swing_mean_deg', group: 'Form / stability', type: 'number', unit: 'deg', desc: 'Mean per-rep upper-arm (shoulder) angle range.', calc: 'mean(upper_arm_swing_deg).' },
  { key: 'upper_arm_swing_max_deg', group: 'Form / stability', type: 'number', unit: 'deg', desc: 'Max per-rep upper-arm angle range.', calc: 'max(upper_arm_swing_deg).' },
  { key: 'elbow_drift_mean_ul', group: 'Form / stability', type: 'number', unit: 'upper-arm lengths', desc: 'Mean elbow displacement relative to shoulder.', calc: 'mean(elbow_drift_ul).' },
  { key: 'trunk_sway_range_deg', group: 'Form / stability', type: 'number', unit: 'deg', desc: 'Trunk inclination range over the test.', calc: 'max(tr)-min(tr).' },
  { key: 'trunk_incl_mean_deg', group: 'Form / stability', type: 'number', unit: 'deg', desc: 'Mean trunk inclination.', calc: 'mean(tr).' },
  { key: 'shoulder_shrug_mean_tl', group: 'Form / stability', type: 'number', unit: 'trunk lengths', desc: 'Mean shoulder rise relative to hip.', calc: 'mean per-rep shoulder-y change / trunk length.' },
  { key: 'forearm_incl_top_mean_deg', group: 'Form / stability', type: 'number', unit: 'deg', desc: 'Mean forearm inclination at the top.', calc: 'mean(forearm_incl_top_deg).' },
  { key: 'wrist_angle_range_mean_deg', group: 'Form / stability', type: 'number', unit: 'deg', desc: 'Mean per-rep wrist-angle range (exploratory).', calc: 'mean(wrist_angle_range_deg).' },
  { key: 'swing_reps', group: 'Form / stability', type: 'int', unit: 'reps', desc: 'Count of reps flagged for swing.', calc: 'sum(swing_flag).' },

  // --- Calibration ---
  { key: 'dominant_side', group: 'Calibration', type: 'enum', unit: '-', desc: 'Auto-detected near side (left|right).', calc: 'Max mean visibility over pre-roll.' },
  { key: 'facing_direction', group: 'Calibration', type: 'int', unit: '-', desc: 'Facing direction sign (+1/-1).', calc: 'Sign from shoulder/hip geometry.' },
  { key: 'scale_m_per_px', group: 'Calibration', type: 'number', unit: 'm/px', desc: 'Metre-per-pixel scale.', calc: '(0.186H+0.146H)/median arm-chain px.' },
  { key: 'scale_check_diff_pct', group: 'Calibration', type: 'number', unit: '%', desc: 'Scale drift check.', calc: 'median arm chain vs first 2 s.' },
  { key: 'calib_arm_chain_px', group: 'Calibration', type: 'number', unit: 'px', desc: 'Median shoulder-elbow-wrist pixel length.', calc: 'median over valid frames.' },
  { key: 'calib_elbow_flex_bottom_deg', group: 'Calibration', type: 'number', unit: 'deg', desc: 'Calibrated bottom elbow flexion.', calc: 'median of troughs.' },
  { key: 'calib_elbow_flex_top_deg', group: 'Calibration', type: 'number', unit: 'deg', desc: 'Calibrated top elbow flexion.', calc: 'median of peaks.' },
  { key: 'calib_rom_deg', group: 'Calibration', type: 'number', unit: 'deg', desc: 'Calibrated ROM (top-bottom).', calc: 'calib_top - calib_bottom.' },
  { key: 'calib_start_elbow_flex_deg', group: 'Calibration', type: 'number', unit: 'deg', desc: 'Median pre-roll elbow flexion.', calc: 'median over pre-roll frames.' },

  // --- Quality control ---
  { key: 'effective_fs_hz', group: 'Quality control', type: 'number', unit: 'Hz', desc: 'Effective detector throughput.', calc: 'Frames / capture duration.' },
  { key: 'valid_frame_pct', group: 'Quality control', type: 'number', unit: '%', desc: 'Percent frames with valid arm chain.', calc: '100*valid/total.' },
  { key: 'imputed_sample_pct', group: 'Quality control', type: 'number', unit: '%', desc: 'Percent samples imputed.', calc: '100*imputed/total.' },
  { key: 'longest_gap_s', group: 'Quality control', type: 'number', unit: 's', desc: 'Longest tracking gap.', calc: 'max contiguous invalid span.' },
  { key: 'median_arm_visibility', group: 'Quality control', type: 'number', unit: '-', desc: 'Median visibility of the arm chain.', calc: 'median visibility.' },
  { key: 'view_obliquity_median', group: 'Quality control', type: 'number', unit: '-', desc: 'Median view obliquity.', calc: 'hip/shoulder horizontal sep / trunk length.' },
  { key: 'elbow_2d_3d_diff_deg', group: 'Quality control', type: 'number', unit: 'deg', desc: 'Mean 2-D vs 3-D elbow difference.', calc: 'mean |e2d - e3d|.' },
  { key: 'qc_flags', group: 'Quality control', type: 'string', unit: '-', desc: 'Semicolon-separated QC flags raised.', calc: 'Join of raised flags.' },
  { key: 'qc_pass', group: 'Quality control', type: 'bool', unit: '-', desc: 'No blocking flags raised.', calc: 'No blocking flag present.' },
  { key: 'valid_for_norm', group: 'Quality control', type: 'bool', unit: '-', desc: 'Eligible for norm classification.', calc: 'qc_pass & full 30 s & age 60-94 & sex m/f & standard weight & practice.' }
];

// ---------------------------------------------------------------------------
// REPS — one row per detected attempt
// ---------------------------------------------------------------------------
export const REP_FIELDS = [
  { key: 'session_id', group: 'Rep', type: 'string', unit: '-', desc: 'Parent session id.', calc: 'Copied from session.' },
  { key: 'rep_index', group: 'Rep', type: 'int', unit: '-', desc: 'Detected-attempt index (0-based, includes uncounted).', calc: 'Order of detection.' },
  { key: 'curl_number', group: 'Rep', type: 'int', unit: '-', desc: 'Counted-curl number (blank if not counted).', calc: 'Running count of counted reps.' },
  { key: 'counted', group: 'Rep', type: 'bool', unit: '-', desc: 'Whether this attempt counts.', calc: 'Full ROM + window rules.' },
  { key: 'counted_by_half_rule', group: 'Rep', type: 'bool', unit: '-', desc: 'Counted via the half-way rule at time-up.', calc: 'Peak after 30 s with p>=0.5.' },
  { key: 'full_rom_flag', group: 'Rep', type: 'bool', unit: '-', desc: 'Reached full-curl ROM.', calc: 'peak p>=fullCurlProgress & e_top>=minTopFlex.' },
  { key: 'full_extension_flag', group: 'Rep', type: 'bool', unit: '-', desc: 'Returned to full extension.', calc: 'e_bottom_rep <= e_bottom + tol.' },
  { key: 't_onset_s', group: 'Rep', type: 'number', unit: 's', desc: 'Onset time (10%).', calc: 'Progress rises through lowPct.' },
  { key: 't_half_s', group: 'Rep', type: 'number', unit: 's', desc: '50% time.', calc: 'Progress crosses 0.5 ascending.' },
  { key: 't_top_s', group: 'Rep', type: 'number', unit: 's', desc: 'Top-reached time (90%).', calc: 'Progress rises through highPct.' },
  { key: 't_lower_start_s', group: 'Rep', type: 'number', unit: 's', desc: 'Lowering-start time.', calc: 'Progress falls below highPct.' },
  { key: 't_bottom_s', group: 'Rep', type: 'number', unit: 's', desc: 'Bottom-reached time.', calc: 'Progress returns to lowPct.' },
  { key: 'curl_time_s', group: 'Rep', type: 'number', unit: 's', desc: 'Concentric time (onset->top).', calc: 't_top - t_onset.' },
  { key: 'top_dwell_s', group: 'Rep', type: 'number', unit: 's', desc: 'Dwell at top.', calc: 't_lower_start - t_top.' },
  { key: 'lower_time_s', group: 'Rep', type: 'number', unit: 's', desc: 'Eccentric time.', calc: 't_bottom - t_lower_start.' },
  { key: 'bottom_dwell_s', group: 'Rep', type: 'number', unit: 's', desc: 'Dwell at bottom before next onset.', calc: 'next onset - t_bottom.' },
  { key: 'cycle_time_s', group: 'Rep', type: 'number', unit: 's', desc: 'Full cycle time.', calc: 'onset to next onset (or bottom).' },
  { key: 'tempo_ratio', group: 'Rep', type: 'number', unit: '-', desc: 'Lowering/curl ratio.', calc: 'lower_time/curl_time.' },
  { key: 'elbow_flex_onset_deg', group: 'Rep', type: 'number', unit: 'deg', desc: 'Elbow flexion at onset.', calc: 'e(t_onset).' },
  { key: 'elbow_flex_top_deg', group: 'Rep', type: 'number', unit: 'deg', desc: 'Peak elbow flexion.', calc: 'max e in rep.' },
  { key: 'elbow_rom_deg', group: 'Rep', type: 'number', unit: 'deg', desc: 'Rep ROM.', calc: 'top - onset.' },
  { key: 'elbow_flex_peak_vel_deg_s', group: 'Rep', type: 'number', unit: 'deg/s', desc: 'Concentric peak angular velocity.', calc: 'max de/dt in curl phase.' },
  { key: 'time_to_peak_vel_s', group: 'Rep', type: 'number', unit: 's', desc: 'Time from onset to peak velocity.', calc: 't(peak vel) - t_onset.' },
  { key: 'elbow_ext_peak_vel_deg_s', group: 'Rep', type: 'number', unit: 'deg/s', desc: 'Eccentric peak angular velocity.', calc: 'min de/dt (magnitude) in lower phase.' },
  { key: 'wrist_rise_m', group: 'Rep', type: 'number', unit: 'm', desc: 'Wrist vertical rise.', calc: '(wrist y range)*scale.' },
  { key: 'wrist_peak_speed_m_s', group: 'Rep', type: 'number', unit: 'm/s', desc: 'Peak wrist linear speed.', calc: 'max |dwrist/dt|*scale.' },
  { key: 'load_work_rate_proxy_w', group: 'Rep', type: 'number', unit: 'W', desc: 'Load work-rate proxy.', calc: 'weight*9.81*wrist_rise/curl_time.' },
  { key: 'peak_progress', group: 'Rep', type: 'number', unit: '-', desc: 'Peak normalised progress.', calc: 'max p in rep.' },
  { key: 'upper_arm_swing_deg', group: 'Rep', type: 'number', unit: 'deg', desc: 'Shoulder-angle range in rep.', calc: 'max s - min s.' },
  { key: 'elbow_drift_ul', group: 'Rep', type: 'number', unit: 'upper-arm lengths', desc: 'Elbow displacement vs shoulder.', calc: 'elbow path range / upper-arm length.' },
  { key: 'trunk_sway_deg', group: 'Rep', type: 'number', unit: 'deg', desc: 'Trunk inclination range in rep.', calc: 'max tr - min tr.' },
  { key: 'shoulder_shrug_tl', group: 'Rep', type: 'number', unit: 'trunk lengths', desc: 'Shoulder rise in rep.', calc: 'shoulder-y range / trunk length.' },
  { key: 'forearm_incl_top_deg', group: 'Rep', type: 'number', unit: 'deg', desc: 'Forearm inclination at top.', calc: 'f(t_top).' },
  { key: 'wrist_angle_range_deg', group: 'Rep', type: 'number', unit: 'deg', desc: 'Wrist-angle range (exploratory).', calc: 'max - min wrist angle.' },
  { key: 'swing_flag', group: 'Rep', type: 'bool', unit: '-', desc: 'Upper-arm swing exceeded threshold.', calc: 'upper_arm_swing_deg > swingThresholdDeg.' },
  { key: 'tracking_gap_flag', group: 'Rep', type: 'bool', unit: '-', desc: 'Tracking gap overlapped this rep.', calc: 'Imputed samples within rep span.' }
];

// ---------------------------------------------------------------------------
// FRAMES — optional, uniform 30 Hz, filtered
// ---------------------------------------------------------------------------
export const FRAME_FIELDS = [
  { key: 'session_id', group: 'Frame', type: 'string', unit: '-', desc: 'Parent session id.', calc: 'Copied.' },
  { key: 't_s', group: 'Frame', type: 'number', unit: 's', desc: 'Time relative to GO.', calc: 'Sample index / resample_hz - preRoll.' },
  { key: 'phase', group: 'Frame', type: 'enum', unit: '-', desc: 'BOTTOM|CURL|TOP|LOWER.', calc: 'State machine.' },
  { key: 'tracking_gap', group: 'Frame', type: 'bool', unit: '-', desc: 'Sample was imputed.', calc: 'Interpolated flag.' },
  { key: 'progress', group: 'Frame', type: 'number', unit: '-', desc: 'Curl progress 0-1.', calc: '(e-e_bottom)/(e_top-e_bottom).' },
  { key: 'elbow_flex_deg', group: 'Frame', type: 'number', unit: 'deg', desc: 'Elbow flexion.', calc: '180 - angle(sh,el,wr).' },
  { key: 'elbow_vel_deg_s', group: 'Frame', type: 'number', unit: 'deg/s', desc: 'Elbow angular velocity.', calc: 'd(elbow_flex)/dt.' },
  { key: 'shoulder_angle_deg', group: 'Frame', type: 'number', unit: 'deg', desc: 'Upper-arm angle vs trunk.', calc: 'angle(trunk, upper arm).' },
  { key: 'trunk_incl_deg', group: 'Frame', type: 'number', unit: 'deg', desc: 'Trunk inclination.', calc: 'atan2(d*(sh.x-hip.x), hip.y-sh.y).' },
  { key: 'forearm_incl_deg', group: 'Frame', type: 'number', unit: 'deg', desc: 'Forearm inclination vs vertical.', calc: 'angle(el->wr, vertical).' },
  { key: 'wrist_angle_deg', group: 'Frame', type: 'number', unit: 'deg', desc: 'Wrist angle (exploratory).', calc: 'angle(el,wr,idx).' },
  { key: 'wrist_height_m', group: 'Frame', type: 'number', unit: 'm', desc: 'Wrist height above start.', calc: '(startY - wrist.y)*scale.' },
  { key: 'wrist_speed_m_s', group: 'Frame', type: 'number', unit: 'm/s', desc: 'Wrist linear speed.', calc: '|dwrist/dt|*scale.' },
  { key: 'elbow_flex_3d_deg', group: 'Frame', type: 'number', unit: 'deg', desc: '3-D elbow flexion.', calc: 'From world landmarks.' },
  { key: 'obliquity', group: 'Frame', type: 'number', unit: '-', desc: 'View obliquity.', calc: 'hip/shoulder sep / trunk length.' },
  { key: 'sh_x', group: 'Frame', type: 'number', unit: 'px', desc: 'Shoulder x (filtered).', calc: 'Filtered pixel coord.' },
  { key: 'sh_y', group: 'Frame', type: 'number', unit: 'px', desc: 'Shoulder y (filtered).', calc: 'Filtered pixel coord.' },
  { key: 'el_x', group: 'Frame', type: 'number', unit: 'px', desc: 'Elbow x (filtered).', calc: 'Filtered pixel coord.' },
  { key: 'el_y', group: 'Frame', type: 'number', unit: 'px', desc: 'Elbow y (filtered).', calc: 'Filtered pixel coord.' },
  { key: 'wr_x', group: 'Frame', type: 'number', unit: 'px', desc: 'Wrist x (filtered).', calc: 'Filtered pixel coord.' },
  { key: 'wr_y', group: 'Frame', type: 'number', unit: 'px', desc: 'Wrist y (filtered).', calc: 'Filtered pixel coord.' },
  { key: 'hip_x', group: 'Frame', type: 'number', unit: 'px', desc: 'Hip x (filtered).', calc: 'Filtered pixel coord.' },
  { key: 'hip_y', group: 'Frame', type: 'number', unit: 'px', desc: 'Hip y (filtered).', calc: 'Filtered pixel coord.' }
];

// ---------------------------------------------------------------------------
// RAW markers (ZIP only). 17 markers x 7 channels = 119 + t_ms = 120 columns.
// ---------------------------------------------------------------------------
export const MARKERS = [
  { key: 'nose', idx: 0, role: 'Frame-fit; head-in-frame check' },
  { key: 'l_sh', idx: 11, role: 'Left shoulder: upper-arm origin, trunk top, scale' },
  { key: 'r_sh', idx: 12, role: 'Right shoulder: upper-arm origin, trunk top, scale' },
  { key: 'l_el', idx: 13, role: 'Left elbow: primary joint' },
  { key: 'r_el', idx: 14, role: 'Right elbow: primary joint' },
  { key: 'l_wr', idx: 15, role: 'Left wrist: forearm end, wrist path/speed' },
  { key: 'r_wr', idx: 16, role: 'Right wrist: forearm end, wrist path/speed' },
  { key: 'l_pinky', idx: 17, role: 'Left pinky: hand orientation' },
  { key: 'r_pinky', idx: 18, role: 'Right pinky: hand orientation' },
  { key: 'l_idx', idx: 19, role: 'Left index: hand orientation (supination proxy)' },
  { key: 'r_idx', idx: 20, role: 'Right index: hand orientation (supination proxy)' },
  { key: 'l_thumb', idx: 21, role: 'Left thumb: supination cue' },
  { key: 'r_thumb', idx: 22, role: 'Right thumb: supination cue' },
  { key: 'l_hip', idx: 23, role: 'Left hip: trunk axis, seated check' },
  { key: 'r_hip', idx: 24, role: 'Right hip: trunk axis, seated check' },
  { key: 'l_kn', idx: 25, role: 'Left knee: seated-posture check' },
  { key: 'r_kn', idx: 26, role: 'Right knee: seated-posture check' }
];

export const RAW_CHANNELS = ['x', 'y', 'z', 'v', 'wx', 'wy', 'wz'];

export function rawHeader() {
  const cols = ['t_ms'];
  for (const m of MARKERS) for (const c of RAW_CHANNELS) cols.push(`${m.key}_${c}`);
  return cols; // 1 + 17*7 = 120
}

export const SCHEMA = { SESSION_FIELDS, REP_FIELDS, FRAME_FIELDS, MARKERS, RAW_CHANNELS };

if (typeof globalThis !== 'undefined') globalThis.AC_SCHEMA = SCHEMA;

export default SCHEMA;

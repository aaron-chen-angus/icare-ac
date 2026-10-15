# AC//LAB — TRON Arm Curl Biomechanics Lab

Browser-based computer-vision implementation of the **Senior Fitness Test (SFT) 30-Second Arm Curl**. Counts reps, runs a biomechanical analysis, shows a live pose skeleton, exports a full data ZIP, and optionally posts numeric results to Google Sheets. Runs entirely on-device in a mobile browser.

> Research / screening instrument — **not a medical device**. 2-D sagittal estimates; thresholds marked `[TUNE]` are unvalidated engineering defaults.

## Quick start
This is a static site — no build step. Because it uses ES modules and the camera, it must be served over **http(s)** (not `file://`).

```powershell
# from the project root, any static server works, e.g. with Node:
npx serve .
# or Python:
python -m http.server 8000
```
Then open `http://localhost:8000/` on a desktop, or deploy to HTTPS for phone testing (camera needs HTTPS).

## Deploy to GitHub Pages
1. Create a public repo `icare-ac`, push these files to `main`.
2. Settings → Pages → Deploy from branch → `main` / root.
3. Visit `https://<user>.github.io/icare-ac/` on your phone.

## Google Sheets setup
1. Create a Google Sheet named **AC Lab Data**.
2. Extensions → Apps Script, paste `apps-script/Code.gs`, save.
3. Deploy → New deployment → **Web app**: *Execute as* **Me**, *Who has access* **Anyone**.
4. Copy the `/exec` URL into `js/config.js` → `sheets.webhookUrl`.
5. Commit and redeploy Pages. The `Sessions`, `Reps` (and optional `Frames`) tabs are created automatically; columns are matched by name and new schema columns append on their own.

When no webhook is set, the consent checkbox is hidden and results are saved locally (download the ZIP). When a webhook **and** consent are present, each attempt auto-uploads on finish (no button click); failures queue to a local outbox and retry when the device comes back online or from the History screen.

## Inputs
Participant ID, age (18–110), sex, height (sets the metre scale), optional body mass, **dominant arm**, **dumbbell weight** (auto-suggested: 2.27 kg women / 3.63 kg men), optional chair height, site/notes, camera (rear/front), pose model (lite/full/heavy). Confirmations: safety, protocol briefed, and (if a webhook is configured) upload consent.

## Flow
`Entry → Camera/Framing → Test (3-2-1 → 30 s) → Processing → Results → History`

- **Framing** shows live readiness chips and one specific guidance message at a time.
- **Practice** (optional 1–2 reps, not scored) precedes the scored trial.
- **Test** runs a 3-2-1-GO countdown, 30 s timer, live rep count, and a 2 s tail for the half-way rule. A 2.5 s ring buffer feeds `preRollS` of pre-roll into the recording.
- **Results** shows the big curl count, QC / norm / ½-rule badges, metric tiles, charts, a per-rep table, QC-flag explanations, and attempt-handling buttons (Try again / Keep previous / Use current / I cannot do this test).

## Metrics
Primary outcome `curls_count` (offline, authoritative) plus live count and the difference. Temporal/fatigue (cycle time, CV, slope, first-vs-last third), ROM (elbow flexion bottom/top, per-rep ROM, decline), velocity (concentric/eccentric peak angular velocity, wrist speed, load work-rate proxy), and form/stability (upper-arm swing, elbow drift, trunk sway, shoulder shrug, forearm inclination). Full field list in [`DATA_DICTIONARY.md`](DATA_DICTIONARY.md).

## Scientific manual — the 30-s Arm Curl
Seated on a straight-back chair without arms, dominant side near the chair edge, weight in the dominant hand (handshake grip), arm hanging perpendicular to the floor. On "go", curl through full ROM (palm turns up) and return to full extension; the upper arm must stay still (no swinging). Score = fully/controlled curls in 30 s; if the forearm is more than halfway up at time-up, it counts (half-way rule). One 30-s trial after 1–2 practice reps. Dominant arm only.

The examiner's manual cues are replaced by CV rules: peak-flexion threshold (full curl), full-extension return, upper-arm-swing and elbow-drift flags, and a trunk-sway flag. Supination is a 2-D exploratory proxy and never gates a count.

## Biomechanics & CV methods
- **Pose:** MediaPipe Pose Landmarker (BlazePose GHUM), VIDEO mode, 1 pose, GPU→CPU fallback, model default `full`.
- **17 markers** recorded (nose, shoulders, elbows, wrists, pinky/index/thumb, hips, knees) × 7 channels.
- **Signal chain:** validity gating → gap interpolation → resample to 30 Hz → zero-lag Butterworth (filtfilt, 8 Hz effective) → metre scale from Winter segment fractions → joint angles → curl progress → rep state machine → metrics → QC → norms.
- **Alignment:** the overlay canvas uses the same intrinsic size as the video and identical `object-fit: cover`, so landmarks align at any screen aspect ratio. Front camera is mirrored for display only; stored data is never mirrored.

## Metric computation
See [`DATA_DICTIONARY.md`](DATA_DICTIONARY.md) §7 for every formula (angles, events, progress, scale, filter, half-way rule, tempo ratio, drift, sway, work-rate proxy).

## Quality control
QC flags are listed in `DATA_DICTIONARY.md` §8 with triggers and whether they block norm eligibility. Blocking flags set `valid_for_norm = FALSE`.

## Norms
Rikli & Jones / Jones & Rikli (2002) middle-50% "average" bands, 3-tier classification, ages 60–94 only, dominant arm, standard weight. **Values are from secondary reproductions and are marked `[VERIFY vs SFT Manual 2nd ed.]`** — confirm against the manual before research use. Ages outside 60–94 get count + metrics with no classification.

## Limitations
2-D sagittal single-camera estimates; no bilateral symmetry; supination not verifiable in 2-D; `[TUNE]` thresholds unvalidated. Validate per Part H (≥ 20 sessions, two manual counters, ICC / Bland–Altman) before any real use.

## Tests
Pure analysis engine with synthetic-motion unit tests.
```powershell
node tests/run.js          # exact counts, fatigue, partial ROM, swing, dropouts, half-way rule, noise, norms, schema completeness
```
No Node? Open `tests/index.html` over http(s) to run the same suite in the browser.

Regenerate the data dictionary after schema changes:
```powershell
node tools/build-dictionary.js
```

## Project structure
```
index.html, manifest.webmanifest
css/styles.css, css/icon.svg
js/{config,schema,i18n,pose-engine,live,analysis,charts,export,app}.js
tests/{run,synth}.js, tests/index.html
tools/build-dictionary.js
apps-script/Code.gs
DATA_DICTIONARY.md
```

## References
Rikli & Jones (1999); Jones & Rikli (2002); Rikli & Jones (2013) SFT Manual 2e; PhenX Toolkit 150202; Winter (2009); Bazarevsky et al. (2020) BlazePose; Needham et al. (2021).

// AC//LAB — pose-engine.js
// Camera + MediaPipe Pose Landmarker + skeleton overlay.
// Emits per-frame landmark records in the shape analysis.js expects:
//   { t(ms), lm:{ key:{x,y,z,v,wx,wy,wz} } }  (pixel coords, y-down)
//
// Alignment rule (Part C #4): the overlay canvas uses the SAME intrinsic size
// as the video (canvas.width = video.videoWidth) and identical object-fit:cover,
// so normalised landmarks map directly to pixel coords without hand-mapping onto
// a differently cropped box. Front camera is mirrored via scaleX(-1) in CSS and
// the drawing flips x only; STORED data is never mirrored.

import { CONFIG } from './config.js';
import { MARKERS } from './schema.js';

const KEY_BY_IDX = {};
for (const m of MARKERS) KEY_BY_IDX[m.idx] = m.key;

// Skeleton connections (MediaPipe indices) we draw.
const CONNECTIONS = [
  [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], // left arm + hand
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], // right arm + hand
  [11, 12], [11, 23], [12, 24], [23, 24],           // trunk
  [23, 25], [24, 26]                                // hips->knees
];

export class PoseEngine {
  constructor(videoEl, canvasEl, cfg = CONFIG) {
    this.video = videoEl;
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.cfg = cfg;
    this.landmarker = null;
    this.stream = null;
    this.running = false;
    this.facing = cfg.camera.facing; // 'rear' | 'front'
    this.delegate = 'GPU';
    this.side = 'right';            // tested-arm side (for highlight)
    this.showLabels = false;
    this.showAll = true;
    this.showArc = true;
    this.onFrame = null;            // callback(record, rawLandmarks, worldLandmarks)
    this.fps = 0;
    this._lastT = 0;
    this._emaFps = 0;
    this._rafId = null;
    this._lastVideoTime = -1;
    this._progress = 0;             // 0..1 for the elbow arc
  }

  async loadModel(onProgress) {
    const V = this.cfg.pose.tasksVisionVersion;
    const mod = await import(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${V}/vision_bundle.mjs`);
    const { FilesetResolver, PoseLandmarker } = mod;
    if (onProgress) onProgress('Loading vision runtime…');
    const fileset = await FilesetResolver.forVisionTasks(this.cfg.pose.wasmBase);
    const modelPath = this.cfg.pose.modelUrls[this.cfg.pose.model] || this.cfg.pose.modelUrls.full;

    const opts = (delegate) => ({
      baseOptions: { modelAssetPath: modelPath, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: this.cfg.pose.minDetectionConfidence,
      minPosePresenceConfidence: this.cfg.pose.minPresenceConfidence,
      minTrackingConfidence: this.cfg.pose.minTrackingConfidence
    });

    if (onProgress) onProgress('Loading pose model…');
    try {
      this.landmarker = await PoseLandmarker.createFromOptions(fileset, opts('GPU'));
      this.delegate = 'GPU';
    } catch (e) {
      if (onProgress) onProgress('GPU unavailable, using CPU…');
      this.landmarker = await PoseLandmarker.createFromOptions(fileset, opts('CPU'));
      this.delegate = 'CPU';
    }
    return this.delegate;
  }

  async startCamera(facing = this.facing) {
    this.facing = facing;
    const facingMode = facing === 'front' ? 'user' : 'environment';
    const tryConstraints = [
      { video: { facingMode, width: { ideal: 720 }, height: { ideal: 1280 }, aspectRatio: { ideal: 9 / 16 }, frameRate: { ideal: 30 } }, audio: false },
      { video: { facingMode, width: { ideal: 720 }, height: { ideal: 1280 }, frameRate: { ideal: 30 } }, audio: false },
      { video: { facingMode }, audio: false }
    ];
    let lastErr;
    for (const c of tryConstraints) {
      try { this.stream = await navigator.mediaDevices.getUserMedia(c); break; }
      catch (e) { lastErr = e; }
    }
    if (!this.stream) throw lastErr || new Error('camera unavailable');
    this.video.srcObject = this.stream;
    this.video.setAttribute('playsinline', '');
    this.video.muted = true;
    await this.video.play();
    this._applyMirror();
    await this._waitForVideo();
    this._syncCanvas();
    return { width: this.video.videoWidth, height: this.video.videoHeight };
  }

  _waitForVideo() {
    return new Promise(res => {
      if (this.video.videoWidth) return res();
      this.video.addEventListener('loadedmetadata', () => res(), { once: true });
    });
  }

  _applyMirror() {
    const t = this.facing === 'front' ? 'scaleX(-1)' : 'none';
    this.video.style.transform = t;
    this.canvas.style.transform = t;
  }

  _syncCanvas() {
    // identical intrinsic size as video -> landmarks map 1:1
    this.canvas.width = this.video.videoWidth || 720;
    this.canvas.height = this.video.videoHeight || 1280;
  }

  setProgress(p) { this._progress = p; }

  start() {
    if (this.running) return;
    this.running = true;
    this._loop();
  }

  _loop() {
    const step = (now) => {
      if (!this.running) return;
      this._detectOnce(now);
      if (this.video.requestVideoFrameCallback) this.video.requestVideoFrameCallback((t) => step(t));
      else this._rafId = requestAnimationFrame(step);
    };
    if (this.video.requestVideoFrameCallback) this.video.requestVideoFrameCallback((t) => step(t));
    else this._rafId = requestAnimationFrame(step);
  }

  _detectOnce(now) {
    try {
      if (!this.landmarker || !this.video.videoWidth) return;
      if (this.video.currentTime === this._lastVideoTime) return;
      this._lastVideoTime = this.video.currentTime;
      if (this.canvas.width !== this.video.videoWidth) this._syncCanvas();

      let tsMs = performance.now();
      // ensure strictly increasing timestamps for the VIDEO mode
      if (tsMs <= this._lastT) tsMs = this._lastT + 1;
      this._lastT = tsMs;

      const result = this.landmarker.detectForVideo(this.video, tsMs);

      // fps EMA
      if (this._prevNow) {
        const inst = 1000 / Math.max(1, (now || performance.now()) - this._prevNow);
        this._emaFps = this._emaFps ? 0.8 * this._emaFps + 0.2 * inst : inst;
        this.fps = this._emaFps;
      }
      this._prevNow = now || performance.now();

      const lms = result.landmarks && result.landmarks[0];
      const worlds = result.worldLandmarks && result.worldLandmarks[0];
      this._draw(lms);

      if (lms && this.onFrame) {
        const rec = this._toRecord(tsMs, lms, worlds);
        this.onFrame(rec, lms, worlds);
      } else if (!lms && this.onFrame) {
        this.onFrame(null, null, null);
      }
    } catch (e) {
      // keep looping; log once
      if (!this._errLogged) { console.warn('pose detect error', e); this._errLogged = true; }
    }
  }

  _toRecord(tsMs, lms, worlds) {
    const W = this.canvas.width, H = this.canvas.height;
    const lm = {};
    for (const m of MARKERS) {
      const p = lms[m.idx];
      const w = worlds && worlds[m.idx];
      if (!p) continue;
      lm[m.key] = {
        x: p.x * W, y: p.y * H, z: (p.z || 0) * W,
        v: p.visibility != null ? p.visibility : 1,
        wx: w ? w.x : null, wy: w ? w.y : null, wz: w ? w.z : null
      };
    }
    return { t: Math.round(tsMs), lm };
  }

  _draw(lms) {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (!lms) return;
    const minV = this.cfg.pose.minPresenceConfidence;

    // determine tested-arm chain indices for highlight
    const armIdx = this.side === 'left' ? [11, 13, 15, 17, 19, 21] : [12, 14, 16, 18, 20, 22];
    const isArm = (i) => armIdx.includes(i);

    // connections
    ctx.lineWidth = Math.max(2, W / 240);
    for (const [a, b] of CONNECTIONS) {
      const pa = lms[a], pb = lms[b];
      if (!pa || !pb) continue;
      const onArm = isArm(a) && isArm(b);
      // non-tested arm = dim blue
      const nonTested = (a >= 11 && a <= 22 && b >= 11 && b <= 22 && !onArm &&
        ((this.side === 'left' && (a === 12 || a === 14 || a === 16)) || (this.side === 'right' && (a === 11 || a === 13 || a === 15))));
      ctx.strokeStyle = onArm ? '#ff6a00' : nonTested ? 'rgba(0,212,255,0.35)' : '#00d4ff';
      ctx.beginPath(); ctx.moveTo(pa.x * W, pa.y * H); ctx.lineTo(pb.x * W, pb.y * H); ctx.stroke();
    }

    // points
    const r = Math.max(3, W / 160);
    for (const m of MARKERS) {
      const p = lms[m.idx]; if (!p) continue;
      if (!this.showAll && !isArm(m.idx) && ![11, 12, 23, 24].includes(m.idx)) continue;
      const low = (p.visibility != null ? p.visibility : 1) < minV;
      const x = p.x * W, y = p.y * H;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      if (low) { ctx.strokeStyle = '#ffd400'; ctx.lineWidth = 2; ctx.stroke(); } // hollow yellow
      else { ctx.fillStyle = isArm(m.idx) ? '#ff6a00' : '#00d4ff'; ctx.fill(); }
      if (this.showLabels) {
        ctx.save();
        if (this.facing === 'front') { ctx.translate(x, 0); ctx.scale(-1, 1); ctx.translate(-x, 0); } // un-flip text
        ctx.fillStyle = '#dfe9ff'; ctx.font = `${Math.round(W / 48)}px Rajdhani, sans-serif`;
        ctx.fillText(m.key, x + r + 2, y);
        ctx.restore();
      }
    }

    // elbow angle arc on the tested elbow
    if (this.showArc) {
      const sh = lms[this.side === 'left' ? 11 : 12];
      const el = lms[this.side === 'left' ? 13 : 14];
      const wr = lms[this.side === 'left' ? 15 : 16];
      if (sh && el && wr) {
        const ex = el.x * W, ey = el.y * H;
        const a1 = Math.atan2(sh.y * H - ey, sh.x * W - ex);
        const a2 = Math.atan2(wr.y * H - ey, wr.x * W - ex);
        ctx.strokeStyle = '#ff6a00'; ctx.lineWidth = Math.max(2, W / 220);
        ctx.beginPath(); ctx.arc(ex, ey, W / 10, Math.min(a1, a2), Math.max(a1, a2)); ctx.stroke();
      }
    }
  }

  // framing readiness helpers (used by framing screen)
  readiness(rec) {
    if (!rec) return { ok: false, msg: 'No person detected — step into frame.' };
    const p = this.side === 'left' ? 'l_' : 'r_';
    const sh = rec.lm[p + 'sh'], el = rec.lm[p + 'el'], wr = rec.lm[p + 'wr'];
    const hip = rec.lm[p + 'hip'], kn = rec.lm[p + 'kn'], nose = rec.lm.nose;
    const minV = this.cfg.readiness.minVisibility;
    const vis = (o) => o && o.v >= minV;
    if (!(vis(sh) && vis(el) && vis(wr))) return { ok: false, msg: 'Tested-arm shoulder, elbow and wrist not clearly visible.' };
    if (!(nose && hip && kn)) return { ok: false, msg: 'Head to knees must be in frame.' };
    // obliquity
    const osh = rec.lm[(this.side === 'left' ? 'r_' : 'l_') + 'sh'];
    if (sh && osh && hip) {
      const sep = Math.abs(sh.x - osh.x);
      const trunk = Math.hypot(sh.x - hip.x, sh.y - hip.y) || 1;
      if (sep / trunk > this.cfg.readiness.obliquity) return { ok: false, msg: 'Turn so the tested-arm side faces the camera.' };
    }
    // arm hanging: elbow flexion low
    const flex = 180 - angleAt(sh, el, wr);
    if (flex > this.cfg.calibration.startMaxElbowFlexDeg) return { ok: false, msg: 'Let the arm hang straight down to start.' };
    return { ok: true, msg: 'READY' };
  }

  elbowFlex(rec) {
    if (!rec) return NaN;
    const p = this.side === 'left' ? 'l_' : 'r_';
    const sh = rec.lm[p + 'sh'], el = rec.lm[p + 'el'], wr = rec.lm[p + 'wr'];
    if (!sh || !el || !wr) return NaN;
    return 180 - angleAt(sh, el, wr);
  }

  detectSide(rec) {
    if (!rec) return this.side;
    const l = rec.lm.l_el, r = rec.lm.r_el;
    const lw = rec.lm.l_wr, rw = rec.lm.r_wr;
    const lv = (l ? l.v : 0) + (lw ? lw.v : 0);
    const rv = (r ? r.v : 0) + (rw ? rw.v : 0);
    return lv >= rv ? 'left' : 'right';
  }

  stop() {
    this.running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = null;
  }

  releaseCamera() {
    this.stop();
    if (this.stream) { for (const t of this.stream.getTracks()) t.stop(); this.stream = null; }
    if (this.video) this.video.srcObject = null;
  }

  async flipCamera() {
    const next = this.facing === 'front' ? 'rear' : 'front';
    this.releaseCamera();
    await this.startCamera(next);
    if (this.running) { /* loop still scheduled */ }
  }
}

function angleAt(a, b, c) {
  const v1x = a.x - b.x, v1y = a.y - b.y, v2x = c.x - b.x, v2y = c.y - b.y;
  const dot = v1x * v2x + v1y * v2y;
  const m1 = Math.hypot(v1x, v1y), m2 = Math.hypot(v2x, v2y);
  if (!m1 || !m2) return NaN;
  return Math.acos(Math.max(-1, Math.min(1, dot / (m1 * m2)))) * 180 / Math.PI;
}

export default PoseEngine;
if (typeof globalThis !== 'undefined') globalThis.PoseEngine = PoseEngine;

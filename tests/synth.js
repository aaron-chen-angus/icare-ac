// AC//LAB — tests/synth.js
// Synthetic arm-curl motion generator. Produces frames in the same shape the
// pose engine emits: { t(ms), lm:{ key:{x,y,z,v,wx,wy,wz} } }.
//
// We model a seated person side-on. The shoulder, hip, knee are fixed. The
// elbow sits below the shoulder; the forearm rotates about the elbow so the
// wrist swings up toward the shoulder as the elbow flexes. We drive the elbow
// flexion angle e(t) directly and reconstruct wrist position from it.

const DEG = Math.PI / 180;

// Default geometry in pixels (720x1280 portrait-ish framing).
const GEO = {
  shoulder: { x: 360, y: 400 },
  hip: { x: 360, y: 720 },
  knee: { x: 360, y: 980 },
  upperArmLen: 150,   // shoulder -> elbow
  forearmLen: 130     // elbow -> wrist
};

// Build frames for a flexion-angle profile e(t) [degrees], sampled at fps.
// opts: { fps, durationS, preRollS, tailS, side('right'|'left'),
//         noisePx, swingDeg, dropouts:[{startS,endS}], visibility }
export function framesFromFlexion(eOfT, opts = {}) {
  const fps = opts.fps ?? 30;
  const preRollS = opts.preRollS ?? 1;
  const durationS = opts.durationS ?? 30;
  const tailS = opts.tailS ?? 2;
  const totalS = preRollS + durationS + tailS;
  const side = opts.side ?? 'right';
  const noise = opts.noisePx ?? 0;
  const vis = opts.visibility ?? 0.95;
  const dropouts = opts.dropouts ?? [];
  const swingDeg = opts.swingDeg ?? 0;
  const p = side === 'left' ? 'l_' : 'r_';
  const q = side === 'left' ? 'r_' : 'l_';

  const n = Math.round(totalS * fps);
  const frames = [];
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed / 0x7fffffff) * 2 - 1; };

  for (let i = 0; i < n; i++) {
    const tS = i / fps;           // from capture start
    const tGo = tS - preRollS;    // from GO
    let e = eOfT(tGo);            // elbow flexion deg (0 = straight)
    e = Math.max(0, Math.min(160, e));

    // upper-arm orientation: hangs straight down (pointing +y). Optional swing
    // makes the upper arm rock forward/back over the cycle.
    const swing = swingDeg ? swingDeg * Math.sin(tGo * 1.0) * DEG : 0;
    const sh = { ...GEO.shoulder };
    const el = {
      x: sh.x + GEO.upperArmLen * Math.sin(swing),
      y: sh.y + GEO.upperArmLen * Math.cos(swing)
    };
    // forearm direction: at e=0 points same as upper arm (down). As e grows the
    // forearm rotates toward the shoulder (wrist comes up and in).
    const uaAngle = Math.atan2(el.y - sh.y, el.x - sh.x); // pointing down
    const faAngle = uaAngle - e * DEG * (side === 'right' ? 1 : -1);
    const wr = {
      x: el.x + GEO.forearmLen * Math.cos(faAngle),
      y: el.y + GEO.forearmLen * Math.sin(faAngle)
    };
    // hand points roughly along forearm
    const idx = { x: wr.x + 20 * Math.cos(faAngle), y: wr.y + 20 * Math.sin(faAngle) };
    const pinky = { x: wr.x + 18 * Math.cos(faAngle + 0.3), y: wr.y + 18 * Math.sin(faAngle + 0.3) };
    const thumb = { x: wr.x + 16 * Math.cos(faAngle - 0.3), y: wr.y + 16 * Math.sin(faAngle - 0.3) };

    const nz = () => (noise ? rnd() * noise : 0);
    let v = vis;
    for (const d of dropouts) if (tS >= d.startS && tS <= d.endS) v = 0.1;

    const lm = {};
    const set = (key, pt, vv = v) => {
      lm[key] = {
        x: pt.x + nz(), y: pt.y + nz(), z: 0, v: vv,
        wx: (pt.x - sh.x) / 1000, wy: (pt.y - sh.y) / 1000, wz: 0
      };
    };
    lm.nose = { x: sh.x, y: sh.y - 120, z: 0, v: 0.9, wx: 0, wy: -0.12, wz: 0 };
    // tested side
    set(p + 'sh', sh, 0.95);
    set(p + 'el', el);
    set(p + 'wr', wr);
    set(p + 'idx', idx);
    set(p + 'pinky', pinky);
    set(p + 'thumb', thumb);
    set(p + 'hip', GEO.hip, 0.95);
    set(p + 'kn', GEO.knee, 0.9);
    // far side (lower visibility, offset so obliquity stays low ~ side-on)
    const off = 8;
    set(q + 'sh', { x: sh.x + off, y: sh.y }, 0.4);
    set(q + 'el', { x: el.x + off, y: el.y }, 0.3);
    set(q + 'wr', { x: wr.x + off, y: wr.y }, 0.3);
    set(q + 'idx', { x: idx.x + off, y: idx.y }, 0.3);
    set(q + 'pinky', { x: pinky.x + off, y: pinky.y }, 0.3);
    set(q + 'thumb', { x: thumb.x + off, y: thumb.y }, 0.3);
    set(q + 'hip', { x: GEO.hip.x + off, y: GEO.hip.y }, 0.4);
    set(q + 'kn', { x: GEO.knee.x + off, y: GEO.knee.y }, 0.4);

    frames.push({ t: Math.round(tS * 1000), lm });
  }
  return frames;
}

// A clean curl train: `reps` full curls over the window with given period.
// profile: e goes 10 -> topDeg -> 10 each cycle. If pace varies, periods ramp.
export function curlTrain({ reps = 10, topDeg = 145, bottomDeg = 10, durationS = 30,
  startDelayS = 0.5, fatigue = 0, partialReps = 0, partialTopDeg = 60,
  halfAtEnd = false } = {}) {
  // Build per-rep durations. fatigue>0 lengthens later reps.
  const periods = [];
  const base = (durationS - startDelayS) / reps;
  for (let r = 0; r < reps; r++) {
    const f = 1 + fatigue * (r / Math.max(1, reps - 1));
    periods.push(base * f);
  }
  // normalise so total fits
  const sum = periods.reduce((a, b) => a + b, 0);
  const scale = (durationS - startDelayS) / sum;
  for (let r = 0; r < periods.length; r++) periods[r] *= scale;

  // rep start times
  const starts = [];
  let tt = startDelayS;
  for (let r = 0; r < reps; r++) { starts.push(tt); tt += periods[r]; }

  // partial reps appended as extra small bumps near the end (not counted)
  const partials = [];
  for (let r = 0; r < partialReps; r++) {
    partials.push({ start: startDelayS + (durationS - startDelayS) * (0.3 + 0.1 * r), period: 1.2, top: partialTopDeg });
  }

  // optional half-way rep straddling the 30 s boundary
  const halfRep = halfAtEnd ? { start: durationS - 0.3, period: 1.4, top: topDeg } : null;

  return (tGo) => {
    if (tGo < 0) return bottomDeg; // pre-roll: arm hanging
    let e = bottomDeg;
    const bump = (start, period, top) => {
      const phase = (tGo - start) / period;
      if (phase < 0 || phase > 1) return 0;
      // raised cosine 0..1..0
      const s = 0.5 - 0.5 * Math.cos(2 * Math.PI * phase);
      return (top - bottomDeg) * s;
    };
    for (let r = 0; r < reps; r++) e = Math.max(e, bottomDeg + bump(starts[r], periods[r], topDeg));
    for (const pr of partials) e = Math.max(e, bottomDeg + bump(pr.start, pr.period, pr.top));
    if (halfRep) {
      // only rising half within tail -> peak ~ half way then counts via half rule
      const phase = (tGo - halfRep.start) / halfRep.period;
      if (phase >= 0 && phase <= 0.5) {
        const s = Math.sin(Math.PI * phase); // rises to 1 at phase .5
        e = Math.max(e, bottomDeg + (topDeg - bottomDeg) * 0.6 * s);
      }
    }
    return e;
  };
}

export const GEOMETRY = GEO;
export default { framesFromFlexion, curlTrain, GEOMETRY };

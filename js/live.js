// AC//LAB — live.js
// Causal (real-time) rep counter for the on-screen live count. The offline
// analysis.js count is authoritative; this is a best-effort live estimate.
//
// Approach: track a running min/max of elbow flexion to normalise progress
// before calibration is known, smooth with an EMA, and run a simple
// top/bottom state machine with hysteresis. Only reps whose top occurs within
// the 0..durationS window are counted.

import { CONFIG } from './config.js';

export class LiveCounter {
  constructor(cfg = CONFIG) {
    this.cfg = cfg;
    this.reset();
  }

  reset() {
    this.count = 0;
    this.ema = null;
    this.minE = Infinity;
    this.maxE = -Infinity;
    this.state = 'bottom'; // 'bottom' | 'top'
    this.lastRepTime = -Infinity;
    this.onRep = null; // callback(count)
  }

  // elbowFlexDeg: 180 - angle(sh,el,wr); tSec: seconds from GO (may be negative
  // during pre-roll). counts only while 0 <= tSec <= durationS.
  update(elbowFlexDeg, tSec) {
    if (!isFinite(elbowFlexDeg)) return this.count;
    const a = this.cfg.live.emaAlpha;
    this.ema = this.ema == null ? elbowFlexDeg : a * elbowFlexDeg + (1 - a) * this.ema;

    // adapt running range (only expand; slow decay keeps it responsive)
    this.minE = Math.min(this.minE, this.ema);
    this.maxE = Math.max(this.maxE, this.ema);
    const range = this.maxE - this.minE;
    if (range < 1e-3) return this.count;

    const p = (this.ema - this.minE) / range; // 0..1 progress estimate

    const inWindow = tSec >= 0 && tSec <= this.cfg.protocol.durationS;

    if (this.state === 'bottom') {
      if (p >= this.cfg.live.curlAt) this.state = 'top';
    } else { // top
      if (p <= this.cfg.live.extendAt) {
        this.state = 'bottom';
        // a full top->bottom cycle completed; count it if the top was in-window.
        if (inWindow || tSec < this.cfg.protocol.durationS + this.cfg.protocol.tailS) {
          this.count++;
          this.lastRepTime = tSec;
          if (this.onRep) this.onRep(this.count);
        }
      }
    }
    return this.count;
  }
}

export default LiveCounter;
if (typeof globalThis !== 'undefined') globalThis.LiveCounter = LiveCounter;

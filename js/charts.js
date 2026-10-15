// AC//LAB — charts.js
// Dependency-free canvas line charts. Each chart stores its draw spec so it can
// redraw on resize/orientation/visualViewport changes without stacking
// transforms (Part K #26 / Acceptance #22).

const registry = new Set();

function dpr() { return Math.min(window.devicePixelRatio || 1, 2); }

function sizeCanvas(cv) {
  const cssW = cv.clientWidth || cv.parentElement.clientWidth || 320;
  const cssH = Math.round(cssW * (cv.dataset.ratio ? Number(cv.dataset.ratio) : 0.52));
  const r = dpr();
  cv.width = Math.round(cssW * r);
  cv.height = Math.round(cssH * r);
  cv.style.height = cssH + 'px';
  const ctx = cv.getContext('2d');
  ctx.setTransform(r, 0, 0, r, 0, 0); // reset each draw -> no stacking
  return { ctx, w: cssW, h: cssH };
}

const COL = {
  bg: 'rgba(5,7,13,0)', grid: 'rgba(0,212,255,0.12)', axis: 'rgba(143,166,200,0.6)',
  blue: '#00d4ff', orange: '#ff6a00', green: '#4cdf7c', dim: '#8fa6c8', ref: 'rgba(143,166,200,0.4)'
};

const PHASE_FILL = {
  CURL: 'rgba(255,106,0,0.08)', TOP: 'rgba(76,223,124,0.08)',
  LOWER: 'rgba(0,212,255,0.08)', BOTTOM: 'rgba(0,0,0,0)'
};

// spec: { title, series:[{name,color,points:[{x,y}]}], xLabel, yLabel,
//         xMin,xMax,yMin,yMax, refLines:[{y,color,label}],
//         vLines:[{x,color,label}], phases:[{x0,x1,phase}], windowS }
function draw(cv, spec) {
  const { ctx, w, h } = sizeCanvas(cv);
  ctx.clearRect(0, 0, w, h);
  const padL = 44, padR = 12, padT = 22, padB = 26;
  const plotW = w - padL - padR, plotH = h - padT - padB;

  const xs = spec.series.flatMap(s => s.points.map(p => p.x));
  const ys = spec.series.flatMap(s => s.points.map(p => p.y)).filter(Number.isFinite);
  const xMin = spec.xMin ?? Math.min(...xs, 0);
  const xMax = spec.xMax ?? Math.max(...xs, 1);
  let yMin = spec.yMin ?? Math.min(...ys);
  let yMax = spec.yMax ?? Math.max(...ys);
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || yMin === yMax) { yMin = 0; yMax = 1; }
  const pad = (yMax - yMin) * 0.08; yMin -= pad; yMax += pad;

  const X = x => padL + ((x - xMin) / (xMax - xMin || 1)) * plotW;
  const Y = y => padT + (1 - (y - yMin) / (yMax - yMin || 1)) * plotH;

  // phase shading
  if (spec.phases) {
    for (const ph of spec.phases) {
      const c = PHASE_FILL[ph.phase]; if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(X(ph.x0), padT, X(ph.x1) - X(ph.x0), plotH);
    }
  }

  // grid + y ticks
  ctx.strokeStyle = COL.grid; ctx.fillStyle = COL.dim; ctx.lineWidth = 1;
  ctx.font = '10px Orbitron, monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const yv = yMin + (i / ticks) * (yMax - yMin);
    const py = Y(yv);
    ctx.beginPath(); ctx.moveTo(padL, py); ctx.lineTo(w - padR, py); ctx.stroke();
    ctx.fillText(fmt(yv), padL - 5, py);
  }

  // window / vertical lines
  if (spec.windowS != null) {
    ctx.strokeStyle = COL.ref; ctx.setLineDash([4, 4]);
    for (const vx of [0, spec.windowS]) {
      ctx.beginPath(); ctx.moveTo(X(vx), padT); ctx.lineTo(X(vx), padT + plotH); ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  if (spec.vLines) for (const v of spec.vLines) {
    ctx.strokeStyle = v.color || COL.orange; ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(X(v.x), padT); ctx.lineTo(X(v.x), padT + plotH); ctx.stroke();
    ctx.setLineDash([]);
  }

  // reference horizontal lines
  if (spec.refLines) for (const r of spec.refLines) {
    ctx.strokeStyle = r.color || COL.ref; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(padL, Y(r.y)); ctx.lineTo(w - padR, Y(r.y)); ctx.stroke();
    ctx.setLineDash([]);
    if (r.label) { ctx.fillStyle = r.color || COL.dim; ctx.textAlign = 'left'; ctx.fillText(r.label, padL + 3, Y(r.y) - 7); ctx.textAlign = 'right'; }
  }

  // x ticks
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = COL.dim;
  const xticks = 6;
  for (let i = 0; i <= xticks; i++) {
    const xv = xMin + (i / xticks) * (xMax - xMin);
    ctx.fillText(fmt(xv), X(xv), padT + plotH + 5);
  }

  // series
  for (const s of spec.series) {
    ctx.strokeStyle = s.color; ctx.lineWidth = 1.8; ctx.beginPath();
    let started = false;
    for (const p of s.points) {
      if (!Number.isFinite(p.y)) { started = false; continue; }
      const px = X(p.x), py = Y(p.y);
      if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
    }
    ctx.stroke();
    // point markers
    if (s.markers) {
      ctx.fillStyle = s.color;
      for (const p of s.points) {
        if (!Number.isFinite(p.y)) continue;
        ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), 2.6, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  // title + legend
  ctx.fillStyle = COL.orange; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.font = '11px Orbitron, monospace';
  ctx.fillText((spec.title || '').toUpperCase(), padL, 4);
  if (spec.series.length > 1) {
    let lx = padL; const ly = h - 12;
    ctx.font = '9px Orbitron, monospace'; ctx.textBaseline = 'bottom';
    for (const s of spec.series) {
      ctx.fillStyle = s.color; ctx.fillRect(lx, ly, 10, 3);
      ctx.fillText(s.name, lx + 14, ly + 4);
      lx += 16 + ctx.measureText(s.name).width + 10;
    }
  }
}

function fmt(v) {
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(0);
  if (Math.abs(v) >= 1) return v.toFixed(1);
  return v.toFixed(2);
}

// Public: register a chart that redraws on layout changes.
export function line(canvasEl, spec) {
  canvasEl.classList.add('chart');
  const entry = { cv: canvasEl, spec };
  registry.add(entry);
  draw(canvasEl, spec);
  return {
    update(newSpec) { entry.spec = newSpec; draw(canvasEl, newSpec); },
    destroy() { registry.delete(entry); }
  };
}

export function clearAll() { registry.clear(); }

function redrawAll() { for (const e of registry) { if (document.contains(e.cv)) draw(e.cv, e.spec); } }

let raf = null;
function schedule() { if (raf) return; raf = requestAnimationFrame(() => { raf = null; redrawAll(); }); }

if (typeof window !== 'undefined') {
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', schedule);
}

export const Charts = { line, clearAll, redrawAll };
if (typeof globalThis !== 'undefined') globalThis.Charts = Charts;
export default Charts;

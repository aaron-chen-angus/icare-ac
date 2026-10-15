// AC//LAB — export.js
// CSV / ZIP / Google Sheets / outbox / local history.
// CSV: CRLF line endings, TRUE/FALSE booleans, 4-d.p. numeric rounding.
// ZIP: dependency-free STORE-method archive with CRC32.

import { CONFIG } from './config.js';
import { SESSION_FIELDS, REP_FIELDS, FRAME_FIELDS, rawHeader, MARKERS, RAW_CHANNELS } from './schema.js';

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------
function csvCell(v) {
  if (v === true) return 'TRUE';
  if (v === false) return 'FALSE';
  if (v == null) return '';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '';
    return String(Math.round(v * 1e4) / 1e4);
  }
  const s = String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCSV(headerKeys, rows) {
  const lines = [headerKeys.join(',')];
  for (const row of rows) lines.push(headerKeys.map(k => csvCell(row[k])).join(','));
  return lines.join('\r\n') + '\r\n';
}

export function summaryCSV(summary) {
  const keys = SESSION_FIELDS.map(f => f.key);
  return toCSV(keys, [summary]);
}
export function repsCSV(reps) {
  const keys = REP_FIELDS.map(f => f.key);
  return toCSV(keys, reps);
}
export function framesCSV(frames) {
  const keys = FRAME_FIELDS.map(f => f.key);
  return toCSV(keys, frames);
}
export function rawCSV(rawFrames) {
  // rawFrames: [{ t_ms, lm:{key:{x,y,z,v,wx,wy,wz}} }]
  const header = rawHeader();
  const rows = rawFrames.map(fr => {
    const o = { t_ms: fr.t_ms ?? fr.t };
    for (const m of MARKERS) {
      const lm = fr.lm[m.key] || {};
      for (const c of RAW_CHANNELS) o[`${m.key}_${c}`] = lm[channelKey(c)];
    }
    return o;
  });
  return toCSV(header, rows);
}
function channelKey(c) { return ({ x: 'x', y: 'y', z: 'z', v: 'v', wx: 'wx', wy: 'wy', wz: 'wz' })[c]; }

// ---------------------------------------------------------------------------
// CRC32 + STORE-method ZIP (no compression)
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function strBytes(s) { return new TextEncoder().encode(s); }

// Minimal ZIP (store). files: [{name, data(Uint8Array|string)}]
export function makeZip(files) {
  const enc = files.map(f => ({ name: strBytes(f.name), data: typeof f.data === 'string' ? strBytes(f.data) : f.data }));
  const chunks = [];
  const central = [];
  let offset = 0;

  const dosTime = () => { const d = new Date(); return (((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF); };
  const dosDate = () => { const d = new Date(); return ((((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF); };
  const time = dosTime(), date = dosDate();

  for (const f of enc) {
    const crc = crc32(f.data);
    const h = new DataView(new ArrayBuffer(30));
    let p = 0;
    h.setUint32(p, 0x04034b50, true); p += 4;
    h.setUint16(p, 20, true); p += 2;        // version
    h.setUint16(p, 0x0800, true); p += 2;    // flags: UTF-8
    h.setUint16(p, 0, true); p += 2;         // method: store
    h.setUint16(p, time, true); p += 2;
    h.setUint16(p, date, true); p += 2;
    h.setUint32(p, crc, true); p += 4;
    h.setUint32(p, f.data.length, true); p += 4;
    h.setUint32(p, f.data.length, true); p += 4;
    h.setUint16(p, f.name.length, true); p += 2;
    h.setUint16(p, 0, true); p += 2;
    const local = new Uint8Array(h.buffer);
    chunks.push(local, f.name, f.data);
    const localLen = 30 + f.name.length + f.data.length;

    const c = new DataView(new ArrayBuffer(46));
    p = 0;
    c.setUint32(p, 0x02014b50, true); p += 4;
    c.setUint16(p, 20, true); p += 2;
    c.setUint16(p, 20, true); p += 2;
    c.setUint16(p, 0x0800, true); p += 2;
    c.setUint16(p, 0, true); p += 2;
    c.setUint16(p, time, true); p += 2;
    c.setUint16(p, date, true); p += 2;
    c.setUint32(p, crc, true); p += 4;
    c.setUint32(p, f.data.length, true); p += 4;
    c.setUint32(p, f.data.length, true); p += 4;
    c.setUint16(p, f.name.length, true); p += 2;
    c.setUint16(p, 0, true); p += 2;         // extra len
    c.setUint16(p, 0, true); p += 2;         // comment len
    c.setUint16(p, 0, true); p += 2;         // disk
    c.setUint16(p, 0, true); p += 2;         // int attrs
    c.setUint32(p, 0, true); p += 4;         // ext attrs
    c.setUint32(p, offset, true); p += 4;    // local header offset
    central.push(new Uint8Array(c.buffer), f.name);
    offset += localLen;
  }

  const centralStart = offset;
  let centralLen = 0;
  for (const c of central) centralLen += c.length;

  const end = new DataView(new ArrayBuffer(22));
  let p = 0;
  end.setUint32(p, 0x06054b50, true); p += 4;
  end.setUint16(p, 0, true); p += 2;
  end.setUint16(p, 0, true); p += 2;
  end.setUint16(p, enc.length, true); p += 2;
  end.setUint16(p, enc.length, true); p += 2;
  end.setUint32(p, centralLen, true); p += 4;
  end.setUint32(p, centralStart, true); p += 4;
  end.setUint16(p, 0, true); p += 2;

  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  let total = 0; for (const a of all) total += a.length;
  const out = new Uint8Array(total);
  let q = 0; for (const a of all) { out.set(a, q); q += a.length; }
  return out;
}

export function downloadBlob(bytes, filename, type = 'application/zip') {
  const blob = new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

// Build the full ZIP for a result.
export function buildResultZip(result) {
  const { summary, reps, frames, rawFrames } = result;
  const sid = summary.session_id || 'session';
  const files = [
    { name: `${sid}_summary.csv`, data: summaryCSV(summary) },
    { name: `${sid}_reps.csv`, data: repsCSV(reps) },
    { name: `${sid}_frames_analysis.csv`, data: framesCSV(frames) },
    { name: `${sid}_frames_raw.csv`, data: rawCSV(rawFrames || []) },
    { name: `${sid}_session.json`, data: JSON.stringify(sessionJSON(result), null, 2) }
  ];
  return { bytes: makeZip(files), filename: `${sid}.zip` };
}

export function sessionJSON(result) {
  return {
    schemaVersion: CONFIG.app.schemaVersion,
    appVersion: CONFIG.app.version,
    analysisVersion: CONFIG.app.analysisVersion,
    configSnapshot: paramSnapshot(),
    summary: result.summary,
    reps: result.reps
  };
}

export function paramSnapshot() {
  // config snapshot incl. pose confidences; excludes nothing sensitive here.
  const c = JSON.parse(JSON.stringify(CONFIG));
  if (c.sheets) c.sheets = { uploadFrames: c.sheets.uploadFrames, webhookConfigured: !!CONFIG.sheets.webhookUrl };
  return c;
}

// ---------------------------------------------------------------------------
// Google Sheets POST (text/plain JSON) + outbox
// ---------------------------------------------------------------------------
function lsGet(key, def) { try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; } }
function lsSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }

export function buildPayload(result) {
  const out = {
    schemaVersion: CONFIG.app.schemaVersion,
    service: 'ac-lab',
    summary: result.summary,
    reps: result.reps
  };
  if (CONFIG.sheets.uploadFrames) out.frames = result.frames;
  return out;
}

export async function uploadSheets(payload) {
  const url = CONFIG.sheets.webhookUrl;
  if (!url) return { status: 'not_configured' };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    const txt = await res.text();
    let j = {}; try { j = JSON.parse(txt); } catch {}
    if (j.success || j.status === 'success') return { status: 'saved' };
    if (j.duplicate || j.status === 'duplicate') return { status: 'duplicate' };
    throw new Error(txt || ('HTTP ' + res.status));
  } catch (e) {
    // retry once with no-cors (cannot read response -> unconfirmed)
    try {
      await fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
      return { status: 'sent_unconfirmed' };
    } catch (e2) {
      return { status: 'failed', error: String(e2 && e2.message || e2) };
    }
  }
}

export function queueOutbox(payload) {
  const box = lsGet(CONFIG.storage.outboxKey, []);
  box.push({ payload, queuedAt: Date.now() });
  lsSet(CONFIG.storage.outboxKey, box);
}

export async function flushOutbox() {
  let box = lsGet(CONFIG.storage.outboxKey, []);
  if (!box.length || !CONFIG.sheets.webhookUrl) return { sent: 0, remaining: box.length };
  let sent = 0;
  const remain = [];
  for (const item of box) {
    const r = await uploadSheets(item.payload);
    if (r.status === 'saved' || r.status === 'duplicate' || r.status === 'sent_unconfirmed') sent++;
    else remain.push(item);
  }
  lsSet(CONFIG.storage.outboxKey, remain);
  return { sent, remaining: remain.length };
}

export function buildFinalizePayload(visitId, sessionId, selected) {
  return { action: 'finalize', service: 'ac-lab', visit_id: visitId, session_id: sessionId, selected_attempt: selected };
}

// ---------------------------------------------------------------------------
// Local history
// ---------------------------------------------------------------------------
export function saveHistory(summary) {
  const h = lsGet(CONFIG.storage.historyKey, []);
  h.unshift({
    session_id: summary.session_id, visit_id: summary.visit_id,
    participant_id: summary.participant_id, curls_count: summary.curls_count,
    timestamp_utc: summary.timestamp_utc, norm_classification: summary.norm_classification,
    qc_pass: summary.qc_pass, cycle_time_mean: summary.cycle_time_mean,
    final_attempt: summary.final_attempt, selected_attempt: summary.selected_attempt
  });
  while (h.length > CONFIG.storage.historyCap) h.pop();
  lsSet(CONFIG.storage.historyKey, h);
}

export function getHistory() { return lsGet(CONFIG.storage.historyKey, []); }

export function setFinalLocal(visitId, sessionId, selected) {
  const h = getHistory();
  for (const item of h) {
    if (item.visit_id === visitId) {
      item.final_attempt = (item.session_id === sessionId) ? 'TRUE' : 'FALSE';
      if (item.session_id === sessionId) item.selected_attempt = selected;
    }
  }
  lsSet(CONFIG.storage.historyKey, h);
}

export function clearHistory() {
  // keeps unsent outbox
  lsSet(CONFIG.storage.historyKey, []);
}

export function outboxCount() { return lsGet(CONFIG.storage.outboxKey, []).length; }

export const Exporter = {
  toCSV, summaryCSV, repsCSV, framesCSV, rawCSV, makeZip, downloadBlob, buildResultZip,
  sessionJSON, paramSnapshot, buildPayload, uploadSheets, queueOutbox, flushOutbox,
  buildFinalizePayload, saveHistory, getHistory, setFinalLocal, clearHistory, outboxCount
};
if (typeof globalThis !== 'undefined') globalThis.Exporter = Exporter;
export default Exporter;

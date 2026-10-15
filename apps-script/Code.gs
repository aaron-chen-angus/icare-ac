/**
 * AC//LAB — Google Sheets receiver (Apps Script Web App).
 *
 * Deploy: Extensions > Apps Script in the "AC Lab Data" sheet, paste this file,
 * then Deploy > New deployment > Web app:
 *   - Execute as: Me
 *   - Who has access: Anyone
 * Copy the /exec URL into js/config.js -> sheets.webhookUrl.
 *
 * Behaviour:
 *  - POST text/plain JSON { schemaVersion, service, summary:{...}, reps:[...] , frames?:[...] }
 *      -> appends one Sessions row + N Reps rows (+ optional Frames rows).
 *      -> de-dupes Sessions by session_id (returns {status:"duplicate"}).
 *  - POST { action:"finalize", visit_id, session_id, selected_attempt }
 *      -> sets final_attempt=TRUE on the chosen session_id row (by visit_id),
 *         FALSE on the others. Idempotent. Does NOT go through the duplicate path.
 *  - Columns are matched BY NAME; unknown summary keys append new columns.
 *  - GET -> {status:"active", service:"ac-lab"}.
 */

var SESSIONS = 'Sessions';
var REPS = 'Reps';
var FRAMES = 'Frames';

function doGet() {
  return json({ status: 'active', service: 'ac-lab' });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    var body = JSON.parse(e.postData.contents);

    if (body.action === 'finalize') {
      return finalize(body);
    }

    var summary = body.summary || {};
    var reps = body.reps || [];
    var frames = body.frames || [];

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = getSheet(ss, SESSIONS);

    // de-dupe by session_id
    var idCol = headerIndex(sheet, 'session_id');
    if (idCol > 0 && summary.session_id) {
      var existing = findRowByValue(sheet, idCol, summary.session_id);
      if (existing > 0) return json({ status: 'duplicate', session_id: summary.session_id });
    }

    appendRow(sheet, summary);

    if (reps.length) {
      var repSheet = getSheet(ss, REPS);
      for (var i = 0; i < reps.length; i++) appendRow(repSheet, reps[i]);
    }
    if (frames.length) {
      var frSheet = getSheet(ss, FRAMES);
      for (var k = 0; k < frames.length; k++) appendRow(frSheet, frames[k]);
    }

    return json({ status: 'success', session_id: summary.session_id || '' });
  } catch (err) {
    return json({ status: 'error', message: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

function finalize(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getSheet(ss, SESSIONS);
  var visitCol = headerIndex(sheet, 'visit_id');
  var idCol = headerIndex(sheet, 'session_id');
  var finalCol = ensureColumn(sheet, 'final_attempt');
  var selCol = ensureColumn(sheet, 'selected_attempt');
  if (visitCol < 1 || idCol < 1) return json({ status: 'error', message: 'missing visit_id/session_id columns' });

  var last = sheet.getLastRow();
  if (last < 2) return json({ status: 'success', updated: 0 });
  var rng = sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues();
  var updated = 0;
  for (var r = 0; r < rng.length; r++) {
    if (String(rng[r][visitCol - 1]) === String(body.visit_id)) {
      var isChosen = String(rng[r][idCol - 1]) === String(body.session_id);
      sheet.getRange(r + 2, finalCol).setValue(isChosen ? 'TRUE' : 'FALSE');
      if (isChosen) sheet.getRange(r + 2, selCol).setValue(body.selected_attempt || '');
      updated++;
    }
  }
  return json({ status: 'success', updated: updated });
}

/* ---------- helpers ---------- */
function getSheet(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function headerIndex(sheet, key) {
  if (sheet.getLastColumn() === 0) return -1;
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  for (var i = 0; i < headers.length; i++) if (headers[i] === key) return i + 1;
  return -1;
}

function ensureColumn(sheet, key) {
  var idx = headerIndex(sheet, key);
  if (idx > 0) return idx;
  var col = sheet.getLastColumn() + 1;
  if (sheet.getLastColumn() === 0) col = 1;
  sheet.getRange(1, col).setValue(key);
  return col;
}

function appendRow(sheet, obj) {
  // ensure every key has a column (append new columns by name)
  var keys = Object.keys(obj);
  for (var i = 0; i < keys.length; i++) ensureColumn(sheet, keys[i]);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = [];
  for (var j = 0; j < headers.length; j++) {
    var v = obj[headers[j]];
    row.push(v === undefined || v === null ? '' : v);
  }
  sheet.appendRow(row);
}

function findRowByValue(sheet, col, value) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var vals = sheet.getRange(2, col, last - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) if (String(vals[i][0]) === String(value)) return i + 2;
  return -1;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* Drop-in full export + import for a local-first app.
   Adjust STATE_KEYS and the load()/save() hooks to your app's state.
   Wire exportBackup() and triggerImport() to two buttons. */

const BACKUP_PREFIX = 'app-backup-';     // filename prefix
const SCHEMA_BASELINE = {};              // a record with every field at its default (for migration)

// --- download helper (the Android-reliable blob-anchor trick) ---
function downloadFile(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// --- export everything, re-importable ---
function exportBackup() {
  const payload = {
    app: APP_VERSION,                    // stamp the version that wrote the file
    exportedAt: new Date().toISOString(),
    // include ALL persisted state so nothing is lost:
    projects, settings, stats            // <-- replace with your app's state variables
  };
  const date = new Date().toISOString().slice(0, 10);
  downloadFile(`${BACKUP_PREFIX}${date}.json`, JSON.stringify(payload, null, 2));
  toast('Backup exported');
}

// --- optional human-readable export (keep headers & rows in lockstep!) ---
function exportCsv(rows, headerFields) {
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [headerFields.join(',')];
  rows.forEach(r => lines.push(headerFields.map(f => esc(r[f])).join(',')));
  downloadFile(`${BACKUP_PREFIX}${new Date().toISOString().slice(0,10)}.csv`,
               lines.join('\n'), 'text/csv');
}

// --- import (with migration so old backups still load) ---
function migrateRecord(r) {
  const m = { ...SCHEMA_BASELINE, ...r };   // backfill any missing fields with defaults
  // add per-version fixups here, e.g.:
  // if (m.status === undefined) m.status = isPast(m.date) ? 'done' : 'planned';
  return m;
}

function triggerImport() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'application/json';
  input.onchange = async () => {
    const file = input.files[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      // adapt to your shape; migrate arrays of records:
      projects = (data.projects || []).map(migrateRecord);
      settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
      stats    = data.stats || stats;
      save();
      renderAll();                           // re-render everything after import
      toast('Backup imported');
    } catch (e) {
      console.error(e);
      toast('Import failed — not a valid backup file');
    }
  };
  input.click();
}

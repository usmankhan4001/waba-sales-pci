const fs = require('fs');
const path = require('path');
const { withFileLock } = require('../store/withFileLock');
const logger = require('./logger');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

/** Write-to-temp-then-rename so a process killed mid-write (e.g. Dokploy sending SIGTERM
 * during a redeploy) can never leave a truncated/corrupt file - the rename is atomic, so
 * readers only ever see the old complete file or the new complete file, never a partial one. */
function atomicWriteFile(filePath, content) {
  ensureDataDir();
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, content);
  fs.renameSync(tmpPath, filePath);
}

/**
 * JSON-object file store at data/<filename> with atomic writes and corruption-preserving
 * reads. A parse failure archives the bad file as <filename>.corrupt-<timestamp> and logs
 * loudly instead of silently resetting to the default value - so disk corruption shows up
 * as an incident, not as quietly-lost data that looks identical to "nothing saved yet".
 */
function createJsonStore(filename, { defaultValue = {} } = {}) {
  const filePath = path.join(DATA_DIR, filename);

  function read() {
    if (!fs.existsSync(filePath)) return structuredClone(defaultValue);
    const raw = fs.readFileSync(filePath, 'utf8');
    try {
      return JSON.parse(raw);
    } catch (err) {
      const corruptPath = `${filePath}.corrupt-${Date.now()}`;
      try {
        ensureDataDir();
        fs.writeFileSync(corruptPath, raw);
      } catch (archiveErr) {
        logger.error({ err: archiveErr, filePath }, '[fileStore] failed to archive corrupt file');
      }
      logger.error({ err, filePath, corruptPath }, '[fileStore] file is corrupt - archived and reset to default');
      return structuredClone(defaultValue);
    }
  }

  function write(data) {
    atomicWriteFile(filePath, JSON.stringify(data, null, 2));
  }

  /** Read -> mutate in place via fn -> write, serialized per-file so concurrent requests
   * in this process can't lost-update each other. fn's return value is passed through. */
  async function update(fn) {
    return withFileLock(filePath, () => {
      const data = read();
      const result = fn(data);
      write(data);
      return result;
    });
  }

  return { read, write, update, filePath };
}

module.exports = { createJsonStore, atomicWriteFile, ensureDataDir, DATA_DIR };

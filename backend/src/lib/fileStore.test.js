const fs = require('fs');
const path = require('path');
const { createJsonStore, DATA_DIR } = require('./fileStore');

const TEST_FILENAME = 'vitest-fileStore-test.json';
const TEST_FILE_PATH = path.join(DATA_DIR, TEST_FILENAME);

function cleanup() {
  for (const f of fs.existsSync(DATA_DIR) ? fs.readdirSync(DATA_DIR) : []) {
    if (f.startsWith(TEST_FILENAME)) fs.unlinkSync(path.join(DATA_DIR, f));
  }
}

describe('fileStore', () => {
  afterEach(cleanup);

  it('read() returns the default value when the file does not exist', () => {
    const store = createJsonStore(TEST_FILENAME, { defaultValue: { a: 1 } });
    expect(store.read()).toEqual({ a: 1 });
  });

  it('write() then read() round-trips data, and the write is atomic (temp file is gone)', () => {
    const store = createJsonStore(TEST_FILENAME);
    store.write({ hello: 'world' });
    expect(store.read()).toEqual({ hello: 'world' });
    expect(fs.existsSync(TEST_FILE_PATH)).toBe(true);
    const leftoverTmp = fs.readdirSync(DATA_DIR).filter((f) => f.startsWith(`${TEST_FILENAME}.tmp-`));
    expect(leftoverTmp).toEqual([]);
  });

  it('update() reads, mutates, writes, and returns the callback result', async () => {
    const store = createJsonStore(TEST_FILENAME);
    const result = await store.update((data) => {
      data.count = (data.count || 0) + 1;
      return data.count;
    });
    expect(result).toBe(1);
    expect(store.read()).toEqual({ count: 1 });

    const result2 = await store.update((data) => {
      data.count += 1;
      return data.count;
    });
    expect(result2).toBe(2);
  });

  it('archives a corrupt file and resets to default instead of silently discarding it', () => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(TEST_FILE_PATH, '{not valid json');

    const store = createJsonStore(TEST_FILENAME, { defaultValue: {} });
    const value = store.read();

    expect(value).toEqual({});
    const corruptFiles = fs.readdirSync(DATA_DIR).filter((f) => f.startsWith(`${TEST_FILENAME}.corrupt-`));
    expect(corruptFiles.length).toBe(1);
    expect(fs.readFileSync(path.join(DATA_DIR, corruptFiles[0]), 'utf8')).toBe('{not valid json');
  });
});

// Every store here does an unsynchronized read -> mutate -> write on a shared JSON file,
// which is a lost-update race under concurrent requests (two requests both read the same
// stale state and one write clobbers the other). This serializes operations per file within
// this process - sufficient since Dokploy runs a single backend instance.
const chains = new Map();

function withFileLock(key, fn) {
  const prev = chains.get(key) || Promise.resolve();
  const next = prev.then(fn, fn);
  chains.set(
    key,
    next.then(
      () => {},
      () => {}
    )
  );
  return next;
}

module.exports = { withFileLock };

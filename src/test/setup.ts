// IndexedDB shim so the data layer can be exercised in plain Node tests.
import 'fake-indexeddb/auto';

// structuredClone is used by fake-indexeddb's value cloning on some paths.
if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = (v: unknown) => JSON.parse(JSON.stringify(v));
}

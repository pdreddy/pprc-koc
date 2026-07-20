import { ref, update } from 'firebase/database';

const DEFAULT_MAX_UPDATE_BYTES = 450 * 1024;

function estimateJsonBytes(value) {
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch {
    return JSON.stringify(String(value || '')).length;
  }
}

export async function updateInChunks(db, updates, { maxBytes = DEFAULT_MAX_UPDATE_BYTES } = {}) {
  const entries = Object.entries(updates || {});
  if (!entries.length) return;

  let chunk = {};
  let chunkBytes = 2;
  const flush = async () => {
    if (!Object.keys(chunk).length) return;
    await update(ref(db), chunk);
    chunk = {};
    chunkBytes = 2;
  };

  for (const [path, value] of entries) {
    const entry = { [path]: value };
    const entryBytes = estimateJsonBytes(entry);
    if (Object.keys(chunk).length && chunkBytes + entryBytes > maxBytes) await flush();
    chunk[path] = value;
    chunkBytes += entryBytes;
    if (entryBytes > maxBytes) await flush();
  }
  await flush();
}

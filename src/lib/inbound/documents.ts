type StoredDocument = { bytes: Uint8Array; mime: string };

declare global {
  var blinkaDocuments: Map<string, StoredDocument> | undefined;
}

function documents(): Map<string, StoredDocument> {
  globalThis.blinkaDocuments ??= new Map();
  return globalThis.blinkaDocuments;
}

export function rememberDocument(id: string, bytes: Uint8Array, mime: string) {
  documents().set(id, { bytes: bytes.slice(), mime: mime || "application/octet-stream" });
}

export function readDocument(id: string): StoredDocument | null {
  return documents().get(id) ?? null;
}

export function pruneDocuments(ids: Set<string>) {
  for (const id of documents().keys()) {
    if (!ids.has(id)) documents().delete(id);
  }
}

export function clearDocuments() {
  documents().clear();
}

const databaseName = "nava-secure-face-drafts";
const storeName = "drafts";
const ttlMs = 30 * 60 * 1000;

type StoredFaceDraft = {
  id: string;
  cipher: ArrayBuffer;
  iv: ArrayBuffer;
  name: string;
  type: string;
  lastModified: number;
  expiresAt: number;
};

function draftId(userId: string, date: string) {
  return `${userId}:${date}`;
}

function keyStorageName(userId: string) {
  return `nava-face-draft-key:${userId}:v1`;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return window.btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = window.atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function sessionKey(userId: string, create: boolean) {
  const storageKey = keyStorageName(userId);
  const saved = window.sessionStorage.getItem(storageKey);
  if (saved) return crypto.subtle.importKey("raw", base64ToBytes(saved), "AES-GCM", false, ["encrypt", "decrypt"]);
  if (!create) return null;
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  window.sessionStorage.setItem(storageKey, bytesToBase64(raw));
  return key;
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open secure face draft storage."));
  });
}

async function withStore<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      const request = operation(transaction.objectStore(storeName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Secure face draft storage failed."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Secure face draft transaction aborted."));
    });
  } finally {
    database.close();
  }
}

export async function saveSecureFaceDraft(userId: string, date: string, file: File) {
  if (!window.indexedDB || !crypto.subtle) return false;
  const key = await sessionKey(userId, true);
  if (!key) return false;
  const id = draftId(userId, date);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const additionalData = new TextEncoder().encode(`${id}:${file.type}`);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData }, key, await file.arrayBuffer());
  await withStore("readwrite", (store) => store.put({
    id,
    cipher,
    iv: iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer,
    name: file.name,
    type: file.type || "image/jpeg",
    lastModified: file.lastModified,
    expiresAt: Date.now() + ttlMs,
  } satisfies StoredFaceDraft));
  return true;
}

export async function loadSecureFaceDraft(userId: string, date: string) {
  if (!window.indexedDB || !crypto.subtle) return null;
  const id = draftId(userId, date);
  const stored = await withStore<StoredFaceDraft | undefined>("readonly", (store) => store.get(id));
  if (!stored) return null;
  const key = await sessionKey(userId, false);
  if (!key || stored.expiresAt <= Date.now()) {
    await clearSecureFaceDraft(userId, date);
    return null;
  }
  try {
    const additionalData = new TextEncoder().encode(`${id}:${stored.type}`);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(stored.iv), additionalData }, key, stored.cipher);
    return new File([plain], stored.name, { type: stored.type, lastModified: stored.lastModified });
  } catch {
    await clearSecureFaceDraft(userId, date);
    return null;
  }
}

export async function clearSecureFaceDraft(userId: string, date: string) {
  if (!window.indexedDB) return;
  await withStore("readwrite", (store) => store.delete(draftId(userId, date)));
}

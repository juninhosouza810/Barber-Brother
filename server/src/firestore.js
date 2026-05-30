// Camada de acesso ao Firestore (Firebase Admin SDK).
// O app mantém um cache em memória; aqui cuidamos de carregar tudo na inicialização
// e de sincronizar as diferenças (upsert/delete) para as coleções do Firestore.
import admin from 'firebase-admin';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEY_FILE = path.join(__dirname, '..', 'serviceAccountKey.json');

// Coleções cujos itens são objetos com campo `id`.
export const COLLECTIONS = ['clients', 'services', 'barbers', 'availability', 'blocks', 'appointments', 'notifications'];
const META_COL = 'meta';
const SETTINGS_DOC = 'settings';
const BATCH_LIMIT = 450; // limite seguro abaixo dos 500 do Firestore

let fsdb = null;
let available = false;

export function isAvailable() {
  return available;
}

export function initFirestore() {
  if (fsdb) return true;
  if (!fs.existsSync(KEY_FILE)) {
    console.warn('  ⚠️  serviceAccountKey.json não encontrado — Firestore desativado (usando JSON local).');
    return false;
  }
  try {
    const cred = JSON.parse(fs.readFileSync(KEY_FILE, 'utf-8'));
    admin.initializeApp({ credential: admin.credential.cert(cred), projectId: cred.project_id });
    fsdb = admin.firestore();
    fsdb.settings({ ignoreUndefinedProperties: true });
    available = true;
    return true;
  } catch (e) {
    console.error('  ⚠️  Falha ao iniciar o Firestore:', e.message);
    return false;
  }
}

/** Já existe estado persistido? (o doc de settings é o marcador de inicialização) */
export async function isInitialized() {
  if (!fsdb) return false;
  const snap = await fsdb.collection(META_COL).doc(SETTINGS_DOC).get();
  return snap.exists;
}

/** Lê todas as coleções + settings no formato do cache da aplicação. */
export async function loadAll() {
  if (!fsdb) return null;
  const data = {};
  for (const col of COLLECTIONS) {
    const snap = await fsdb.collection(col).get();
    data[col] = snap.docs.map((d) => d.data());
  }
  const settingsSnap = await fsdb.collection(META_COL).doc(SETTINGS_DOC).get();
  data.settings = settingsSnap.exists ? settingsSnap.data() : null;
  return data;
}

/** Grava o estado inteiro (usado no seed inicial). */
export async function writeAll(cache) {
  if (!fsdb) return;
  for (const col of COLLECTIONS) {
    await commitChunks((cache[col] || []).map((item) => ({ type: 'set', ref: fsdb.collection(col).doc(String(item.id)), data: item })));
  }
  await fsdb.collection(META_COL).doc(SETTINGS_DOC).set(cache.settings || {});
}

/**
 * Sincroniza as diferenças entre o cache atual e o último estado persistido.
 * Faz upsert dos itens novos/alterados e delete dos removidos.
 * @returns número de operações aplicadas.
 */
export async function syncDiff(cache, prev) {
  if (!fsdb) return 0;
  const ops = [];

  for (const col of COLLECTIONS) {
    const curr = new Map((cache[col] || []).map((x) => [String(x.id), x]));
    const old = new Map(((prev && prev[col]) || []).map((x) => [String(x.id), x]));

    for (const [id, item] of curr) {
      const before = old.get(id);
      if (!before || JSON.stringify(before) !== JSON.stringify(item)) {
        ops.push({ type: 'set', ref: fsdb.collection(col).doc(id), data: item });
      }
    }
    for (const id of old.keys()) {
      if (!curr.has(id)) ops.push({ type: 'delete', ref: fsdb.collection(col).doc(id) });
    }
  }

  if (!prev || JSON.stringify(prev.settings) !== JSON.stringify(cache.settings)) {
    ops.push({ type: 'set', ref: fsdb.collection(META_COL).doc(SETTINGS_DOC), data: cache.settings || {} });
  }

  await commitChunks(ops);
  return ops.length;
}

async function commitChunks(ops) {
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = fsdb.batch();
    for (const op of ops.slice(i, i + BATCH_LIMIT)) {
      if (op.type === 'delete') batch.delete(op.ref);
      else batch.set(op.ref, op.data);
    }
    await batch.commit();
  }
}

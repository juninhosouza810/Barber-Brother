import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { initFirestore, isAvailable, isInitialized, loadAll, writeAll, syncDiff } from './firestore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

export const uid = () => randomUUID().slice(0, 8);

// Coleções de dados (cada documento carrega um campo shopId).
// `shops` guarda as configurações de cada barbearia (doc id = shopId).
const ARRAY_KEYS = ['clients', 'services', 'barbers', 'availability', 'blocks', 'appointments', 'notifications', 'shops'];

// Estado inicial vazio. Cada barbearia é provisionada sob demanda (ver ensureShop).
function emptyState() {
  const out = {};
  for (const k of ARRAY_KEYS) out[k] = [];
  out.settings = {}; // marcador global de inicialização — não usado pelo app
  return out;
}

// Configurações padrão de uma barbearia nova.
function defaultShop(shopId) {
  return {
    id: shopId,
    shopName: 'Minha Barbearia',
    slogan: 'Estilo, precisão e atitude.',
    phone: '',
    address: '',
    slotStep: 15,         // granularidade dos horários (min)
    bufferMin: 0,         // intervalo entre atendimentos (min)
    openTime: '09:00',
    closeTime: '19:00',
    cancelPolicyHours: 2, // cancelar/remarcar com X horas de antecedência
    policies: 'Tolerância de 10 minutos de atraso. Cancelamentos com no mínimo 2h de antecedência.',
  };
}

// Catálogo de serviços de exemplo (editável) para começar rápido.
function seedServices(shopId) {
  const base = [
    { name: 'Corte Masculino', category: 'Cabelo', durationMin: 40, price: 50, description: 'Corte na tesoura ou máquina com acabamento na navalha.' },
    { name: 'Barba Completa', category: 'Barba', durationMin: 30, price: 40, description: 'Toalha quente, modelagem e finalização com produtos premium.' },
    { name: 'Combo Corte + Barba', category: 'Combos', durationMin: 60, price: 80, description: 'O pacote completo do cavalheiro: corte e barba alinhados.' },
    { name: 'Sobrancelha', category: 'Estética', durationMin: 15, price: 20, description: 'Design e limpeza de sobrancelha na navalha.' },
    { name: 'Corte Infantil', category: 'Cabelo', durationMin: 30, price: 40, description: 'Atendimento paciente e divertido para os pequenos.' },
  ];
  return base.map((s) => ({ id: 'svc-' + uid(), shopId, ...s }));
}

let cache = null;
let lastSnapshot = null;   // último estado já refletido no Firestore
let syncTimer = null;
let syncing = false;
let pendingSync = false;

const clone = (x) => JSON.parse(JSON.stringify(x));

// Garante que todas as coleções/objetos esperados existam.
function normalize(c) {
  const out = { ...emptyState(), ...(c || {}) };
  for (const k of ARRAY_KEYS) if (!Array.isArray(out[k])) out[k] = [];
  if (!out.settings || typeof out.settings !== 'object') out.settings = {};
  return out;
}

function loadJSON() {
  if (!fs.existsSync(DB_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function persistJSON() {
  if (!cache) return;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(cache, null, 2), 'utf-8');
}

// Carrega o cache de forma síncrona (JSON local ou vazio) caso ainda não tenha
// sido carregado. Mantém db.get() síncrono mesmo antes do init() assíncrono.
function ensureLoaded() {
  if (cache) return cache;
  cache = normalize(loadJSON() || emptyState());
  return cache;
}

/**
 * Provisiona uma barbearia: na primeira vez que ela acessa, cria o registro em
 * `shops` (configurações padrão) e um catálogo de serviços de exemplo.
 * Idempotente: não faz nada se a barbearia já existe.
 */
function ensureShop(shopId) {
  if (!shopId) return;
  ensureLoaded();
  if (cache.shops.some((s) => s.id === shopId)) return;
  cache.shops.push(defaultShop(shopId));
  cache.services.push(...seedServices(shopId));
  persistJSON();
  scheduleSync();
}

/** Configurações (doc) de uma barbearia. */
function getShop(shopId) {
  ensureLoaded();
  return cache.shops.find((s) => s.id === shopId) || null;
}

/**
 * Inicialização assíncrona: Firestore como fonte primária.
 * Na 1ª vez, grava o estado vazio no Firestore; depois carrega de lá.
 */
async function init() {
  if (initFirestore()) {
    try {
      if (await isInitialized()) {
        cache = normalize(await loadAll());
        console.log('  🔥 Dados carregados do Firestore.');
      } else {
        cache = normalize(loadJSON() || emptyState());
        await writeAll(cache);
        console.log('  🔥 Firestore inicializado.');
      }
      lastSnapshot = clone(cache);
      persistJSON();
      return;
    } catch (e) {
      console.error('  ⚠️  Erro ao acessar o Firestore, usando JSON local:', e.message);
    }
  }
  cache = normalize(loadJSON() || emptyState());
  persistJSON();
}

function scheduleSync() {
  if (!isAvailable()) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(runSync, 400); // coalesce gravações em rajada
}

async function runSync() {
  if (!isAvailable() || !cache) return;
  if (syncing) { pendingSync = true; return; }
  syncing = true;
  const target = clone(cache);
  try {
    const n = await syncDiff(target, lastSnapshot);
    lastSnapshot = target;
    if (n) console.log(`  🔥 Firestore: ${n} alteração(ões) sincronizada(s).`);
  } catch (e) {
    console.error('  ⚠️  Falha ao sincronizar com o Firestore:', e.message);
  } finally {
    syncing = false;
    if (pendingSync) { pendingSync = false; scheduleSync(); }
  }
}

export const db = {
  init,
  ensureShop,
  getShop,
  get() {
    return ensureLoaded();
  },
  save() {
    ensureLoaded();
    persistJSON();     // backup local imediato
    scheduleSync();    // sincroniza com o Firestore (debounce)
  },
  // Restaura uma barbearia ao estado inicial (remove seus dados e re-popula o seed).
  resetShop(shopId) {
    ensureLoaded();
    for (const k of ['clients', 'services', 'barbers', 'availability', 'blocks', 'appointments', 'notifications']) {
      cache[k] = cache[k].filter((x) => x.shopId !== shopId);
    }
    cache.shops = cache.shops.filter((s) => s.id !== shopId);
    ensureShop(shopId);
    persistJSON();
    scheduleSync();
    return getShop(shopId);
  },
  // Força a sincronização pendente (ex.: testes / shutdown).
  async flush() { if (syncTimer) clearTimeout(syncTimer); await runSync(); },
};

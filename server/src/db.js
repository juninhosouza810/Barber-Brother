import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { initFirestore, isAvailable, isInitialized, loadAll, writeAll, syncDiff } from './firestore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

export const uid = () => randomUUID().slice(0, 8);

/**
 * Dados iniciais (seed) da BarberMan.
 * weekday: 0=Dom, 1=Seg, ... 6=Sáb
 */
function seedData() {
  const services = [
    { id: 'svc-corte', name: 'Corte Masculino', category: 'Cabelo', durationMin: 40, price: 50, description: 'Corte na tesoura ou máquina com acabamento na navalha.' },
    { id: 'svc-barba', name: 'Barba Completa', category: 'Barba', durationMin: 30, price: 40, description: 'Toalha quente, modelagem e finalização com produtos premium.' },
    { id: 'svc-combo', name: 'Combo Corte + Barba', category: 'Combos', durationMin: 60, price: 80, description: 'O pacote completo do cavalheiro: corte e barba alinhados.' },
    { id: 'svc-pigment', name: 'Pigmentação', category: 'Estética', durationMin: 45, price: 60, description: 'Disfarce de falhas e definição de contorno com pigmento.' },
    { id: 'svc-sobrancelha', name: 'Sobrancelha', category: 'Estética', durationMin: 15, price: 20, description: 'Design e limpeza de sobrancelha na navalha.' },
    { id: 'svc-platinado', name: 'Platinado / Luzes', category: 'Cabelo', durationMin: 90, price: 150, description: 'Descoloração e tonalização com proteção do fio.' },
    { id: 'svc-infantil', name: 'Corte Infantil', category: 'Cabelo', durationMin: 30, price: 40, description: 'Atendimento paciente e divertido para os pequenos.' },
    { id: 'svc-vip', name: 'Combo VIP', category: 'Combos', durationMin: 90, price: 130, description: 'Corte, barba, sobrancelha e hidratação. Experiência completa.' },
  ];

  const barbers = [
    {
      id: 'brb-rafael',
      name: 'Rafael Lima',
      photo: 'https://images.unsplash.com/photo-1503443207922-dff7d543fd0e?w=400&q=80',
      role: 'Master Barber',
      specialties: ['Corte Masculino', 'Barba Completa', 'Pigmentação'],
      bio: 'Mais de 10 anos de estrada e referência em fade e barba desenhada.',
      rating: 4.9,
    },
    {
      id: 'brb-diego',
      name: 'Diego Souza',
      photo: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=400&q=80',
      role: 'Barber Stylist',
      specialties: ['Platinado / Luzes', 'Corte Masculino', 'Sobrancelha'],
      bio: 'Especialista em colorimetria e cortes modernos.',
      rating: 4.8,
    },
    {
      id: 'brb-marcos',
      name: 'Marcos Antônio',
      photo: 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=400&q=80',
      role: 'Barbeiro Sênior',
      specialties: ['Combo Corte + Barba', 'Corte Infantil', 'Barba Completa'],
      bio: 'Atendimento clássico, navalha afiada e mão firme.',
      rating: 4.9,
    },
  ];

  // Disponibilidade padrão: Seg-Sex 09-19, Sáb 09-17
  const availability = [];
  for (const b of barbers) {
    for (let d = 1; d <= 5; d++) {
      availability.push({ id: uid(), barberId: b.id, weekday: d, startTime: '09:00', endTime: '19:00' });
    }
    availability.push({ id: uid(), barberId: b.id, weekday: 6, startTime: '09:00', endTime: '17:00' });
  }

  const settings = {
    shopName: 'BarberMan',
    slogan: 'Estilo, precisão e atitude.',
    phone: '5511999990000',
    address: 'Rua dos Cavalheiros, 123 - Centro',
    slotStep: 15,          // granularidade dos horários (min)
    bufferMin: 0,          // intervalo entre atendimentos (min)
    openTime: '09:00',
    closeTime: '19:00',
    cancelPolicyHours: 2,  // cancelar/remarcar com X horas de antecedência
    adminPin: '1234',
    policies: 'Tolerância de 10 minutos de atraso. Cancelamentos com no mínimo 2h de antecedência.',
  };

  return { clients: [], services, barbers, availability, blocks: [], appointments: [], notifications: [], settings };
}

const ARRAY_KEYS = ['clients', 'services', 'barbers', 'availability', 'blocks', 'appointments', 'notifications'];

let cache = null;
let lastSnapshot = null;   // último estado já refletido no Firestore
let syncTimer = null;
let syncing = false;
let pendingSync = false;

const clone = (x) => JSON.parse(JSON.stringify(x));

// Garante que todas as coleções/objetos esperados existam.
function normalize(c) {
  const out = { ...seedData(), ...(c || {}) };
  for (const k of ARRAY_KEYS) if (!Array.isArray(out[k])) out[k] = [];
  if (!out.settings || typeof out.settings !== 'object') out.settings = seedData().settings;
  return out;
}

function loadJSON() {
  if (!fs.existsSync(DB_FILE)) return null;
  try {
    const c = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    if (!Array.isArray(c.blocks)) c.blocks = [];
    return c;
  } catch {
    return null;
  }
}

function persistJSON() {
  if (!cache) return;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(cache, null, 2), 'utf-8');
}

// Carrega o cache de forma síncrona (JSON local ou seed) caso ainda não tenha sido
// carregado. Mantém a API db.get() síncrona mesmo antes do init() assíncrono.
function ensureLoaded() {
  if (cache) return cache;
  cache = normalize(loadJSON() || seedData());
  persistJSON();
  return cache;
}

/**
 * Inicialização assíncrona: Firestore como fonte primária.
 * Na 1ª vez popula o Firestore a partir do JSON/seed; depois carrega de lá.
 */
async function init() {
  if (initFirestore()) {
    try {
      if (await isInitialized()) {
        cache = normalize(await loadAll());
        console.log('  🔥 Dados carregados do Firestore.');
      } else {
        cache = normalize(loadJSON() || seedData());
        await writeAll(cache);
        console.log('  🔥 Firestore inicializado com os dados atuais.');
      }
      lastSnapshot = clone(cache);
      persistJSON();
      return;
    } catch (e) {
      console.error('  ⚠️  Erro ao acessar o Firestore, usando JSON local:', e.message);
    }
  }
  // Fallback: somente JSON local.
  cache = normalize(loadJSON() || seedData());
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
  get() {
    return ensureLoaded();
  },
  save() {
    ensureLoaded();
    persistJSON();     // backup local imediato
    scheduleSync();    // sincroniza com o Firestore (debounce)
  },
  reset() {
    cache = normalize(seedData());
    persistJSON();
    scheduleSync();    // o diff remove no Firestore o que saiu do seed
    return cache;
  },
  // Força a sincronização pendente (ex.: testes / shutdown).
  async flush() { if (syncTimer) clearTimeout(syncTimer); await runSync(); },
};

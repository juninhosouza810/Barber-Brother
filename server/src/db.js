import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

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

let cache = null;

function ensureLoaded() {
  if (cache) return cache;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    try {
      cache = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
      // Migração leve: garante coleções novas em bancos antigos.
      if (!Array.isArray(cache.blocks)) cache.blocks = [];
    } catch {
      cache = seedData();
      persist();
    }
  } else {
    cache = seedData();
    persist();
  }
  return cache;
}

function persist() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(cache, null, 2), 'utf-8');
}

export const db = {
  get() {
    return ensureLoaded();
  },
  save() {
    persist();
  },
  reset() {
    cache = seedData();
    persist();
    return cache;
  },
};

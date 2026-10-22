// Utilitários de horário e geração de slots.

export const toMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export const toHHMM = (min) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// Fuso padrão dos salões. O servidor (ex.: Render) roda em UTC, então "agora"
// precisa ser calculado no fuso do salão, não no do servidor.
export const DEFAULT_TZ = 'America/Sao_Paulo';

/** Data (YYYY-MM-DD), minutos do dia e carimbo "relógio de parede" no fuso informado. */
export function nowInTz(tz = DEFAULT_TZ) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date());
  } catch {
    return nowInTz(DEFAULT_TZ); // fuso inválido nas configurações
  }
  const get = (t) => parts.find((p) => p.type === t).value;
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const hhmm = `${get('hour')}:${get('minute')}`;
  return { date, min: toMin(hhmm), stamp: Date.parse(`${date}T${hhmm}:00Z`) };
}

/** Carimbo "relógio de parede" de uma data/hora de agendamento (comparável a nowInTz().stamp). */
export const wallStamp = (date, time) => Date.parse(`${date}T${time}:00Z`);

export const weekdayOf = (dateStr) => new Date(`${dateStr}T00:00:00`).getDay();

// Dois intervalos [aStart,aEnd) e [bStart,bEnd) se sobrepõem?
const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

/**
 * Gera todos os slots de um barbeiro num dia, marcando quais estão livres
 * para um serviço de determinada duração.
 *
 * @returns { slots: [{ time, available, reason }] }
 */
export function generateSlots({ barberId, date, durationMin, availability, appointments, settings, blocks = [] }) {
  const wd = weekdayOf(date);
  const windows = availability.filter((a) => a.barberId === barberId && a.weekday === wd);
  if (windows.length === 0) return { slots: [] };

  const step = settings.slotStep || 15;
  const buffer = settings.bufferMin || 0;

  // Agendamentos ativos do barbeiro no dia.
  const busy = appointments
    .filter((a) => a.barberId === barberId && a.date === date && a.status !== 'cancelado')
    .map((a) => ({ start: toMin(a.time), end: toMin(a.time) + a.durationMin }));

  // Folgas/bloqueios do barbeiro neste dia (dia inteiro ou faixa de horário).
  const blocked = blocks
    .filter((b) => b.barberId === barberId && b.date === date)
    .map((b) => (b.allDay
      ? { start: 0, end: 24 * 60 }
      : { start: toMin(b.startTime), end: toMin(b.endTime) }));

  const now = nowInTz(settings.timezone);
  const isPast = date < now.date;
  const isToday = date === now.date;

  const slots = [];
  for (const w of windows) {
    const wStart = toMin(w.startTime);
    const wEnd = toMin(w.endTime);
    for (let t = wStart; t + durationMin <= wEnd; t += step) {
      const slotEnd = t + durationMin;
      let available = true;
      let reason = null;

      // Não permitir horários no passado.
      if (isPast || (isToday && t <= now.min)) {
        available = false;
        reason = 'passado';
      }

      // Folga/bloqueio definido pelo barbeiro.
      if (available) {
        for (const bl of blocked) {
          if (overlaps(t, slotEnd, bl.start, bl.end)) {
            available = false;
            reason = 'bloqueado';
            break;
          }
        }
      }

      // Bloqueio por conflito com agendamento existente (+ buffer).
      if (available) {
        for (const b of busy) {
          if (overlaps(t - buffer, slotEnd + buffer, b.start, b.end)) {
            available = false;
            reason = 'ocupado';
            break;
          }
        }
      }

      slots.push({ time: toHHMM(t), available, reason });
    }
  }

  // Remove duplicatas de horário (caso janelas se sobreponham), mantendo o melhor estado.
  const map = new Map();
  for (const s of slots) {
    const prev = map.get(s.time);
    if (!prev || (s.available && !prev.available)) map.set(s.time, s);
  }
  return { slots: [...map.values()].sort((a, b) => toMin(a.time) - toMin(b.time)) };
}

/**
 * Valida no servidor se um horário pode ser reservado (fonte da verdade).
 */
export function isSlotFree({ barberId, date, time, durationMin, availability, appointments, settings, blocks = [] }) {
  const { slots } = generateSlots({ barberId, date, durationMin, availability, appointments, settings, blocks });
  const found = slots.find((s) => s.time === time);
  return !!(found && found.available);
}

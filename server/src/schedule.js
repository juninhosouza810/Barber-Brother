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

  const now = new Date();
  const isToday = date === now.toISOString().slice(0, 10);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const slots = [];
  for (const w of windows) {
    const wStart = toMin(w.startTime);
    const wEnd = toMin(w.endTime);
    for (let t = wStart; t + durationMin <= wEnd; t += step) {
      const slotEnd = t + durationMin;
      let available = true;
      let reason = null;

      // Não permitir horários no passado.
      if (isToday && t <= nowMin) {
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

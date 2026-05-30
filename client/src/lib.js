// Helpers de formatação e data.

export const BRL = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const fmtDuration = (min) => {
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${m}` : `${h}h`;
};

export const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const WEEKDAYS_FULL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// Data local YYYY-MM-DD (sem fuso UTC).
export const toISODate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const parseISO = (s) => new Date(`${s}T00:00:00`);

export const fmtDateLong = (iso) => {
  const d = parseISO(iso);
  return `${WEEKDAYS_FULL[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
};

export const fmtDateShort = (iso) => {
  const [y, m, day] = iso.split('-');
  return `${day}/${m}/${y}`;
};

// Próximos N dias a partir de hoje.
export const nextDays = (n = 14) => {
  const out = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = 0; i < n; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push(d);
  }
  return out;
};

export const initials = (name = '') =>
  name.split(' ').filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase();

export const phoneMask = (v = '') => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

// Gera horários "HH:MM" de start até end (inclusive), de `step` em `step` minutos.
export const buildTimes = (startTime, endTime, step = 15) => {
  const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  const pad = (n) => String(n).padStart(2, '0');
  const out = [];
  for (let t = toMin(startTime); t <= toMin(endTime); t += step) {
    out.push(`${pad(Math.floor(t / 60))}:${pad(t % 60)}`);
  }
  return out;
};

import { createContext, useContext, useState, useCallback } from 'react';
import { X, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { initials, toISODate, parseISO, WEEKDAYS, MONTHS_FULL } from './lib.js';

// ---------------- Toast ----------------
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const show = useCallback((msg, type = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && <div className={`toast ${toast.type === 'err' ? 'err' : ''}`}>{toast.msg}</div>}
    </ToastCtx.Provider>
  );
}

// ---------------- Avatar ----------------
export function Avatar({ name, photo, className = '' }) {
  const [err, setErr] = useState(false);
  if (photo && !err) {
    return <img className={`avatar ${className}`} src={photo} alt={name} onError={() => setErr(true)} loading="lazy" />;
  }
  return <div className={`avatar-fallback ${className}`}>{initials(name)}</div>;
}

// ---------------- Loading ----------------
export const Loading = () => <div className="spinner" />;

// ---------------- Badge ----------------
export const StatusBadge = ({ status }) => <span className={`badge ${status}`}>{status}</span>;

// ---------------- Modal ----------------
export function Modal({ title, onClose, children }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn-ghost btn btn-sm" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------- Empty state ----------------
export function Empty({ icon: Icon, title, hint }) {
  return (
    <div className="empty">
      {Icon && <Icon size={42} />}
      <h3 style={{ marginBottom: 6 }}>{title}</h3>
      {hint && <p>{hint}</p>}
    </div>
  );
}

export { Check };

// ---------------- Marca do salão ----------------
// Mostra a logo personalizada do assinante (ou a inicial) + o nome do salão.
export const DEFAULT_SHOP_NAME = 'Meu Salão';

export function BrandMark({ logo, name, size = 38 }) {
  const [err, setErr] = useState(false);
  const style = { width: size, height: size, fontSize: size * 0.5 };
  if (logo && !err) {
    return <img className="brand-logo" src={logo} alt={name || DEFAULT_SHOP_NAME} style={style} onError={() => setErr(true)} />;
  }
  return <span className="brand-mark" style={style}>{(name || DEFAULT_SHOP_NAME).trim().charAt(0).toUpperCase()}</span>;
}

export function BrandName({ name, style }) {
  if (name && name !== DEFAULT_SHOP_NAME) return <span className="brand-name" style={style}>{name}</span>;
  return <span className="brand-name" style={style}>Meu <b>Salão</b></span>;
}

// ---------------- Calendário mensal ----------------
// Mostra o mês inteiro com navegação entre meses (de hoje até `maxMonths` à frente).
// `isDisabled(date, iso)` devolve false (livre), true ou um texto (motivo, vira tooltip).
export function MonthCalendar({ value, onChange, isDisabled, maxMonths = 12 }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const last = new Date(today.getFullYear(), today.getMonth() + maxMonths - 1, 1);
  const [view, setView] = useState(() => {
    const base = value ? parseISO(value) : today;
    const start = new Date(base.getFullYear(), base.getMonth(), 1);
    return start < first ? first : start > last ? last : start;
  });

  const y = view.getFullYear();
  const m = view.getMonth();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const lead = new Date(y, m, 1).getDay();
  const todayIso = toISODate(today);
  const go = (delta) => setView(new Date(y, m + delta, 1));

  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(<span key={`e${i}`} className="cal-day empty" />);
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(y, m, day);
    const iso = toISODate(d);
    const reason = d < today ? 'Data passada' : (isDisabled ? isDisabled(d, iso) : false);
    const off = !!reason;
    cells.push(
      <button
        key={iso}
        type="button"
        className={`cal-day ${value === iso ? 'sel' : ''} ${off ? 'disabled' : ''} ${iso === todayIso ? 'today' : ''}`}
        disabled={off}
        title={typeof reason === 'string' ? reason : ''}
        onClick={() => onChange(iso)}
      >
        <b>{day}</b>
      </button>
    );
  }

  return (
    <div className="month-cal">
      <div className="cal-head">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => go(-1)} disabled={view <= first} aria-label="Mês anterior"><ChevronLeft size={16} /></button>
        <b>{MONTHS_FULL[m]} {y}</b>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => go(1)} disabled={view >= last} aria-label="Próximo mês"><ChevronRight size={16} /></button>
      </div>
      <div className="cal-days cal-week">
        {WEEKDAYS.map((w) => <small key={w}>{w}</small>)}
      </div>
      <div className="cal-days">{cells}</div>
    </div>
  );
}

// ---------------- Campos de formulário ----------------
export function Field({ label, value, onChange, type = 'text', textarea, placeholder }) {
  return (
    <div className="field">
      <label>{label}</label>
      {textarea
        ? <textarea value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
        : <input type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />}
    </div>
  );
}

export function Select({ label, value, onChange, options }) {
  return (
    <div className="field" style={{ margin: 0 }}>
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
      </select>
    </div>
  );
}

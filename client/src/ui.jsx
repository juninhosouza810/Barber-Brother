import { createContext, useContext, useState, useCallback } from 'react';
import { X, Check } from 'lucide-react';
import { initials } from './lib.js';

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

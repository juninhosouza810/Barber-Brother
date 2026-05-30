import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Search, CalendarClock, Clock, Scissors, UserRound, XCircle, RefreshCw, CalendarPlus, Phone,
} from 'lucide-react';
import { api } from '../api.js';
import { BRL, fmtDateLong, fmtDuration, nextDays, toISODate, WEEKDAYS, phoneMask } from '../lib.js';
import { Avatar, StatusBadge, Loading, Empty, Modal, useToast } from '../ui.jsx';

export default function MyBookings() {
  const toast = useToast();
  const [phone, setPhone] = useState(localStorage.getItem('barberman_phone') || '');
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState([]);
  const [reschedule, setReschedule] = useState(null);

  const load = useCallback(async (p) => {
    const digits = (p ?? phone).replace(/\D/g, '');
    if (digits.length < 10) { toast('Informe um telefone válido.', 'err'); return; }
    setLoading(true);
    setSearched(true);
    try {
      const data = await api.appointments({ phone: digits });
      setList(data);
      localStorage.setItem('barberman_phone', phone);
    } catch (e) { toast(e.message, 'err'); }
    finally { setLoading(false); }
  }, [phone, toast]);

  useEffect(() => {
    const saved = localStorage.getItem('barberman_phone');
    if (saved) load(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cancel(appt) {
    if (!confirm(`Cancelar o agendamento de ${appt.serviceName} em ${fmtDateLong(appt.date)} às ${appt.time}?`)) return;
    try {
      await api.updateAppointment(appt.id, { status: 'cancelado' });
      toast('Agendamento cancelado.');
      load();
    } catch (e) { toast(e.message, 'err'); }
  }

  const upcoming = list.filter((a) => a.status !== 'cancelado');
  const history = list.filter((a) => a.status === 'cancelado');

  return (
    <div className="container block" style={{ maxWidth: 640 }}>
      <div className="section-head">
        <p className="eyebrow">Área do cliente</p>
        <h2>Meus agendamentos</h2>
        <p className="muted">Consulte pelo telefone usado no agendamento.</p>
      </div>

      <div className="card mb">
        <div className="row" style={{ gap: 10 }}>
          <div className="field" style={{ flex: 1, margin: 0 }}>
            <input
              value={phone}
              onChange={(e) => setPhone(phoneMask(e.target.value))}
              placeholder="(11) 99999-9999"
              inputMode="numeric"
              onKeyDown={(e) => e.key === 'Enter' && load()}
            />
          </div>
          <button className="btn btn-gold" onClick={() => load()}><Search size={17} /> Buscar</button>
        </div>
      </div>

      {loading ? <Loading /> : !searched ? (
        <Empty icon={Phone} title="Digite seu telefone" hint="Mostraremos seus horários marcados." />
      ) : list.length === 0 ? (
        <Empty icon={CalendarClock} title="Nenhum agendamento encontrado" hint="Que tal marcar um horário agora?" />
      ) : (
        <>
          {upcoming.length > 0 && (
            <>
              <h3 className="display mb" style={{ fontSize: '1.4rem' }}>Próximos</h3>
              <div className="grid">{upcoming.map((a) => (
                <ApptCard key={a.id} a={a} onCancel={cancel} onReschedule={() => setReschedule(a)} />
              ))}</div>
            </>
          )}
          {history.length > 0 && (
            <>
              <h3 className="display mb mt" style={{ fontSize: '1.4rem' }}>Cancelados</h3>
              <div className="grid">{history.map((a) => <ApptCard key={a.id} a={a} />)}</div>
            </>
          )}
        </>
      )}

      <Link to="/agendar" className="btn btn-gold btn-block mt"><CalendarPlus size={18} /> Novo agendamento</Link>

      {reschedule && (
        <RescheduleModal
          appt={reschedule}
          onClose={() => setReschedule(null)}
          onDone={() => { setReschedule(null); load(); }}
        />
      )}
    </div>
  );
}

function ApptCard({ a, onCancel, onReschedule }) {
  const cancelled = a.status === 'cancelado';
  return (
    <div className="card" style={{ opacity: cancelled ? 0.7 : 1 }}>
      <div className="between mb">
        <span className="chip">{a.serviceName}</span>
        <StatusBadge status={a.status} />
      </div>
      <div className="row" style={{ gap: 12, marginBottom: 10 }}>
        <Avatar name={a.barberName} photo={a.barberPhoto} className="avatar-sm" />
        <div>
          <b>{fmtDateLong(a.date)}</b>
          <div className="muted row" style={{ fontSize: '0.85rem', gap: 12 }}>
            <span className="row" style={{ gap: 4 }}><Clock size={14} /> {a.time}</span>
            <span className="row" style={{ gap: 4 }}><UserRound size={14} /> {a.barberName}</span>
          </div>
        </div>
      </div>
      {a.notes && <p className="muted" style={{ fontSize: '0.85rem' }}>Obs.: {a.notes}</p>}
      <div className="between mt">
        <b className="gold">{BRL(a.servicePrice)}</b>
        {!cancelled && (
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={onReschedule}><RefreshCw size={15} /> Remarcar</button>
            <button className="btn btn-danger btn-sm" onClick={() => onCancel(a)}><XCircle size={15} /> Cancelar</button>
          </div>
        )}
      </div>
    </div>
  );
}

function RescheduleModal({ appt, onClose, onDone }) {
  const toast = useToast();
  const [avail, setAvail] = useState([]);
  const [date, setDate] = useState(appt.date);
  const [time, setTime] = useState('');
  const [slots, setSlots] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.availability(appt.barberId).then(setAvail).catch(() => {}); }, [appt.barberId]);
  useEffect(() => {
    if (!date) return;
    setTime('');
    api.slots({ barberId: appt.barberId, date, serviceId: appt.serviceId })
      .then((r) => setSlots(r.slots)).catch(() => setSlots([]));
  }, [date, appt.barberId, appt.serviceId]);

  const workdays = new Set(avail.map((a) => a.weekday));

  async function save() {
    if (!time) { toast('Escolha um horário.', 'err'); return; }
    setSaving(true);
    try {
      await api.updateAppointment(appt.id, { date, time });
      toast('Agendamento remarcado!');
      onDone();
    } catch (e) { toast(e.message, 'err'); }
    finally { setSaving(false); }
  }

  return (
    <Modal title="Remarcar horário" onClose={onClose}>
      <p className="muted mb">{appt.serviceName} com {appt.barberName}</p>
      <div className="cal-days mb">
        {nextDays(14).map((d) => {
          const iso = toISODate(d);
          const works = workdays.has(d.getDay());
          return (
            <button key={iso} className={`cal-day ${date === iso ? 'sel' : ''} ${!works ? 'disabled' : ''}`} disabled={!works} onClick={() => setDate(iso)}>
              <small>{WEEKDAYS[d.getDay()]}</small><b>{d.getDate()}</b>
            </button>
          );
        })}
      </div>
      {!slots ? <Loading /> : slots.length === 0 ? (
        <p className="muted center">Sem atendimento neste dia.</p>
      ) : (
        <div className="slots-grid">
          {slots.map((s) => (
            <button key={s.time} className={`slot ${time === s.time ? 'sel' : ''}`} disabled={!s.available} onClick={() => setTime(s.time)}>{s.time}</button>
          ))}
        </div>
      )}
      <button className="btn btn-gold btn-block mt" disabled={saving || !time} onClick={save}>{saving ? 'Salvando...' : 'Confirmar remarcação'}</button>
    </Modal>
  );
}

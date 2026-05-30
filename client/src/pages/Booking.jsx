import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import {
  Clock, ChevronLeft, ChevronRight, Check, CalendarDays, Scissors, UserRound,
  PartyPopper, MessageCircle, CalendarPlus,
} from 'lucide-react';
import { api } from '../api.js';
import { BRL, fmtDuration, nextDays, toISODate, WEEKDAYS, fmtDateLong, phoneMask } from '../lib.js';
import { Avatar, Loading, useToast } from '../ui.jsx';

// Títulos por índice lógico de etapa (0=Serviço, 1=Barbeiro, 2=Data, 3=Dados).
const STEP_TITLES = ['Serviço', 'Barbeiro', 'Data & Hora', 'Seus dados'];

export default function Booking() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [services, setServices] = useState([]);
  const [barbers, setBarbers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [step, setStep] = useState(0);
  const [serviceId, setServiceId] = useState(params.get('service') || '');
  const [barberId, setBarberId] = useState(params.get('barber') || '');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [form, setForm] = useState({ clientName: '', clientPhone: '' });

  const [slots, setSlots] = useState(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(null); // { appointment, notification }

  useEffect(() => {
    Promise.all([api.services(), api.barbers()])
      .then(([s, b]) => { setServices(s); setBarbers(b); })
      .catch(() => toast('Falha ao carregar dados. O servidor está rodando?', 'err'))
      .finally(() => setLoading(false));
  }, [toast]);

  // Com um único profissional, pula a etapa "Barbeiro": seleciona automaticamente.
  const singleBarber = barbers.length === 1;
  // Sequência de etapas (índices lógicos) que o cliente percorre.
  const flow = useMemo(() => (singleBarber ? [0, 2, 3] : [0, 1, 2, 3]), [singleBarber]);
  const pos = Math.max(0, flow.indexOf(step));

  useEffect(() => {
    if (singleBarber) {
      setBarberId(barbers[0].id);
      setStep((s) => (s === 1 ? 2 : s)); // se caiu na etapa Barbeiro, avança
    }
  }, [singleBarber, barbers]);

  // Pré-carregar a partir do query param: pula para a etapa adequada.
  useEffect(() => {
    if (params.get('service')) setStep(1);
    if (params.get('barber')) setStep(params.get('service') ? 2 : 1);
  }, [params]);

  const service = services.find((s) => s.id === serviceId);
  const barber = barbers.find((b) => b.id === barberId);

  // Carregar slots quando serviço + barbeiro + data estão prontos.
  useEffect(() => {
    if (!serviceId || !barberId || !date) { setSlots(null); return; }
    setSlotsLoading(true);
    setTime('');
    api.slots({ barberId, date, serviceId })
      .then((r) => setSlots(r.slots))
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [serviceId, barberId, date]);

  const canNext = useMemo(() => {
    if (step === 0) return !!serviceId;
    if (step === 1) return !!barberId;
    if (step === 2) return !!date && !!time;
    return true;
  }, [step, serviceId, barberId, date, time]);

  const formValid = form.clientName.trim() && form.clientPhone.replace(/\D/g, '').length >= 10;

  async function submit() {
    if (!formValid) { toast('Informe nome e telefone válidos.', 'err'); return; }
    setSubmitting(true);
    try {
      const res = await api.createAppointment({
        clientName: form.clientName.trim(),
        clientPhone: form.clientPhone,
        serviceId, barberId, date, time,
      });
      // memoriza telefone para a área do cliente
      localStorage.setItem('barberman_phone', form.clientPhone);
      setConfirmed(res);
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="container"><Loading /></div>;

  if (confirmed) return <Confirmation data={confirmed} service={service} barber={barber} date={date} time={time} navigate={navigate} />;

  return (
    <div className="container block" style={{ paddingBottom: 120 }}>
      <div className="step-label">
        <span>Etapa {pos + 1} de {flow.length}</span>
        <span className="gold">{STEP_TITLES[step]}</span>
      </div>
      <div className="steps">
        {flow.map((_, i) => <div key={i} className={`step ${i <= pos ? 'done' : ''}`} />)}
      </div>

      {step === 0 && (
        <Section icon={Scissors} title="Escolha o serviço">
          <div className="grid">
            {services.map((s) => (
              <button key={s.id} className={`selectable ${serviceId === s.id ? 'sel' : ''}`} onClick={() => setServiceId(s.id)}>
                <span className="radio" />
                <div style={{ flex: 1 }}>
                  <div className="between"><b>{s.name}</b><span className="gold display" style={{ fontSize: '1.3rem' }}>{BRL(s.price)}</span></div>
                  <span className="muted" style={{ fontSize: '0.82rem' }}>{s.category} · {fmtDuration(s.durationMin)}</span>
                </div>
              </button>
            ))}
          </div>
        </Section>
      )}

      {step === 1 && (
        <Section icon={UserRound} title="Escolha o profissional">
          <div className="grid">
            {barbers.map((b) => (
              <button key={b.id} className={`selectable ${barberId === b.id ? 'sel' : ''}`} onClick={() => setBarberId(b.id)}>
                <span className="radio" />
                <Avatar name={b.name} photo={b.photo} className="avatar-sm" />
                <div style={{ flex: 1 }}>
                  <b>{b.name}</b>
                  <span className="muted" style={{ fontSize: '0.82rem', display: 'block' }}>{b.role}</span>
                </div>
              </button>
            ))}
          </div>
        </Section>
      )}

      {step === 2 && (
        <Section icon={CalendarDays} title="Escolha data e horário">
          <DatePicker barberId={barberId} value={date} onChange={setDate} />
          <div className="divider" />
          {!date ? (
            <p className="muted center">Selecione um dia para ver os horários.</p>
          ) : slotsLoading ? (
            <Loading />
          ) : slots && slots.length === 0 ? (
            <p className="muted center">O profissional não atende neste dia. Escolha outra data.</p>
          ) : (
            <>
              <p className="muted mb" style={{ fontSize: '0.85rem' }}>{fmtDateLong(date)} · {fmtDuration(service?.durationMin || 0)}</p>
              <div className="slots-grid">
                {slots?.map((s) => (
                  <button
                    key={s.time}
                    className={`slot ${time === s.time ? 'sel' : ''}`}
                    disabled={!s.available}
                    title={!s.available ? (s.reason === 'ocupado' ? 'Horário ocupado' : s.reason === 'bloqueado' ? 'Folga do profissional' : 'Indisponível') : ''}
                    onClick={() => setTime(s.time)}
                  >
                    {s.time}
                  </button>
                ))}
              </div>
              {slots && slots.every((s) => !s.available) && (
                <p className="muted center mt">Todos os horários deste dia estão indisponíveis. Tente outra data.</p>
              )}
            </>
          )}
        </Section>
      )}

      {step === 3 && (
        <Section icon={UserRound} title="Seus dados">
          <div className="field">
            <label>Nome *</label>
            <input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} placeholder="Ex.: João da Silva" autoComplete="name" />
          </div>
          <div className="field">
            <label>WhatsApp *</label>
            <input value={form.clientPhone} onChange={(e) => setForm({ ...form, clientPhone: phoneMask(e.target.value) })} placeholder="(11) 99999-9999" inputMode="tel" autoComplete="tel" />
            <p className="muted" style={{ fontSize: '0.78rem', marginTop: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
              <MessageCircle size={13} className="gold" /> Enviaremos a confirmação e um lembrete por aqui.
            </p>
          </div>
          <SummaryCard service={service} barber={barber} date={date} time={time} />
        </Section>
      )}

      {/* Barra inferior de navegação/resumo */}
      <div className="summary-bar">
        <div className="container">
          {step < 3 ? (
            <>
              <div className="total">
                <small>{service ? service.name : 'Selecione um serviço'}</small>
                <b>{service ? BRL(service.price) : '—'}</b>
              </div>
              <div className="row">
                {pos > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setStep(flow[pos - 1])}><ChevronLeft size={16} /> Voltar</button>}
                <button className="btn btn-gold" disabled={!canNext} onClick={() => setStep(flow[pos + 1])}>Continuar <ChevronRight size={16} /></button>
              </div>
            </>
          ) : (
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => setStep(2)}><ChevronLeft size={16} /> Voltar</button>
              <button className="btn btn-gold" disabled={!formValid || submitting} onClick={submit}>
                <Check size={17} /> {submitting ? 'Enviando...' : 'Confirmar agendamento'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <div>
      <h2 className="display" style={{ fontSize: '1.9rem', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
        <Icon size={24} className="gold" /> {title}
      </h2>
      {children}
    </div>
  );
}

function DatePicker({ barberId, value, onChange }) {
  const [avail, setAvail] = useState([]);
  const [blocks, setBlocks] = useState([]);
  useEffect(() => {
    if (!barberId) return;
    api.availability(barberId).then(setAvail).catch(() => {});
    api.blocks(barberId).then(setBlocks).catch(() => setBlocks([]));
  }, [barberId]);
  const workdays = new Set(avail.map((a) => a.weekday));
  // Dias com folga de dia inteiro ficam indisponíveis no calendário.
  const offDays = new Set(blocks.filter((b) => b.allDay).map((b) => b.date));
  const days = nextDays(14);

  return (
    <div className="cal-days">
      {days.map((d) => {
        const iso = toISODate(d);
        const off = !workdays.has(d.getDay()) || offDays.has(iso);
        return (
          <button
            key={iso}
            className={`cal-day ${value === iso ? 'sel' : ''} ${off ? 'disabled' : ''}`}
            disabled={off}
            title={offDays.has(iso) ? 'Folga do profissional' : ''}
            onClick={() => onChange(iso)}
          >
            <small>{WEEKDAYS[d.getDay()]}</small>
            <b>{d.getDate()}</b>
          </button>
        );
      })}
    </div>
  );
}

function SummaryCard({ service, barber, date, time }) {
  return (
    <div className="card" style={{ background: 'var(--black-2)' }}>
      <p className="eyebrow mb">Resumo</p>
      <Row label="Serviço" value={service?.name} />
      <Row label="Profissional" value={barber?.name} />
      <Row label="Data" value={date && fmtDateLong(date)} />
      <Row label="Horário" value={time} />
      <div className="divider" />
      <div className="between"><b>Total</b><b className="gold display" style={{ fontSize: '1.6rem' }}>{BRL(service?.price)}</b></div>
    </div>
  );
}

const Row = ({ label, value }) => (
  <div className="between" style={{ padding: '6px 0' }}>
    <span className="muted" style={{ fontSize: '0.88rem' }}>{label}</span>
    <b style={{ fontSize: '0.92rem' }}>{value || '—'}</b>
  </div>
);

function Confirmation({ data, service, barber, date, time, navigate }) {
  const { appointment, notification } = data;
  return (
    <div className="container block center" style={{ maxWidth: 520, paddingBottom: 120 }}>
      <div className="confirm-check"><PartyPopper size={44} /></div>
      <h2 className="display" style={{ fontSize: '2.2rem' }}>AGENDAMENTO ENVIADO!</h2>
      <p className="muted mb">Recebemos seu pedido. O status inicial é <b className="gold">pendente</b> e será confirmado pela barbearia.</p>
      <p className="muted mb" style={{ fontSize: '0.88rem', display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
        <MessageCircle size={15} className="gold" /> Enviamos os detalhes para o seu WhatsApp. Você receberá um lembrete 4h antes.
      </p>

      <div className="card mt" style={{ textAlign: 'left' }}>
        <Row label="Serviço" value={service?.name} />
        <Row label="Profissional" value={barber?.name} />
        <Row label="Data" value={fmtDateLong(date)} />
        <Row label="Horário" value={time} />
        <Row label="Valor" value={BRL(service?.price)} />
        <div className="divider" />
        <div className="between"><span className="muted">Status</span><span className="badge pendente">{appointment.status}</span></div>
      </div>

      {notification?.waLink && (
        <a className="btn btn-gold btn-block mt" href={notification.waLink} target="_blank" rel="noreferrer">
          <MessageCircle size={18} /> Enviar confirmação no WhatsApp
        </a>
      )}
      <div className="row mt" style={{ gap: 10 }}>
        <button className="btn btn-ghost btn-block" onClick={() => navigate('/meus-agendamentos')}>Meus agendamentos</button>
        <Link to="/" className="btn btn-ghost btn-block"><CalendarPlus size={16} /> Início</Link>
      </div>
    </div>
  );
}

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Shield, LayoutDashboard, CalendarRange, Scissors, Users, Bell, Settings as Cog,
  Plus, Trash2, Pencil, Check, X, MessageCircle, RotateCcw, LogOut, ArrowLeft, Clock, CalendarPlus,
  Smartphone, QrCode, Power, RefreshCw, CheckCircle2, CalendarOff, Ban, Sun,
} from 'lucide-react';
import { api } from '../api.js';
import { BRL, fmtDuration, fmtDateShort, fmtDateLong, WEEKDAYS, nextDays, toISODate, parseISO, buildTimes } from '../lib.js';
import { Avatar, StatusBadge, Loading, Empty, Modal, useToast } from '../ui.jsx';

const PIN_KEY = 'barberman_admin';

export default function Admin() {
  const toast = useToast();
  const [authed, setAuthed] = useState(sessionStorage.getItem(PIN_KEY) === '1');
  const [tab, setTab] = useState('agenda');

  if (!authed) return <PinGate onOk={() => { sessionStorage.setItem(PIN_KEY, '1'); setAuthed(true); }} />;

  const tabs = [
    { id: 'agenda', label: 'Agenda', icon: CalendarRange },
    { id: 'servicos', label: 'Serviços', icon: Scissors },
    { id: 'barbeiros', label: 'Barbeiros', icon: Users },
    { id: 'clientes', label: 'Clientes', icon: LayoutDashboard },
    { id: 'whatsapp', label: 'WhatsApp', icon: Smartphone },
    { id: 'notificacoes', label: 'Notificações', icon: Bell },
    { id: 'config', label: 'Config', icon: Cog },
  ];

  return (
    <div className="container block" style={{ paddingTop: 22 }}>
      <div className="between mb">
        <div className="brand" style={{ gap: 10 }}>
          <span className="brand-mark">B</span>
          <div>
            <div className="brand-name" style={{ fontSize: '1.3rem' }}>Barber<b className="gold">Man</b> Admin</div>
            <span className="muted" style={{ fontSize: '0.78rem' }}>Painel de controle</span>
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link to="/" className="btn btn-ghost btn-sm"><ArrowLeft size={15} /> Site</Link>
          <button className="btn btn-ghost btn-sm" onClick={() => { sessionStorage.removeItem(PIN_KEY); setAuthed(false); }}><LogOut size={15} /> Sair</button>
        </div>
      </div>

      <div className="admin-tabs">
        {tabs.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            <span className="row" style={{ gap: 6 }}><t.icon size={16} /> {t.label}</span>
          </button>
        ))}
      </div>

      {tab === 'agenda' && <AgendaTab toast={toast} />}
      {tab === 'servicos' && <ServicesTab toast={toast} />}
      {tab === 'barbeiros' && <BarbersTab toast={toast} />}
      {tab === 'clientes' && <ClientsTab toast={toast} />}
      {tab === 'whatsapp' && <WhatsAppTab toast={toast} />}
      {tab === 'notificacoes' && <NotificationsTab toast={toast} />}
      {tab === 'config' && <ConfigTab toast={toast} />}
    </div>
  );
}

// ---------------- PIN gate ----------------
function PinGate({ onOk }) {
  const toast = useToast();
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try { await api.adminLogin(pin); onOk(); }
    catch { toast('PIN incorreto.', 'err'); }
    finally { setLoading(false); }
  }
  return (
    <div className="container block center" style={{ maxWidth: 380, paddingTop: 70 }}>
      <div className="confirm-check"><Shield size={40} /></div>
      <h2 className="display" style={{ fontSize: '2rem' }}>PAINEL ADMIN</h2>
      <p className="muted mb">Acesso restrito da BarberMan.</p>
      <form onSubmit={submit} className="card">
        <div className="field">
          <label>PIN de acesso</label>
          <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••" inputMode="numeric" autoFocus />
        </div>
        <button className="btn btn-gold btn-block" disabled={loading}>{loading ? 'Verificando...' : 'Entrar'}</button>
        <p className="muted center" style={{ fontSize: '0.78rem', marginTop: 12 }}>PIN padrão da demo: <b className="gold">1234</b></p>
      </form>
      <Link to="/" className="btn btn-ghost btn-sm mt"><ArrowLeft size={15} /> Voltar ao site</Link>
    </div>
  );
}

// ---------------- Agenda / Agendamentos ----------------
function AgendaTab({ toast }) {
  const [appts, setAppts] = useState(null);
  const [barbers, setBarbers] = useState([]);
  const [services, setServices] = useState([]);
  const [filter, setFilter] = useState({ barberId: '', serviceId: '', status: '', date: '' });
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    const [a, b, s] = await Promise.all([api.appointments(), api.barbers(), api.services()]);
    setAppts(a); setBarbers(b); setServices(s);
  }, []);
  useEffect(() => { load().catch(() => setAppts([])); }, [load]);

  const filtered = useMemo(() => {
    if (!appts) return [];
    return appts.filter((a) =>
      (!filter.barberId || a.barberId === filter.barberId) &&
      (!filter.serviceId || a.serviceId === filter.serviceId) &&
      (!filter.status || a.status === filter.status) &&
      (!filter.date || a.date === filter.date)
    );
  }, [appts, filter]);

  const stats = useMemo(() => {
    if (!appts) return {};
    const today = toISODate(new Date());
    const active = appts.filter((a) => a.status !== 'cancelado');
    return {
      total: appts.length,
      pendentes: appts.filter((a) => a.status === 'pendente').length,
      hoje: active.filter((a) => a.date === today).length,
      receita: active.filter((a) => a.status === 'confirmado').reduce((s, a) => s + (a.servicePrice || 0), 0),
    };
  }, [appts]);

  async function setStatus(a, status) {
    try { await api.updateAppointment(a.id, { status }); toast(`Status: ${status}`); load(); }
    catch (e) { toast(e.message, 'err'); }
  }
  async function remove(a) {
    if (!confirm('Remover permanentemente este agendamento?')) return;
    try { await api.deleteAppointment(a.id); toast('Removido.'); load(); }
    catch (e) { toast(e.message, 'err'); }
  }

  if (!appts) return <Loading />;

  return (
    <div>
      <div className="stat-cards">
        <div className="card stat-card"><b>{stats.total}</b><small>Agendamentos</small></div>
        <div className="card stat-card"><b>{stats.pendentes}</b><small>Pendentes</small></div>
        <div className="card stat-card"><b>{stats.hoje}</b><small>Hoje</small></div>
        <div className="card stat-card"><b style={{ fontSize: '1.5rem' }}>{BRL(stats.receita)}</b><small>Receita confirmada</small></div>
      </div>

      <div className="card mb">
        <div className="grid grid-2" style={{ gap: 10 }}>
          <Select label="Barbeiro" value={filter.barberId} onChange={(v) => setFilter({ ...filter, barberId: v })} options={[['', 'Todos']].concat(barbers.map((b) => [b.id, b.name]))} />
          <Select label="Serviço" value={filter.serviceId} onChange={(v) => setFilter({ ...filter, serviceId: v })} options={[['', 'Todos']].concat(services.map((s) => [s.id, s.name]))} />
          <Select label="Status" value={filter.status} onChange={(v) => setFilter({ ...filter, status: v })} options={[['', 'Todos'], ['pendente', 'Pendente'], ['confirmado', 'Confirmado'], ['cancelado', 'Cancelado']]} />
          <div className="field" style={{ margin: 0 }}>
            <label>Data</label>
            <input type="date" value={filter.date} onChange={(e) => setFilter({ ...filter, date: e.target.value })} />
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty icon={CalendarRange} title="Nenhum agendamento" hint="Os agendamentos aparecerão aqui." />
      ) : (
        <div className="grid">
          {filtered.map((a) => (
            <div key={a.id} className="card">
              <div className="between mb">
                <div className="row" style={{ gap: 12 }}>
                  <Avatar name={a.barberName} photo={a.barberPhoto} className="avatar-sm" />
                  <div>
                    <b>{a.clientName}</b>
                    <div className="muted" style={{ fontSize: '0.82rem' }}>{a.clientPhone}</div>
                  </div>
                </div>
                <StatusBadge status={a.status} />
              </div>
              <div className="row wrap" style={{ gap: 8, fontSize: '0.85rem' }}>
                <span className="chip">{a.serviceName}</span>
                <span className="muted row" style={{ gap: 4 }}><Clock size={14} /> {fmtDateShort(a.date)} · {a.time}</span>
                <span className="muted">{a.barberName}</span>
                <b className="gold">{BRL(a.servicePrice)}</b>
              </div>
              {a.notes && <p className="muted" style={{ fontSize: '0.84rem', marginTop: 8 }}>Obs.: {a.notes}</p>}
              <div className="divider" />
              <div className="row wrap" style={{ gap: 8 }}>
                {a.status !== 'confirmado' && <button className="btn btn-gold btn-sm" onClick={() => setStatus(a, 'confirmado')}><Check size={15} /> Confirmar</button>}
                {a.status !== 'cancelado' && <button className="btn btn-ghost btn-sm" onClick={() => setStatus(a, 'cancelado')}><X size={15} /> Cancelar</button>}
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(a)}><RotateCcw size={15} /> Remarcar</button>
                <button className="btn btn-danger btn-sm" onClick={() => remove(a)}><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <AdminReschedule appt={editing} services={services} barbers={barbers}
          onClose={() => setEditing(null)} onDone={() => { setEditing(null); load(); }} toast={toast} />
      )}
    </div>
  );
}

function AdminReschedule({ appt, services, barbers, onClose, onDone, toast }) {
  const [barberId, setBarberId] = useState(appt.barberId);
  const [serviceId, setServiceId] = useState(appt.serviceId);
  const [date, setDate] = useState(appt.date);
  const [time, setTime] = useState(appt.time);
  const [slots, setSlots] = useState(null);
  const [avail, setAvail] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.availability(barberId).then(setAvail).catch(() => {}); }, [barberId]);
  useEffect(() => {
    if (!date) return;
    api.slots({ barberId, date, serviceId }).then((r) => setSlots(r.slots)).catch(() => setSlots([]));
  }, [barberId, serviceId, date]);

  const workdays = new Set(avail.map((a) => a.weekday));

  async function save() {
    setSaving(true);
    try {
      await api.updateAppointment(appt.id, { barberId, serviceId, date, time });
      toast('Agendamento atualizado.');
      onDone();
    } catch (e) { toast(e.message, 'err'); }
    finally { setSaving(false); }
  }

  return (
    <Modal title="Editar / Remarcar" onClose={onClose}>
      <Select label="Serviço" value={serviceId} onChange={setServiceId} options={services.map((s) => [s.id, s.name])} />
      <Select label="Barbeiro" value={barberId} onChange={setBarberId} options={barbers.map((b) => [b.id, b.name])} />
      <label className="muted" style={{ fontSize: '0.82rem', fontWeight: 600 }}>Data</label>
      <div className="cal-days mb" style={{ marginTop: 6 }}>
        {nextDays(14).map((d) => {
          const iso = toISODate(d);
          const works = workdays.has(d.getDay());
          return <button key={iso} className={`cal-day ${date === iso ? 'sel' : ''} ${!works ? 'disabled' : ''}`} disabled={!works} onClick={() => { setDate(iso); setTime(''); }}><small>{WEEKDAYS[d.getDay()]}</small><b>{d.getDate()}</b></button>;
        })}
      </div>
      {slots && (
        <div className="slots-grid mb">
          {slots.map((s) => <button key={s.time} className={`slot ${time === s.time ? 'sel' : ''}`} disabled={!s.available && s.time !== appt.time} onClick={() => setTime(s.time)}>{s.time}</button>)}
        </div>
      )}
      <button className="btn btn-gold btn-block" disabled={saving} onClick={save}>{saving ? 'Salvando...' : 'Salvar alterações'}</button>
    </Modal>
  );
}

// ---------------- Serviços ----------------
function ServicesTab({ toast }) {
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => api.services().then(setItems), []);
  useEffect(() => { load(); }, [load]);

  async function remove(id) {
    if (!confirm('Excluir este serviço?')) return;
    await api.deleteService(id); toast('Serviço excluído.'); load();
  }

  if (!items) return <Loading />;

  return (
    <div>
      <div className="between mb">
        <h3 className="display" style={{ fontSize: '1.5rem' }}>Serviços ({items.length})</h3>
        <button className="btn btn-gold btn-sm" onClick={() => setEditing({})}><Plus size={16} /> Novo</button>
      </div>
      <div className="grid grid-2">
        {items.map((s) => (
          <div key={s.id} className="card svc">
            <div className="svc-top">
              <div><span className="chip">{s.category}</span><h3 style={{ marginTop: 6 }}>{s.name}</h3></div>
              <span className="price">{BRL(s.price)}</span>
            </div>
            <p className="muted" style={{ fontSize: '0.85rem' }}>{s.description}</p>
            <div className="between">
              <span className="meta"><Clock size={14} /> {fmtDuration(s.durationMin)}</span>
              <div className="row" style={{ gap: 6 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(s)}><Pencil size={14} /></button>
                <button className="btn btn-danger btn-sm" onClick={() => remove(s.id)}><Trash2 size={14} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {editing && <ServiceModal item={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); load(); }} toast={toast} />}
    </div>
  );
}

function ServiceModal({ item, onClose, onDone, toast }) {
  const [f, setF] = useState({ name: '', category: '', durationMin: 30, price: 0, description: '', ...item });
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!f.name) { toast('Informe o nome.', 'err'); return; }
    setSaving(true);
    try {
      if (item.id) await api.updateService(item.id, f); else await api.createService(f);
      toast('Serviço salvo.'); onDone();
    } catch (e) { toast(e.message, 'err'); } finally { setSaving(false); }
  }
  return (
    <Modal title={item.id ? 'Editar serviço' : 'Novo serviço'} onClose={onClose}>
      <Field label="Nome" value={f.name} onChange={(v) => setF({ ...f, name: v })} />
      <Field label="Categoria" value={f.category} onChange={(v) => setF({ ...f, category: v })} placeholder="Cabelo, Barba, Combos..." />
      <div className="grid grid-2" style={{ gap: 10 }}>
        <Field label="Duração (min)" type="number" value={f.durationMin} onChange={(v) => setF({ ...f, durationMin: v })} />
        <Field label="Preço (R$)" type="number" value={f.price} onChange={(v) => setF({ ...f, price: v })} />
      </div>
      <Field label="Descrição" textarea value={f.description} onChange={(v) => setF({ ...f, description: v })} />
      <button className="btn btn-gold btn-block" disabled={saving} onClick={save}>{saving ? 'Salvando...' : 'Salvar'}</button>
    </Modal>
  );
}

// ---------------- Barbeiros ----------------
function BarbersTab({ toast }) {
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null);
  const [hours, setHours] = useState(null);
  const [blocking, setBlocking] = useState(null);

  const load = useCallback(() => api.barbers().then(setItems), []);
  useEffect(() => { load(); }, [load]);

  async function remove(id) {
    if (!confirm('Excluir este barbeiro e sua agenda?')) return;
    await api.deleteBarber(id); toast('Barbeiro excluído.'); load();
  }
  if (!items) return <Loading />;

  return (
    <div>
      <div className="between mb">
        <h3 className="display" style={{ fontSize: '1.5rem' }}>Barbeiros ({items.length})</h3>
        <button className="btn btn-gold btn-sm" onClick={() => setEditing({})}><Plus size={16} /> Novo</button>
      </div>
      <div className="grid grid-2">
        {items.map((b) => (
          <div key={b.id} className="card">
            <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
              <Avatar name={b.name} photo={b.photo} className="avatar-sm" />
              <div style={{ flex: 1 }}>
                <b>{b.name}</b>
                <div className="gold" style={{ fontSize: '0.82rem' }}>{b.role}</div>
                <div className="row wrap" style={{ gap: 5, marginTop: 6 }}>{b.specialties.map((s) => <span key={s} className="chip">{s}</span>)}</div>
              </div>
            </div>
            <div className="row wrap" style={{ gap: 6, marginTop: 12 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setHours(b)}><Clock size={14} /> Horários</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setBlocking(b)}><CalendarOff size={14} /> Folgas</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(b)}><Pencil size={14} /></button>
              <button className="btn btn-danger btn-sm" onClick={() => remove(b.id)}><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>
      {editing && <BarberModal item={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); load(); }} toast={toast} />}
      {hours && <HoursModal barber={hours} onClose={() => setHours(null)} toast={toast} />}
      {blocking && <BlocksModal barber={blocking} onClose={() => setBlocking(null)} toast={toast} />}
    </div>
  );
}

// ---------------- Folgas / bloqueios do barbeiro ----------------
function BlocksModal({ barber, onClose, toast }) {
  const [list, setList] = useState(null);
  const [mode, setMode] = useState('day'); // 'day' (dia inteiro) | 'time' (faixa de horário)
  const [date, setDate] = useState('');
  const [range, setRange] = useState({ start: null, end: null });
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const [avail, setAvail] = useState([]);
  const [gridStep, setGridStep] = useState(15);

  const load = useCallback(() => api.blocks(barber.id).then(setList).catch(() => setList([])), [barber.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.availability(barber.id).then(setAvail).catch(() => {});
    api.settings().then((s) => setGridStep(s.slotStep || 15)).catch(() => {});
  }, [barber.id]);

  const todayISO = toISODate(new Date());

  // Horários de trabalho do barbeiro no dia escolhido (base da grade de folga).
  const times = useMemo(() => {
    if (!date) return [];
    const wd = parseISO(date).getDay();
    const windows = avail.filter((a) => a.weekday === wd);
    if (!windows.length) return [];
    const start = windows.reduce((m, w) => (w.startTime < m ? w.startTime : m), windows[0].startTime);
    const end = windows.reduce((m, w) => (w.endTime > m ? w.endTime : m), windows[0].endTime);
    return buildTimes(start, end, gridStep);
  }, [date, avail, gridStep]);

  function onPickDate(v) { setDate(v); setRange({ start: null, end: null }); }
  function onChangeMode(m) { setMode(m); setRange({ start: null, end: null }); }

  // Toque-início / toque-fim para montar o intervalo de folga.
  function pickTime(t) {
    setRange((r) => {
      if (!r.start || r.end) return { start: t, end: null };
      if (t === r.start) return { start: null, end: null };
      if (t < r.start) return { start: t, end: r.start };
      return { start: r.start, end: t };
    });
  }
  const inRange = (t) => range.start && range.end && t > range.start && t < range.end;

  async function add() {
    if (!date) { toast('Escolha a data.', 'err'); return; }
    if (mode === 'time' && (!range.start || !range.end)) { toast('Toque no início e no fim do período de folga.', 'err'); return; }
    setSaving(true);
    try {
      await api.createBlock({
        barberId: barber.id,
        date,
        allDay: mode === 'day',
        startTime: mode === 'time' ? range.start : undefined,
        endTime: mode === 'time' ? range.end : undefined,
        reason,
      });
      toast('Folga/bloqueio adicionado.');
      setDate(''); setReason(''); setRange({ start: null, end: null });
      load();
    } catch (e) { toast(e.message, 'err'); }
    finally { setSaving(false); }
  }

  async function remove(id) {
    try { await api.deleteBlock(id); toast('Removido.'); load(); }
    catch (e) { toast(e.message, 'err'); }
  }

  return (
    <Modal title={`Folgas de ${barber.name.split(' ')[0]}`} onClose={onClose}>
      <p className="muted mb" style={{ fontSize: '0.86rem' }}>
        Defina dias ou horários em que <b>{barber.name.split(' ')[0]}</b> não atende.
        Eles ficam <b>indisponíveis</b> no agendamento dos clientes.
      </p>

      {/* Tipo de bloqueio */}
      <div className="seg mb">
        <button className={`seg-btn ${mode === 'day' ? 'active' : ''}`} onClick={() => onChangeMode('day')}>
          <Sun size={15} /> Dia inteiro
        </button>
        <button className={`seg-btn ${mode === 'time' ? 'active' : ''}`} onClick={() => onChangeMode('time')}>
          <Clock size={15} /> Faixa de horário
        </button>
      </div>

      <div className="field">
        <label>Data</label>
        <input type="date" value={date} min={todayISO} onChange={(e) => onPickDate(e.target.value)} />
      </div>

      {mode === 'time' && date && (
        times.length === 0 ? (
          <p className="muted mb" style={{ fontSize: '0.85rem' }}>O profissional não trabalha neste dia. Escolha outra data ou use “Dia inteiro”.</p>
        ) : (
          <div className="field">
            <label>
              {range.start && range.end
                ? <>Folga das <b className="gold">{range.start}</b> às <b className="gold">{range.end}</b></>
                : range.start
                  ? <>Início <b className="gold">{range.start}</b> — toque no horário final</>
                  : 'Toque no horário inicial e depois no final'}
            </label>
            <div className="slots-grid">
              {times.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`slot ${range.start === t || range.end === t ? 'sel' : ''} ${inRange(t) ? 'in-range' : ''}`}
                  onClick={() => pickTime(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )
      )}

      <Field label="Motivo (opcional)" value={reason} onChange={setReason} placeholder="Ex.: Folga, médico, viagem..." />
      <button className="btn btn-gold btn-block mb" disabled={saving} onClick={add}>
        <Ban size={16} /> {saving ? 'Adicionando...' : 'Adicionar bloqueio'}
      </button>

      <div className="divider" />
      <p className="eyebrow mb">Bloqueios ativos</p>
      {!list ? <Loading /> : list.length === 0 ? (
        <p className="muted" style={{ fontSize: '0.86rem' }}>Nenhum bloqueio. {barber.name.split(' ')[0]} atende conforme a agenda semanal.</p>
      ) : (
        <div className="grid" style={{ gap: 8 }}>
          {list.map((b) => (
            <div key={b.id} className="block-row">
              <span className="block-icon">{b.allDay ? <CalendarOff size={16} /> : <Clock size={16} />}</span>
              <div style={{ flex: 1 }}>
                <b style={{ fontSize: '0.92rem' }}>{fmtDateShort(b.date)}</b>
                <span className="muted" style={{ fontSize: '0.82rem', display: 'block' }}>
                  {b.allDay ? 'Dia inteiro' : `${b.startTime} às ${b.endTime}`}{b.reason ? ` · ${b.reason}` : ''}
                </span>
              </div>
              <button className="btn btn-danger btn-sm" onClick={() => remove(b.id)}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function BarberModal({ item, onClose, onDone, toast }) {
  const [f, setF] = useState({
    name: '', role: 'Barbeiro', photo: '', bio: '',
    ...item,
    specialties: Array.isArray(item.specialties) ? item.specialties.join(', ') : (item.specialties || ''),
  });
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!f.name) { toast('Informe o nome.', 'err'); return; }
    setSaving(true);
    try {
      if (item.id) await api.updateBarber(item.id, f); else await api.createBarber(f);
      toast('Barbeiro salvo.'); onDone();
    } catch (e) { toast(e.message, 'err'); } finally { setSaving(false); }
  }
  return (
    <Modal title={item.id ? 'Editar barbeiro' : 'Novo barbeiro'} onClose={onClose}>
      <Field label="Nome" value={f.name} onChange={(v) => setF({ ...f, name: v })} />
      <Field label="Função" value={f.role} onChange={(v) => setF({ ...f, role: v })} />
      <Field label="URL da foto" value={f.photo} onChange={(v) => setF({ ...f, photo: v })} placeholder="https://... (opcional)" />
      <Field label="Especialidades (vírgula)" value={f.specialties} onChange={(v) => setF({ ...f, specialties: v })} placeholder="Corte, Barba, Pigmentação" />
      <Field label="Bio" textarea value={f.bio} onChange={(v) => setF({ ...f, bio: v })} />
      <button className="btn btn-gold btn-block" disabled={saving} onClick={save}>{saving ? 'Salvando...' : 'Salvar'}</button>
    </Modal>
  );
}

function HoursModal({ barber, onClose, toast }) {
  const [grid, setGrid] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.availability(barber.id).then((list) => {
      const byDay = {};
      for (let d = 0; d <= 6; d++) byDay[d] = null;
      for (const a of list) byDay[a.weekday] = { startTime: a.startTime, endTime: a.endTime };
      setGrid(byDay);
    });
  }, [barber.id]);

  function toggle(d) {
    setGrid((g) => ({ ...g, [d]: g[d] ? null : { startTime: '09:00', endTime: '19:00' } }));
  }
  function update(d, key, val) {
    setGrid((g) => ({ ...g, [d]: { ...g[d], [key]: val } }));
  }
  async function save() {
    setSaving(true);
    const list = Object.entries(grid).filter(([, v]) => v).map(([d, v]) => ({ weekday: Number(d), ...v }));
    try { await api.setAvailability(barber.id, list); toast('Agenda atualizada.'); onClose(); }
    catch (e) { toast(e.message, 'err'); } finally { setSaving(false); }
  }
  if (!grid) return <Modal title="Horários" onClose={onClose}><Loading /></Modal>;

  return (
    <Modal title={`Agenda de ${barber.name.split(' ')[0]}`} onClose={onClose}>
      <p className="muted mb">Marque os dias de atendimento e os horários.</p>
      {[1, 2, 3, 4, 5, 6, 0].map((d) => (
        <div key={d} className="between" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
          <button className={`btn btn-sm ${grid[d] ? 'btn-gold' : 'btn-ghost'}`} style={{ minWidth: 64 }} onClick={() => toggle(d)}>
            {WEEKDAYS[d]}
          </button>
          {grid[d] ? (
            <div className="row" style={{ gap: 6 }}>
              <input type="time" value={grid[d].startTime} onChange={(e) => update(d, 'startTime', e.target.value)} style={inputStyle} />
              <span className="muted">às</span>
              <input type="time" value={grid[d].endTime} onChange={(e) => update(d, 'endTime', e.target.value)} style={inputStyle} />
            </div>
          ) : <span className="muted" style={{ fontSize: '0.85rem' }}>Folga</span>}
        </div>
      ))}
      <button className="btn btn-gold btn-block mt" disabled={saving} onClick={save}>{saving ? 'Salvando...' : 'Salvar agenda'}</button>
    </Modal>
  );
}
const inputStyle = { padding: '8px 10px', borderRadius: 8, background: 'var(--black-2)', border: '1px solid var(--line)', color: 'var(--white)' };

// ---------------- Clientes ----------------
function ClientsTab() {
  const [items, setItems] = useState(null);
  useEffect(() => { api.clients().then((l) => setItems(l.sort((a, b) => b.appointments - a.appointments))); }, []);
  if (!items) return <Loading />;
  if (items.length === 0) return <Empty icon={Users} title="Nenhum cliente ainda" hint="Os clientes são cadastrados ao agendarem." />;
  return (
    <div className="card" style={{ overflowX: 'auto' }}>
      <table className="table">
        <thead><tr><th>Nome</th><th>Telefone</th><th>E-mail</th><th>Agend.</th></tr></thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.id}>
              <td><b>{c.name}</b></td>
              <td className="muted">{c.phone}</td>
              <td className="muted">{c.email || '—'}</td>
              <td><span className="chip">{c.appointments}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------- WhatsApp ----------------
const WA_LABEL = {
  disconnected: 'Desconectado',
  starting: 'Iniciando...',
  qr: 'Aguardando leitura do QR Code',
  authenticated: 'Autenticando...',
  connected: 'Conectado',
  error: 'Erro na conexão',
};

function WhatsAppTab({ toast }) {
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => api.waStatus().then(setSt).catch(() => {}), []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 3000); // acompanha o pareamento em tempo real
    return () => clearInterval(id);
  }, [refresh]);

  async function connect() {
    setBusy(true);
    try { setSt(await api.waConnect()); toast('Conexão iniciada. Leia o QR Code.'); }
    catch (e) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  }
  async function logout() {
    if (!confirm('Desconectar o WhatsApp? Será preciso ler o QR Code novamente.')) return;
    setBusy(true);
    try { setSt(await api.waLogout()); toast('WhatsApp desconectado.'); }
    catch (e) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  }

  if (!st) return <Loading />;

  const status = st.status || 'disconnected';
  const connected = status === 'connected';
  const dotClass = connected ? 'green' : status === 'error' ? 'red' : 'amber';

  return (
    <div className="grid grid-2">
      <div className="card">
        <div className="row" style={{ gap: 12, marginBottom: 14 }}>
          <span className="wa-icon"><Smartphone size={22} /></span>
          <div>
            <h3 className="display" style={{ fontSize: '1.4rem' }}>Conexão do WhatsApp</h3>
            <span className="muted" style={{ fontSize: '0.82rem' }}>Envio automático de confirmações e lembretes.</span>
          </div>
        </div>

        <div className="wa-status">
          <span className={`dot ${dotClass}`} />
          <b>{WA_LABEL[status] || status}</b>
        </div>

        {connected && st.me && (
          <p className="muted" style={{ fontSize: '0.86rem', marginTop: 10 }}>
            Número conectado: <b className="gold">{st.me.name || ''} {st.me.number}</b>
          </p>
        )}
        {status === 'error' && st.error && (
          <p className="muted" style={{ fontSize: '0.82rem', marginTop: 10, color: 'var(--red)' }}>{st.error}</p>
        )}

        <div className="row wrap" style={{ gap: 8, marginTop: 18 }}>
          {!connected && (
            <button className="btn btn-gold btn-sm" disabled={busy} onClick={connect}>
              <Power size={15} /> {status === 'disconnected' || status === 'error' ? 'Conectar' : 'Reiniciar'}
            </button>
          )}
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={refresh}><RefreshCw size={15} /> Atualizar</button>
          {(connected || status === 'qr' || status === 'authenticated') && (
            <button className="btn btn-danger btn-sm" disabled={busy} onClick={logout}><Power size={15} /> Desconectar</button>
          )}
        </div>

        <p className="muted" style={{ fontSize: '0.78rem', marginTop: 16, lineHeight: 1.6 }}>
          As mensagens são enviadas do seu próprio número, como no WhatsApp Web.
          Mantenha o celular com internet. A sessão fica salva — não precisa parear toda vez.
        </p>
      </div>

      <div className="card center">
        {connected ? (
          <div className="wa-connected">
            <CheckCircle2 size={56} className="gold" />
            <h3 className="display" style={{ fontSize: '1.6rem', marginTop: 10 }}>TUDO PRONTO</h3>
            <p className="muted" style={{ fontSize: '0.88rem' }}>Confirmações e lembretes serão enviados automaticamente.</p>
          </div>
        ) : st.qr ? (
          <>
            <p className="eyebrow mb">Escaneie com o WhatsApp</p>
            <img src={st.qr} alt="QR Code do WhatsApp" className="wa-qr" />
            <p className="muted" style={{ fontSize: '0.8rem', marginTop: 12, lineHeight: 1.6 }}>
              No celular: <b>WhatsApp → Configurações → Aparelhos conectados → Conectar um aparelho</b>.
            </p>
          </>
        ) : (
          <div className="wa-empty">
            <QrCode size={56} className="muted" />
            <p className="muted" style={{ marginTop: 12, fontSize: '0.9rem' }}>
              {status === 'starting' || status === 'authenticated'
                ? 'Gerando QR Code...'
                : 'Clique em "Conectar" para gerar o QR Code.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------- Notificações ----------------
const KIND_LABEL = { novo: 'Novo', remarcado: 'Remarcado', cancelado: 'Cancelado', lembrete: 'Lembrete', status: 'Status' };

function NotificationsTab() {
  const [items, setItems] = useState(null);
  const load = useCallback(() => api.notifications().then(setItems), []);
  useEffect(() => {
    load();
    const id = setInterval(load, 5000); // atualiza o status de entrega
    return () => clearInterval(id);
  }, [load]);
  if (!items) return <Loading />;
  if (items.length === 0) return <Empty icon={Bell} title="Sem notificações" hint="Cada agendamento gera uma mensagem aqui." />;
  return (
    <div className="grid">
      {items.map((n) => (
        <div key={n.id} className="card">
          <div className="between mb">
            <div className="row" style={{ gap: 6 }}>
              <span className="chip"><MessageCircle size={13} /> {KIND_LABEL[n.kind] || 'WhatsApp'}</span>
              <span className={`chip ${n.delivered ? 'chip-green' : 'chip-amber'}`}>
                {n.delivered ? <><CheckCircle2 size={12} /> Enviado</> : (n.deliveryInfo || 'Pendente')}
              </span>
            </div>
            <span className="muted" style={{ fontSize: '0.78rem' }}>{new Date(n.createdAt).toLocaleString('pt-BR')}</span>
          </div>
          <p className="muted" style={{ fontSize: '0.8rem', marginBottom: 6 }}>Para: <b>{n.clientName}</b> · {n.to}</p>
          <p style={{ whiteSpace: 'pre-wrap', fontSize: '0.88rem' }}>{n.message}</p>
          {n.waLink && <a className="btn btn-ghost btn-sm mt" href={n.waLink} target="_blank" rel="noreferrer"><MessageCircle size={15} /> Abrir no WhatsApp</a>}
        </div>
      ))}
    </div>
  );
}

// ---------------- Configurações ----------------
function ConfigTab({ toast }) {
  const [f, setF] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.settings().then(setF); }, []);
  async function save() {
    setSaving(true);
    try { await api.updateSettings(f); toast('Configurações salvas.'); }
    catch (e) { toast(e.message, 'err'); } finally { setSaving(false); }
  }
  async function reset() {
    if (!confirm('Restaurar todos os dados de demonstração? Isso apaga agendamentos e cadastros atuais.')) return;
    await api.reset(); toast('Dados restaurados.'); api.settings().then(setF);
  }
  if (!f) return <Loading />;
  return (
    <div className="grid grid-2">
      <div className="card">
        <h3 className="display mb" style={{ fontSize: '1.4rem' }}>Barbearia</h3>
        <Field label="Nome" value={f.shopName} onChange={(v) => setF({ ...f, shopName: v })} />
        <Field label="Slogan" value={f.slogan} onChange={(v) => setF({ ...f, slogan: v })} />
        <Field label="Endereço" value={f.address} onChange={(v) => setF({ ...f, address: v })} />
        <Field label="Telefone (WhatsApp)" value={f.phone} onChange={(v) => setF({ ...f, phone: v })} />
      </div>
      <div className="card">
        <h3 className="display mb" style={{ fontSize: '1.4rem' }}>Operação</h3>
        <div className="grid grid-2" style={{ gap: 10 }}>
          <Field label="Abre às" type="time" value={f.openTime} onChange={(v) => setF({ ...f, openTime: v })} />
          <Field label="Fecha às" type="time" value={f.closeTime} onChange={(v) => setF({ ...f, closeTime: v })} />
          <Field label="Intervalo de slots (min)" type="number" value={f.slotStep} onChange={(v) => setF({ ...f, slotStep: Number(v) })} />
          <Field label="Buffer entre atend. (min)" type="number" value={f.bufferMin} onChange={(v) => setF({ ...f, bufferMin: Number(v) })} />
        </div>
        <Field label="Políticas" textarea value={f.policies} onChange={(v) => setF({ ...f, policies: v })} />
      </div>
      <div style={{ gridColumn: '1 / -1' }} className="row wrap" >
        <button className="btn btn-gold" disabled={saving} onClick={save}><Check size={16} /> {saving ? 'Salvando...' : 'Salvar configurações'}</button>
        <button className="btn btn-danger" onClick={reset}><RotateCcw size={16} /> Restaurar dados de demonstração</button>
      </div>
    </div>
  );
}

// ---------------- Inputs reutilizáveis ----------------
function Field({ label, value, onChange, type = 'text', textarea, placeholder }) {
  return (
    <div className="field">
      <label>{label}</label>
      {textarea
        ? <textarea value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
        : <input type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />}
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <div className="field" style={{ margin: 0 }}>
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
      </select>
    </div>
  );
}

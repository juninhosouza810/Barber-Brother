import express from 'express';
import cors from 'cors';
import { db, uid } from './db.js';
import { generateSlots, isSlotFree } from './schedule.js';
import { pushNotification } from './notify.js';
import { getStatus as waStatus, initWhatsApp, logoutWhatsApp, hasSavedSession } from './whatsapp.js';
import { startReminderLoop } from './reminders.js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

const ok = (res, data) => res.json(data);
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });

// ----------------------------------------------------------------------------
// Serviços
// ----------------------------------------------------------------------------
app.get('/api/services', (req, res) => ok(res, db.get().services));

app.post('/api/services', (req, res) => {
  const data = db.get();
  const { name, category, durationMin, price, description } = req.body;
  if (!name || !durationMin) return bad(res, 'Nome e duração são obrigatórios.');
  const svc = { id: 'svc-' + uid(), name, category: category || 'Geral', durationMin: Number(durationMin), price: Number(price) || 0, description: description || '' };
  data.services.push(svc);
  db.save();
  ok(res, svc);
});

app.put('/api/services/:id', (req, res) => {
  const data = db.get();
  const svc = data.services.find((s) => s.id === req.params.id);
  if (!svc) return bad(res, 'Serviço não encontrado.', 404);
  Object.assign(svc, {
    name: req.body.name ?? svc.name,
    category: req.body.category ?? svc.category,
    durationMin: req.body.durationMin != null ? Number(req.body.durationMin) : svc.durationMin,
    price: req.body.price != null ? Number(req.body.price) : svc.price,
    description: req.body.description ?? svc.description,
  });
  db.save();
  ok(res, svc);
});

app.delete('/api/services/:id', (req, res) => {
  const data = db.get();
  data.services = data.services.filter((s) => s.id !== req.params.id);
  db.save();
  ok(res, { ok: true });
});

// ----------------------------------------------------------------------------
// Barbeiros
// ----------------------------------------------------------------------------
app.get('/api/barbers', (req, res) => ok(res, db.get().barbers));

app.post('/api/barbers', (req, res) => {
  const data = db.get();
  const { name, role, photo, specialties, bio } = req.body;
  if (!name) return bad(res, 'Nome é obrigatório.');
  const b = {
    id: 'brb-' + uid(),
    name,
    role: role || 'Barbeiro',
    photo: photo || '',
    specialties: Array.isArray(specialties) ? specialties : String(specialties || '').split(',').map((s) => s.trim()).filter(Boolean),
    bio: bio || '',
    rating: 5,
  };
  data.barbers.push(b);
  // disponibilidade padrão Seg-Sáb
  for (let d = 1; d <= 5; d++) data.availability.push({ id: uid(), barberId: b.id, weekday: d, startTime: '09:00', endTime: '19:00' });
  data.availability.push({ id: uid(), barberId: b.id, weekday: 6, startTime: '09:00', endTime: '17:00' });
  db.save();
  ok(res, b);
});

app.put('/api/barbers/:id', (req, res) => {
  const data = db.get();
  const b = data.barbers.find((x) => x.id === req.params.id);
  if (!b) return bad(res, 'Barbeiro não encontrado.', 404);
  const specialties = req.body.specialties != null
    ? (Array.isArray(req.body.specialties) ? req.body.specialties : String(req.body.specialties).split(',').map((s) => s.trim()).filter(Boolean))
    : b.specialties;
  Object.assign(b, {
    name: req.body.name ?? b.name,
    role: req.body.role ?? b.role,
    photo: req.body.photo ?? b.photo,
    bio: req.body.bio ?? b.bio,
    specialties,
  });
  db.save();
  ok(res, b);
});

app.delete('/api/barbers/:id', (req, res) => {
  const data = db.get();
  data.barbers = data.barbers.filter((b) => b.id !== req.params.id);
  data.availability = data.availability.filter((a) => a.barberId !== req.params.id);
  db.save();
  ok(res, { ok: true });
});

// ----------------------------------------------------------------------------
// Disponibilidade (agenda semanal do barbeiro)
// ----------------------------------------------------------------------------
app.get('/api/availability', (req, res) => {
  const data = db.get();
  const { barberId } = req.query;
  let list = data.availability;
  if (barberId) list = list.filter((a) => a.barberId === barberId);
  ok(res, list);
});

// Substitui toda a grade de um barbeiro de uma vez.
app.put('/api/availability/:barberId', (req, res) => {
  const data = db.get();
  const { barberId } = req.params;
  const incoming = Array.isArray(req.body) ? req.body : [];
  data.availability = data.availability.filter((a) => a.barberId !== barberId);
  for (const w of incoming) {
    if (w.weekday == null || !w.startTime || !w.endTime) continue;
    data.availability.push({ id: uid(), barberId, weekday: Number(w.weekday), startTime: w.startTime, endTime: w.endTime });
  }
  db.save();
  ok(res, data.availability.filter((a) => a.barberId === barberId));
});

// ----------------------------------------------------------------------------
// Folgas / bloqueios (datas e horários em que o barbeiro NÃO atende)
// ----------------------------------------------------------------------------
app.get('/api/blocks', (req, res) => {
  const data = db.get();
  const { barberId } = req.query;
  let list = data.blocks;
  if (barberId) list = list.filter((b) => b.barberId === barberId);
  // Mantém apenas bloqueios de hoje em diante (limpa passados).
  const today = new Date().toISOString().slice(0, 10);
  list = list.filter((b) => b.date >= today).sort((a, b) => (a.date + (a.startTime || '')).localeCompare(b.date + (b.startTime || '')));
  ok(res, list);
});

app.post('/api/blocks', (req, res) => {
  const data = db.get();
  const { barberId, date, allDay, startTime, endTime, reason } = req.body;
  if (!barberId || !date) return bad(res, 'Informe o barbeiro e a data.');
  if (!data.barbers.find((b) => b.id === barberId)) return bad(res, 'Barbeiro inválido.');
  const isAllDay = allDay === true || allDay === 'true';
  if (!isAllDay) {
    if (!startTime || !endTime) return bad(res, 'Informe o horário inicial e final do bloqueio.');
    if (startTime >= endTime) return bad(res, 'O horário final deve ser maior que o inicial.');
  }
  const block = {
    id: 'blk-' + uid(),
    barberId,
    date,
    allDay: isAllDay,
    startTime: isAllDay ? null : startTime,
    endTime: isAllDay ? null : endTime,
    reason: reason || '',
    createdAt: new Date().toISOString(),
  };
  data.blocks.push(block);
  db.save();
  ok(res, block);
});

app.delete('/api/blocks/:id', (req, res) => {
  const data = db.get();
  data.blocks = data.blocks.filter((b) => b.id !== req.params.id);
  db.save();
  ok(res, { ok: true });
});

// ----------------------------------------------------------------------------
// Slots / horários livres em tempo real
// ----------------------------------------------------------------------------
app.get('/api/slots', (req, res) => {
  const data = db.get();
  const { barberId, date, serviceId } = req.query;
  if (!barberId || !date) return bad(res, 'barberId e date são obrigatórios.');
  const service = data.services.find((s) => s.id === serviceId);
  const durationMin = service ? service.durationMin : Number(req.query.durationMin) || 30;
  const result = generateSlots({
    barberId,
    date,
    durationMin,
    availability: data.availability,
    appointments: data.appointments,
    settings: data.settings,
    blocks: data.blocks,
  });
  ok(res, { barberId, date, serviceId, durationMin, ...result });
});

// ----------------------------------------------------------------------------
// Agendamentos
// ----------------------------------------------------------------------------
function decorate(appt) {
  const data = db.get();
  const service = data.services.find((s) => s.id === appt.serviceId);
  const barber = data.barbers.find((b) => b.id === appt.barberId);
  return {
    ...appt,
    serviceName: service?.name,
    servicePrice: service?.price,
    barberName: barber?.name,
    barberPhoto: barber?.photo,
  };
}

app.get('/api/appointments', (req, res) => {
  const data = db.get();
  const { phone, barberId, serviceId, status, date } = req.query;
  let list = [...data.appointments];
  if (phone) {
    const p = String(phone).replace(/\D/g, '');
    list = list.filter((a) => (a.clientPhone || '').replace(/\D/g, '') === p);
  }
  if (barberId) list = list.filter((a) => a.barberId === barberId);
  if (serviceId) list = list.filter((a) => a.serviceId === serviceId);
  if (status) list = list.filter((a) => a.status === status);
  if (date) list = list.filter((a) => a.date === date);
  list.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  ok(res, list.map(decorate));
});

app.post('/api/appointments', (req, res) => {
  const data = db.get();
  const { clientName, clientPhone, clientEmail, serviceId, barberId, date, time, notes } = req.body;
  if (!clientName || !clientPhone || !serviceId || !barberId || !date || !time) {
    return bad(res, 'Preencha nome, telefone, serviço, barbeiro, data e hora.');
  }
  const service = data.services.find((s) => s.id === serviceId);
  if (!service) return bad(res, 'Serviço inválido.');
  if (!data.barbers.find((b) => b.id === barberId)) return bad(res, 'Barbeiro inválido.');

  // Regra: não permitir conflito de horário (fonte da verdade no servidor).
  const free = isSlotFree({
    barberId, date, time, durationMin: service.durationMin,
    availability: data.availability, appointments: data.appointments, settings: data.settings, blocks: data.blocks,
  });
  if (!free) return bad(res, 'Esse horário acabou de ser ocupado. Escolha outro, por favor.', 409);

  // Cliente (cadastra ou atualiza por telefone).
  const phoneKey = clientPhone.replace(/\D/g, '');
  let client = data.clients.find((c) => (c.phone || '').replace(/\D/g, '') === phoneKey);
  if (!client) {
    client = { id: 'cli-' + uid(), name: clientName, phone: clientPhone, email: clientEmail || '', createdAt: new Date().toISOString() };
    data.clients.push(client);
  } else {
    client.name = clientName;
    if (clientEmail) client.email = clientEmail;
  }

  const appt = {
    id: 'apt-' + uid(),
    clientId: client.id,
    clientName,
    clientPhone,
    clientEmail: clientEmail || '',
    serviceId,
    barberId,
    date,
    time,
    durationMin: service.durationMin,
    status: 'pendente',
    notes: notes || '',
    createdAt: new Date().toISOString(),
  };
  data.appointments.push(appt);
  db.save();

  const notification = pushNotification(appt, 'novo');
  ok(res, { appointment: decorate(appt), notification });
});

app.patch('/api/appointments/:id', (req, res) => {
  const data = db.get();
  const appt = data.appointments.find((a) => a.id === req.params.id);
  if (!appt) return bad(res, 'Agendamento não encontrado.', 404);

  const { status, date, time, serviceId, barberId, notes } = req.body;
  let kind = 'status';

  // Remarcação: revalida conflito.
  const newDate = date ?? appt.date;
  const newTime = time ?? appt.time;
  const newBarber = barberId ?? appt.barberId;
  const newServiceId = serviceId ?? appt.serviceId;
  const service = data.services.find((s) => s.id === newServiceId);
  const duration = service ? service.durationMin : appt.durationMin;

  const rescheduled = newDate !== appt.date || newTime !== appt.time || newBarber !== appt.barberId || newServiceId !== appt.serviceId;
  if (rescheduled && status !== 'cancelado') {
    const free = isSlotFree({
      barberId: newBarber, date: newDate, time: newTime, durationMin: duration,
      availability: data.availability,
      appointments: data.appointments.filter((a) => a.id !== appt.id),
      settings: data.settings,
      blocks: data.blocks,
    });
    if (!free) return bad(res, 'Horário indisponível para a remarcação.', 409);
    kind = 'remarcado';
  }

  if (date != null) appt.date = newDate;
  if (time != null) appt.time = newTime;
  if (barberId != null) appt.barberId = newBarber;
  if (serviceId != null) { appt.serviceId = newServiceId; appt.durationMin = duration; }
  if (notes != null) appt.notes = notes;
  if (status != null) { appt.status = status; if (status === 'cancelado') kind = 'cancelado'; }
  // Remarcou? O lembrete de 4h deve ser reavaliado para o novo horário.
  if (rescheduled) appt.reminderSent = false;

  db.save();
  const notification = pushNotification(appt, kind);
  ok(res, { appointment: decorate(appt), notification });
});

app.delete('/api/appointments/:id', (req, res) => {
  const data = db.get();
  data.appointments = data.appointments.filter((a) => a.id !== req.params.id);
  db.save();
  ok(res, { ok: true });
});

// ----------------------------------------------------------------------------
// Clientes
// ----------------------------------------------------------------------------
app.get('/api/clients', (req, res) => {
  const data = db.get();
  const withHistory = data.clients.map((c) => ({
    ...c,
    appointments: data.appointments.filter((a) => a.clientId === c.id).length,
  }));
  ok(res, withHistory);
});

// ----------------------------------------------------------------------------
// Notificações (log)
// ----------------------------------------------------------------------------
app.get('/api/notifications', (req, res) => ok(res, db.get().notifications));
app.post('/api/notifications/:id/read', (req, res) => {
  const data = db.get();
  const n = data.notifications.find((x) => x.id === req.params.id);
  if (n) { n.read = true; db.save(); }
  ok(res, { ok: true });
});

// ----------------------------------------------------------------------------
// Configurações
// ----------------------------------------------------------------------------
app.get('/api/settings', (req, res) => {
  const { adminPin, ...rest } = db.get().settings;
  ok(res, rest);
});

app.put('/api/settings', (req, res) => {
  const data = db.get();
  Object.assign(data.settings, req.body);
  db.save();
  const { adminPin, ...rest } = data.settings;
  ok(res, rest);
});

app.post('/api/admin/login', (req, res) => {
  const { pin } = req.body;
  if (String(pin) === String(db.get().settings.adminPin)) return ok(res, { ok: true });
  return bad(res, 'PIN incorreto.', 401);
});

// Reset para dados de demonstração.
app.post('/api/admin/reset', (req, res) => ok(res, { ok: true, reset: true, ...{ data: db.reset() && undefined } }));

// ----------------------------------------------------------------------------
// WhatsApp Web (conexão real)
// ----------------------------------------------------------------------------
app.get('/api/whatsapp/status', (req, res) => ok(res, waStatus()));
app.post('/api/whatsapp/connect', (req, res) => ok(res, initWhatsApp()));
app.post('/api/whatsapp/logout', async (req, res) => ok(res, await logoutWhatsApp()));

app.listen(PORT, () => {
  console.log(`\n  🪒 BarberMan API rodando em http://localhost:${PORT}\n`);
  startReminderLoop();
  // Reconecta automaticamente se já existe uma sessão pareada.
  if (hasSavedSession()) {
    console.log('  📲 Sessão de WhatsApp encontrada — reconectando...');
    initWhatsApp();
  }
});

import express from 'express';
import cors from 'cors';
import { db, uid } from './db.js';
import { generateSlots, isSlotFree } from './schedule.js';
import { pushNotification } from './notify.js';
import { startReminderLoop } from './reminders.js';
import { requireAuth, resolveShop, requireSuperAdmin, requirePlan, isSuperAdmin } from './auth.js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

const ok = (res, data) => res.json(data);
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });

// Health check público (usado pelo Render para verificar se o serviço subiu).
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Helpers de escopo por barbearia (multi-tenant).
const ofShop = (req) => (x) => x.shopId === req.shopId;
const shopSettings = (req) => db.getShop(req.shopId) || {};

// ----------------------------------------------------------------------------
// Conta logada (painel) — dados da barbearia + link público
// ----------------------------------------------------------------------------
app.get('/api/me', requireAuth, (req, res) => {
  const shop = db.getShop(req.shopId) || {};
  ok(res, {
    shopId: req.shopId,
    email: req.shopEmail,
    shopName: shop.shopName || '',
    plan: shop.plan || 'agendamento',
    assinaturaAtiva: shop.assinaturaAtiva !== false,
    vencimento: shop.vencimento || null,
    isSuperAdmin: isSuperAdmin(req.shopEmail),
  });
});

// ----------------------------------------------------------------------------
// Super-admin (dono do sistema) — gestão das barbearias / assinaturas
// ----------------------------------------------------------------------------
const PLAN_PRICE = { agendamento: 29.9, completo: 54.9 };

app.get('/api/admin/shops', requireSuperAdmin, (req, res) => {
  const data = db.get();
  const list = data.shops.map((s) => ({
    id: s.id,
    email: s.email || '',
    shopName: s.shopName || '',
    plan: s.plan || 'agendamento',
    planPrice: PLAN_PRICE[s.plan] ?? PLAN_PRICE.agendamento,
    assinaturaAtiva: s.assinaturaAtiva !== false,
    vencimento: s.vencimento || null,
    criadoEm: s.criadoEm || null,
    agendamentos: data.appointments.filter((a) => a.shopId === s.id).length,
  }));
  list.sort((a, b) => (b.criadoEm || '').localeCompare(a.criadoEm || ''));
  ok(res, list);
});

app.put('/api/admin/shops/:id', requireSuperAdmin, (req, res) => {
  const data = db.get();
  const shop = data.shops.find((s) => s.id === req.params.id);
  if (!shop) return bad(res, 'Barbearia não encontrada.', 404);
  const { plan, assinaturaAtiva, vencimento } = req.body;
  if (plan != null) shop.plan = plan === 'completo' ? 'completo' : 'agendamento';
  if (assinaturaAtiva != null) shop.assinaturaAtiva = !!assinaturaAtiva;
  if (vencimento !== undefined) shop.vencimento = vencimento || null;
  db.save();
  ok(res, shop);
});

// ----------------------------------------------------------------------------
// Serviços
// ----------------------------------------------------------------------------
app.get('/api/services', resolveShop, (req, res) => ok(res, db.get().services.filter(ofShop(req))));

app.post('/api/services', requireAuth, (req, res) => {
  const data = db.get();
  const { name, category, durationMin, price, description } = req.body;
  if (!name || !durationMin) return bad(res, 'Nome e duração são obrigatórios.');
  const svc = { id: 'svc-' + uid(), shopId: req.shopId, name, category: category || 'Geral', durationMin: Number(durationMin), price: Number(price) || 0, description: description || '' };
  data.services.push(svc);
  db.save();
  ok(res, svc);
});

app.put('/api/services/:id', requireAuth, (req, res) => {
  const data = db.get();
  const svc = data.services.find((s) => s.id === req.params.id && s.shopId === req.shopId);
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

app.delete('/api/services/:id', requireAuth, (req, res) => {
  const data = db.get();
  data.services = data.services.filter((s) => !(s.id === req.params.id && s.shopId === req.shopId));
  db.save();
  ok(res, { ok: true });
});

// ----------------------------------------------------------------------------
// Barbeiros
// ----------------------------------------------------------------------------
app.get('/api/barbers', resolveShop, (req, res) => ok(res, db.get().barbers.filter(ofShop(req))));

app.post('/api/barbers', requireAuth, (req, res) => {
  const data = db.get();
  const { name, role, photo, specialties, bio } = req.body;
  if (!name) return bad(res, 'Nome é obrigatório.');
  const b = {
    id: 'brb-' + uid(),
    shopId: req.shopId,
    name,
    role: role || 'Barbeiro',
    photo: photo || '',
    specialties: Array.isArray(specialties) ? specialties : String(specialties || '').split(',').map((s) => s.trim()).filter(Boolean),
    bio: bio || '',
    rating: 5,
  };
  data.barbers.push(b);
  // disponibilidade padrão Seg-Sáb
  for (let d = 1; d <= 5; d++) data.availability.push({ id: uid(), shopId: req.shopId, barberId: b.id, weekday: d, startTime: '09:00', endTime: '19:00' });
  data.availability.push({ id: uid(), shopId: req.shopId, barberId: b.id, weekday: 6, startTime: '09:00', endTime: '17:00' });
  db.save();
  ok(res, b);
});

app.put('/api/barbers/:id', requireAuth, (req, res) => {
  const data = db.get();
  const b = data.barbers.find((x) => x.id === req.params.id && x.shopId === req.shopId);
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

app.delete('/api/barbers/:id', requireAuth, (req, res) => {
  const data = db.get();
  if (!data.barbers.some((b) => b.id === req.params.id && b.shopId === req.shopId)) return bad(res, 'Barbeiro não encontrado.', 404);
  data.barbers = data.barbers.filter((b) => b.id !== req.params.id);
  data.availability = data.availability.filter((a) => a.barberId !== req.params.id);
  db.save();
  ok(res, { ok: true });
});

// ----------------------------------------------------------------------------
// Disponibilidade (agenda semanal do barbeiro)
// ----------------------------------------------------------------------------
app.get('/api/availability', requireAuth, (req, res) => {
  const data = db.get();
  const { barberId } = req.query;
  let list = data.availability.filter(ofShop(req));
  if (barberId) list = list.filter((a) => a.barberId === barberId);
  ok(res, list);
});

// Substitui toda a grade de um barbeiro de uma vez.
app.put('/api/availability/:barberId', requireAuth, (req, res) => {
  const data = db.get();
  const { barberId } = req.params;
  if (!data.barbers.some((b) => b.id === barberId && b.shopId === req.shopId)) return bad(res, 'Barbeiro inválido.', 404);
  const incoming = Array.isArray(req.body) ? req.body : [];
  data.availability = data.availability.filter((a) => a.barberId !== barberId);
  for (const w of incoming) {
    if (w.weekday == null || !w.startTime || !w.endTime) continue;
    data.availability.push({ id: uid(), shopId: req.shopId, barberId, weekday: Number(w.weekday), startTime: w.startTime, endTime: w.endTime });
  }
  db.save();
  ok(res, data.availability.filter((a) => a.barberId === barberId));
});

// ----------------------------------------------------------------------------
// Folgas / bloqueios (datas e horários em que o barbeiro NÃO atende)
// ----------------------------------------------------------------------------
app.get('/api/blocks', requireAuth, (req, res) => {
  const data = db.get();
  const { barberId } = req.query;
  let list = data.blocks.filter(ofShop(req));
  if (barberId) list = list.filter((b) => b.barberId === barberId);
  const today = new Date().toISOString().slice(0, 10);
  list = list.filter((b) => b.date >= today).sort((a, b) => (a.date + (a.startTime || '')).localeCompare(b.date + (b.startTime || '')));
  ok(res, list);
});

app.post('/api/blocks', requireAuth, (req, res) => {
  const data = db.get();
  const { barberId, date, allDay, startTime, endTime, reason } = req.body;
  if (!barberId || !date) return bad(res, 'Informe o barbeiro e a data.');
  if (!data.barbers.find((b) => b.id === barberId && b.shopId === req.shopId)) return bad(res, 'Barbeiro inválido.');
  const isAllDay = allDay === true || allDay === 'true';
  if (!isAllDay) {
    if (!startTime || !endTime) return bad(res, 'Informe o horário inicial e final do bloqueio.');
    if (startTime >= endTime) return bad(res, 'O horário final deve ser maior que o inicial.');
  }
  const block = {
    id: 'blk-' + uid(),
    shopId: req.shopId,
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

app.delete('/api/blocks/:id', requireAuth, (req, res) => {
  const data = db.get();
  data.blocks = data.blocks.filter((b) => !(b.id === req.params.id && b.shopId === req.shopId));
  db.save();
  ok(res, { ok: true });
});

// ----------------------------------------------------------------------------
// Slots / horários livres em tempo real (usado no site público de agendamento)
// ----------------------------------------------------------------------------
app.get('/api/slots', resolveShop, (req, res) => {
  const data = db.get();
  const { barberId, date, serviceId } = req.query;
  if (!barberId || !date) return bad(res, 'barberId e date são obrigatórios.');
  const service = data.services.find((s) => s.id === serviceId && s.shopId === req.shopId);
  const durationMin = service ? service.durationMin : Number(req.query.durationMin) || 30;
  const result = generateSlots({
    barberId,
    date,
    durationMin,
    availability: data.availability.filter(ofShop(req)),
    appointments: data.appointments.filter(ofShop(req)),
    settings: shopSettings(req),
    blocks: data.blocks.filter(ofShop(req)),
  });
  ok(res, { barberId, date, serviceId, durationMin, ...result });
});

// ----------------------------------------------------------------------------
// Agendamentos
// ----------------------------------------------------------------------------
function decorate(appt) {
  const data = db.get();
  const service = data.services.find((s) => s.id === appt.serviceId && s.shopId === appt.shopId);
  const barber = data.barbers.find((b) => b.id === appt.barberId && b.shopId === appt.shopId);
  return {
    ...appt,
    serviceName: service?.name,
    servicePrice: service?.price,
    barberName: barber?.name,
    barberPhoto: barber?.photo,
  };
}

app.get('/api/appointments', resolveShop, (req, res) => {
  const data = db.get();
  const { phone, barberId, serviceId, status, date } = req.query;
  let list = data.appointments.filter(ofShop(req));
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

app.post('/api/appointments', resolveShop, (req, res) => {
  if (!req.shopId) return bad(res, 'Barbearia não identificada.');
  const data = db.get();
  const { clientName, clientPhone, clientEmail, serviceId, barberId, date, time, notes } = req.body;
  if (!clientName || !clientPhone || !serviceId || !barberId || !date || !time) {
    return bad(res, 'Preencha nome, telefone, serviço, barbeiro, data e hora.');
  }
  const service = data.services.find((s) => s.id === serviceId && s.shopId === req.shopId);
  if (!service) return bad(res, 'Serviço inválido.');
  if (!data.barbers.find((b) => b.id === barberId && b.shopId === req.shopId)) return bad(res, 'Barbeiro inválido.');

  // Regra: não permitir conflito de horário (fonte da verdade no servidor).
  const free = isSlotFree({
    barberId, date, time, durationMin: service.durationMin,
    availability: data.availability.filter(ofShop(req)),
    appointments: data.appointments.filter(ofShop(req)),
    settings: shopSettings(req),
    blocks: data.blocks.filter(ofShop(req)),
  });
  if (!free) return bad(res, 'Esse horário acabou de ser ocupado. Escolha outro, por favor.', 409);

  // Cliente (cadastra ou atualiza por telefone, dentro da barbearia).
  const phoneKey = clientPhone.replace(/\D/g, '');
  let client = data.clients.find((c) => c.shopId === req.shopId && (c.phone || '').replace(/\D/g, '') === phoneKey);
  if (!client) {
    client = { id: 'cli-' + uid(), shopId: req.shopId, name: clientName, phone: clientPhone, email: clientEmail || '', createdAt: new Date().toISOString() };
    data.clients.push(client);
  } else {
    client.name = clientName;
    if (clientEmail) client.email = clientEmail;
  }

  const appt = {
    id: 'apt-' + uid(),
    shopId: req.shopId,
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

app.patch('/api/appointments/:id', resolveShop, (req, res) => {
  const data = db.get();
  const appt = data.appointments.find((a) => a.id === req.params.id && a.shopId === req.shopId);
  if (!appt) return bad(res, 'Agendamento não encontrado.', 404);

  const { status, date, time, serviceId, barberId, notes } = req.body;
  let kind = 'status';

  const newDate = date ?? appt.date;
  const newTime = time ?? appt.time;
  const newBarber = barberId ?? appt.barberId;
  const newServiceId = serviceId ?? appt.serviceId;
  const service = data.services.find((s) => s.id === newServiceId && s.shopId === req.shopId);
  const duration = service ? service.durationMin : appt.durationMin;

  const rescheduled = newDate !== appt.date || newTime !== appt.time || newBarber !== appt.barberId || newServiceId !== appt.serviceId;
  if (rescheduled && status !== 'cancelado') {
    const free = isSlotFree({
      barberId: newBarber, date: newDate, time: newTime, durationMin: duration,
      availability: data.availability.filter(ofShop(req)),
      appointments: data.appointments.filter((a) => a.shopId === req.shopId && a.id !== appt.id),
      settings: shopSettings(req),
      blocks: data.blocks.filter(ofShop(req)),
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
  if (rescheduled) appt.reminderSent = false;

  // Plano completo: ao CONCLUIR o atendimento, o valor do serviço entra no
  // caixa automaticamente (uma única vez por agendamento).
  if (appt.status === 'concluido' && !appt.lancadoNoCaixa) {
    const shop = db.getShop(req.shopId);
    if (shop && shop.plan === 'completo') {
      const svc = data.services.find((s) => s.id === appt.serviceId && s.shopId === req.shopId);
      const valor = svc ? Number(svc.price) || 0 : 0;
      const aberto = data.caixas.find((c) => c.shopId === req.shopId && c.status === 'aberto');
      data.movimentos.push({
        id: 'mov-' + uid(),
        shopId: req.shopId,
        caixaId: aberto ? aberto.id : null,
        tipo: 'entrada',
        valor,
        descricao: `Atendimento — ${appt.clientName}${svc ? ' · ' + svc.name : ''}`,
        apptId: appt.id,
        metodo: req.body.metodo || '',
        data: new Date().toISOString(),
      });
      appt.lancadoNoCaixa = true;
    }
  }

  db.save();
  const notification = pushNotification(appt, kind);
  ok(res, { appointment: decorate(appt), notification });
});

app.delete('/api/appointments/:id', resolveShop, (req, res) => {
  const data = db.get();
  data.appointments = data.appointments.filter((a) => !(a.id === req.params.id && a.shopId === req.shopId));
  db.save();
  ok(res, { ok: true });
});

// ----------------------------------------------------------------------------
// Clientes
// ----------------------------------------------------------------------------
app.get('/api/clients', requireAuth, (req, res) => {
  const data = db.get();
  const withHistory = data.clients.filter(ofShop(req)).map((c) => ({
    ...c,
    appointments: data.appointments.filter((a) => a.shopId === req.shopId && a.clientId === c.id).length,
  }));
  ok(res, withHistory);
});

// ----------------------------------------------------------------------------
// Notificações (log)
// ----------------------------------------------------------------------------
app.get('/api/notifications', requireAuth, (req, res) => ok(res, db.get().notifications.filter(ofShop(req))));
app.post('/api/notifications/:id/read', requireAuth, (req, res) => {
  const data = db.get();
  const n = data.notifications.find((x) => x.id === req.params.id && x.shopId === req.shopId);
  if (n) { n.read = true; db.save(); }
  ok(res, { ok: true });
});

// ----------------------------------------------------------------------------
// Configurações da barbearia (públicas para leitura; edição só logado)
// ----------------------------------------------------------------------------
app.get('/api/settings', resolveShop, (req, res) => {
  ok(res, db.getShop(req.shopId) || {});
});

app.put('/api/settings', requireAuth, (req, res) => {
  const data = db.get();
  const shop = data.shops.find((s) => s.id === req.shopId);
  if (!shop) return bad(res, 'Barbearia não encontrada.', 404);
  // O id não pode ser sobrescrito pelo corpo.
  const { id, ...patch } = req.body || {};
  Object.assign(shop, patch);
  db.save();
  ok(res, shop);
});

// Restaura a barbearia logada ao estado inicial.
app.post('/api/admin/reset', requireAuth, (req, res) => {
  const shop = db.resetShop(req.shopId);
  ok(res, { ok: true, reset: true, shop });
});

// ----------------------------------------------------------------------------
// Caixa / Financeiro (PDV) — exclusivo do plano "completo"
// ----------------------------------------------------------------------------
const completo = [requireAuth, requirePlan('completo')];

function saldoEsperado(caixa, movimentos) {
  let saldo = Number(caixa.saldoInicial) || 0;
  for (const m of movimentos) {
    if (m.caixaId !== caixa.id) continue;
    if (m.tipo === 'entrada' || m.tipo === 'suprimento') saldo += Number(m.valor) || 0;
    else if (m.tipo === 'saida' || m.tipo === 'sangria') saldo -= Number(m.valor) || 0;
  }
  return saldo;
}

app.get('/api/caixa/atual', ...completo, (req, res) => {
  const data = db.get();
  const caixa = data.caixas.find((c) => c.shopId === req.shopId && c.status === 'aberto') || null;
  const movimentos = caixa
    ? data.movimentos.filter((m) => m.shopId === req.shopId && m.caixaId === caixa.id).sort((a, b) => (b.data || '').localeCompare(a.data || ''))
    : [];
  ok(res, { caixa, movimentos, saldoEsperado: caixa ? saldoEsperado(caixa, data.movimentos.filter((m) => m.shopId === req.shopId)) : 0 });
});

app.post('/api/caixa/abrir', ...completo, (req, res) => {
  const data = db.get();
  if (data.caixas.some((c) => c.shopId === req.shopId && c.status === 'aberto')) return bad(res, 'Já existe um caixa aberto.');
  const caixa = {
    id: 'cx-' + uid(), shopId: req.shopId, status: 'aberto',
    saldoInicial: Number(req.body.saldoInicial) || 0,
    abertoEm: new Date().toISOString(), fechadoEm: null, saldoFinal: null, diferenca: null,
  };
  data.caixas.push(caixa);
  db.save();
  ok(res, caixa);
});

app.post('/api/caixa/fechar', ...completo, (req, res) => {
  const data = db.get();
  const caixa = data.caixas.find((c) => c.shopId === req.shopId && c.status === 'aberto');
  if (!caixa) return bad(res, 'Nenhum caixa aberto.');
  const esperado = saldoEsperado(caixa, data.movimentos.filter((m) => m.shopId === req.shopId));
  const contado = Number(req.body.saldoFinal) || 0;
  Object.assign(caixa, { status: 'fechado', fechadoEm: new Date().toISOString(), saldoEsperado: esperado, saldoFinal: contado, diferenca: contado - esperado });
  db.save();
  ok(res, caixa);
});

app.post('/api/caixa/movimento', ...completo, (req, res) => {
  const data = db.get();
  const { tipo, valor, descricao } = req.body;
  if (!['sangria', 'suprimento'].includes(tipo)) return bad(res, 'Tipo inválido (use sangria ou suprimento).');
  if (!(Number(valor) > 0)) return bad(res, 'Informe um valor válido.');
  const caixa = data.caixas.find((c) => c.shopId === req.shopId && c.status === 'aberto');
  if (!caixa) return bad(res, 'Abra o caixa primeiro.');
  const mov = { id: 'mov-' + uid(), shopId: req.shopId, caixaId: caixa.id, tipo, valor: Number(valor), descricao: descricao || '', data: new Date().toISOString() };
  data.movimentos.push(mov);
  db.save();
  ok(res, mov);
});

app.get('/api/caixa/historico', ...completo, (req, res) => {
  const data = db.get();
  const list = data.caixas.filter((c) => c.shopId === req.shopId).sort((a, b) => (b.abertoEm || '').localeCompare(a.abertoEm || '')).slice(0, 20);
  ok(res, list);
});

app.get('/api/financeiro/resumo', ...completo, (req, res) => {
  const data = db.get();
  const { de, ate } = req.query;
  let movs = data.movimentos.filter((m) => m.shopId === req.shopId && m.tipo === 'entrada');
  if (de) movs = movs.filter((m) => (m.data || '').slice(0, 10) >= de);
  if (ate) movs = movs.filter((m) => (m.data || '').slice(0, 10) <= ate);
  const receita = movs.reduce((s, m) => s + (Number(m.valor) || 0), 0);
  const qtd = movs.length;
  const porMetodo = {};
  for (const m of movs) { const k = m.metodo || 'Não informado'; porMetodo[k] = (porMetodo[k] || 0) + (Number(m.valor) || 0); }
  ok(res, { receita, qtd, ticket: qtd ? receita / qtd : 0, porMetodo });
});

// Carrega os dados (Firestore como fonte primária) antes de aceitar requisições.
await db.init();

app.listen(PORT, () => {
  console.log(`\n  🪒 BarberMan API rodando em http://localhost:${PORT}\n`);
  startReminderLoop();
});

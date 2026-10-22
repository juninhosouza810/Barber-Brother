import express from 'express';
import cors from 'cors';
import { db, uid } from './db.js';
import { generateSlots, isSlotFree, nowInTz } from './schedule.js';
import { pushNotification } from './notify.js';
import { startReminderLoop } from './reminders.js';
import { requireAuth, resolveShop, requireSuperAdmin, isSuperAdmin } from './auth.js';
import { registerGestao } from './gestao.js';

// Variáveis locais opcionais (server/.env). Em produção vêm do ambiente (Render).
try { process.loadEnvFile(new URL('../.env', import.meta.url)); } catch { /* sem .env */ }

const app = express();
app.use(cors());
// Limite maior para aceitar a logo do salão (data URL já redimensionada no client).
app.use(express.json({ limit: '1mb' }));

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
    logo: shop.logo || '',
    themeColor: shop.themeColor || '',
    planPrice: PLANO_PRECO,
    assinaturaAtiva: shop.assinaturaAtiva !== false,
    vencimento: shop.vencimento || null,
    isSuperAdmin: isSuperAdmin(req.shopEmail),
  });
});

// ----------------------------------------------------------------------------
// Super-admin (dono do sistema) — gestão das barbearias / assinaturas
// ----------------------------------------------------------------------------
// Plano único com todas as funções (agenda, PDV, caixa, contas, financeiro).
const PLANO_PRECO = 59.9;

// Situação da assinatura a partir do vencimento (data AAAA-MM-DD no fuso de Brasília).
const AVISO_DIAS = 5; // "vence em breve" quando faltam até 5 dias
function diasEntre(de, ate) {
  return Math.round((Date.parse(ate + 'T00:00:00Z') - Date.parse(de + 'T00:00:00Z')) / 86_400_000);
}
function situacaoAssinatura(s, hoje) {
  if (s.assinaturaAtiva === false) return { situacao: 'bloqueada', diasParaVencer: null };
  if (!s.vencimento) return { situacao: 'sem_vencimento', diasParaVencer: null };
  const dias = diasEntre(hoje, s.vencimento);
  if (dias < 0) return { situacao: 'vencida', diasParaVencer: dias };
  if (dias <= AVISO_DIAS) return { situacao: 'vence_em_breve', diasParaVencer: dias };
  return { situacao: 'em_dia', diasParaVencer: dias };
}
function somaMeses(iso, meses) {
  const [y, m, d] = iso.split('-').map(Number);
  const alvo = new Date(Date.UTC(y, m - 1 + meses, 1));
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimoDia));
  return alvo.toISOString().slice(0, 10);
}
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function resumoShop(s, data, hoje) {
  return {
    id: s.id,
    email: s.email || '',
    shopName: s.shopName || '',
    logo: s.logo || '',
    phone: s.phone || '',
    planPrice: PLANO_PRECO,
    assinaturaAtiva: s.assinaturaAtiva !== false,
    vencimento: s.vencimento || null,
    ultimoPagamento: s.ultimoPagamento || null,
    pagamentos: (s.pagamentos || []).slice(-12).reverse(),
    criadoEm: s.criadoEm || null,
    agendamentos: data.appointments.filter((a) => a.shopId === s.id).length,
    ...situacaoAssinatura(s, hoje),
  };
}

app.get('/api/admin/shops', requireSuperAdmin, (req, res) => {
  const data = db.get();
  const hoje = nowInTz().date;
  const list = data.shops.map((s) => resumoShop(s, data, hoje));
  list.sort((a, b) => (b.criadoEm || '').localeCompare(a.criadoEm || ''));
  ok(res, list);
});

app.put('/api/admin/shops/:id', requireSuperAdmin, (req, res) => {
  const data = db.get();
  const shop = data.shops.find((s) => s.id === req.params.id);
  if (!shop) return bad(res, 'Salão não encontrado.', 404);
  const { assinaturaAtiva, vencimento } = req.body;
  if (vencimento != null && vencimento !== '' && !ISO_DATE.test(vencimento)) return bad(res, 'Data de vencimento inválida.');
  if (assinaturaAtiva != null) shop.assinaturaAtiva = !!assinaturaAtiva;
  if (vencimento !== undefined) shop.vencimento = vencimento || null;
  db.save();
  ok(res, resumoShop(shop, data, nowInTz().date));
});

// Registra o pagamento da mensalidade: estende o vencimento em N meses
// (a partir do vencimento atual, ou de hoje se já venceu) e reativa o salão.
app.post('/api/admin/shops/:id/pagamento', requireSuperAdmin, (req, res) => {
  const data = db.get();
  const shop = data.shops.find((s) => s.id === req.params.id);
  if (!shop) return bad(res, 'Salão não encontrado.', 404);
  const meses = Math.trunc(Number(req.body?.meses) || 1);
  if (meses < 1 || meses > 12) return bad(res, 'Informe de 1 a 12 meses.');
  const hoje = nowInTz().date;
  const base = shop.vencimento && shop.vencimento > hoje ? shop.vencimento : hoje;
  shop.vencimento = somaMeses(base, meses);
  shop.ultimoPagamento = hoje;
  shop.assinaturaAtiva = true;
  shop.pagamentos = [...(shop.pagamentos || []), {
    data: hoje, meses, valor: Math.round(PLANO_PRECO * meses * 100) / 100, vencimento: shop.vencimento,
  }].slice(-60);
  db.save();
  ok(res, resumoShop(shop, data, hoje));
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
// Leitura pública (a agenda do cliente precisa saber os dias de atendimento).
app.get('/api/availability', resolveShop, (req, res) => {
  if (!req.shopId) return ok(res, []);
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
// Leitura pública (o calendário do cliente esconde os dias de folga). Sem login,
// devolve só data/horário — o motivo da folga fica restrito ao painel.
app.get('/api/blocks', resolveShop, (req, res) => {
  if (!req.shopId) return ok(res, []);
  const data = db.get();
  const { barberId } = req.query;
  let list = data.blocks.filter(ofShop(req));
  if (barberId) list = list.filter((b) => b.barberId === barberId);
  const today = nowInTz(shopSettings(req).timezone).date;
  list = list.filter((b) => b.date >= today).sort((a, b) => (a.date + (a.startTime || '')).localeCompare(b.date + (b.startTime || '')));
  if (!req.authed) {
    list = list.map(({ id, barberId: bId, date, allDay, startTime, endTime }) => ({ id, barberId: bId, date, allDay, startTime, endTime }));
  }
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
  if (!req.shopId) return bad(res, 'Salão não identificado.');
  const shop = db.getShop(req.shopId);
  if (!shop) return bad(res, 'Salão não encontrado.', 404);
  if (shop.assinaturaAtiva === false) return bad(res, 'A agenda deste salão está temporariamente indisponível.', 403);
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

  // Ao CONCLUIR o atendimento, o valor do serviço entra no caixa
  // automaticamente (uma única vez por agendamento).
  if (appt.status === 'concluido' && !appt.lancadoNoCaixa) {
    const shop = db.getShop(req.shopId);
    if (shop) {
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
        dia: nowInTz(shop.timezone).date,
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
// Campos do salão que o site/agenda pública pode ver (sem e-mail, vencimento...).
const PUBLIC_SHOP_FIELDS = ['id', 'shopName', 'slogan', 'logo', 'themeColor', 'phone', 'address', 'openTime', 'closeTime',
  'slotStep', 'cancelPolicyHours', 'policies', 'assinaturaAtiva'];

app.get('/api/settings', resolveShop, (req, res) => {
  const shop = db.getShop(req.shopId);
  if (!shop) return ok(res, {});
  if (req.authed) return ok(res, shop);
  const pub = {};
  for (const k of PUBLIC_SHOP_FIELDS) if (shop[k] !== undefined) pub[k] = shop[k];
  pub.assinaturaAtiva = shop.assinaturaAtiva !== false;
  ok(res, pub);
});

app.put('/api/settings', requireAuth, (req, res) => {
  const data = db.get();
  const shop = data.shops.find((s) => s.id === req.shopId);
  if (!shop) return bad(res, 'Salão não encontrado.', 404);
  // id e dados de assinatura não podem ser sobrescritos pelo assinante (só o super-admin).
  const { id, plan, planPrice, assinaturaAtiva, vencimento, ultimoPagamento, pagamentos, email, criadoEm, ...patch } = req.body || {};
  if (patch.logo != null) {
    if (typeof patch.logo !== 'string') return bad(res, 'Logo inválida.');
    if (patch.logo && !patch.logo.startsWith('data:image/')) return bad(res, 'A logo precisa ser uma imagem.');
    if (patch.logo.length > 700_000) return bad(res, 'Logo muito grande (máx. ~500 KB).');
  }
  if (patch.themeColor != null && patch.themeColor !== '' && !/^#[0-9a-f]{6}$/i.test(patch.themeColor)) {
    return bad(res, 'Cor do layout inválida.');
  }
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
// Caixa / Financeiro (PDV)
// ----------------------------------------------------------------------------

// Saldo físico esperado na gaveta: só dinheiro (Pix/cartão não passam pelo caixa).
// Lançamentos antigos sem método são tratados como dinheiro.
function saldoEsperado(caixa, movimentos) {
  let saldo = Number(caixa.saldoInicial) || 0;
  for (const m of movimentos) {
    if (m.caixaId !== caixa.id) continue;
    if (m.metodo && m.metodo !== 'Dinheiro') continue;
    if (m.tipo === 'entrada' || m.tipo === 'suprimento') saldo += Number(m.valor) || 0;
    else if (m.tipo === 'saida' || m.tipo === 'sangria') saldo -= Number(m.valor) || 0;
  }
  return saldo;
}

app.get('/api/caixa/atual', requireAuth, (req, res) => {
  const data = db.get();
  const caixa = data.caixas.find((c) => c.shopId === req.shopId && c.status === 'aberto') || null;
  const movimentos = caixa
    ? data.movimentos.filter((m) => m.shopId === req.shopId && m.caixaId === caixa.id).sort((a, b) => (b.data || '').localeCompare(a.data || ''))
    : [];
  ok(res, { caixa, movimentos, saldoEsperado: caixa ? saldoEsperado(caixa, data.movimentos.filter((m) => m.shopId === req.shopId)) : 0 });
});

app.post('/api/caixa/abrir', requireAuth, (req, res) => {
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

app.post('/api/caixa/fechar', requireAuth, (req, res) => {
  const data = db.get();
  const caixa = data.caixas.find((c) => c.shopId === req.shopId && c.status === 'aberto');
  if (!caixa) return bad(res, 'Nenhum caixa aberto.');
  const esperado = saldoEsperado(caixa, data.movimentos.filter((m) => m.shopId === req.shopId));
  const contado = Number(req.body.saldoFinal) || 0;
  Object.assign(caixa, { status: 'fechado', fechadoEm: new Date().toISOString(), saldoEsperado: esperado, saldoFinal: contado, diferenca: contado - esperado });
  db.save();
  ok(res, caixa);
});

app.post('/api/caixa/movimento', requireAuth, (req, res) => {
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

app.get('/api/caixa/historico', requireAuth, (req, res) => {
  const data = db.get();
  const list = data.caixas.filter((c) => c.shopId === req.shopId).sort((a, b) => (b.abertoEm || '').localeCompare(a.abertoEm || '')).slice(0, 20);
  ok(res, list);
});

app.get('/api/financeiro/resumo', requireAuth, (req, res) => {
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

// Clientes, PDV, produtos, contas a pagar/receber e fluxo de caixa.
registerGestao(app);

// Carrega os dados (Firestore como fonte primária) antes de aceitar requisições.
await db.init();

app.listen(PORT, () => {
  console.log(`\n  ✂️  Meu Salão API rodando em http://localhost:${PORT}\n`);
  startReminderLoop();
});

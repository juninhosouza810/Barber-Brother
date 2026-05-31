import { db, uid } from './db.js';

const fmtDate = (d) => {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
};

const statusLabel = {
  pendente: 'PENDENTE de confirmação',
  confirmado: 'CONFIRMADO',
  cancelado: 'CANCELADO',
};

/** Monta o texto da mensagem de WhatsApp conforme o tipo de evento. */
export function buildMessage(appointment, kind = 'novo') {
  const data = db.get();
  const service = data.services.find((s) => s.id === appointment.serviceId);
  const barber = data.barbers.find((b) => b.id === appointment.barberId);
  const shop = data.settings?.shopName || 'BarberMan';
  const address = data.settings?.address;

  const quando = `${fmtDate(appointment.date)} às ${appointment.time}`;

  // Lembrete enviado 4h antes do atendimento.
  if (kind === 'lembrete') {
    return (
      `🪒 *${shop}* — Lembrete do seu horário\n\n` +
      `Olá, ${appointment.clientName}! Faltam poucas horas para o seu atendimento. 😉\n\n` +
      `📅 ${quando}\n` +
      `✂️ ${service?.name || '-'}\n` +
      `💈 Com ${barber?.name || '-'}\n` +
      (address ? `📍 ${address}\n` : '') +
      `\nTe esperamos! Caso não possa comparecer, avise com antecedência.`
    );
  }

  const headline =
    kind === 'novo' ? 'Recebemos seu agendamento'
    : kind === 'remarcado' ? 'Seu agendamento foi remarcado'
    : kind === 'cancelado' ? 'Seu agendamento foi cancelado'
    : appointment.status === 'confirmado' ? 'Seu agendamento foi CONFIRMADO'
    : `Atualização do seu agendamento`;

  return (
    `🪒 *${shop}*\n` +
    `${headline}!\n\n` +
    `👤 Cliente: ${appointment.clientName}\n` +
    `✂️ Serviço: ${service?.name || '-'}\n` +
    `💈 Profissional: ${barber?.name || '-'}\n` +
    `📅 Data: ${quando}\n` +
    `📌 Status: ${statusLabel[appointment.status] || appointment.status}` +
    (appointment.notes ? `\n📝 Obs.: ${appointment.notes}` : '') +
    (address ? `\n📍 ${address}` : '')
  );
}

/**
 * Gera e registra um aviso na central de notificações. O envio automático por
 * WhatsApp foi removido; aqui montamos a mensagem e um link wa.me pronto para
 * que o atendente, se quiser, envie manualmente com um clique pelo painel.
 */
export function pushNotification(appointment, kind = 'novo') {
  const data = db.get();
  const message = buildMessage(appointment, kind);

  const phone = (appointment.clientPhone || '').replace(/\D/g, '');
  const waLink = phone ? `https://wa.me/55${phone}?text=${encodeURIComponent(message)}` : null;

  const record = {
    id: uid(),
    appointmentId: appointment.id,
    channel: 'manual',
    kind,
    to: appointment.clientPhone,
    clientName: appointment.clientName,
    message,
    waLink,
    delivered: false,
    deliveryInfo: 'Envie pelo link, se desejar',
    createdAt: new Date().toISOString(),
    read: false,
  };

  data.notifications.unshift(record);
  if (data.notifications.length > 200) data.notifications.length = 200;
  db.save();

  return record;
}

// Agendador de lembretes: envia um aviso por WhatsApp ~4h antes do atendimento.
import { db } from './db.js';
import { pushNotification } from './notify.js';
import { nowInTz, wallStamp } from './schedule.js';

const HOURS_BEFORE = 4;
const CHECK_EVERY_MS = 60 * 1000; // verifica a cada minuto

function checkReminders() {
  const data = db.get();
  const remindWindow = HOURS_BEFORE * 60 * 60 * 1000;
  let changed = false;

  for (const appt of data.appointments) {
    if (appt.status === 'cancelado') continue;
    if (appt.reminderSent) continue;

    // Compara no fuso do salão (o servidor pode estar em UTC).
    const now = nowInTz(db.getShop(appt.shopId)?.timezone).stamp;
    const start = wallStamp(appt.date, appt.time);
    const remindAt = start - remindWindow;

    // Janela: já passou da marca de 4h antes e o atendimento ainda não começou.
    if (now >= remindAt && now < start) {
      appt.reminderSent = true;
      changed = true;
      pushNotification(appt, 'lembrete');
      console.log(`  ⏰ Lembrete enviado para ${appt.clientName} (${appt.date} ${appt.time})`);
    }
  }

  if (changed) db.save();
}

export function startReminderLoop() {
  checkReminders();
  setInterval(checkReminders, CHECK_EVERY_MS);
  console.log(`  ⏰ Lembretes automáticos ativos (${HOURS_BEFORE}h antes do atendimento).`);
}

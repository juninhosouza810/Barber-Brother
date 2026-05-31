// Conexão real ao WhatsApp Web (via whatsapp-web.js + Puppeteer).
// A sessão fica salva em server/data/.wwebjs_auth (LocalAuth), então após
// parear o QR uma vez o servidor reconecta sozinho nos próximos starts.
import pkg from 'whatsapp-web.js';
import qrcodeLib from 'qrcode';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Client, LocalAuth } = pkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(__dirname, '..', 'data', '.wwebjs_auth');

let client = null;

// Estado observável pelo painel admin.
const state = {
  status: 'disconnected', // disconnected | starting | qr | authenticated | connected | error
  qr: null,               // data URL (imagem do QR) quando status === 'qr'
  me: null,               // { number, name } quando conectado
  error: null,
  updatedAt: null,
};

function set(patch) {
  Object.assign(state, patch, { updatedAt: new Date().toISOString() });
}

export function getStatus() {
  const { status, qr, me, error, updatedAt } = state;
  return { status, qr, me, error, updatedAt };
}

/** Existe uma sessão salva (já pareada anteriormente)? */
export function hasSavedSession() {
  try {
    return fs.existsSync(AUTH_DIR) && fs.readdirSync(AUTH_DIR).length > 0;
  } catch {
    return false;
  }
}

/** Inicia (ou reinicia) a conexão. Idempotente: ignora se já está ativo. */
export function initWhatsApp() {
  if (client) return getStatus();
  set({ status: 'starting', qr: null, error: null });

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: AUTH_DIR }),
    puppeteer: {
      headless: true,
      // Em produção (Docker/Render) usamos o Chromium do sistema via
      // PUPPETEER_EXECUTABLE_PATH; em dev, fica undefined e usa o do Puppeteer.
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      // Flags de baixo consumo de memória — essenciais para rodar o Chromium
      // em hosts com pouca RAM (ex.: plano grátis do Render, 512 MB).
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-extensions',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
      ],
    },
  });

  client.on('qr', async (qr) => {
    try {
      const dataUrl = await qrcodeLib.toDataURL(qr, { margin: 1, width: 300 });
      set({ status: 'qr', qr: dataUrl });
    } catch {
      set({ status: 'qr' });
    }
  });

  client.on('loading_screen', () => set({ status: 'authenticated', qr: null }));
  client.on('authenticated', () => set({ status: 'authenticated', qr: null }));

  client.on('ready', () => {
    const info = client?.info;
    set({
      status: 'connected',
      qr: null,
      error: null,
      me: info?.wid?.user ? { number: info.wid.user, name: info.pushname || '' } : null,
    });
    console.log('  📲 WhatsApp conectado:', state.me?.number || '(número oculto)');
  });

  client.on('auth_failure', (msg) => set({ status: 'error', error: String(msg), qr: null }));

  client.on('disconnected', (reason) => {
    console.log('  📴 WhatsApp desconectado:', reason);
    set({ status: 'disconnected', me: null, qr: null });
    try { client?.destroy(); } catch { /* noop */ }
    client = null;
  });

  client.initialize().catch((e) => {
    set({ status: 'error', error: e.message, qr: null });
    client = null;
  });

  return getStatus();
}

/** Encerra a sessão e apaga as credenciais salvas. */
export async function logoutWhatsApp() {
  if (client) {
    try { await client.logout(); } catch { /* já caiu */ }
    try { await client.destroy(); } catch { /* noop */ }
    client = null;
  }
  set({ status: 'disconnected', qr: null, me: null, error: null });
  return getStatus();
}

/** Normaliza um telefone BR para o formato do WhatsApp (com DDI 55). */
function normalizePhone(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length <= 11) d = '55' + d; // assume Brasil quando não tem DDI
  return d;
}

/**
 * Envia uma mensagem de texto. Retorna { sent, reason }.
 * Não lança erro — falhas são informativas (ex.: não conectado).
 */
export async function sendWhatsApp(phone, text) {
  if (state.status !== 'connected' || !client) {
    return { sent: false, reason: 'WhatsApp não conectado' };
  }
  const number = normalizePhone(phone);
  if (!number) return { sent: false, reason: 'Telefone inválido' };
  try {
    const numberId = await client.getNumberId(number);
    if (!numberId) return { sent: false, reason: 'Número não possui WhatsApp' };
    await client.sendMessage(numberId._serialized, text);
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e.message };
  }
}

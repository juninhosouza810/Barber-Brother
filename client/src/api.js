// Cliente HTTP fino para a API do BarberMan.
import { auth } from './firebase.js';

const BASE = '/api';

// Identifica a barbearia no site público pelo ?shop=<id> da URL (lembrado no
// dispositivo). No painel admin isso é ignorado — usamos o token de login.
function currentShop() {
  const fromUrl = new URLSearchParams(location.search).get('shop');
  if (fromUrl) { try { localStorage.setItem('bm_shop', fromUrl); } catch { /* noop */ } return fromUrl; }
  try { return localStorage.getItem('bm_shop'); } catch { return null; }
}

async function req(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };

  const user = auth.currentUser;
  if (user) {
    // Painel logado: envia o ID token (o servidor resolve a barbearia pelo login).
    try { headers.Authorization = `Bearer ${await user.getIdToken()}`; } catch { /* segue sem token */ }
  } else {
    // Site público: anexa a barbearia como ?shop=<id>.
    const shop = currentShop();
    if (shop && !/[?&]shop=/.test(path)) {
      path += (path.includes('?') ? '&' : '?') + 'shop=' + encodeURIComponent(shop);
    }
  }

  const res = await fetch(BASE + path, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* sem corpo */ }
  if (!res.ok) {
    const msg = (data && data.error) || `Erro ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export const api = {
  // Serviços
  services: () => req('/services'),
  createService: (b) => req('/services', { method: 'POST', body: b }),
  updateService: (id, b) => req(`/services/${id}`, { method: 'PUT', body: b }),
  deleteService: (id) => req(`/services/${id}`, { method: 'DELETE' }),

  // Barbeiros
  barbers: () => req('/barbers'),
  createBarber: (b) => req('/barbers', { method: 'POST', body: b }),
  updateBarber: (id, b) => req(`/barbers/${id}`, { method: 'PUT', body: b }),
  deleteBarber: (id) => req(`/barbers/${id}`, { method: 'DELETE' }),

  // Disponibilidade
  availability: (barberId) => req(`/availability${barberId ? `?barberId=${barberId}` : ''}`),
  setAvailability: (barberId, list) => req(`/availability/${barberId}`, { method: 'PUT', body: list }),

  // Folgas / bloqueios
  blocks: (barberId) => req(`/blocks${barberId ? `?barberId=${barberId}` : ''}`),
  createBlock: (b) => req('/blocks', { method: 'POST', body: b }),
  deleteBlock: (id) => req(`/blocks/${id}`, { method: 'DELETE' }),

  // Slots
  slots: ({ barberId, date, serviceId }) =>
    req(`/slots?barberId=${barberId}&date=${date}&serviceId=${serviceId}`),

  // Agendamentos
  appointments: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return req(`/appointments${q ? `?${q}` : ''}`);
  },
  createAppointment: (b) => req('/appointments', { method: 'POST', body: b }),
  updateAppointment: (id, b) => req(`/appointments/${id}`, { method: 'PATCH', body: b }),
  deleteAppointment: (id) => req(`/appointments/${id}`, { method: 'DELETE' }),

  // Clientes
  clients: () => req('/clients'),

  // Notificações
  notifications: () => req('/notifications'),

  // Conta logada
  me: () => req('/me'),

  // Configurações / admin
  settings: () => req('/settings'),
  updateSettings: (b) => req('/settings', { method: 'PUT', body: b }),
  reset: () => req('/admin/reset', { method: 'POST' }),
};

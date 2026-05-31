// Cliente HTTP fino para a API do BarberMan.
const BASE = '/api';

async function req(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
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

  // Configurações / admin
  settings: () => req('/settings'),
  updateSettings: (b) => req('/settings', { method: 'PUT', body: b }),
  adminLogin: (pin) => req('/admin/login', { method: 'POST', body: { pin } }),
  reset: () => req('/admin/reset', { method: 'POST' }),
};

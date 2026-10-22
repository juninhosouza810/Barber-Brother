// Cliente HTTP fino para a API do BarberMan.
import { auth } from './firebase.js';

const BASE = '/api';

// Identifica a barbearia no site público pelo ?shop=<id> da URL (lembrado no
// dispositivo). No painel admin isso é ignorado — usamos o token de login.
// Link exclusivo de agenda do salão: /agenda/<shopId>.
export function agendaShopId() {
  const m = location.pathname.match(/^\/agenda\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function currentShop() {
  const fromAgenda = agendaShopId();
  if (fromAgenda) return fromAgenda;
  const fromUrl = new URLSearchParams(location.search).get('shop');
  if (fromUrl) { try { localStorage.setItem('bm_shop', fromUrl); } catch { /* noop */ } return fromUrl; }
  try { return localStorage.getItem('bm_shop'); } catch { return null; }
}

async function req(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };

  // Na agenda pública o salão vem sempre do link, mesmo que o dono esteja logado
  // neste navegador — assim ele vê exatamente o que o cliente verá.
  const user = agendaShopId() ? null : auth.currentUser;
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
  createClient: (b) => req('/clients', { method: 'POST', body: b }),
  updateClient: (id, b) => req(`/clients/${id}`, { method: 'PUT', body: b }),
  deleteClient: (id) => req(`/clients/${id}`, { method: 'DELETE' }),
  clientHistory: (id) => req(`/clients/${id}/historico`),

  // Produtos / PDV
  produtos: () => req('/produtos'),
  createProduto: (b) => req('/produtos', { method: 'POST', body: b }),
  updateProduto: (id, b) => req(`/produtos/${id}`, { method: 'PUT', body: b }),
  deleteProduto: (id) => req(`/produtos/${id}`, { method: 'DELETE' }),
  vendas: (de, ate) => {
    const q = new URLSearchParams({ ...(de ? { de } : {}), ...(ate ? { ate } : {}) }).toString();
    return req(`/vendas${q ? `?${q}` : ''}`);
  },
  createVenda: (b) => req('/vendas', { method: 'POST', body: b }),
  estornarVenda: (id) => req(`/vendas/${id}`, { method: 'DELETE' }),

  // Contas a pagar / receber
  contas: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return req(`/contas${q ? `?${q}` : ''}`);
  },
  createConta: (b) => req('/contas', { method: 'POST', body: b }),
  updateConta: (id, b) => req(`/contas/${id}`, { method: 'PUT', body: b }),
  deleteConta: (id) => req(`/contas/${id}`, { method: 'DELETE' }),
  baixarConta: (id, metodo) => req(`/contas/${id}/baixar`, { method: 'POST', body: { metodo } }),
  estornarConta: (id) => req(`/contas/${id}/estornar`, { method: 'POST' }),
  fluxo: (de, ate) => {
    const q = new URLSearchParams({ ...(de ? { de } : {}), ...(ate ? { ate } : {}) }).toString();
    return req(`/financeiro/fluxo${q ? `?${q}` : ''}`);
  },

  // Notificações
  notifications: () => req('/notifications'),

  // Conta logada
  me: () => req('/me'),

  // Configurações / admin
  settings: () => req('/settings'),
  updateSettings: (b) => req('/settings', { method: 'PUT', body: b }),
  reset: () => req('/admin/reset', { method: 'POST' }),

  // Caixa / Financeiro
  caixaAtual: () => req('/caixa/atual'),
  abrirCaixa: (saldoInicial) => req('/caixa/abrir', { method: 'POST', body: { saldoInicial } }),
  fecharCaixa: (saldoFinal) => req('/caixa/fechar', { method: 'POST', body: { saldoFinal } }),
  movimentoCaixa: (b) => req('/caixa/movimento', { method: 'POST', body: b }),
  historicoCaixa: () => req('/caixa/historico'),
  financeiro: (de, ate) => {
    const q = new URLSearchParams({ ...(de ? { de } : {}), ...(ate ? { ate } : {}) }).toString();
    return req(`/financeiro/resumo${q ? `?${q}` : ''}`);
  },

  // Super-admin (dono do sistema)
  adminShops: () => req('/admin/shops'),
  adminUpdateShop: (id, b) => req(`/admin/shops/${id}`, { method: 'PUT', body: b }),
  adminPagamento: (id, meses = 1) => req(`/admin/shops/${id}/pagamento`, { method: 'POST', body: { meses } }),
};

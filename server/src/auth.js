// Autenticação multi-tenant.
// O shopId é o uid da conta do Firebase — cada conta = uma barbearia.
import admin from 'firebase-admin';
import { db } from './db.js';

const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL || '').toLowerCase();

export function isSuperAdmin(email) {
  return !!SUPER_ADMIN_EMAIL && String(email || '').toLowerCase() === SUPER_ADMIN_EMAIL;
}

function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

// Protege rotas de gestão (painel admin): exige login válido.
export async function requireAuth(req, res, next) {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Faça login para continuar.' });
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.shopId = decoded.uid;
    req.shopEmail = decoded.email || null;
    db.ensureShop(req.shopId, req.shopEmail); // provisiona a barbearia no primeiro acesso
    next();
  } catch {
    return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
  }
}

// Restringe ao dono do sistema (super-admin) — gestão de assinaturas.
export async function requireSuperAdmin(req, res, next) {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Faça login para continuar.' });
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    if (!isSuperAdmin(decoded.email)) {
      return res.status(403).json({ error: 'Acesso restrito ao administrador do sistema.' });
    }
    req.shopId = decoded.uid;
    req.shopEmail = decoded.email || null;
    next();
  } catch {
    return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
  }
}

// Gating por plano: exige que a barbearia esteja no plano informado.
// O super-admin tem acesso liberado. Use depois de requireAuth.
export function requirePlan(plan) {
  return (req, res, next) => {
    if (isSuperAdmin(req.shopEmail)) return next();
    const shop = db.getShop(req.shopId);
    if (!shop) return res.status(404).json({ error: 'Barbearia não encontrada.' });
    if (shop.plan !== plan) {
      return res.status(403).json({ error: 'Recurso disponível apenas no plano Completo.' });
    }
    next();
  };
}

// Rotas acessíveis pelo painel (login) E pelo site público (cliente final).
// Resolve o shopId pelo token, se houver; senão, pelo ?shop=<id> da URL.
export async function resolveShop(req, res, next) {
  const token = bearer(req);
  if (token) {
    try {
      const decoded = await admin.auth().verifyIdToken(token);
      req.shopId = decoded.uid;
      req.shopEmail = decoded.email || null;
      db.ensureShop(req.shopId, req.shopEmail);
      return next();
    } catch { /* token inválido: tenta o parâmetro público abaixo */ }
  }
  // Sem login: identifica a barbearia pelo ?shop=<id> (ou shopId no corpo).
  // Não bloqueia aqui — fica null e as rotas de leitura devolvem lista vazia;
  // as rotas de escrita validam a presença do shopId individualmente.
  const shopId = req.query.shop || (req.body && req.body.shopId);
  req.shopId = shopId ? String(shopId) : null;
  next();
}

// Autenticação multi-tenant.
// O shopId é o uid da conta do Firebase — cada conta = uma barbearia.
import admin from 'firebase-admin';
import { db } from './db.js';

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
    db.ensureShop(req.shopId); // provisiona a barbearia no primeiro acesso
    next();
  } catch {
    return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
  }
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
      db.ensureShop(req.shopId);
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

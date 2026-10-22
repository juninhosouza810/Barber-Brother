// Gestão do salão: cadastro de clientes, PDV (vendas), produtos,
// contas a pagar/receber e fluxo de caixa.
import { db, uid } from './db.js';
import { requireAuth } from './auth.js';
import { nowInTz } from './schedule.js';

const ok = (res, data) => res.json(data);
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const ofShop = (req) => (x) => x.shopId === req.shopId;

export const METODOS = ['Dinheiro', 'Pix', 'Cartão de débito', 'Cartão de crédito'];
const A_PRAZO = 'A prazo';
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const money = (v) => Math.round((Number(v) || 0) * 100) / 100;
const hoje = (req) => nowInTz(db.getShop(req.shopId)?.timezone).date;
const caixaAberto = (data, shopId) => data.caixas.find((c) => c.shopId === shopId && c.status === 'aberto');

// Dia (no fuso do salão) de uma movimentação — antigas só têm o ISO em UTC.
const diaMov = (m) => m.dia || (m.data || '').slice(0, 10);

/** Lança entrada/saída no fluxo; vai para o caixa aberto se houver. */
function lancar(req, { tipo, valor, descricao, metodo = '', origem = {} }) {
  const data = db.get();
  const caixa = caixaAberto(data, req.shopId);
  const mov = {
    id: 'mov-' + uid(),
    shopId: req.shopId,
    caixaId: caixa ? caixa.id : null,
    tipo, // 'entrada' | 'saida'
    valor: money(valor),
    descricao: descricao || '',
    metodo,
    data: new Date().toISOString(),
    dia: hoje(req),
    ...origem,
  };
  data.movimentos.push(mov);
  return mov;
}

function findClient(data, req, id) {
  return id ? data.clients.find((c) => c.id === id && c.shopId === req.shopId) : null;
}

export function registerGestao(app) {
  // --------------------------------------------------------------------------
  // Clientes
  // --------------------------------------------------------------------------
  function clientPayload(body) {
    const { name, phone, email, birthday, notes } = body || {};
    return {
      name: String(name || '').trim(),
      phone: String(phone || '').trim(),
      email: String(email || '').trim(),
      birthday: isDate(birthday) ? birthday : '',
      notes: String(notes || '').slice(0, 1000),
    };
  }
  const phoneTaken = (data, req, phone, exceptId) => {
    const key = phone.replace(/\D/g, '');
    return key && data.clients.some((c) => c.shopId === req.shopId && c.id !== exceptId && (c.phone || '').replace(/\D/g, '') === key);
  };

  app.post('/api/clients', requireAuth, (req, res) => {
    const data = db.get();
    const p = clientPayload(req.body);
    if (!p.name) return bad(res, 'Informe o nome do cliente.');
    if (phoneTaken(data, req, p.phone)) return bad(res, 'Já existe um cliente com esse telefone.', 409);
    const client = { id: 'cli-' + uid(), shopId: req.shopId, ...p, createdAt: new Date().toISOString() };
    data.clients.push(client);
    db.save();
    ok(res, client);
  });

  app.put('/api/clients/:id', requireAuth, (req, res) => {
    const data = db.get();
    const client = findClient(data, req, req.params.id);
    if (!client) return bad(res, 'Cliente não encontrado.', 404);
    const p = clientPayload(req.body);
    if (!p.name) return bad(res, 'Informe o nome do cliente.');
    if (phoneTaken(data, req, p.phone, client.id)) return bad(res, 'Já existe um cliente com esse telefone.', 409);
    Object.assign(client, p);
    db.save();
    ok(res, client);
  });

  app.delete('/api/clients/:id', requireAuth, (req, res) => {
    const data = db.get();
    const client = findClient(data, req, req.params.id);
    if (!client) return bad(res, 'Cliente não encontrado.', 404);
    if (data.contas.some((c) => c.shopId === req.shopId && c.clientId === client.id && c.status === 'aberta')) {
      return bad(res, 'Este cliente tem contas a receber em aberto.', 409);
    }
    data.clients = data.clients.filter((c) => c !== client);
    db.save();
    ok(res, { ok: true });
  });

  // Ficha do cliente: agendamentos, compras e contas.
  app.get('/api/clients/:id/historico', requireAuth, (req, res) => {
    const data = db.get();
    const client = findClient(data, req, req.params.id);
    if (!client) return bad(res, 'Cliente não encontrado.', 404);
    const appointments = data.appointments
      .filter((a) => a.shopId === req.shopId && a.clientId === client.id)
      .map((a) => ({ id: a.id, date: a.date, time: a.time, status: a.status, serviceName: data.services.find((s) => s.id === a.serviceId)?.name || '' }))
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    const vendas = data.vendas.filter((v) => v.shopId === req.shopId && v.clientId === client.id).sort((a, b) => b.data.localeCompare(a.data));
    const contas = data.contas.filter((c) => c.shopId === req.shopId && c.clientId === client.id);
    const totalGasto = vendas.reduce((s, v) => s + v.total, 0);
    const emAberto = contas.filter((c) => c.status === 'aberta').reduce((s, c) => s + c.valor, 0);
    ok(res, { client, appointments, vendas, contas, totalGasto: money(totalGasto), emAberto: money(emAberto) });
  });

  // --------------------------------------------------------------------------
  // Produtos
  // --------------------------------------------------------------------------
  function produtoPayload(body) {
    const { name, price, stock, category } = body || {};
    return {
      name: String(name || '').trim(),
      category: String(category || '').trim(),
      price: money(price),
      // null = não controla estoque
      stock: stock === '' || stock == null ? null : Math.max(0, Math.floor(Number(stock) || 0)),
    };
  }

  app.get('/api/produtos', requireAuth, (req, res) => {
    ok(res, db.get().produtos.filter(ofShop(req)).sort((a, b) => a.name.localeCompare(b.name)));
  });

  app.post('/api/produtos', requireAuth, (req, res) => {
    const p = produtoPayload(req.body);
    if (!p.name) return bad(res, 'Informe o nome do produto.');
    const prod = { id: 'prd-' + uid(), shopId: req.shopId, ...p };
    db.get().produtos.push(prod);
    db.save();
    ok(res, prod);
  });

  app.put('/api/produtos/:id', requireAuth, (req, res) => {
    const prod = db.get().produtos.find((p) => p.id === req.params.id && p.shopId === req.shopId);
    if (!prod) return bad(res, 'Produto não encontrado.', 404);
    const p = produtoPayload(req.body);
    if (!p.name) return bad(res, 'Informe o nome do produto.');
    Object.assign(prod, p);
    db.save();
    ok(res, prod);
  });

  app.delete('/api/produtos/:id', requireAuth, (req, res) => {
    const data = db.get();
    data.produtos = data.produtos.filter((p) => !(p.id === req.params.id && p.shopId === req.shopId));
    db.save();
    ok(res, { ok: true });
  });

  // --------------------------------------------------------------------------
  // PDV — vendas
  // --------------------------------------------------------------------------
  app.get('/api/vendas', requireAuth, (req, res) => {
    const { de, ate } = req.query;
    let list = db.get().vendas.filter(ofShop(req));
    if (isDate(de)) list = list.filter((v) => v.dia >= de);
    if (isDate(ate)) list = list.filter((v) => v.dia <= ate);
    ok(res, list.sort((a, b) => b.data.localeCompare(a.data)).slice(0, 200));
  });

  app.post('/api/vendas', requireAuth, (req, res) => {
    const data = db.get();
    const { clientId, itens, desconto, metodo, vencimento, obs } = req.body || {};
    if (!Array.isArray(itens) || itens.length === 0) return bad(res, 'Adicione ao menos um item.');
    if (![...METODOS, A_PRAZO].includes(metodo)) return bad(res, 'Forma de pagamento inválida.');
    const client = findClient(data, req, clientId);
    if (clientId && !client) return bad(res, 'Cliente não encontrado.', 404);
    if (metodo === A_PRAZO && !client) return bad(res, 'Venda a prazo precisa de um cliente.');
    if (metodo === A_PRAZO && !isDate(vencimento)) return bad(res, 'Informe o vencimento da venda a prazo.');

    // Os itens vêm do catálogo do salão; o preço pode ser ajustado no caixa.
    const linhas = [];
    for (const it of itens) {
      const qtd = Math.max(1, Math.floor(Number(it.qtd) || 1));
      const ref = it.tipo === 'produto'
        ? data.produtos.find((p) => p.id === it.refId && p.shopId === req.shopId)
        : it.tipo === 'servico'
          ? data.services.find((s) => s.id === it.refId && s.shopId === req.shopId)
          : null;
      if (it.tipo !== 'avulso' && !ref) return bad(res, 'Item inválido na venda.');
      if (it.tipo === 'avulso' && !String(it.nome || '').trim()) return bad(res, 'Informe a descrição do item avulso.');
      if (ref && it.tipo === 'produto' && ref.stock != null && ref.stock < qtd) {
        return bad(res, `Estoque insuficiente de "${ref.name}" (disponível: ${ref.stock}).`, 409);
      }
      const preco = it.preco != null && it.preco !== '' ? money(it.preco) : money(ref?.price);
      if (preco < 0) return bad(res, 'Preço inválido.');
      linhas.push({ tipo: it.tipo, refId: ref?.id || null, nome: ref?.name || String(it.nome).trim(), qtd, preco, subtotal: money(preco * qtd) });
    }
    const bruto = money(linhas.reduce((s, l) => s + l.subtotal, 0));
    const desc = Math.min(bruto, Math.max(0, money(desconto)));
    const total = money(bruto - desc);

    const venda = {
      id: 'vnd-' + uid(),
      shopId: req.shopId,
      numero: data.vendas.filter(ofShop(req)).length + 1,
      clientId: client?.id || null,
      clientName: client?.name || '',
      itens: linhas,
      bruto, desconto: desc, total,
      metodo,
      obs: String(obs || '').slice(0, 500),
      data: new Date().toISOString(),
      dia: hoje(req),
    };

    // Baixa de estoque.
    for (const l of linhas) {
      if (l.tipo !== 'produto') continue;
      const prod = data.produtos.find((p) => p.id === l.refId);
      if (prod && prod.stock != null) prod.stock -= l.qtd;
    }

    const descricao = `Venda #${venda.numero}${client ? ' — ' + client.name : ''}`;
    if (metodo === A_PRAZO) {
      const conta = {
        id: 'cta-' + uid(), shopId: req.shopId, tipo: 'receber', descricao, categoria: 'Vendas',
        valor: total, vencimento, clientId: client.id, clientName: client.name,
        status: 'aberta', vendaId: venda.id, criadoEm: venda.data,
      };
      data.contas.push(conta);
      venda.contaId = conta.id;
    } else if (total > 0) {
      venda.movimentoId = lancar(req, { tipo: 'entrada', valor: total, descricao, metodo, origem: { vendaId: venda.id } }).id;
    }

    data.vendas.push(venda);
    db.save();
    ok(res, venda);
  });

  // Estorna uma venda: devolve estoque e remove os lançamentos/contas gerados.
  app.delete('/api/vendas/:id', requireAuth, (req, res) => {
    const data = db.get();
    const venda = data.vendas.find((v) => v.id === req.params.id && v.shopId === req.shopId);
    if (!venda) return bad(res, 'Venda não encontrada.', 404);
    const conta = venda.contaId && data.contas.find((c) => c.id === venda.contaId);
    if (conta && conta.status === 'paga') return bad(res, 'A conta desta venda já foi recebida. Estorne o recebimento antes.', 409);
    for (const l of venda.itens) {
      if (l.tipo !== 'produto') continue;
      const prod = data.produtos.find((p) => p.id === l.refId);
      if (prod && prod.stock != null) prod.stock += l.qtd;
    }
    data.movimentos = data.movimentos.filter((m) => m.vendaId !== venda.id);
    data.contas = data.contas.filter((c) => c.vendaId !== venda.id);
    data.vendas = data.vendas.filter((v) => v !== venda);
    db.save();
    ok(res, { ok: true });
  });

  // --------------------------------------------------------------------------
  // Contas a pagar / a receber
  // --------------------------------------------------------------------------
  app.get('/api/contas', requireAuth, (req, res) => {
    const { tipo, status } = req.query;
    let list = db.get().contas.filter(ofShop(req));
    if (tipo) list = list.filter((c) => c.tipo === tipo);
    if (status) list = list.filter((c) => c.status === status);
    ok(res, list.sort((a, b) => (a.status === b.status ? a.vencimento.localeCompare(b.vencimento) : a.status === 'aberta' ? -1 : 1)));
  });

  function contaPayload(data, req, body) {
    const { tipo, descricao, categoria, valor, vencimento, clientId } = body || {};
    if (!['pagar', 'receber'].includes(tipo)) return { error: 'Tipo inválido.' };
    if (!String(descricao || '').trim()) return { error: 'Informe a descrição.' };
    if (!(Number(valor) > 0)) return { error: 'Informe um valor válido.' };
    if (!isDate(vencimento)) return { error: 'Informe o vencimento.' };
    const client = findClient(data, req, clientId);
    return {
      tipo,
      descricao: String(descricao).trim(),
      categoria: String(categoria || '').trim(),
      valor: money(valor),
      vencimento,
      clientId: client?.id || null,
      clientName: client?.name || '',
    };
  }

  app.post('/api/contas', requireAuth, (req, res) => {
    const data = db.get();
    const p = contaPayload(data, req, req.body);
    if (p.error) return bad(res, p.error);
    const parcelas = Math.min(24, Math.max(1, Math.floor(Number(req.body.parcelas) || 1)));
    const criadas = [];
    for (let i = 0; i < parcelas; i++) {
      // Parcelas mensais a partir do primeiro vencimento.
      const [y, m, d] = p.vencimento.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1 + i, 1));
      const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
      dt.setUTCDate(Math.min(d, last));
      const conta = {
        id: 'cta-' + uid(), shopId: req.shopId, ...p,
        descricao: parcelas > 1 ? `${p.descricao} (${i + 1}/${parcelas})` : p.descricao,
        vencimento: dt.toISOString().slice(0, 10),
        status: 'aberta', criadoEm: new Date().toISOString(),
      };
      data.contas.push(conta);
      criadas.push(conta);
    }
    db.save();
    ok(res, criadas);
  });

  app.put('/api/contas/:id', requireAuth, (req, res) => {
    const data = db.get();
    const conta = data.contas.find((c) => c.id === req.params.id && c.shopId === req.shopId);
    if (!conta) return bad(res, 'Conta não encontrada.', 404);
    if (conta.status === 'paga') return bad(res, 'Conta já baixada. Estorne a baixa para editar.', 409);
    const p = contaPayload(data, req, { ...req.body, tipo: conta.tipo });
    if (p.error) return bad(res, p.error);
    Object.assign(conta, p);
    db.save();
    ok(res, conta);
  });

  app.delete('/api/contas/:id', requireAuth, (req, res) => {
    const data = db.get();
    const conta = data.contas.find((c) => c.id === req.params.id && c.shopId === req.shopId);
    if (!conta) return bad(res, 'Conta não encontrada.', 404);
    if (conta.status === 'paga') return bad(res, 'Conta já baixada. Estorne a baixa antes de excluir.', 409);
    if (conta.vendaId) return bad(res, 'Esta conta veio de uma venda. Estorne a venda no PDV.', 409);
    data.contas = data.contas.filter((c) => c !== conta);
    db.save();
    ok(res, { ok: true });
  });

  // Baixa (pagar/receber): marca como paga e lança no fluxo de caixa.
  app.post('/api/contas/:id/baixar', requireAuth, (req, res) => {
    const data = db.get();
    const conta = data.contas.find((c) => c.id === req.params.id && c.shopId === req.shopId);
    if (!conta) return bad(res, 'Conta não encontrada.', 404);
    if (conta.status === 'paga') return bad(res, 'Conta já baixada.');
    const metodo = req.body?.metodo;
    if (!METODOS.includes(metodo)) return bad(res, 'Forma de pagamento inválida.');
    const mov = lancar(req, {
      tipo: conta.tipo === 'receber' ? 'entrada' : 'saida',
      valor: conta.valor,
      descricao: `${conta.tipo === 'receber' ? 'Recebimento' : 'Pagamento'}: ${conta.descricao}`,
      metodo,
      origem: { contaId: conta.id, categoria: conta.categoria || '' },
    });
    Object.assign(conta, { status: 'paga', pagoEm: mov.dia, metodo, movimentoId: mov.id });
    db.save();
    ok(res, conta);
  });

  app.post('/api/contas/:id/estornar', requireAuth, (req, res) => {
    const data = db.get();
    const conta = data.contas.find((c) => c.id === req.params.id && c.shopId === req.shopId);
    if (!conta) return bad(res, 'Conta não encontrada.', 404);
    if (conta.status !== 'paga') return bad(res, 'A conta não está baixada.');
    data.movimentos = data.movimentos.filter((m) => m.id !== conta.movimentoId);
    Object.assign(conta, { status: 'aberta', pagoEm: null, metodo: null, movimentoId: null });
    db.save();
    ok(res, conta);
  });

  // --------------------------------------------------------------------------
  // Fluxo de caixa
  // --------------------------------------------------------------------------
  app.get('/api/financeiro/fluxo', requireAuth, (req, res) => {
    const data = db.get();
    const de = isDate(req.query.de) ? req.query.de : hoje(req).slice(0, 8) + '01';
    const ate = isDate(req.query.ate) ? req.query.ate : hoje(req);

    // Realizado: entradas e saídas (suprimento/sangria só movem dinheiro dentro do caixa).
    const movs = data.movimentos.filter((m) => m.shopId === req.shopId && (m.tipo === 'entrada' || m.tipo === 'saida'))
      .filter((m) => diaMov(m) >= de && diaMov(m) <= ate);
    const dias = {};
    const porMetodo = {};
    const porCategoria = {};
    let entradas = 0;
    let saidas = 0;
    for (const m of movs) {
      const d = (dias[diaMov(m)] ||= { dia: diaMov(m), entradas: 0, saidas: 0 });
      if (m.tipo === 'entrada') {
        entradas += m.valor; d.entradas += m.valor;
        const k = m.metodo || 'Não informado';
        porMetodo[k] = money((porMetodo[k] || 0) + m.valor);
      } else {
        saidas += m.valor; d.saidas += m.valor;
        const k = m.categoria || 'Outros';
        porCategoria[k] = money((porCategoria[k] || 0) + m.valor);
      }
    }

    // Previsto: contas em aberto com vencimento até o fim do período (inclui atrasadas).
    const abertas = data.contas.filter((c) => c.shopId === req.shopId && c.status === 'aberta' && c.vencimento <= ate);
    const today = hoje(req);
    const sum = (l) => money(l.reduce((s, c) => s + c.valor, 0));
    const receber = abertas.filter((c) => c.tipo === 'receber');
    const pagar = abertas.filter((c) => c.tipo === 'pagar');

    ok(res, {
      de, ate,
      entradas: money(entradas),
      saidas: money(saidas),
      saldo: money(entradas - saidas),
      aReceber: sum(receber),
      aPagar: sum(pagar),
      atrasadoReceber: sum(receber.filter((c) => c.vencimento < today)),
      atrasadoPagar: sum(pagar.filter((c) => c.vencimento < today)),
      saldoPrevisto: money(entradas - saidas + sum(receber) - sum(pagar)),
      dias: Object.values(dias).map((d) => ({ ...d, entradas: money(d.entradas), saidas: money(d.saidas) })).sort((a, b) => a.dia.localeCompare(b.dia)),
      porMetodo,
      porCategoria,
      vendas: data.vendas.filter((v) => v.shopId === req.shopId && v.dia >= de && v.dia <= ate).length,
    });
  });
}

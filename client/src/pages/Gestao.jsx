// Gestão do salão no painel: clientes, PDV, contas a pagar/receber e fluxo de caixa.
import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Users, Plus, Trash2, Pencil, Search, Minus, ShoppingCart, Package, Receipt, Wallet, TrendingUp,
  ArrowUpCircle, ArrowDownCircle, AlertTriangle, CheckCircle2, RotateCcw, FileText, Scissors,
} from 'lucide-react';
import { api } from '../api.js';
import { BRL, fmtDateShort, fmtDateLong, phoneMask, toISODate } from '../lib.js';
import { Loading, Empty, Modal, Field, Select, StatusBadge } from '../ui.jsx';

export const METODOS = ['Dinheiro', 'Pix', 'Cartão de débito', 'Cartão de crédito'];
const A_PRAZO = 'A prazo';
const CATEGORIAS_PAGAR = ['Aluguel', 'Energia', 'Água', 'Internet/Telefone', 'Produtos/Fornecedores', 'Salários/Comissões', 'Impostos', 'Marketing', 'Manutenção', 'Outros'];
const CATEGORIAS_RECEBER = ['Serviços', 'Vendas', 'Pacotes', 'Outros'];

const hojeISO = () => toISODate(new Date());
const inicioMes = () => hojeISO().slice(0, 8) + '01';
const rowLine = { padding: '8px 0', borderBottom: '1px solid var(--line)' };

function ClientPicker({ clients, value, onChange, label = 'Cliente', allowEmpty = true }) {
  return (
    <Select
      label={label}
      value={value}
      onChange={onChange}
      options={[...(allowEmpty ? [['', '— Sem cliente —']] : [['', 'Selecione...']]), ...clients.map((c) => [c.id, `${c.name}${c.phone ? ' · ' + c.phone : ''}`])]}
    />
  );
}

// ============================================================================
// Clientes
// ============================================================================
export function ClientesTab({ toast }) {
  const [items, setItems] = useState(null);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [ficha, setFicha] = useState(null);

  const load = useCallback(() => api.clients().then((l) => setItems(l.sort((a, b) => a.name.localeCompare(b.name)))).catch((e) => toast(e.message, 'err')), [toast]);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!items) return [];
    const t = q.trim().toLowerCase();
    const digits = t.replace(/\D/g, '');
    return items.filter((c) => !t || c.name.toLowerCase().includes(t) || (digits && (c.phone || '').replace(/\D/g, '').includes(digits)) || (c.email || '').toLowerCase().includes(t));
  }, [items, q]);

  async function remove(c) {
    if (!confirm(`Excluir o cliente ${c.name}?`)) return;
    try { await api.deleteClient(c.id); toast('Cliente excluído.'); load(); }
    catch (e) { toast(e.message, 'err'); }
  }

  if (!items) return <Loading />;
  return (
    <div>
      <div className="between wrap mb" style={{ gap: 10 }}>
        <h3 className="display" style={{ fontSize: '1.5rem' }}>Clientes ({items.length})</h3>
        <button className="btn btn-gold btn-sm" onClick={() => setEditing({})}><Plus size={15} /> Novo cliente</button>
      </div>
      <div className="field">
        <div className="row" style={{ gap: 8 }}>
          <Search size={16} className="muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, telefone ou e-mail" style={{ flex: 1 }} />
        </div>
      </div>
      {filtered.length === 0 ? (
        <Empty icon={Users} title={items.length ? 'Nenhum cliente encontrado' : 'Nenhum cliente ainda'} hint="Cadastre aqui ou eles entram sozinhos ao agendar pelo link." />
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr><th>Nome</th><th>Telefone</th><th>Aniversário</th><th>Agend.</th><th /></tr></thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td><button className="gold" style={{ fontWeight: 700 }} onClick={() => setFicha(c)}>{c.name}</button>{c.email && <div className="muted" style={{ fontSize: '0.78rem' }}>{c.email}</div>}</td>
                  <td className="muted">{c.phone || '—'}</td>
                  <td className="muted">{c.birthday ? fmtDateShort(c.birthday).slice(0, 5) : '—'}</td>
                  <td><span className="chip">{c.appointments}</span></td>
                  <td>
                    <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setFicha(c)} title="Ficha"><FileText size={14} /></button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditing(c)} title="Editar"><Pencil size={14} /></button>
                      <button className="btn btn-danger btn-sm" onClick={() => remove(c)} title="Excluir"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <ClientModal item={editing} toast={toast} onClose={() => setEditing(null)} onDone={() => { setEditing(null); load(); }} />}
      {ficha && <ClientFicha client={ficha} toast={toast} onClose={() => setFicha(null)} />}
    </div>
  );
}

export function ClientModal({ item, toast, onClose, onDone }) {
  const [f, setF] = useState({ name: '', phone: '', email: '', birthday: '', notes: '', ...item });
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      const saved = item.id ? await api.updateClient(item.id, f) : await api.createClient(f);
      toast('Cliente salvo.'); onDone(saved);
    } catch (e) { toast(e.message, 'err'); } finally { setSaving(false); }
  }
  return (
    <Modal title={item.id ? 'Editar cliente' : 'Novo cliente'} onClose={onClose}>
      <Field label="Nome *" value={f.name} onChange={(v) => setF({ ...f, name: v })} />
      <div className="grid grid-2" style={{ gap: 10 }}>
        <Field label="Telefone (WhatsApp)" value={f.phone} onChange={(v) => setF({ ...f, phone: phoneMask(v) })} placeholder="(11) 99999-9999" />
        <Field label="Aniversário" type="date" value={f.birthday} onChange={(v) => setF({ ...f, birthday: v })} />
      </div>
      <Field label="E-mail" type="email" value={f.email} onChange={(v) => setF({ ...f, email: v })} />
      <Field label="Observações" textarea value={f.notes} onChange={(v) => setF({ ...f, notes: v })} placeholder="Preferências, alergias, histórico de química..." />
      <button className="btn btn-gold btn-block" disabled={saving} onClick={save}>{saving ? 'Salvando...' : 'Salvar cliente'}</button>
    </Modal>
  );
}

function ClientFicha({ client, toast, onClose }) {
  const [h, setH] = useState(null);
  useEffect(() => { api.clientHistory(client.id).then(setH).catch((e) => toast(e.message, 'err')); }, [client.id, toast]);
  return (
    <Modal title={client.name} onClose={onClose}>
      {!h ? <Loading /> : (
        <>
          <p className="muted mb" style={{ fontSize: '0.85rem' }}>
            {client.phone || 'Sem telefone'}{client.email ? ` · ${client.email}` : ''}{client.birthday ? ` · Aniversário ${fmtDateShort(client.birthday).slice(0, 5)}` : ''}
          </p>
          {client.notes && <p className="card mb" style={{ fontSize: '0.85rem', background: 'var(--black-2)' }}>{client.notes}</p>}
          <div className="stat-cards" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <div className="card stat-card"><b style={{ fontSize: '1.4rem' }}>{BRL(h.totalGasto)}</b><small>Total em compras</small></div>
            <div className="card stat-card"><b style={{ fontSize: '1.4rem', color: h.emAberto ? 'var(--amber)' : undefined }}>{BRL(h.emAberto)}</b><small>Em aberto</small></div>
          </div>
          <h4 className="mb">Agendamentos ({h.appointments.length})</h4>
          {h.appointments.length === 0 ? <p className="muted mb" style={{ fontSize: '0.85rem' }}>Nenhum.</p> : (
            <div className="mb">
              {h.appointments.slice(0, 15).map((a) => (
                <div key={a.id} className="between" style={{ ...rowLine, fontSize: '0.85rem' }}>
                  <span>{fmtDateShort(a.date)} {a.time} · {a.serviceName}</span><StatusBadge status={a.status} />
                </div>
              ))}
            </div>
          )}
          <h4 className="mb">Compras ({h.vendas.length})</h4>
          {h.vendas.length === 0 ? <p className="muted" style={{ fontSize: '0.85rem' }}>Nenhuma.</p> : h.vendas.slice(0, 15).map((v) => (
            <div key={v.id} className="between" style={{ ...rowLine, fontSize: '0.85rem' }}>
              <span>{fmtDateShort(v.dia)} · #{v.numero} · {v.itens.map((i) => i.nome).join(', ')}</span><b className="gold">{BRL(v.total)}</b>
            </div>
          ))}
        </>
      )}
    </Modal>
  );
}

// ============================================================================
// PDV
// ============================================================================
export function PdvTab({ toast }) {
  const [services, setServices] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [clients, setClients] = useState([]);
  const [caixa, setCaixa] = useState(undefined);
  const [vendas, setVendas] = useState([]);
  const [aba, setAba] = useState('servico');
  const [q, setQ] = useState('');
  const [cart, setCart] = useState([]);
  const [clientId, setClientId] = useState('');
  const [desconto, setDesconto] = useState('');
  const [metodo, setMetodo] = useState('Dinheiro');
  const [vencimento, setVencimento] = useState('');
  const [recebido, setRecebido] = useState('');
  const [saving, setSaving] = useState(false);
  const [showProdutos, setShowProdutos] = useState(false);
  const [newClient, setNewClient] = useState(false);

  const load = useCallback(async () => {
    const [s, p, c, cx, v] = await Promise.all([api.services(), api.produtos(), api.clients(), api.caixaAtual(), api.vendas(hojeISO(), hojeISO())]);
    setServices(s); setProdutos(p); setClients(c.sort((a, b) => a.name.localeCompare(b.name))); setCaixa(cx.caixa); setVendas(v);
  }, []);
  useEffect(() => { load().catch((e) => toast(e.message, 'err')); }, [load, toast]);

  const catalogo = (aba === 'servico' ? services : produtos)
    .filter((x) => !q.trim() || x.name.toLowerCase().includes(q.trim().toLowerCase()));

  function add(item, tipo) {
    if (tipo === 'produto' && item.stock != null) {
      const inCart = cart.find((c) => c.tipo === 'produto' && c.refId === item.id)?.qtd || 0;
      if (inCart >= item.stock) return toast(`Sem estoque de ${item.name}.`, 'err');
    }
    setCart((c) => {
      const i = c.findIndex((x) => x.tipo === tipo && x.refId === item.id);
      if (i >= 0) return c.map((x, j) => (j === i ? { ...x, qtd: x.qtd + 1 } : x));
      return [...c, { key: tipo + item.id, tipo, refId: item.id, nome: item.name, preco: item.price, qtd: 1 }];
    });
  }
  const [avulso, setAvulso] = useState(null);
  function addAvulso() {
    const nome = (avulso?.nome || '').trim();
    const preco = Number(String(avulso?.preco || '').replace(',', '.'));
    if (!nome) return toast('Informe a descrição.', 'err');
    if (!(preco >= 0)) return toast('Informe o valor.', 'err');
    setCart((c) => [...c, { key: 'av' + Date.now(), tipo: 'avulso', refId: null, nome, preco, qtd: 1 }]);
    setAvulso(null);
  }
  const setLine = (key, patch) => setCart((c) => c.map((x) => (x.key === key ? { ...x, ...patch } : x)).filter((x) => x.qtd > 0));

  const bruto = cart.reduce((s, x) => s + (Number(x.preco) || 0) * x.qtd, 0);
  const desc = Math.min(bruto, Math.max(0, Number(String(desconto).replace(',', '.')) || 0));
  const total = bruto - desc;
  const troco = metodo === 'Dinheiro' && recebido ? (Number(String(recebido).replace(',', '.')) || 0) - total : null;

  async function finalizar() {
    if (cart.length === 0) return toast('Adicione itens à venda.', 'err');
    if (metodo === A_PRAZO && !clientId) return toast('Venda a prazo precisa de um cliente.', 'err');
    if (metodo === A_PRAZO && !vencimento) return toast('Informe o vencimento.', 'err');
    setSaving(true);
    try {
      const v = await api.createVenda({
        clientId: clientId || null, metodo, desconto: desc, vencimento: metodo === A_PRAZO ? vencimento : undefined,
        itens: cart.map(({ tipo, refId, nome, preco, qtd }) => ({ tipo, refId, nome, preco: Number(preco) || 0, qtd })),
      });
      toast(`Venda #${v.numero} registrada — ${BRL(v.total)}`);
      setCart([]); setDesconto(''); setRecebido(''); setClientId(''); setVencimento(''); setMetodo('Dinheiro');
      load();
    } catch (e) { toast(e.message, 'err'); } finally { setSaving(false); }
  }
  async function estornar(v) {
    if (!confirm(`Estornar a venda #${v.numero} (${BRL(v.total)})? O estoque e o caixa serão ajustados.`)) return;
    try { await api.estornarVenda(v.id); toast('Venda estornada.'); load(); }
    catch (e) { toast(e.message, 'err'); }
  }

  if (caixa === undefined) return <Loading />;
  const totalHoje = vendas.reduce((s, v) => s + v.total, 0);

  return (
    <div>
      {!caixa && (
        <div className="card mb row" style={{ gap: 10, borderColor: 'var(--amber)' }}>
          <AlertTriangle size={18} style={{ color: 'var(--amber)', flexShrink: 0 }} />
          <span style={{ fontSize: '0.85rem' }}>O caixa está fechado. As vendas entram no financeiro, mas o dinheiro só é conferido com o caixa aberto (aba <b>Caixa</b>).</span>
        </div>
      )}
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        {/* Catálogo */}
        <div className="card">
          <div className="between wrap mb" style={{ gap: 8 }}>
            <div className="seg">
              <button className={`seg-btn ${aba === 'servico' ? 'active' : ''}`} onClick={() => setAba('servico')}><Scissors size={14} /> Serviços</button>
              <button className={`seg-btn ${aba === 'produto' ? 'active' : ''}`} onClick={() => setAba('produto')}><Package size={14} /> Produtos</button>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowProdutos(true)}><Package size={14} /> Gerenciar produtos</button>
          </div>
          <div className="field"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar item..." /></div>
          {catalogo.length === 0 ? (
            <Empty icon={aba === 'servico' ? Scissors : Package} title={aba === 'servico' ? 'Nenhum serviço' : 'Nenhum produto'} hint={aba === 'produto' ? 'Cadastre em "Gerenciar produtos".' : 'Cadastre na aba Serviços.'} />
          ) : (
            <div className="grid" style={{ gap: 8 }}>
              {catalogo.map((x) => {
                const semEstoque = aba === 'produto' && x.stock != null && x.stock <= 0;
                return (
                  <button key={x.id} className="selectable" disabled={semEstoque} style={semEstoque ? { opacity: 0.45 } : undefined} onClick={() => add(x, aba)}>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <b>{x.name}</b>
                      {aba === 'produto' && x.stock != null && <span className="muted" style={{ fontSize: '0.78rem', display: 'block' }}>Estoque: {x.stock}</span>}
                    </div>
                    <b className="gold">{BRL(x.price)}</b>
                    <Plus size={16} className="gold" />
                  </button>
                );
              })}
            </div>
          )}
          <button className="btn btn-ghost btn-block mt" onClick={() => setAvulso({ nome: '', preco: '' })}><Plus size={14} /> Item avulso</button>
        </div>

        {/* Carrinho */}
        <div className="card">
          <h3 className="display mb" style={{ fontSize: '1.4rem', display: 'flex', gap: 8, alignItems: 'center' }}><ShoppingCart size={20} className="gold" /> Venda</h3>
          {cart.length === 0 ? <p className="muted mb" style={{ fontSize: '0.85rem' }}>Toque nos itens ao lado para adicionar.</p> : (
            <div className="mb">
              {cart.map((x) => (
                <div key={x.key} style={rowLine}>
                  <div className="between" style={{ gap: 8 }}>
                    <b style={{ fontSize: '0.9rem' }}>{x.nome}</b>
                    <b className="gold">{BRL((Number(x.preco) || 0) * x.qtd)}</b>
                  </div>
                  <div className="row" style={{ gap: 6, marginTop: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setLine(x.key, { qtd: x.qtd - 1 })}><Minus size={13} /></button>
                    <b style={{ minWidth: 22, textAlign: 'center' }}>{x.qtd}</b>
                    <button className="btn btn-ghost btn-sm" onClick={() => {
                      const p = x.tipo === 'produto' && produtos.find((pp) => pp.id === x.refId);
                      if (p && p.stock != null && x.qtd >= p.stock) return toast(`Estoque de ${p.name}: ${p.stock}.`, 'err');
                      setLine(x.key, { qtd: x.qtd + 1 });
                    }}><Plus size={13} /></button>
                    <span className="muted" style={{ fontSize: '0.78rem', marginLeft: 'auto' }}>R$</span>
                    <input type="number" min="0" step="0.01" value={x.preco} onChange={(e) => setLine(x.key, { preco: e.target.value })} style={{ width: 90 }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}><ClientPicker clients={clients} value={clientId} onChange={setClientId} /></div>
            <button className="btn btn-ghost btn-sm" style={{ marginBottom: 2 }} onClick={() => setNewClient(true)} title="Cadastrar cliente"><Plus size={14} /></button>
          </div>
          <div className="mt"><Field label="Desconto (R$)" type="number" value={desconto} onChange={setDesconto} placeholder="0" /></div>

          <label className="muted" style={{ fontSize: '0.82rem', fontWeight: 600 }}>Forma de pagamento</label>
          <div className="row wrap mb" style={{ gap: 6, marginTop: 6 }}>
            {[...METODOS, A_PRAZO].map((m) => (
              <button key={m} className={`btn btn-sm ${metodo === m ? 'btn-gold' : 'btn-ghost'}`} onClick={() => setMetodo(m)}>{m}</button>
            ))}
          </div>
          {metodo === 'Dinheiro' && <Field label="Valor recebido (para troco)" type="number" value={recebido} onChange={setRecebido} placeholder={total.toFixed(2)} />}
          {troco != null && <p className="mb" style={{ fontSize: '0.9rem' }}>Troco: <b className={troco < 0 ? '' : 'gold'} style={troco < 0 ? { color: 'var(--red)' } : undefined}>{BRL(troco)}</b></p>}
          {metodo === A_PRAZO && <Field label="Vencimento *" type="date" value={vencimento} onChange={setVencimento} />}

          <div className="divider" />
          {desc > 0 && <div className="between muted" style={{ fontSize: '0.85rem' }}><span>Subtotal</span><span>{BRL(bruto)}</span></div>}
          {desc > 0 && <div className="between muted" style={{ fontSize: '0.85rem' }}><span>Desconto</span><span>− {BRL(desc)}</span></div>}
          <div className="between mb"><b>Total</b><b className="gold display" style={{ fontSize: '1.8rem' }}>{BRL(total)}</b></div>
          <button className="btn btn-gold btn-block" disabled={saving || cart.length === 0} onClick={finalizar}>
            <CheckCircle2 size={16} /> {saving ? 'Registrando...' : metodo === A_PRAZO ? 'Lançar venda a prazo' : 'Finalizar venda'}
          </button>
        </div>
      </div>

      <div className="card mt">
        <div className="between mb"><h3 className="display" style={{ fontSize: '1.2rem' }}>Vendas de hoje ({vendas.length})</h3><b className="gold">{BRL(totalHoje)}</b></div>
        {vendas.length === 0 ? <p className="muted" style={{ fontSize: '0.85rem' }}>Nenhuma venda hoje.</p> : vendas.map((v) => (
          <div key={v.id} className="between wrap" style={{ ...rowLine, gap: 8, fontSize: '0.85rem' }}>
            <span><b>#{v.numero}</b> · {new Date(v.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · {v.itens.map((i) => `${i.qtd}× ${i.nome}`).join(', ')}{v.clientName ? ` · ${v.clientName}` : ''}</span>
            <span className="row" style={{ gap: 8 }}>
              <span className="chip">{v.metodo}</span>
              <b className="gold">{BRL(v.total)}</b>
              <button className="btn btn-ghost btn-sm" onClick={() => estornar(v)} title="Estornar"><RotateCcw size={13} /></button>
            </span>
          </div>
        ))}
      </div>

      {avulso && (
        <Modal title="Item avulso" onClose={() => setAvulso(null)}>
          <Field label="Descrição *" value={avulso.nome} onChange={(v) => setAvulso({ ...avulso, nome: v })} placeholder="Ex.: Taxa de deslocamento" />
          <Field label="Valor (R$) *" type="number" value={avulso.preco} onChange={(v) => setAvulso({ ...avulso, preco: v })} />
          <button className="btn btn-gold btn-block" onClick={addAvulso}><Plus size={15} /> Adicionar à venda</button>
        </Modal>
      )}
      {showProdutos && <ProdutosModal toast={toast} onClose={() => { setShowProdutos(false); load(); }} />}
      {newClient && <ClientModal item={{}} toast={toast} onClose={() => setNewClient(false)} onDone={(c) => { setNewClient(false); setClients((l) => [...l, c].sort((a, b) => a.name.localeCompare(b.name))); setClientId(c.id); }} />}
    </div>
  );
}

function ProdutosModal({ toast, onClose }) {
  const [items, setItems] = useState(null);
  const [f, setF] = useState({ name: '', category: '', price: '', stock: '' });
  const load = useCallback(() => api.produtos().then(setItems).catch((e) => toast(e.message, 'err')), [toast]);
  useEffect(() => { load(); }, [load]);
  async function save() {
    try {
      if (f.id) await api.updateProduto(f.id, f); else await api.createProduto(f);
      toast('Produto salvo.'); setF({ name: '', category: '', price: '', stock: '' }); load();
    } catch (e) { toast(e.message, 'err'); }
  }
  async function remove(p) {
    if (!confirm(`Excluir ${p.name}?`)) return;
    try { await api.deleteProduto(p.id); load(); } catch (e) { toast(e.message, 'err'); }
  }
  return (
    <Modal title="Produtos" onClose={onClose}>
      <Field label="Nome *" value={f.name} onChange={(v) => setF({ ...f, name: v })} placeholder="Ex.: Shampoo 300ml" />
      <div className="grid grid-2" style={{ gap: 10 }}>
        <Field label="Preço (R$)" type="number" value={f.price} onChange={(v) => setF({ ...f, price: v })} />
        <Field label="Estoque (vazio = não controlar)" type="number" value={f.stock ?? ''} onChange={(v) => setF({ ...f, stock: v })} />
      </div>
      <Field label="Categoria" value={f.category} onChange={(v) => setF({ ...f, category: v })} placeholder="Cabelo, Unhas, Pele..." />
      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-gold" style={{ flex: 1 }} onClick={save}>{f.id ? 'Salvar alterações' : 'Adicionar produto'}</button>
        {f.id && <button className="btn btn-ghost" onClick={() => setF({ name: '', category: '', price: '', stock: '' })}>Cancelar</button>}
      </div>
      <div className="divider" />
      {!items ? <Loading /> : items.length === 0 ? <p className="muted" style={{ fontSize: '0.85rem' }}>Nenhum produto cadastrado.</p> : items.map((p) => (
        <div key={p.id} className="between" style={{ ...rowLine, gap: 8, fontSize: '0.88rem' }}>
          <span><b>{p.name}</b>{p.category && <span className="muted"> · {p.category}</span>}<span className="muted" style={{ display: 'block', fontSize: '0.78rem' }}>{p.stock == null ? 'Sem controle de estoque' : `Estoque: ${p.stock}`}</span></span>
          <span className="row" style={{ gap: 6 }}>
            <b className="gold">{BRL(p.price)}</b>
            <button className="btn btn-ghost btn-sm" onClick={() => setF({ ...p, stock: p.stock ?? '' })}><Pencil size={13} /></button>
            <button className="btn btn-danger btn-sm" onClick={() => remove(p)}><Trash2 size={13} /></button>
          </span>
        </div>
      ))}
    </Modal>
  );
}

// ============================================================================
// Contas a pagar / receber
// ============================================================================
export function ContasTab({ toast }) {
  const [tipo, setTipo] = useState('pagar');
  const [status, setStatus] = useState('aberta');
  const [items, setItems] = useState(null);
  const [clients, setClients] = useState([]);
  const [editing, setEditing] = useState(null);
  const [baixando, setBaixando] = useState(null);

  const load = useCallback(() => api.contas({ tipo }).then(setItems).catch((e) => toast(e.message, 'err')), [tipo, toast]);
  useEffect(() => { setItems(null); load(); }, [load]);
  useEffect(() => { api.clients().then((c) => setClients(c.sort((a, b) => a.name.localeCompare(b.name)))).catch(() => {}); }, []);

  const hoje = hojeISO();
  const abertas = (items || []).filter((c) => c.status === 'aberta');
  const vencidas = abertas.filter((c) => c.vencimento < hoje);
  const proximas = abertas.filter((c) => c.vencimento >= hoje && c.vencimento <= toISODate(new Date(Date.now() + 7 * 864e5)));
  const sum = (l) => l.reduce((s, c) => s + c.valor, 0);
  const shown = (items || []).filter((c) => !status || c.status === status);

  async function estornar(c) {
    if (!confirm('Estornar a baixa? O lançamento sai do fluxo de caixa.')) return;
    try { await api.estornarConta(c.id); toast('Baixa estornada.'); load(); } catch (e) { toast(e.message, 'err'); }
  }
  async function remove(c) {
    if (!confirm(`Excluir "${c.descricao}"?`)) return;
    try { await api.deleteConta(c.id); toast('Conta excluída.'); load(); } catch (e) { toast(e.message, 'err'); }
  }

  const label = tipo === 'pagar' ? 'a pagar' : 'a receber';
  return (
    <div>
      <div className="between wrap mb" style={{ gap: 10 }}>
        <div className="seg">
          <button className={`seg-btn ${tipo === 'pagar' ? 'active' : ''}`} onClick={() => setTipo('pagar')}><ArrowDownCircle size={14} /> A pagar</button>
          <button className={`seg-btn ${tipo === 'receber' ? 'active' : ''}`} onClick={() => setTipo('receber')}><ArrowUpCircle size={14} /> A receber</button>
        </div>
        <button className="btn btn-gold btn-sm" onClick={() => setEditing({ tipo })}><Plus size={15} /> Nova conta {label}</button>
      </div>

      <div className="stat-cards">
        <div className="card stat-card"><b style={{ fontSize: '1.4rem' }}>{BRL(sum(abertas))}</b><small>Em aberto</small></div>
        <div className="card stat-card"><b style={{ fontSize: '1.4rem', color: vencidas.length ? 'var(--red)' : undefined }}>{BRL(sum(vencidas))}</b><small>Vencidas ({vencidas.length})</small></div>
        <div className="card stat-card"><b style={{ fontSize: '1.4rem' }}>{BRL(sum(proximas))}</b><small>Próximos 7 dias</small></div>
        <div className="card stat-card"><b style={{ fontSize: '1.4rem' }}>{abertas.length}</b><small>Contas abertas</small></div>
      </div>

      <div className="seg mb" style={{ width: 'fit-content' }}>
        {[['aberta', 'Abertas'], ['paga', tipo === 'pagar' ? 'Pagas' : 'Recebidas'], ['', 'Todas']].map(([v, l]) => (
          <button key={v} className={`seg-btn ${status === v ? 'active' : ''}`} onClick={() => setStatus(v)}>{l}</button>
        ))}
      </div>

      {!items ? <Loading /> : shown.length === 0 ? (
        <Empty icon={Receipt} title={`Nenhuma conta ${label}`} hint={tipo === 'pagar' ? 'Cadastre aluguel, fornecedores, contas fixas...' : 'Vendas a prazo e valores a receber aparecem aqui.'} />
      ) : (
        <div className="grid" style={{ gap: 8 }}>
          {shown.map((c) => {
            const vencida = c.status === 'aberta' && c.vencimento < hoje;
            return (
              <div key={c.id} className="card" style={vencida ? { borderColor: 'var(--red)' } : undefined}>
                <div className="between wrap" style={{ gap: 8 }}>
                  <div>
                    <b>{c.descricao}</b>
                    <div className="muted" style={{ fontSize: '0.8rem' }}>
                      {c.categoria || 'Sem categoria'}{c.clientName ? ` · ${c.clientName}` : ''} · Vence {fmtDateShort(c.vencimento)}
                      {vencida && <b style={{ color: 'var(--red)' }}> · VENCIDA</b>}
                      {c.status === 'paga' && <> · {tipo === 'pagar' ? 'Paga' : 'Recebida'} em {fmtDateShort(c.pagoEm)} ({c.metodo})</>}
                    </div>
                  </div>
                  <b className={tipo === 'receber' ? 'gold' : ''} style={{ fontSize: '1.1rem' }}>{BRL(c.valor)}</b>
                </div>
                <div className="row wrap mt" style={{ gap: 6 }}>
                  {c.status === 'aberta' ? (
                    <>
                      <button className="btn btn-gold btn-sm" onClick={() => setBaixando(c)}><CheckCircle2 size={14} /> {tipo === 'pagar' ? 'Pagar' : 'Receber'}</button>
                      {!c.vendaId && <button className="btn btn-ghost btn-sm" onClick={() => setEditing(c)}><Pencil size={14} /> Editar</button>}
                      {!c.vendaId && <button className="btn btn-danger btn-sm" onClick={() => remove(c)}><Trash2 size={14} /></button>}
                    </>
                  ) : (
                    <button className="btn btn-ghost btn-sm" onClick={() => estornar(c)}><RotateCcw size={14} /> Estornar baixa</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && <ContaModal item={editing} clients={clients} toast={toast} onClose={() => setEditing(null)} onDone={() => { setEditing(null); load(); }} />}
      {baixando && <BaixaModal conta={baixando} toast={toast} onClose={() => setBaixando(null)} onDone={() => { setBaixando(null); load(); }} />}
    </div>
  );
}

function ContaModal({ item, clients, toast, onClose, onDone }) {
  const [f, setF] = useState({ descricao: '', categoria: '', valor: '', vencimento: hojeISO(), clientId: '', parcelas: 1, ...item });
  const [saving, setSaving] = useState(false);
  const cats = f.tipo === 'pagar' ? CATEGORIAS_PAGAR : CATEGORIAS_RECEBER;
  async function save() {
    setSaving(true);
    try {
      if (item.id) await api.updateConta(item.id, f); else await api.createConta(f);
      toast('Conta salva.'); onDone();
    } catch (e) { toast(e.message, 'err'); } finally { setSaving(false); }
  }
  return (
    <Modal title={`${item.id ? 'Editar' : 'Nova'} conta ${f.tipo === 'pagar' ? 'a pagar' : 'a receber'}`} onClose={onClose}>
      <Field label="Descrição *" value={f.descricao} onChange={(v) => setF({ ...f, descricao: v })} placeholder={f.tipo === 'pagar' ? 'Ex.: Aluguel do salão' : 'Ex.: Pacote de escova'} />
      <div className="grid grid-2" style={{ gap: 10 }}>
        <Field label="Valor (R$) *" type="number" value={f.valor} onChange={(v) => setF({ ...f, valor: v })} />
        <Field label={item.id ? 'Vencimento *' : '1º vencimento *'} type="date" value={f.vencimento} onChange={(v) => setF({ ...f, vencimento: v })} />
      </div>
      <div className="field">
        <label>Categoria</label>
        <input list="cats-conta" value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} placeholder="Escolha ou digite" />
        <datalist id="cats-conta">{cats.map((c) => <option key={c} value={c} />)}</datalist>
      </div>
      {f.tipo === 'receber' && <div className="mb"><ClientPicker clients={clients} value={f.clientId || ''} onChange={(v) => setF({ ...f, clientId: v })} /></div>}
      {!item.id && (
        <Field label="Repetir / parcelas (mensal)" type="number" value={f.parcelas} onChange={(v) => setF({ ...f, parcelas: v })} />
      )}
      <button className="btn btn-gold btn-block" disabled={saving} onClick={save}>{saving ? 'Salvando...' : 'Salvar conta'}</button>
    </Modal>
  );
}

function BaixaModal({ conta, toast, onClose, onDone }) {
  const [metodo, setMetodo] = useState('Pix');
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try { await api.baixarConta(conta.id, metodo); toast(conta.tipo === 'pagar' ? 'Pagamento registrado.' : 'Recebimento registrado.'); onDone(); }
    catch (e) { toast(e.message, 'err'); } finally { setSaving(false); }
  }
  return (
    <Modal title={conta.tipo === 'pagar' ? 'Registrar pagamento' : 'Registrar recebimento'} onClose={onClose}>
      <p className="mb"><b>{conta.descricao}</b> · <b className="gold">{BRL(conta.valor)}</b></p>
      <label className="muted" style={{ fontSize: '0.82rem', fontWeight: 600 }}>Forma de pagamento</label>
      <div className="row wrap mb" style={{ gap: 6, marginTop: 6 }}>
        {METODOS.map((m) => <button key={m} className={`btn btn-sm ${metodo === m ? 'btn-gold' : 'btn-ghost'}`} onClick={() => setMetodo(m)}>{m}</button>)}
      </div>
      <p className="muted mb" style={{ fontSize: '0.8rem' }}>Entra no fluxo de caixa de hoje. Em dinheiro, com o caixa aberto, também ajusta o saldo da gaveta.</p>
      <button className="btn btn-gold btn-block" disabled={saving} onClick={save}>{saving ? 'Registrando...' : 'Confirmar'}</button>
    </Modal>
  );
}

// ============================================================================
// Financeiro — fluxo de caixa
// ============================================================================
export function FluxoTab({ toast }) {
  const [range, setRange] = useState({ de: inicioMes(), ate: hojeISO() });
  const [data, setData] = useState(null);

  const load = useCallback(async () => { setData(await api.fluxo(range.de, range.ate)); }, [range]);
  useEffect(() => { load().catch((e) => toast(e.message, 'err')); }, [load, toast]);

  const maxDia = data ? Math.max(1, ...data.dias.map((d) => Math.max(d.entradas, d.saidas))) : 1;

  return (
    <div>
      <div className="card mb">
        <div className="grid grid-2" style={{ gap: 10 }}>
          <Field label="De" type="date" value={range.de} onChange={(v) => setRange({ ...range, de: v })} />
          <Field label="Até" type="date" value={range.ate} onChange={(v) => setRange({ ...range, ate: v })} />
        </div>
      </div>
      {!data ? <Loading /> : (
        <>
          <div className="stat-cards">
            <div className="card stat-card"><b className="gold" style={{ fontSize: '1.4rem' }}>{BRL(data.entradas)}</b><small>Entradas</small></div>
            <div className="card stat-card"><b style={{ fontSize: '1.4rem', color: 'var(--red)' }}>{BRL(data.saidas)}</b><small>Saídas</small></div>
            <div className="card stat-card"><b style={{ fontSize: '1.4rem', color: data.saldo < 0 ? 'var(--red)' : 'var(--green)' }}>{BRL(data.saldo)}</b><small>Saldo do período</small></div>
            <div className="card stat-card"><b style={{ fontSize: '1.4rem' }}>{data.vendas}</b><small>Vendas no PDV</small></div>
          </div>

          <div className="card mb">
            <h3 className="display mb" style={{ fontSize: '1.2rem' }}>Previsão (contas em aberto até {fmtDateShort(data.ate)})</h3>
            <div className="between" style={rowLine}><span>Saldo realizado</span><b>{BRL(data.saldo)}</b></div>
            <div className="between" style={rowLine}><span>+ A receber{data.atrasadoReceber ? <span className="muted"> (vencido {BRL(data.atrasadoReceber)})</span> : ''}</span><b className="gold">{BRL(data.aReceber)}</b></div>
            <div className="between" style={rowLine}><span>− A pagar{data.atrasadoPagar ? <span style={{ color: 'var(--red)' }}> (vencido {BRL(data.atrasadoPagar)})</span> : ''}</span><b style={{ color: 'var(--red)' }}>{BRL(data.aPagar)}</b></div>
            <div className="between" style={{ padding: '10px 0 0' }}><b>Saldo previsto</b><b className="display" style={{ fontSize: '1.5rem', color: data.saldoPrevisto < 0 ? 'var(--red)' : 'var(--green)' }}>{BRL(data.saldoPrevisto)}</b></div>
          </div>

          <div className="card mb">
            <h3 className="display mb" style={{ fontSize: '1.2rem' }}>Movimento por dia</h3>
            {data.dias.length === 0 ? <Empty icon={TrendingUp} title="Sem movimentações no período" hint="Vendas, recebimentos e pagamentos aparecem aqui." /> : (
              <div className="grid" style={{ gap: 8 }}>
                {data.dias.map((d) => (
                  <div key={d.dia} style={{ fontSize: '0.82rem' }}>
                    <div className="between"><span className="muted">{fmtDateLong(d.dia)}</span><b style={{ color: d.entradas - d.saidas < 0 ? 'var(--red)' : undefined }}>{BRL(d.entradas - d.saidas)}</b></div>
                    <div className="flow-bar"><span className="in" style={{ width: `${(d.entradas / maxDia) * 100}%` }} /></div>
                    <div className="flow-bar"><span className="out" style={{ width: `${(d.saidas / maxDia) * 100}%` }} /></div>
                    <div className="between muted" style={{ fontSize: '0.74rem' }}><span>+ {BRL(d.entradas)}</span><span>− {BRL(d.saidas)}</span></div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-2">
            <div className="card">
              <h3 className="display mb" style={{ fontSize: '1.2rem', display: 'flex', gap: 8, alignItems: 'center' }}><Wallet size={18} className="gold" /> Entradas por forma de pagamento</h3>
              {Object.keys(data.porMetodo).length === 0 ? <p className="muted" style={{ fontSize: '0.85rem' }}>Sem entradas.</p>
                : Object.entries(data.porMetodo).sort((a, b) => b[1] - a[1]).map(([k, v]) => <div key={k} className="between" style={rowLine}><span>{k}</span><b className="gold">{BRL(v)}</b></div>)}
            </div>
            <div className="card">
              <h3 className="display mb" style={{ fontSize: '1.2rem', display: 'flex', gap: 8, alignItems: 'center' }}><Receipt size={18} className="gold" /> Despesas por categoria</h3>
              {Object.keys(data.porCategoria).length === 0 ? <p className="muted" style={{ fontSize: '0.85rem' }}>Sem saídas.</p>
                : Object.entries(data.porCategoria).sort((a, b) => b[1] - a[1]).map(([k, v]) => <div key={k} className="between" style={rowLine}><span>{k}</span><b style={{ color: 'var(--red)' }}>{BRL(v)}</b></div>)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

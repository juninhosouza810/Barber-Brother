import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Crown, LogOut, ArrowLeft, Ban, Check, Search, CalendarClock, BadgeDollarSign, ShieldAlert, History } from 'lucide-react';
import { api } from '../api.js';
import { auth } from '../firebase.js';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { BRL, fmtDateShort } from '../lib.js';
import { Loading, Empty, Modal, useToast, BrandMark } from '../ui.jsx';
import { applyTheme } from '../theme.js';
import { LoginGate } from './Admin.jsx';

// Situação calculada no servidor a partir do vencimento.
const SITUACOES = {
  em_dia: { label: 'Em dia', chip: 'chip-green' },
  vence_em_breve: { label: 'Vence em breve', chip: 'chip-amber' },
  vencida: { label: 'Vencida', chip: 'chip-red' },
  sem_vencimento: { label: 'Sem vencimento', chip: 'chip-muted' },
  bloqueada: { label: 'Bloqueada', chip: 'chip-red' },
};

const FILTROS = [
  ['todos', 'Todos'],
  ['em_dia', 'Em dia'],
  ['vence_em_breve', 'Vence em breve'],
  ['vencida', 'Vencidas'],
  ['sem_vencimento', 'Sem vencimento'],
  ['bloqueada', 'Bloqueadas'],
];

function prazo(s) {
  if (s.diasParaVencer == null) return '';
  if (s.diasParaVencer < 0) return `venceu há ${-s.diasParaVencer} dia(s)`;
  if (s.diasParaVencer === 0) return 'vence hoje';
  return `vence em ${s.diasParaVencer} dia(s)`;
}

// Tela do dono do sistema: todos os assinantes e a situação de cada assinatura.
export default function Gestor() {
  const toast = useToast();
  const [user, setUser] = useState(undefined);
  const [me, setMe] = useState(null);

  useEffect(() => onAuthStateChanged(auth, setUser), []);
  useEffect(() => {
    if (user) api.me().then(setMe).catch(() => setMe(false));
    else setMe(null);
  }, [user]);
  useEffect(() => { applyTheme(null); document.title = 'Gestor do Sistema'; }, []);

  if (user === undefined || (user && me === null)) return <div className="container block center" style={{ paddingTop: 80 }}><Loading /></div>;
  if (!user) return <LoginGate title="GESTOR DO SISTEMA" hint="Acesso exclusivo do administrador do sistema." />;
  if (!me || !me.isSuperAdmin) {
    return (
      <div className="container block center" style={{ maxWidth: 420, paddingTop: 70 }}>
        <div className="confirm-check"><ShieldAlert size={40} /></div>
        <h2 className="display" style={{ fontSize: '1.8rem' }}>Acesso restrito</h2>
        <p className="muted mb">Esta área é exclusiva do administrador do sistema.</p>
        <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
          <Link to="/admin" className="btn btn-gold btn-sm">Ir para o meu painel</Link>
          <button className="btn btn-ghost btn-sm" onClick={() => signOut(auth)}><LogOut size={15} /> Sair</button>
        </div>
      </div>
    );
  }

  return (
    <div className="container block" style={{ paddingTop: 22 }}>
      <div className="between mb">
        <div className="brand" style={{ gap: 10 }}>
          <span className="brand-mark" style={{ width: 38, height: 38 }}><Crown size={20} /></span>
          <div>
            <b className="display" style={{ fontSize: '1.3rem', display: 'block' }}>Gestor do Sistema</b>
            <span className="muted" style={{ fontSize: '0.78rem' }}>Assinantes e assinaturas · {me.email}</span>
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link to="/admin" className="btn btn-ghost btn-sm"><ArrowLeft size={15} /> Meu salão</Link>
          <button className="btn btn-ghost btn-sm" onClick={() => signOut(auth)}><LogOut size={15} /> Sair</button>
        </div>
      </div>
      <Assinantes toast={toast} />
    </div>
  );
}

function Assinantes({ toast }) {
  const [shops, setShops] = useState(null);
  const [filtro, setFiltro] = useState('todos');
  const [busca, setBusca] = useState('');
  const [pagando, setPagando] = useState(null);
  const [historico, setHistorico] = useState(null);

  const load = useCallback(() => api.adminShops().then(setShops).catch((e) => toast(e.message, 'err')), [toast]);
  useEffect(() => { load(); }, [load]);

  async function update(id, patch, msg = 'Assinante atualizado.') {
    try { await api.adminUpdateShop(id, patch); toast(msg); load(); }
    catch (e) { toast(e.message, 'err'); }
  }

  const lista = useMemo(() => {
    if (!shops) return [];
    const q = busca.trim().toLowerCase();
    return shops.filter((s) => (filtro === 'todos' || s.situacao === filtro)
      && (!q || `${s.shopName} ${s.email} ${s.phone}`.toLowerCase().includes(q)));
  }, [shops, filtro, busca]);

  if (!shops) return <Loading />;

  const conta = (sit) => shops.filter((s) => s.situacao === sit).length;
  const pagantes = shops.filter((s) => s.situacao === 'em_dia' || s.situacao === 'vence_em_breve');
  const preco = shops[0]?.planPrice ?? 59.9;

  return (
    <div>
      <div className="stat-cards">
        <div className="card stat-card"><b>{shops.length}</b><small>Assinantes</small></div>
        <div className="card stat-card"><b>{conta('em_dia') + conta('vence_em_breve')}</b><small>Em dia</small></div>
        <div className="card stat-card"><b>{conta('vencida') + conta('bloqueada')}</b><small>Vencidas / bloqueadas</small></div>
        <div className="card stat-card"><b style={{ fontSize: '1.6rem' }}>{BRL(pagantes.length * preco)}</b><small>Receita mensal (em dia)</small></div>
      </div>

      <div className="card mb">
        <p className="muted" style={{ fontSize: '0.85rem' }}>
          Plano único com todas as funções: <b className="gold">{BRL(preco)}/mês</b>.
          Registre o pagamento para estender o vencimento. Salões bloqueados ficam com a agenda indisponível.
        </p>
        <div className="row wrap mt" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 6, flex: 1, minWidth: 220 }}>
            <Search size={16} className="muted" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, e-mail ou telefone" style={{ flex: 1 }} />
          </div>
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            {FILTROS.map(([v, l]) => <option key={v} value={v}>{l}{v !== 'todos' ? ` (${conta(v)})` : ''}</option>)}
          </select>
        </div>
      </div>

      {lista.length === 0 ? (
        <Empty icon={Crown} title={shops.length ? 'Nenhum assinante neste filtro' : 'Nenhum assinante ainda'}
          hint={shops.length ? 'Altere a busca ou o filtro.' : 'As contas aparecem aqui após o primeiro login.'} />
      ) : (
        <div className="grid">
          {lista.map((s) => {
            const sit = SITUACOES[s.situacao] || SITUACOES.sem_vencimento;
            return (
              <div key={s.id} className="card">
                <div className="between mb" style={{ alignItems: 'flex-start', gap: 10 }}>
                  <div className="row" style={{ gap: 10, minWidth: 0 }}>
                    <BrandMark logo={s.logo} name={s.shopName} />
                    <div style={{ minWidth: 0 }}>
                      <b>{s.shopName || '(sem nome)'}</b>
                      <div className="muted" style={{ fontSize: '0.8rem', wordBreak: 'break-all' }}>{s.email || s.id}</div>
                      {s.phone && <div className="muted" style={{ fontSize: '0.8rem' }}>{s.phone}</div>}
                    </div>
                  </div>
                  <span className={`chip ${sit.chip}`}>{sit.label}</span>
                </div>

                <div style={{ fontSize: '0.85rem', display: 'grid', gap: 3 }} className="mb">
                  <span><CalendarClock size={14} className="muted" /> Vencimento:{' '}
                    <b>{s.vencimento ? fmtDateShort(s.vencimento) : '—'}</b>
                    {prazo(s) && <span className="muted"> · {prazo(s)}</span>}
                  </span>
                  <span className="muted">
                    Último pagamento: {s.ultimoPagamento ? fmtDateShort(s.ultimoPagamento) : '—'}
                    {' · '}{s.agendamentos} agend.
                    {s.criadoEm && <> · desde {fmtDateShort(s.criadoEm.slice(0, 10))}</>}
                  </span>
                </div>

                <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
                  <button className="btn btn-gold btn-sm" onClick={() => setPagando(s)}><BadgeDollarSign size={15} /> Registrar pagamento</button>
                  <label className="row muted" style={{ gap: 6, fontSize: '0.8rem' }}>
                    Vence em
                    <input type="date" value={s.vencimento || ''} style={{ width: 'auto', padding: '6px 8px' }}
                      onChange={(e) => update(s.id, { vencimento: e.target.value || null }, 'Vencimento alterado.')} />
                  </label>
                  {s.pagamentos?.length > 0 && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setHistorico(s)}><History size={15} /> Histórico</button>
                  )}
                  {s.assinaturaAtiva
                    ? <button className="btn btn-danger btn-sm" onClick={() => update(s.id, { assinaturaAtiva: false }, 'Salão bloqueado.')}><Ban size={15} /> Bloquear</button>
                    : <button className="btn btn-ghost btn-sm" onClick={() => update(s.id, { assinaturaAtiva: true }, 'Salão desbloqueado.')}><Check size={15} /> Desbloquear</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pagando && <PagamentoModal shop={pagando} preco={preco} toast={toast} onClose={() => setPagando(null)} onDone={() => { setPagando(null); load(); }} />}
      {historico && (
        <Modal title={`Pagamentos — ${historico.shopName || historico.email}`} onClose={() => setHistorico(null)}>
          <div style={{ display: 'grid', gap: 8 }}>
            {historico.pagamentos.map((p, i) => (
              <div key={i} className="between" style={{ fontSize: '0.9rem' }}>
                <span>{fmtDateShort(p.data)} · {p.meses} mês(es)</span>
                <span><b className="gold">{BRL(p.valor)}</b> <span className="muted">até {fmtDateShort(p.vencimento)}</span></span>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

function PagamentoModal({ shop, preco, toast, onClose, onDone }) {
  const [meses, setMeses] = useState(1);
  const [salvando, setSalvando] = useState(false);
  async function confirmar() {
    setSalvando(true);
    try {
      const r = await api.adminPagamento(shop.id, meses);
      toast(`Pagamento registrado. Novo vencimento: ${fmtDateShort(r.vencimento)}.`);
      onDone();
    } catch (e) { toast(e.message, 'err'); setSalvando(false); }
  }
  return (
    <Modal title="Registrar pagamento" onClose={onClose}>
      <p className="mb"><b>{shop.shopName || shop.email}</b></p>
      <div className="field">
        <label>Meses pagos</label>
        <select value={meses} onChange={(e) => setMeses(Number(e.target.value))}>
          {[1, 2, 3, 6, 12].map((m) => <option key={m} value={m}>{m} {m === 1 ? 'mês' : 'meses'} — {BRL(preco * m)}</option>)}
        </select>
      </div>
      <p className="muted mb" style={{ fontSize: '0.85rem' }}>
        O vencimento é estendido a partir do vencimento atual (ou de hoje, se já venceu) e o salão é reativado.
      </p>
      <button className="btn btn-gold btn-block" onClick={confirmar} disabled={salvando}>{salvando ? 'Salvando...' : 'Confirmar pagamento'}</button>
    </Modal>
  );
}

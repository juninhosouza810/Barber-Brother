import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Clock, ChevronRight, Scissors } from 'lucide-react';
import { api } from '../api.js';
import { BRL, fmtDuration } from '../lib.js';
import { Loading, Empty } from '../ui.jsx';

export default function Services() {
  const [services, setServices] = useState(null);
  const [cat, setCat] = useState('Todos');

  useEffect(() => { api.services().then(setServices).catch(() => setServices([])); }, []);

  const categories = useMemo(() => {
    if (!services) return [];
    return ['Todos', ...new Set(services.map((s) => s.category))];
  }, [services]);

  const filtered = useMemo(() => {
    if (!services) return [];
    return cat === 'Todos' ? services : services.filter((s) => s.category === cat);
  }, [services, cat]);

  if (!services) return <div className="container"><Loading /></div>;

  return (
    <div className="container block">
      <div className="section-head">
        <p className="eyebrow">Tabela de preços</p>
        <h2>Serviços</h2>
        <p className="muted">Escolha um serviço para iniciar o agendamento.</p>
      </div>

      <div className="filters">
        {categories.map((c) => (
          <button key={c} className={cat === c ? 'active' : ''} onClick={() => setCat(c)}>{c}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Empty icon={Scissors} title="Nenhum serviço nesta categoria" />
      ) : (
        <div className="grid grid-2">
          {filtered.map((s) => (
            <Link key={s.id} to={`/agendar?service=${s.id}`} className="card card-hover svc">
              <div className="svc-top">
                <div>
                  <span className="chip">{s.category}</span>
                  <h3 style={{ marginTop: 8 }}>{s.name}</h3>
                </div>
                <span className="price">{BRL(s.price)}</span>
              </div>
              <p className="muted" style={{ fontSize: '0.88rem' }}>{s.description}</p>
              <div className="between" style={{ marginTop: 4 }}>
                <span className="meta"><Clock size={15} /> {fmtDuration(s.durationMin)}</span>
                <span className="row gold" style={{ fontWeight: 600, fontSize: '0.9rem' }}>Agendar <ChevronRight size={16} /></span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

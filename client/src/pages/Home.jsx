import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Scissors, CalendarPlus, Clock, MapPin, Star, ChevronRight, ShieldCheck } from 'lucide-react';
import { api } from '../api.js';
import { BRL, fmtDuration } from '../lib.js';
import { Avatar } from '../ui.jsx';

export default function Home() {
  const [services, setServices] = useState([]);
  const [barbers, setBarbers] = useState([]);
  const [settings, setSettings] = useState({});

  useEffect(() => {
    api.services().then(setServices).catch(() => {});
    api.barbers().then(setBarbers).catch(() => {});
    api.settings().then(setSettings).catch(() => {});
  }, []);

  return (
    <>
      <section className="hero">
        <div className="container hero-inner">
          <p className="eyebrow">Barbearia Premium</p>
          <h1>SEU VISUAL<br /><span>NO PONTO CERTO</span></h1>
          <p>{settings.slogan || 'Agende seu corte e barba em poucos cliques. Profissionais top, horários no seu tempo.'}</p>
          <div className="hero-cta">
            <Link to="/agendar" className="btn btn-gold"><CalendarPlus size={18} /> Agendar agora</Link>
            <Link to="/servicos" className="btn btn-ghost"><Scissors size={18} /> Ver serviços</Link>
          </div>
          <div className="hero-stats">
            <div><b>{services.length}+</b><small>Serviços</small></div>
            <div><b>{barbers.length}</b><small>Barbeiros</small></div>
            <div><b>4.9</b><small>Avaliação</small></div>
          </div>
        </div>
      </section>

      <div className="container">
        <section className="block">
          <div className="grid grid-3">
            <Feature icon={Clock} title="Rápido e fácil" text="Reserve em menos de 1 minuto, sem ligação." />
            <Feature icon={ShieldCheck} title="Sem conflito" text="Horários ocupados são bloqueados em tempo real." />
            <Feature icon={Star} title="Profissionais top" text="Equipe especializada em corte, barba e mais." />
          </div>
        </section>

        <section className="block">
          <div className="section-head between">
            <div>
              <p className="eyebrow">Mais pedidos</p>
              <h2>Nossos serviços</h2>
            </div>
            <Link to="/servicos" className="row gold" style={{ fontWeight: 600 }}>Ver todos <ChevronRight size={16} /></Link>
          </div>
          <div className="grid grid-3">
            {services.slice(0, 3).map((s) => (
              <Link key={s.id} to={`/agendar?service=${s.id}`} className="card card-hover svc">
                <div className="svc-top">
                  <div>
                    <span className="chip">{s.category}</span>
                    <h3 style={{ marginTop: 8 }}>{s.name}</h3>
                  </div>
                  <span className="price">{BRL(s.price)}</span>
                </div>
                <p className="muted" style={{ fontSize: '0.88rem' }}>{s.description}</p>
                <div className="meta"><Clock size={15} /> {fmtDuration(s.durationMin)}</div>
              </Link>
            ))}
          </div>
        </section>

        <section className="block">
          <div className="section-head">
            <p className="eyebrow">Equipe</p>
            <h2>Escolha seu barbeiro</h2>
          </div>
          <div className="grid grid-3">
            {barbers.map((b) => (
              <Link key={b.id} to={`/agendar?barber=${b.id}`} className="card card-hover barber">
                <Avatar name={b.name} photo={b.photo} />
                <div style={{ marginTop: 12 }} className="between">
                  <div>
                    <h3>{b.name}</h3>
                    <p className="muted" style={{ fontSize: '0.82rem' }}>{b.role}</p>
                  </div>
                  <span className="stars"><Star size={14} fill="currentColor" /> {b.rating}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="block">
          <div className="card" style={{ background: 'linear-gradient(145deg, #16140c, #0f0f12)', borderColor: 'var(--gold)', textAlign: 'center', padding: 32 }}>
            <h2 className="display" style={{ fontSize: '2.2rem' }}>PRONTO PRA RENOVAR O VISUAL?</h2>
            <p className="muted mb" style={{ maxWidth: 420, margin: '10px auto 18px' }}>Garanta seu horário com os melhores. Vagas limitadas por dia.</p>
            <Link to="/agendar" className="btn btn-gold"><CalendarPlus size={18} /> Agendar meu horário</Link>
            {settings.address && (
              <p className="muted row" style={{ justifyContent: 'center', marginTop: 18, fontSize: '0.85rem' }}>
                <MapPin size={15} /> {settings.address}
              </p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function Feature({ icon: Icon, title, text }) {
  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 8 }}>
        <span style={{ color: 'var(--gold)' }}><Icon size={22} /></span>
        <h3 style={{ fontSize: '1.02rem' }}>{title}</h3>
      </div>
      <p className="muted" style={{ fontSize: '0.88rem' }}>{text}</p>
    </div>
  );
}

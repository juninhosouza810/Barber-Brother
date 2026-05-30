import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star, Calendar, CalendarPlus } from 'lucide-react';
import { api } from '../api.js';
import { WEEKDAYS } from '../lib.js';
import { Avatar, Loading } from '../ui.jsx';

export default function Barbers() {
  const [barbers, setBarbers] = useState(null);
  const [avail, setAvail] = useState([]);

  useEffect(() => {
    api.barbers().then(setBarbers).catch(() => setBarbers([]));
    api.availability().then(setAvail).catch(() => {});
  }, []);

  if (!barbers) return <div className="container"><Loading /></div>;

  const daysOf = (id) =>
    [...new Set(avail.filter((a) => a.barberId === id).map((a) => a.weekday))]
      .sort()
      .map((d) => WEEKDAYS[d]);

  return (
    <div className="container block">
      <div className="section-head">
        <p className="eyebrow">Nossa equipe</p>
        <h2>Profissionais</h2>
        <p className="muted">Conheça os barbeiros e seus dias de atendimento.</p>
      </div>

      <div className="grid grid-2">
        {barbers.map((b) => (
          <div key={b.id} className="card">
            <div className="row" style={{ alignItems: 'flex-start', gap: 14 }}>
              <Avatar name={b.name} photo={b.photo} className="avatar-sm" />
              <div style={{ flex: 1 }}>
                <div className="between">
                  <h3>{b.name}</h3>
                  <span className="stars"><Star size={14} fill="currentColor" /> {b.rating}</span>
                </div>
                <p className="gold" style={{ fontSize: '0.82rem', fontWeight: 600 }}>{b.role}</p>
              </div>
            </div>
            {b.bio && <p className="muted" style={{ fontSize: '0.88rem', marginTop: 12 }}>{b.bio}</p>}

            <div style={{ marginTop: 12 }}>
              <p className="muted" style={{ fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Especialidades</p>
              <div className="row wrap" style={{ gap: 6 }}>
                {b.specialties.map((s) => <span key={s} className="chip">{s}</span>)}
              </div>
            </div>

            <div className="row" style={{ marginTop: 12, gap: 6, color: 'var(--muted)', fontSize: '0.85rem' }}>
              <Calendar size={15} className="gold" /> {daysOf(b.id).join(' · ') || 'Sem agenda'}
            </div>

            <Link to={`/agendar?barber=${b.id}`} className="btn btn-gold btn-block mt"><CalendarPlus size={17} /> Agendar com {b.name.split(' ')[0]}</Link>
          </div>
        ))}
      </div>
    </div>
  );
}

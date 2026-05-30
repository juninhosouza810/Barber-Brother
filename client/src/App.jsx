import { Routes, Route, NavLink, Link, useLocation } from 'react-router-dom';
import { Home as HomeIcon, Scissors, CalendarPlus, UserRound, Shield } from 'lucide-react';
import Home from './pages/Home.jsx';
import Services from './pages/Services.jsx';
import Barbers from './pages/Barbers.jsx';
import Booking from './pages/Booking.jsx';
import MyBookings from './pages/MyBookings.jsx';
import Admin from './pages/Admin.jsx';

function Brand() {
  return (
    <Link to="/" className="brand">
      <span className="brand-mark">B</span>
      <span className="brand-name">Barber<b>Man</b></span>
    </Link>
  );
}

function Topbar() {
  return (
    <header className="topbar">
      <div className="container topbar-inner">
        <Brand />
        <nav>
          <NavLink to="/" end>Início</NavLink>
          <NavLink to="/servicos">Serviços</NavLink>
          <NavLink to="/profissionais">Profissionais</NavLink>
          <NavLink to="/meus-agendamentos">Minha conta</NavLink>
          <NavLink to="/agendar" className="btn btn-gold btn-sm" style={{ marginLeft: 6 }}>Agendar</NavLink>
        </nav>
      </div>
    </header>
  );
}

function BottomNav() {
  const items = [
    { to: '/', icon: HomeIcon, label: 'Início', end: true },
    { to: '/servicos', icon: Scissors, label: 'Serviços' },
    { to: '/agendar', icon: CalendarPlus, label: 'Agendar' },
    { to: '/meus-agendamentos', icon: UserRound, label: 'Conta' },
  ];
  return (
    <nav className="bottomnav">
      {items.map((it) => (
        <NavLink key={it.to} to={it.to} end={it.end}>
          <it.icon size={21} />
          {it.label}
        </NavLink>
      ))}
    </nav>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="brand-name" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="brand-mark" style={{ width: 30, height: 30, fontSize: '1.3rem' }}>B</span>
          Barber<b className="gold">Man</b>
        </div>
        <p style={{ marginTop: 10 }}>Estilo, precisão e atitude. © {new Date().getFullYear()} BarberMan.</p>
        <p style={{ marginTop: 6 }}>
          <Link to="/admin" className="gold" style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
            <Shield size={14} /> Painel administrativo
          </Link>
        </p>
      </div>
    </footer>
  );
}

export default function App() {
  const loc = useLocation();
  const isAdmin = loc.pathname.startsWith('/admin');
  return (
    <div className="app">
      {!isAdmin && <Topbar />}
      <main className="page">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/servicos" element={<Services />} />
          <Route path="/profissionais" element={<Barbers />} />
          <Route path="/agendar" element={<Booking />} />
          <Route path="/meus-agendamentos" element={<MyBookings />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
      {!isAdmin && <Footer />}
      {!isAdmin && <BottomNav />}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Routes, Route, NavLink, Link, useLocation } from 'react-router-dom';
import { Home as HomeIcon, Scissors, CalendarPlus, UserRound, Shield } from 'lucide-react';
import Home from './pages/Home.jsx';
import Services from './pages/Services.jsx';
import Barbers from './pages/Barbers.jsx';
import Booking from './pages/Booking.jsx';
import MyBookings from './pages/MyBookings.jsx';
import Admin from './pages/Admin.jsx';
import Gestor from './pages/Gestor.jsx';
import Agenda from './pages/Agenda.jsx';
import { api } from './api.js';
import { BrandMark, BrandName, DEFAULT_SHOP_NAME } from './ui.jsx';
import { applyTheme } from './theme.js';

function Brand({ shop }) {
  return (
    <Link to="/" className="brand">
      <BrandMark logo={shop.logo} name={shop.shopName} />
      <BrandName name={shop.shopName} />
    </Link>
  );
}

function Topbar({ shop }) {
  return (
    <header className="topbar">
      <div className="container topbar-inner">
        <Brand shop={shop} />
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

function Footer({ shop }) {
  const name = shop.shopName || DEFAULT_SHOP_NAME;
  return (
    <footer className="footer">
      <div className="container">
        <div className="brand">
          <BrandMark logo={shop.logo} name={name} size={30} />
          <BrandName name={name} />
        </div>
        <p style={{ marginTop: 10 }}>{shop.slogan || 'Beleza, cuidado e estilo.'} © {new Date().getFullYear()} {name}.</p>
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
  const isAdmin = loc.pathname.startsWith('/admin') || loc.pathname.startsWith('/gestor');
  const isAgenda = loc.pathname.startsWith('/agenda/');
  // Configuração pública do salão (nome, logo, slogan) para personalizar o site.
  const [shop, setShop] = useState({});
  useEffect(() => { api.settings().then((s) => setShop(s || {})).catch(() => {}); }, []);
  useEffect(() => {
    if (!isAdmin && !isAgenda) document.title = `${shop.shopName || DEFAULT_SHOP_NAME} — Agendamento online`;
  }, [shop.shopName, isAdmin, isAgenda]);
  // Cor do layout do salão no site público (painel e agenda aplicam a sua própria).
  useEffect(() => { if (!isAdmin && !isAgenda) applyTheme(shop.themeColor); }, [shop.themeColor, isAdmin, isAgenda]);

  // Link exclusivo do salão: só a marca + agenda, sem menu nem rodapé.
  if (isAgenda) {
    return (
      <div className="app app-agenda">
        <main className="page">
          <Routes>
            <Route path="/agenda/:shopId" element={<Agenda />} />
          </Routes>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      {!isAdmin && <Topbar shop={shop} />}
      <main className="page">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/servicos" element={<Services />} />
          <Route path="/profissionais" element={<Barbers />} />
          <Route path="/agendar" element={<Booking />} />
          <Route path="/meus-agendamentos" element={<MyBookings />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/gestor" element={<Gestor />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
      {!isAdmin && <Footer shop={shop} />}
      {!isAdmin && <BottomNav />}
    </div>
  );
}

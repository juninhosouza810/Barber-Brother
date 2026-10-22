import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CalendarX2 } from 'lucide-react';
import { api } from '../api.js';
import { BrandMark, BrandName, Loading, Empty, DEFAULT_SHOP_NAME } from '../ui.jsx';
import Booking from './Booking.jsx';
import { applyTheme } from '../theme.js';

// Agenda pública exclusiva de cada salão (/agenda/:shopId) — o link que o
// assinante envia aos clientes. Mostra só a marca do salão e o agendamento.
export default function Agenda() {
  const { shopId } = useParams();
  const [shop, setShop] = useState(undefined); // undefined = carregando; null = não encontrado

  useEffect(() => {
    api.settings()
      .then((s) => setShop(s && s.id ? s : null))
      .catch(() => setShop(null));
  }, [shopId]);

  useEffect(() => {
    if (shop) document.title = `${shop.shopName || DEFAULT_SHOP_NAME} — Agende seu horário`;
    applyTheme(shop?.themeColor);
  }, [shop]);

  if (shop === undefined) return <div className="container block center" style={{ paddingTop: 80 }}><Loading /></div>;

  if (!shop || shop.assinaturaAtiva === false) {
    return (
      <div className="container block" style={{ paddingTop: 80 }}>
        <Empty icon={CalendarX2} title="Agenda indisponível" hint="Este link de agendamento não existe ou está desativado. Fale com o salão." />
      </div>
    );
  }

  return (
    <>
      <header className="agenda-head">
        <div className="container agenda-head-inner">
          <BrandMark logo={shop.logo} name={shop.shopName} size={88} />
          <div className="agenda-head-text">
            <BrandName name={shop.shopName} style={{ fontSize: '1.8rem' }} />
            {shop.address && <p className="muted" style={{ fontSize: '0.82rem' }}>{shop.address}</p>}
          </div>
        </div>
      </header>
      <Booking embedded />
    </>
  );
}

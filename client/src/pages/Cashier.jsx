import { useEffect, useMemo, useState } from 'react';
import { api, useLoad } from '../api.js';
import { rupiah, uid } from '../format.js';
import Receipt from './Receipt.jsx';

const ORDER_KEY = 'youthdi_order';
const freshOrder = () => ({ clientId: uid(), items: [] });

// The in-progress order lives in localStorage so a dropped connection or refresh never loses it.
function loadOrder() {
  try {
    const o = JSON.parse(localStorage.getItem(ORDER_KEY));
    if (o && o.clientId && Array.isArray(o.items)) return o;
  } catch {
    /* fall through */
  }
  return freshOrder();
}

export default function Cashier({ business }) {
  const { data: menu, error: menuError, reload } = useLoad(() => api('GET', '/menu'), []);
  const [order, setOrder] = useState(loadOrder);
  const [category, setCategory] = useState('Semua');
  const [method, setMethod] = useState('cash');
  const [cash, setCash] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  useEffect(() => {
    localStorage.setItem(ORDER_KEY, JSON.stringify(order));
  }, [order]);

  const categories = useMemo(() => ['Semua', ...new Set((menu ?? []).map((m) => m.category))], [menu]);
  const shown = (menu ?? []).filter((m) => category === 'Semua' || m.category === category);
  const total = order.items.reduce((s, i) => s + i.price * i.qty, 0);
  const received = Number(cash) || 0;
  const canPay = order.items.length > 0 && !busy && (method === 'qris' || received >= total);

  const patch = (id, fn) =>
    setOrder((o) => ({ ...o, items: o.items.map((i) => (i.menuItemId === id ? fn(i) : i)).filter((i) => i.qty > 0) }));
  const add = (m) =>
    setOrder((o) =>
      o.items.some((i) => i.menuItemId === m.id)
        ? { ...o, items: o.items.map((i) => (i.menuItemId === m.id ? { ...i, qty: i.qty + 1 } : i)) }
        : { ...o, items: [...o.items, { menuItemId: m.id, name: m.name, price: m.price, qty: 1, note: '' }] },
    );

  async function pay() {
    setBusy(true);
    setError('');
    try {
      const tx = await api('POST', '/transactions', {
        clientId: order.clientId, // same id on retry, so the server never records the sale twice
        method,
        cashReceived: method === 'cash' ? received : undefined,
        items: order.items.map((i) => ({ menuItemId: i.menuItemId, qty: i.qty, note: i.note || undefined })),
      });
      setDone(tx);
      setOrder(freshOrder());
      setCash('');
    } catch (e) {
      setError(e.message); // order is kept, cashier can retry
      reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cashier">
      <section>
        <div className="chips">
          {categories.map((c) => (
            <button key={c} className={c === category ? 'chip active' : 'chip'} onClick={() => setCategory(c)}>{c}</button>
          ))}
        </div>
        {menuError && <p className="error">{menuError}</p>}
        {menu && menu.length === 0 && <p className="empty">Menu masih kosong. Minta pemilik menambahkan menu dulu.</p>}
        <div className="grid">
          {shown.map((m) => (
            <button key={m.id} className="menu-tile" onClick={() => add(m)}>
              <span>{m.name}</span>
              <strong>{rupiah(m.price)}</strong>
            </button>
          ))}
        </div>
      </section>

      <aside className="card stack">
        <h2>Pesanan</h2>
        {order.items.length === 0 && <p className="muted">Ketuk menu untuk menambah pesanan.</p>}
        {order.items.map((i) => (
          <div key={i.menuItemId} className="order-line">
            <div className="row">
              <span>{i.name}</span>
              <strong>{rupiah(i.price * i.qty)}</strong>
            </div>
            <div className="row">
              <div className="qty">
                <button onClick={() => patch(i.menuItemId, (x) => ({ ...x, qty: x.qty - 1 }))} aria-label="Kurangi">−</button>
                <span>{i.qty}</span>
                <button onClick={() => patch(i.menuItemId, (x) => ({ ...x, qty: x.qty + 1 }))} aria-label="Tambah">+</button>
              </div>
              <input className="note" placeholder="Catatan" value={i.note} onChange={(e) => patch(i.menuItemId, (x) => ({ ...x, note: e.target.value }))} />
            </div>
          </div>
        ))}
        <div className="row total"><span>Total</span><strong>{rupiah(total)}</strong></div>

        <div className="segmented">
          <button className={method === 'cash' ? 'active' : ''} onClick={() => setMethod('cash')}>Tunai</button>
          <button className={method === 'qris' ? 'active' : ''} onClick={() => setMethod('qris')}>QRIS</button>
        </div>

        {method === 'cash' && (
          <>
            <label>Uang diterima
              <input inputMode="numeric" value={cash} onChange={(e) => setCash(e.target.value.replace(/\D/g, ''))} placeholder="0" />
            </label>
            <div className="chips">
              {[total, 20000, 50000, 100000].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map((v) => (
                <button key={v} className="chip" onClick={() => setCash(String(v))}>{v === total ? 'Uang pas' : rupiah(v)}</button>
              ))}
            </div>
            {order.items.length > 0 && (received >= total
              ? <p className="ok">Kembalian: <strong>{rupiah(received - total)}</strong></p>
              : <p className="error">Kurang: <strong>{rupiah(total - received)}</strong></p>)}
          </>
        )}

        {method === 'qris' && (
          business.qrisImage
            ? <img className="qris" src={business.qrisImage} alt="QRIS" />
            : <p className="error">QRIS belum diatur. Pemilik bisa mengunggahnya di menu Pengaturan.</p>
        )}
        {method === 'qris' && <p className="muted small">Pesanan baru tercatat setelah Anda memastikan pembayaran masuk.</p>}

        {error && <p className="error">{error}</p>}
        <button className="primary big" disabled={!canPay} onClick={pay}>
          {busy ? 'Menyimpan…' : method === 'qris' ? 'Pembayaran sudah diterima' : 'Bayar'}
        </button>
        {order.items.length > 0 && !busy && (
          <button className="link" onClick={() => { setOrder(freshOrder()); setCash(''); setError(''); }}>Kosongkan pesanan</button>
        )}
      </aside>

      {done && <Receipt tx={done} business={business} onClose={() => setDone(null)} />}
    </div>
  );
}

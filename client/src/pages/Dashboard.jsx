import { useState } from 'react';
import { api, useLoad } from '../api.js';
import { rupiah, today } from '../format.js';

export default function Dashboard() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const { data, error, loading, reload } = useLoad(() => api('GET', `/dashboard?from=${from}&to=${to}`), [from, to]);

  return (
    <div className="stack">
      <div className="toolbar">
        <h2>Dashboard</h2>
        <label>Dari<input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>Sampai<input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
        <button onClick={reload}>Segarkan</button>
      </div>
      {error && <p className="error">{error}</p>}
      {loading && !data && <p className="muted">Memuat…</p>}
      {data && data.count === 0 && (
        <p className="empty">Belum ada penjualan di periode ini. Buka tab Kasir dan catat penjualan pertama Anda.</p>
      )}
      {data && data.count > 0 && (
        <>
          <div className="stats">
            <div className="card"><span className="muted">Total penjualan</span><strong className="big-num">{rupiah(data.totalSales)}</strong></div>
            <div className="card"><span className="muted">Jumlah transaksi</span><strong className="big-num">{data.count}</strong></div>
          </div>
          <div className="card stack">
            <h3>Tunai vs QRIS</h3>
            <div className="split" role="img" aria-label={`Tunai ${rupiah(data.cash)}, QRIS ${rupiah(data.qris)}`}>
              <div className="split-cash" style={{ width: `${(data.cash / data.totalSales) * 100}%` }} />
              <div className="split-qris" style={{ width: `${(data.qris / data.totalSales) * 100}%` }} />
            </div>
            <div className="row"><span><i className="dot cash" /> Tunai</span><strong>{rupiah(data.cash)}</strong></div>
            <div className="row"><span><i className="dot qris" /> QRIS</span><strong>{rupiah(data.qris)}</strong></div>
            <p className="muted small">Untuk tutup kas: bandingkan angka Tunai dengan uang di laci.</p>
          </div>
          <div className="card stack">
            <h3>Menu terlaris</h3>
            {data.topItems.map((t, i) => (
              <div key={t.name} className="row"><span>{i + 1}. {t.name}</span><span>{t.qty} terjual · {rupiah(t.revenue)}</span></div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

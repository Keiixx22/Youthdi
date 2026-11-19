import { useState } from 'react';
import { api, useLoad } from '../api.js';
import { dateTime, methodLabel, rupiah, today } from '../format.js';

export default function History() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const { data, error, loading } = useLoad(
    () => api('GET', `/transactions?from=${from}&to=${to}&q=${encodeURIComponent(search)}`),
    [from, to, search],
  );

  return (
    <div className="stack">
      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); setSearch(q); }}>
        <h2>Riwayat transaksi</h2>
        <label>Dari<input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>Sampai<input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
        <label>Cari<input placeholder="No., menu, atau kasir" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <button>Cari</button>
      </form>
      {error && <p className="error">{error}</p>}
      {loading && !data && <p className="muted">Memuat…</p>}
      {data && data.length === 0 && <p className="empty">Tidak ada transaksi.</p>}
      {data && data.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>No.</th><th>Waktu</th><th>Pesanan</th><th>Kasir</th><th>Metode</th><th className="num">Total</th></tr></thead>
            <tbody>
              {data.map((t) => (
                <tr key={t.id}>
                  <td>#{t.id}</td><td>{dateTime(t.createdAt)}</td><td>{t.summary}</td>
                  <td>{t.cashier}</td><td>{methodLabel(t.method)}</td><td className="num">{rupiah(t.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

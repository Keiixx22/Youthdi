import { useState } from 'react';
import { dateTime, methodLabel, rupiah } from '../format.js';

// Printed via the browser's print dialog (58mm or 80mm layout). See @media print in styles.css.
export default function Receipt({ tx, business, onClose }) {
  const [width, setWidth] = useState(localStorage.getItem('youthdi_paper') || '58');
  const pickWidth = (w) => { setWidth(w); localStorage.setItem('youthdi_paper', w); };

  return (
    <div className="modal">
      <div className="modal-card">
        <div id="receipt" className={`receipt w${width}`}>
          <h3>{business.name}</h3>
          <p>{dateTime(tx.createdAt)}</p>
          <p>No. #{tx.id} · Kasir: {tx.cashier}</p>
          <hr />
          {tx.items.map((i, idx) => (
            <div key={idx} className="line">
              <span>{i.name}</span>
              <span>{i.qty} x {i.price.toLocaleString('id-ID')} = {(i.qty * i.price).toLocaleString('id-ID')}</span>
              {i.note && <em>{i.note}</em>}
            </div>
          ))}
          <hr />
          <div className="row"><strong>Total</strong><strong>{rupiah(tx.total)}</strong></div>
          <div className="row"><span>Bayar ({methodLabel(tx.method)})</span><span>{tx.method === 'cash' ? rupiah(tx.cashReceived) : rupiah(tx.total)}</span></div>
          {tx.method === 'cash' && <div className="row"><span>Kembali</span><span>{rupiah(tx.changeAmount)}</span></div>}
          <p className="thanks">Terima kasih!</p>
        </div>
        <div className="no-print stack">
          <p className="ok">Transaksi tersimpan.</p>
          <label>Lebar kertas
            <select value={width} onChange={(e) => pickWidth(e.target.value)}>
              <option value="58">58 mm</option>
              <option value="80">80 mm</option>
            </select>
          </label>
          <div className="actions">
            <button onClick={() => window.print()}>Cetak struk</button>
            <button className="primary" onClick={onClose}>Selesai</button>
          </div>
          <p className="muted small">Jika struk gagal tercetak, transaksi tetap tersimpan. Anda bisa coba cetak lagi atau lewati.</p>
        </div>
      </div>
    </div>
  );
}

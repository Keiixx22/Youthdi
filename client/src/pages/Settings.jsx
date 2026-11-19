import { useState } from 'react';
import { api } from '../api.js';

const MAX_BYTES = 500 * 1024;

export default function Settings({ business, onChange }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(image) {
    setBusy(true);
    setError('');
    try {
      await api('PUT', '/business/qris', { image });
      await onChange();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function pick(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > MAX_BYTES) {
      setError('QRIS harus berupa gambar PNG/JPG maksimal 500KB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => save(reader.result);
    reader.readAsDataURL(file);
  }

  return (
    <div className="stack">
      <h2>Pengaturan pembayaran</h2>
      <div className="card stack">
        <h3>QRIS</h3>
        <p className="muted">Tunai selalu aktif. Unggah gambar QRIS statis usaha Anda agar bisa ditampilkan ke pelanggan di layar kasir.</p>
        {business.qrisImage && <img className="qris" src={business.qrisImage} alt="QRIS usaha" />}
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <label className="button">
            {business.qrisImage ? 'Ganti gambar QRIS' : 'Unggah gambar QRIS'}
            <input type="file" accept="image/png,image/jpeg" hidden disabled={busy} onChange={pick} />
          </label>
          {business.qrisImage && <button disabled={busy} onClick={() => save(null)}>Hapus</button>}
        </div>
      </div>
    </div>
  );
}

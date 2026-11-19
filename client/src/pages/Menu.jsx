import { useState } from 'react';
import { api, useLoad } from '../api.js';
import { rupiah } from '../format.js';

export default function Menu() {
  const { data, error, reload } = useLoad(() => api('GET', '/menu'), []);
  const [form, setForm] = useState({ name: '', price: '', category: '' });
  const [editing, setEditing] = useState(null); // { id, name, price, category }
  const [msg, setMsg] = useState('');

  async function act(fn) {
    setMsg('');
    try {
      await fn();
      reload();
    } catch (e) {
      setMsg(e.message);
    }
  }

  const add = (e) => {
    e.preventDefault();
    act(async () => {
      await api('POST', '/menu', { name: form.name, price: Number(form.price), category: form.category || undefined });
      setForm({ name: '', price: '', category: form.category });
    });
  };
  const save = () => act(async () => {
    await api('PATCH', `/menu/${editing.id}`, { name: editing.name, price: Number(editing.price), category: editing.category });
    setEditing(null);
  });

  return (
    <div className="stack">
      <h2>Menu</h2>
      <form className="card toolbar" onSubmit={add}>
        <label>Nama<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label>Harga (Rp)<input required inputMode="numeric" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value.replace(/\D/g, '') })} /></label>
        <label>Kategori<input placeholder="Makanan, Minuman…" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></label>
        <button className="primary">Tambah</button>
      </form>
      {(error || msg) && <p className="error">{error || msg}</p>}
      {data && data.length === 0 && <p className="empty">Belum ada menu. Tambahkan menu pertama Anda di atas.</p>}
      <div className="table-wrap">
        {data && data.length > 0 && (
          <table>
            <thead><tr><th>Nama</th><th>Kategori</th><th className="num">Harga</th><th></th></tr></thead>
            <tbody>
              {data.map((m) => editing?.id === m.id ? (
                <tr key={m.id}>
                  <td><input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></td>
                  <td><input value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} /></td>
                  <td><input inputMode="numeric" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value.replace(/\D/g, '') })} /></td>
                  <td className="actions"><button className="primary" onClick={save}>Simpan</button><button onClick={() => setEditing(null)}>Batal</button></td>
                </tr>
              ) : (
                <tr key={m.id} className={m.active ? '' : 'inactive'}>
                  <td>{m.name}{!m.active && ' (nonaktif)'}</td><td>{m.category}</td><td className="num">{rupiah(m.price)}</td>
                  <td className="actions">
                    <button onClick={() => setEditing({ ...m })}>Ubah</button>
                    <button onClick={() => act(() => api('PATCH', `/menu/${m.id}`, { active: !m.active }))}>{m.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="muted small">Menu tidak dihapus, hanya dinonaktifkan, supaya riwayat transaksi tetap benar. Perubahan harga tidak mengubah transaksi lama.</p>
    </div>
  );
}

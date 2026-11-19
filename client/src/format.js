export const rupiah = (n) => 'Rp ' + Number(n).toLocaleString('id-ID');

export const dateTime = (iso) =>
  new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' });

// Today as YYYY-MM-DD in Asia/Jakarta, matching how the server buckets days.
export const today = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

export const uid = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const methodLabel = (m) => (m === 'cash' ? 'Tunai' : 'QRIS');

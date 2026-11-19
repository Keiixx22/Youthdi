import crypto from 'node:crypto';
import { openDb } from './db.js';
import { createApp } from './app.js';

let secret = process.env.JWT_SECRET;
if (!secret) {
  if (process.env.NODE_ENV === 'production') {
    console.error('JWT_SECRET must be set in production.');
    process.exit(1);
  }
  secret = crypto.randomBytes(32).toString('hex'); // dev only: logins reset on restart
}

const db = openDb(process.env.DB_FILE || 'youthdi.db');
const port = Number(process.env.PORT) || 3001;

createApp(db, { secret }).listen(port, () => {
  console.log(`Youthdi API listening on http://localhost:${port}`);
});

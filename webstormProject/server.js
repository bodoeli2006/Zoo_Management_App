import 'dotenv/config';
import express from 'express';
import pg from 'pg';
import path from 'node:path';
import { query } from './db.js';

pg.types.setTypeParser(1082, (v) => v);

const T = {
  roles:             { pk: 'role_id',     cols: ['role_name', 'description'] },
  users:             { pk: 'user_id',     cols: ['username', 'email', 'password_hash', 'role_id'] },
  habitats:          { pk: 'habitat_id',  cols: ['name', 'climate_type', 'capacity', 'maintenance_status'] },
  animals:           { pk: 'animal_id',   cols: ['name', 'species', 'gender', 'birth_date', 'habitat_id', 'health_status',
                                                  'is_public', 'public_description', 'fun_fact', 'image_url', 'conservation_status'] },
  medical_records:   { pk: 'record_id',   cols: ['animal_id', 'veterinarian_id', 'diagnosis', 'treatment', 'record_date', 'follow_up_date'] },
  feeding_schedules: { pk: 'schedule_id', cols: ['animal_id', 'keeper_id', 'food_type', 'quantity_kg', 'feeding_time'] },
  ticket_sales:      { pk: 'ticket_id',   cols: ['user_id', 'ticket_type', 'price', 'status'] },
};

const app = express();
app.use(express.json());
app.use(express.static(path.join(import.meta.dirname, 'public')));

const route = (fn) => async (req, res) => {
  const name = req.params.table;
  if (!Object.hasOwn(T, name)) return res.status(404).json({ error: 'Unknown table' });
  try {
    res.json(await fn(name, T[name], req));
  } catch (err) {
    res.status(400).json({ error: err.detail || err.message });
  }
};
const pick = (t, body) => t.cols.filter((c) => body[c] !== undefined);

app.get('/api/:table', route(async (name, t) =>
  (await query(`SELECT * FROM ${name} ORDER BY ${t.pk}`)).rows));

app.post('/api/:table', route(async (name, t, req) => {
  const cs = pick(t, req.body);
  const sql = cs.length
    ? `INSERT INTO ${name} (${cs.join(',')}) VALUES (${cs.map((_, i) => '$' + (i + 1))}) RETURNING *`
    : `INSERT INTO ${name} DEFAULT VALUES RETURNING *`;
  return (await query(sql, cs.map((c) => req.body[c]))).rows[0];
}));

app.put('/api/:table/:id', route(async (name, t, req) => {
  const cs = pick(t, req.body);
  if (!cs.length) throw new Error('Nothing to update');
  const sets = cs.map((c, i) => `${c}=$${i + 1}`).join(',');
  const { rows } = await query(
    `UPDATE ${name} SET ${sets} WHERE ${t.pk}=$${cs.length + 1} RETURNING *`,
    [...cs.map((c) => req.body[c]), req.params.id]);
  if (!rows.length) throw new Error('Record not found');
  return rows[0];
}));

app.delete('/api/:table/:id', route(async (name, t, req) => {
  await query(`DELETE FROM ${name} WHERE ${t.pk}=$1`, [req.params.id]);
  return { deleted: true };
}));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Zoo app running at http://localhost:${port}`));

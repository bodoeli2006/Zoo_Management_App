import bcrypt from 'bcryptjs';
import { pool, query } from './db.js';

const [username, password] = process.argv.slice(2);
if (!username || !password || password.length < 8) {
  console.error('Usage: npm run setup:auth -- <admin_username> <password (min 8 characters)>');
  process.exit(1);
}

try {
  await query(
    `INSERT INTO roles (role_name, description)
     VALUES ('User', 'Visitor with read-only access')
     ON CONFLICT (role_name) DO NOTHING`);

  const { rows: [admin] } = await query(`SELECT role_id FROM roles WHERE role_name = 'Admin'`);
  if (!admin) throw new Error("The 'Admin' role is missing. Run fixtures.sql first.");

  const hash = await bcrypt.hash(password, 10);
  const { rowCount } = await query(
    'UPDATE users SET password_hash = $1, role_id = $2 WHERE username = $3',
    [hash, admin.role_id, username]);

  if (rowCount) {
    console.log(`Updated '${username}': now an Admin with the new password.`);
  } else {
    await query(
      'INSERT INTO users (username, email, password_hash, role_id) VALUES ($1, $2, $3, $4)',
      [username, `${username}@zoo.local`, hash, admin.role_id]);
    console.log(`Created Admin '${username}' (email ${username}@zoo.local, editable in the Users tab).`);
  }
  console.log("Role 'User' is ready for sign-ups.");
} catch (err) {
  console.error('Setup failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

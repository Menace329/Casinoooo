import pool from '../db/database.js';
import crypto from 'crypto';

export const User = {
  create: async (userData) => {
    const id = crypto.randomUUID();
    const result = await pool.query(
      `INSERT INTO users (id, username, email, password_hash, age, is_admin, is_owner, is_rigged, balance_cents)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [id, userData.username, userData.email, userData.passwordHash, userData.age, userData.isAdmin ? 1 : 0, userData.isOwner ? 1 : 0, 0, userData.balance || 0]
    );
    const user = result.rows[0];
    return { _id: user.id, ...user, balance: user.balance_cents, isAdmin: user.is_admin === 1, isOwner: user.is_owner === 1, isRigged: user.is_rigged === 1 };
  },

  findOne: async (query) => {
    let result;
    if (query.email) {
      result = await pool.query('SELECT * FROM users WHERE email = $1', [query.email]);
    } else if (query.username) {
      result = await pool.query('SELECT * FROM users WHERE username = $1', [query.username]);
    }
    if (result && result.rows[0]) {
      const user = result.rows[0];
      return { _id: user.id, ...user, balance: user.balance_cents, isAdmin: user.is_admin === 1, isOwner: user.is_owner === 1, isRigged: user.is_rigged === 1 };
    }
    return null;
  },

  findById: async (id) => {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (result.rows[0]) {
      const user = result.rows[0];
      return { _id: user.id, ...user, balance: user.balance_cents, isAdmin: user.is_admin === 1, isOwner: user.is_owner === 1, isRigged: user.is_rigged === 1 };
    }
    return null;
  },

  updateBalance: async (id, amount) => {
    await pool.query('UPDATE users SET balance_cents = balance_cents + $1 WHERE id = $2', [amount, id]);
    return User.findById(id);
  },

  setBalance: async (id, amount) => {
    await pool.query('UPDATE users SET balance_cents = $1 WHERE id = $2', [amount, id]);
    return User.findById(id);
  },

  makeAdmin: async (id) => {
    await pool.query('UPDATE users SET is_admin = 1 WHERE id = $1', [id]);
  },

  removeAdmin: async (id) => {
    await pool.query('UPDATE users SET is_admin = 0 WHERE id = $1', [id]);
  },

  makeOwner: async (id) => {
    await pool.query('UPDATE users SET is_owner = 1, is_admin = 1 WHERE id = $1', [id]);
  },

  setRigged: async (id, rigged) => {
    await pool.query('UPDATE users SET is_rigged = $1 WHERE id = $2', [rigged ? 1 : 0, id]);
  },

  getAll: async () => {
    const result = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
    return result.rows.map(u => ({ _id: u.id, ...u, balance: u.balance_cents, isAdmin: u.is_admin === 1, isOwner: u.is_owner === 1, isRigged: u.is_rigged === 1 }));
  }
};

export default User;

import pool from '../db/database.js';
import crypto from 'crypto';

export const Transaction = {
  create: async (data) => {
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO transactions (id, user_id, type, amount_cents, currency, reference_type, reference_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, data.userId, data.type, data.amountCents, data.currency || 'USD', data.referenceType || null, data.referenceId || null]
    );
    return { id, ...data };
  },

  findByUserId: async (userId, limit = 50) => {
    const result = await pool.query('SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2', [userId, limit]);
    return result.rows;
  },

  getAll: async (limit = 100) => {
    const result = await pool.query('SELECT t.*, u.username FROM transactions t JOIN users u ON t.user_id = u.id ORDER BY t.created_at DESC LIMIT $1', [limit]);
    return result.rows;
  }
};

export default Transaction;

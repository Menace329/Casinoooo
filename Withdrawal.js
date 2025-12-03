import pool from '../db/database.js';
import crypto from 'crypto';

export const Withdrawal = {
  create: async (data) => {
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO withdrawals (id, user_id, currency, amount_satoshi, address, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, data.userId, data.currency, data.amountSatoshi, data.address, data.status || 'pending']
    );
    return { id, ...data };
  },

  findById: async (id) => {
    const result = await pool.query('SELECT * FROM withdrawals WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  findByUserId: async (userId) => {
    const result = await pool.query('SELECT * FROM withdrawals WHERE user_id = $1 ORDER BY requested_at DESC', [userId]);
    return result.rows;
  },

  findPending: async () => {
    const result = await pool.query("SELECT w.*, u.username FROM withdrawals w JOIN users u ON w.user_id = u.id WHERE w.status = 'pending' ORDER BY w.requested_at ASC");
    return result.rows;
  },

  approve: async (id, adminNotes) => {
    await pool.query("UPDATE withdrawals SET status = 'approved', processed_at = CURRENT_TIMESTAMP, admin_notes = $1 WHERE id = $2", [adminNotes || '', id]);
  },

  reject: async (id, adminNotes) => {
    await pool.query("UPDATE withdrawals SET status = 'rejected', processed_at = CURRENT_TIMESTAMP, admin_notes = $1 WHERE id = $2", [adminNotes || '', id]);
  },

  complete: async (id) => {
    await pool.query("UPDATE withdrawals SET status = 'completed', processed_at = CURRENT_TIMESTAMP WHERE id = $1", [id]);
  },

  getAll: async () => {
    const result = await pool.query('SELECT w.*, u.username FROM withdrawals w JOIN users u ON w.user_id = u.id ORDER BY w.requested_at DESC');
    return result.rows;
  }
};

export default Withdrawal;

import pool from '../db/database.js';
import crypto from 'crypto';

export const Deposit = {
  create: async (data) => {
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO deposits (id, user_id, currency, amount_satoshi, tx_hash, confirmations, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, data.userId, data.currency, data.amountSatoshi || 0, data.txHash || null, data.confirmations || 0, data.status || 'pending']
    );
    return { id, ...data };
  },

  findById: async (id) => {
    const result = await pool.query('SELECT * FROM deposits WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  findByUserId: async (userId) => {
    const result = await pool.query('SELECT * FROM deposits WHERE user_id = $1 ORDER BY detected_at DESC', [userId]);
    return result.rows;
  },

  findByTxHash: async (txHash) => {
    const result = await pool.query('SELECT * FROM deposits WHERE tx_hash = $1', [txHash]);
    return result.rows[0] || null;
  },

  findPending: async () => {
    const result = await pool.query("SELECT * FROM deposits WHERE status = 'pending' ORDER BY detected_at DESC");
    return result.rows;
  },

  updateConfirmations: async (id, confirmations) => {
    await pool.query('UPDATE deposits SET confirmations = $1 WHERE id = $2', [confirmations, id]);
  },

  confirm: async (id, amountSatoshi) => {
    await pool.query("UPDATE deposits SET status = 'confirmed', amount_satoshi = $1, confirmed_at = CURRENT_TIMESTAMP WHERE id = $2", [amountSatoshi, id]);
  },

  updateStatus: async (id, status) => {
    await pool.query('UPDATE deposits SET status = $1 WHERE id = $2', [status, id]);
  },

  getAll: async () => {
    const result = await pool.query('SELECT d.*, u.username FROM deposits d JOIN users u ON d.user_id = u.id ORDER BY d.detected_at DESC');
    return result.rows;
  }
};

export default Deposit;

import pool from '../db/database.js';
import crypto from 'crypto';

export const AdminLog = {
  create: async (logData) => {
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO admin_logs (id, admin_id, admin_username, action, target_user_id, target_username, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, logData.adminId, logData.adminUsername, logData.action, logData.targetUserId || null, logData.targetUsername || null, logData.details || null]
    );
    return { id, ...logData };
  },

  getAll: async (limit = 100) => {
    const result = await pool.query('SELECT * FROM admin_logs ORDER BY created_at DESC LIMIT $1', [limit]);
    return result.rows;
  },

  getByAdmin: async (adminId, limit = 50) => {
    const result = await pool.query('SELECT * FROM admin_logs WHERE admin_id = $1 ORDER BY created_at DESC LIMIT $2', [adminId, limit]);
    return result.rows;
  }
};

export default AdminLog;

import pool from '../db/database.js';
import crypto from 'crypto';

export const GameHistory = {
  create: async (data) => {
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO game_history (id, user_id, game_type, bet_cents, payout_cents, multiplier, result, won)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, data.userId, data.gameType, data.betCents, data.payoutCents || 0, data.multiplier || 0, data.result || '', data.won ? 1 : 0]
    );
    return { id, ...data };
  },

  findByUserId: async (userId, limit = 50) => {
    const result = await pool.query('SELECT * FROM game_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2', [userId, limit]);
    return result.rows;
  },

  findByGameType: async (userId, gameType, limit = 20) => {
    const result = await pool.query('SELECT * FROM game_history WHERE user_id = $1 AND game_type = $2 ORDER BY created_at DESC LIMIT $3', [userId, gameType, limit]);
    return result.rows;
  },

  getRecentAll: async (limit = 50) => {
    const result = await pool.query('SELECT g.*, u.username FROM game_history g JOIN users u ON g.user_id = u.id ORDER BY g.created_at DESC LIMIT $1', [limit]);
    return result.rows;
  },

  getStats: async (userId) => {
    const result = await pool.query(`
      SELECT 
        game_type,
        COUNT(*) as total_games,
        SUM(bet_cents) as total_wagered,
        SUM(payout_cents) as total_won,
        SUM(CASE WHEN won = 1 THEN 1 ELSE 0 END) as wins
      FROM game_history 
      WHERE user_id = $1 
      GROUP BY game_type
    `, [userId]);
    return result.rows;
  }
};

export default GameHistory;

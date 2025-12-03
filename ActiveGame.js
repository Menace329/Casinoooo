import pool from '../db/database.js';
import crypto from 'crypto';

export const ActiveGame = {
  create: async (userId, gameType, gameState, betCents) => {
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO active_games (id, user_id, game_type, game_state, bet_cents)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, userId, gameType, JSON.stringify(gameState), betCents]
    );
    return { id, userId, gameType, gameState, betCents };
  },

  findByUserAndType: async (userId, gameType) => {
    const result = await pool.query('SELECT * FROM active_games WHERE user_id = $1 AND game_type = $2', [userId, gameType]);
    if (result.rows[0]) {
      const game = result.rows[0];
      return { ...game, gameState: JSON.parse(game.game_state) };
    }
    return null;
  },

  update: async (id, gameState) => {
    await pool.query('UPDATE active_games SET game_state = $1 WHERE id = $2', [JSON.stringify(gameState), id]);
  },

  delete: async (id) => {
    await pool.query('DELETE FROM active_games WHERE id = $1', [id]);
  },

  deleteByUserAndType: async (userId, gameType) => {
    await pool.query('DELETE FROM active_games WHERE user_id = $1 AND game_type = $2', [userId, gameType]);
  }
};

export default ActiveGame;

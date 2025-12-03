import pool from '../db/database.js';

export const Settings = {
  get: async (key) => {
    const result = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
    return result.rows[0] ? result.rows[0].value : null;
  },

  set: async (key, value) => {
    await pool.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2', [key, value]);
  },

  getRigMode: async () => {
    const value = await Settings.get('rig_mode');
    return value === 'on';
  },

  setRigMode: async (enabled) => {
    await Settings.set('rig_mode', enabled ? 'on' : 'off');
  }
};

export default Settings;

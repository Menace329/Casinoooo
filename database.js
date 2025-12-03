import mysql from 'mysql2/promise';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const useMariaDB = !!(process.env.DB_HOST || process.env.DATABASE_URL?.includes('mysql'));

let mariaPool = null;
let sqliteDb = null;

if (useMariaDB) {
  const config = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT || '3306'),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  };
  mariaPool = mysql.createPool(config);
  console.log('MariaDB connection pool created');
} else {
  const dbPath = path.join(__dirname, '../../data/casino.db');
  sqliteDb = new Database(dbPath);
  sqliteDb.pragma('journal_mode = WAL');
  console.log('SQLite database opened (fallback mode)');
}

const poolWrapper = {
  query: async (text, params = []) => {
    if (useMariaDB) {
      let mysqlText = text.replace(/\$(\d+)/g, '?');
      const hadReturning = /RETURNING \*/i.test(mysqlText);
      mysqlText = mysqlText.replace(/ON CONFLICT \((\w+)\) DO NOTHING/gi, '');
      mysqlText = mysqlText.replace(/RETURNING \*/gi, '');
      
      const isInsert = mysqlText.trim().toUpperCase().startsWith('INSERT');
      const isUpdate = mysqlText.trim().toUpperCase().startsWith('UPDATE');
      
      if (mysqlText.includes('ON CONFLICT')) {
        mysqlText = mysqlText.replace(/INSERT INTO/i, 'INSERT IGNORE INTO');
      }
      
      const [result] = await mariaPool.execute(mysqlText, params);
      
      if (hadReturning && (isInsert || isUpdate) && params[0]) {
        const tableName = mysqlText.match(/(?:INSERT\s+(?:IGNORE\s+)?INTO|UPDATE)\s+(\w+)/i)?.[1];
        if (tableName) {
          const [rows] = await mariaPool.execute(`SELECT * FROM ${tableName} WHERE id = ?`, [params[0]]);
          return { rows: Array.isArray(rows) ? rows : [] };
        }
      }
      
      return { rows: Array.isArray(result) ? result : [] };
    } else {
      let sqliteText = text.replace(/\$(\d+)/g, '?');
      sqliteText = sqliteText.replace(/ON CONFLICT \((\w+)\) DO NOTHING/gi, 'OR IGNORE');
      sqliteText = sqliteText.replace(/RETURNING \*/gi, '');
      
      const isSelect = sqliteText.trim().toUpperCase().startsWith('SELECT');
      const isInsert = sqliteText.trim().toUpperCase().startsWith('INSERT');
      
      if (isSelect) {
        const rows = sqliteDb.prepare(sqliteText).all(...params);
        return { rows };
      } else if (isInsert) {
        const info = sqliteDb.prepare(sqliteText).run(...params);
        const tableName = sqliteText.match(/INSERT INTO (\w+)/i)?.[1];
        if (tableName && params[0]) {
          const lastRow = sqliteDb.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(params[0]);
          return { rows: lastRow ? [lastRow] : [] };
        }
        return { rows: [] };
      } else {
        sqliteDb.prepare(sqliteText).run(...params);
        return { rows: [] };
      }
    }
  }
};

const initDatabase = async () => {
  if (useMariaDB) {
    const connection = await mariaPool.getConnection();
    try {
      await connection.query(`
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(36) PRIMARY KEY,
          username VARCHAR(255) UNIQUE NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          age INT NOT NULL,
          is_admin TINYINT DEFAULT 0,
          is_owner TINYINT DEFAULT 0,
          is_rigged TINYINT DEFAULT 0,
          balance_cents BIGINT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS settings (
          \`key\` VARCHAR(255) PRIMARY KEY,
          value TEXT NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS active_games (
          id VARCHAR(36) PRIMARY KEY,
          user_id VARCHAR(36) NOT NULL,
          game_type VARCHAR(50) NOT NULL,
          game_state TEXT NOT NULL,
          bet_cents BIGINT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_active_games_user (user_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS deposits (
          id VARCHAR(36) PRIMARY KEY,
          user_id VARCHAR(36) NOT NULL,
          currency VARCHAR(10) NOT NULL,
          amount_satoshi BIGINT DEFAULT 0,
          tx_hash VARCHAR(255),
          confirmations INT DEFAULT 0,
          status VARCHAR(50) DEFAULT 'pending',
          detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          confirmed_at TIMESTAMP NULL,
          INDEX idx_deposits_user (user_id),
          INDEX idx_deposits_status (status),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS withdrawals (
          id VARCHAR(36) PRIMARY KEY,
          user_id VARCHAR(36) NOT NULL,
          currency VARCHAR(10) NOT NULL,
          amount_satoshi BIGINT NOT NULL,
          address VARCHAR(255) NOT NULL,
          status VARCHAR(50) DEFAULT 'pending',
          requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          processed_at TIMESTAMP NULL,
          admin_notes TEXT,
          INDEX idx_withdrawals_user (user_id),
          INDEX idx_withdrawals_status (status),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS transactions (
          id VARCHAR(36) PRIMARY KEY,
          user_id VARCHAR(36) NOT NULL,
          type VARCHAR(50) NOT NULL,
          amount_cents BIGINT NOT NULL,
          currency VARCHAR(10) DEFAULT 'USD',
          reference_type VARCHAR(50),
          reference_id VARCHAR(36),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_transactions_user (user_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS game_history (
          id VARCHAR(36) PRIMARY KEY,
          user_id VARCHAR(36) NOT NULL,
          game_type VARCHAR(50) NOT NULL,
          bet_cents BIGINT NOT NULL,
          payout_cents BIGINT DEFAULT 0,
          multiplier DECIMAL(10,4),
          result TEXT,
          won TINYINT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_game_history_user (user_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS admin_logs (
          id VARCHAR(36) PRIMARY KEY,
          admin_id VARCHAR(36) NOT NULL,
          admin_username VARCHAR(255) NOT NULL,
          action VARCHAR(100) NOT NULL,
          target_user_id VARCHAR(36),
          target_username VARCHAR(255),
          details TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_admin_logs_admin (admin_id),
          FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await connection.query(`INSERT IGNORE INTO settings (\`key\`, value) VALUES ('rig_mode', 'off')`);

      console.log('MariaDB 10.10 database initialized successfully');
    } catch (err) {
      console.error('MariaDB initialization error:', err);
      throw err;
    } finally {
      connection.release();
    }
  } else {
    try {
      sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          age INTEGER NOT NULL,
          is_admin INTEGER DEFAULT 0,
          is_owner INTEGER DEFAULT 0,
          is_rigged INTEGER DEFAULT 0,
          balance_cents INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `);

      sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS active_games (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          game_type TEXT NOT NULL,
          game_state TEXT NOT NULL,
          bet_cents INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS deposits (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          currency TEXT NOT NULL,
          amount_satoshi INTEGER DEFAULT 0,
          tx_hash TEXT,
          confirmations INTEGER DEFAULT 0,
          status TEXT DEFAULT 'pending',
          detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          confirmed_at DATETIME
        )
      `);

      sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS withdrawals (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          currency TEXT NOT NULL,
          amount_satoshi INTEGER NOT NULL,
          address TEXT NOT NULL,
          status TEXT DEFAULT 'pending',
          requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          processed_at DATETIME,
          admin_notes TEXT
        )
      `);

      sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS transactions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          type TEXT NOT NULL,
          amount_cents INTEGER NOT NULL,
          currency TEXT DEFAULT 'USD',
          reference_type TEXT,
          reference_id TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS game_history (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          game_type TEXT NOT NULL,
          bet_cents INTEGER NOT NULL,
          payout_cents INTEGER DEFAULT 0,
          multiplier REAL,
          result TEXT,
          won INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS admin_logs (
          id TEXT PRIMARY KEY,
          admin_id TEXT NOT NULL,
          admin_username TEXT NOT NULL,
          action TEXT NOT NULL,
          target_user_id TEXT,
          target_username TEXT,
          details TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_deposits_user ON deposits(user_id)`);
      sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_deposits_status ON deposits(status)`);
      sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals(user_id)`);
      sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status)`);
      sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id)`);
      sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_game_history_user ON game_history(user_id)`);
      sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_active_games_user ON active_games(user_id)`);
      sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_admin_logs_admin ON admin_logs(admin_id)`);

      sqliteDb.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('rig_mode', 'off')`).run();

      console.log('SQLite database initialized successfully (fallback mode)');
    } catch (err) {
      console.error('SQLite initialization error:', err);
      throw err;
    }
  }
};

export { poolWrapper as pool, initDatabase };
export default poolWrapper;

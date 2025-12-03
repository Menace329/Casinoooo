import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

import { initDatabase } from "./src/db/database.js";
import authRoutes from "./src/routes/auth.js";
import gameRoutes from "./src/routes/games.js";
import cryptoRoutes from "./src/routes/crypto.js";
import adminRoutes from "./src/routes/admin.js";

const app = express();

const isProduction = process.env.NODE_ENV === 'production';
const customDomain = process.env.CUSTOM_DOMAIN || 'stormcasino.org';

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use((req, res, next) => {
  const allowedOrigins = [
    `https://${customDomain}`,
    `https://www.${customDomain}`,
    `http://${customDomain}`,
    `http://www.${customDomain}`
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());
app.use(cookieParser());

const sessionSecret = process.env.SESSION_SECRET || 'storm-casino-secret-key-2024';

app.use(session({
  secret: sessionSecret,
  name: 'storm.sid',
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    secure: 'auto',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: 'lax'
  }
}));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

app.use(express.static(path.join(__dirname, "public")));

app.use("/api/auth", authRoutes);
app.use("/api/game", gameRoutes);
app.use("/api/crypto", cryptoRoutes);
app.use("/api/admin", adminRoutes);

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await initDatabase();
    app.listen(PORT, "0.0.0.0", () => console.log(`Casino server running on port ${PORT}`));
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

startServer();

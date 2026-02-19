// ============================================================================
// CRITICAL: Initialize dotenv FIRST before any other imports or code
// ============================================================================
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Determine server root directory (parent of src/)
const serverRoot = join(__dirname, '..');

// EXPLICITLY set path to server/.env
const envPath = join(serverRoot, '.env');

// Initialize dotenv with explicit path - MUST be done before any other code
console.log('\n=== Initializing dotenv ===');
console.log('Server root:', serverRoot);
console.log('Loading .env from:', envPath);

if (fs.existsSync(envPath)) {
  // Always try dotenv first
  const result = dotenv.config({ path: envPath });

  if (result.error) {
    console.error('✗ Error loading .env:', result.error.message);
  } else {
    console.log('✓ .env file loaded via dotenv');

    // Check if dotenv parsed variables
    if (result.parsed && Object.keys(result.parsed).length > 0) {
      console.log(`✓ Parsed ${Object.keys(result.parsed).length} variables via dotenv`);
      console.log('Variables:', Object.keys(result.parsed).join(', '));
    } else {
      console.log('⚠ Dotenv parsed 0 variables');
    }
  }

  // ALWAYS run manual parsing as a backup/override to ensure all variables are loaded
  console.log('→ Running manual parse to ensure all variables are loaded...');
  const content = fs.readFileSync(envPath, 'utf-8');
  const lines = content.split(/\r?\n/);
  let manualCount = 0;
  const seenKeys = new Set();

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const equalIndex = trimmed.indexOf('=');
      const key = trimmed.substring(0, equalIndex).trim();
      let value = trimmed.substring(equalIndex + 1).trim();

      // Remove quotes if present (both single and double)
      if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      // Remove duplicate JWT_SECRET if found
      if (key === 'JWT_SECRET' && seenKeys.has('JWT_SECRET')) {
        console.log(`  ⚠ Skipping duplicate ${key}`);
        continue;
      }

      if (key && value) {
        // Always set, even if already exists (override to ensure correct values)
        process.env[key] = value;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          manualCount++;
        }
      }
    }
  }

  if (manualCount > 0) {
    console.log(`✓✓ Manually loaded/verified ${manualCount} variables`);
    console.log(`  Keys: ${Array.from(seenKeys).join(', ')}`);
  }
} else {
  console.error('✗ .env file NOT FOUND at:', envPath);
  console.error('  Please create .env file in server/ directory');
}

// TEMPORARY: Explicit confirmation logs for EMAIL_USER and EMAIL_PASS
console.log('\n=== Email Credentials Confirmation ===');
// Force re-read from process.env to ensure we have latest values
const emailUser = process.env.EMAIL_USER;
const emailPass = process.env.EMAIL_PASS;

if (emailUser) {
  const trimmedUser = emailUser.trim();
  console.log(`✓ EMAIL_USER: "${trimmedUser.substring(0, Math.min(15, trimmedUser.length))}..." (length: ${trimmedUser.length})`);
  // Update process.env with trimmed value
  if (trimmedUser !== emailUser) {
    process.env.EMAIL_USER = trimmedUser;
    console.log('  → Trimmed whitespace from EMAIL_USER');
  }
} else {
  console.log('✗ EMAIL_USER: MISSING');
  // Try one more time to read from file
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    const emailUserMatch = content.match(/^EMAIL_USER\s*=\s*(.+)$/m);
    if (emailUserMatch) {
      let value = emailUserMatch[1].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env.EMAIL_USER = value;
      console.log(`  →✓ Recovered EMAIL_USER from file: "${value.substring(0, Math.min(15, value.length))}..."`);
    }
  }
}

if (emailPass) {
  const trimmedPass = emailPass.trim();
  console.log(`✓ EMAIL_PASS: Loaded (length: ${trimmedPass.length}, hidden for security)`);
  // Update process.env with trimmed value
  if (trimmedPass !== emailPass) {
    process.env.EMAIL_PASS = trimmedPass;
    console.log('  → Trimmed whitespace from EMAIL_PASS');
  }
} else {
  console.log('✗ EMAIL_PASS: MISSING');
  // Try one more time to read from file
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    const emailPassMatch = content.match(/^EMAIL_PASS\s*=\s*(.+)$/m);
    if (emailPassMatch) {
      let value = emailPassMatch[1].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env.EMAIL_PASS = value;
      console.log(`  →✓ Recovered EMAIL_PASS from file (hidden)`);
    }
  }
}

// Additional environment variables check
console.log('\n=== Other Environment Variables ===');
console.log('MONGO_URI:', process.env.MONGO_URI ? '✓ Loaded' : '✗ MISSING');
console.log('PORT:', process.env.PORT || '5000 (default)');
console.log('JWT_SECRET:', process.env.JWT_SECRET ? '✓ Loaded' : '✗ MISSING');

// Final verification
if (emailUser && emailPass) {
  console.log('\n✓✓✓ Email credentials successfully loaded! ✓✓✓\n');
} else {
  console.error('\n❌❌❌ Email credentials NOT loaded! Email functionality will NOT work! ❌❌❌\n');
}

// Now import other modules (they can safely use process.env)
import http from 'http';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { connectToDatabase } from './config/db.js';
import { createLogger } from './config/logger.js';
import apiRouter from './routes/index.js';
import { initializeSockets } from './sockets/index.js';
import { schedulerService } from './services/scheduler.js';

const logger = createLogger();
const app = express();
const server = http.createServer(app);

// Socket.IO initialization
initializeSockets(server, logger);

// Core middleware - CORS configuration
const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = [
  process.env.CLIENT_ORIGIN,
  // Development origins (only in development)
  ...(isProduction ? [] : [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
  ]),
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    // In production, only allow configured origins
    if (isProduction) {
      if (allowedOrigins.some((o) => origin === o)) {
        return callback(null, true);
      }
      logger.warn(`CORS blocked origin: ${origin}`);
      return callback(new Error('CORS not allowed'), false);
    }

    // In development, be more permissive
    if (allowedOrigins.some((o) => origin === o)) return callback(null, true);
    // Allow any localhost port in dev
    if (/^http:\/\/localhost:\d+$/.test(origin)) return callback(null, true);
    if (/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) return callback(null, true);
    // Allow local network IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x) in dev
    if (/^http:\/\/(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}:\d+$/.test(origin)) return callback(null, true);
    logger.warn(`CORS blocked origin in dev: ${origin}`);
    return callback(new Error('CORS not allowed'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan('dev'));

// Healthcheck
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api', apiRouter);

// API 404 handler — pure API server, no static files served
app.use('/api', (req, res) => {
  res.status(404).json({ message: 'API endpoint not found', path: req.originalUrl });
});

// Global 404 — catch any non-API routes (pure API server, no frontend served here)
app.use((req, res) => {
  res.status(404).json({ message: 'Not Found', path: req.originalUrl });
});

// Global error handler
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  logger.error(err);
  const status = err.status || 500;
  res.status(status).json({ message: err.message || 'Internal Server Error' });
});

const PORT = Number(process.env.PORT || 5000);

// Start server after DB connection
const startServer = async () => {
  try {
    await connectToDatabase();
    server.listen(PORT, () => {
      logger.info(`Server listening on port ${PORT}`);
      // Start scheduler for ML model training
      schedulerService.start();
    });
  } catch (error) {
    logger.error('Failed to connect to MongoDB', error);
    process.exit(1);
  }
};

startServer();

// Export app for Vercel serverless functions
export default app;



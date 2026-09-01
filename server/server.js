require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { PrismaClient } = require('@prisma/client');

const authRoutes = require('./src/routes/auth.routes');
const caseRoutes = require('./src/routes/case.routes');
const evidenceRoutes = require('./src/routes/evidenceRoutes');
const custodyRoutes = require('./src/routes/custody.routes');
const reportRoutes = require('./src/routes/report.routes');
const { errorHandler } = require('./src/middleware/errorHandler');

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: [
    'http://127.0.0.1:5500',
    'http://localhost:5500',
    'http://localhost:3000',
    ...(process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',').map((s) => s.trim()) : []),
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Health check
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', error: err.message });
  }
});

// API routes
const apiPrefix = `/api/${process.env.API_VERSION || 'v1'}`;
app.use(`${apiPrefix}/auth`, authRoutes);
app.use(`${apiPrefix}/cases`, caseRoutes);
app.use(`${apiPrefix}/evidence`, evidenceRoutes);
app.use(`${apiPrefix}/custody`, custodyRoutes);
app.use(`${apiPrefix}/reports`, reportRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use(errorHandler);

// Graceful shutdown
async function startServer() {
  await prisma.$connect();
  console.log('Connected to PostgreSQL via Prisma');

  const server = listen();
  configureSocketTimeouts(server);
  registerShutdown(server);
  return server;
}

/**
 * Free any orphaned process listening on `port` (Windows). Avoids the
 * EADDRINUSE crash caused by leftover nodemon/express/node processes.
 */
function killOrphanedPortListener(port) {
  if (process.platform !== 'win32') return false;
  try {
    const { execSync } = require('child_process');
    const out = execSync(
      `netstat -ano | findstr :${port} | findstr LISTENING`,
      { encoding: 'utf8', shell: 'cmd.exe' }
    );
    const killed = new Set();
    for (const line of out.trim().split(/\r?\n/)) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (!pid || Number.isNaN(Number(pid)) || Number(pid) === process.pid) continue;
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
        killed.add(pid);
      } catch (_) { /* already gone */ }
    }
    if (killed.size > 0) {
      console.warn(`[server] freed orphaned listener(s) on port ${port}: ${[...killed].join(', ')}`);
    }
    return killed.size > 0;
  } catch (_) {
    return false;
  }
}

function listen(attempts = 2) {
  const server = app.listen(PORT);

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && attempts > 0) {
      console.error(`[server] port ${PORT} in use - freeing orphaned listener and retrying`);
      killOrphanedPortListener(PORT);
      setTimeout(() => {
        const retry = listen(attempts - 1);
        configureSocketTimeouts(retry);
        registerShutdown(retry);
      }, 1200);
    } else {
      console.error('[server] failed to bind:', err.message);
      process.exit(1);
    }
  });

  server.on('listening', () => {
    const addr = server.address();
    const shown = addr && typeof addr === 'object' ? addr.port : PORT;
    console.log(`Digital Document Management API running on port ${shown} [${process.env.NODE_ENV}]`);
  });

  return server;
}

function configureSocketTimeouts(server) {
  server.headersTimeout = 65000;
  server.keepAliveTimeout = 65000;
  server.requestTimeout = 300000;
  server.maxRequestsPerSocket = 0;
}

let shuttingDown = false;
function registerShutdown(server) {
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[server] received ${signal}, closing listeners...`);
    server.close(() => {
      prisma.$disconnect()
        .catch(() => {})
        .finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

// Keep the process alive if a background task rejects (e.g. a dropped
// connection while streaming a large upload) instead of crashing the API.
process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandled rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[server] uncaught exception:', err);
});

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

module.exports = app;

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { PrismaClient } = require('@prisma/client');
const auditRoutes = require('./src/routes/audit.routes');
const dashboardRoutes = require('./src/routes/dashboard.routes');
const authRoutes = require('./src/routes/auth.routes');
const caseRoutes = require('./src/routes/case.routes');
const evidenceRoutes = require('./src/routes/evidenceRoutes');
const custodyRoutes = require('./src/routes/custody.routes');
const reportRoutes = require('./src/routes/report.routes');
const { errorHandler } = require('./src/middleware/errorHandler');
const alertRoutes = require('./src/routes/alert.routes');
const prisma = new PrismaClient();
const app = express();
const adminRoutes = require('./src/routes/admin.routes');
const PORT = process.env.PORT || 5000;
const documentPermissionRoutes = require("./src/routes/documentPermission.routes");
/**
 * ============================================================================
 * SECURITY MIDDLEWARE
 * ============================================================================
 */

app.use(helmet());

const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://10.48.3.164:3000',
  'http://192.168.1.18:3000',
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests without an Origin header
      // such as curl/Postman/server-to-server calls.
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(
        new Error(
          `CORS blocked origin: ${origin}`
        )
      );
    },

    credentials: true,

    methods: [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS',
    ],

    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
    ],
  })
);

/**
 * ============================================================================
 * RATE LIMITING
 * ============================================================================
 *
 * We use different limits for different API categories.
 *
 * Authentication:
 *   Strict limit because login/MFA endpoints are security-sensitive.
 *
 * Normal API:
 *   Higher limit so normal dashboard/document navigation does not trigger
 *   false 429 errors during development.
 */

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  // Protect login/MFA against brute-force attempts.
  max: 30,

  standardHeaders: true,
  legacyHeaders: false,

  message: {
    error:
      'Too many authentication attempts, please try again later.',
  },

  skip: (req) => {
    /*
     * Only apply this limiter to authentication requests.
     */
    return !req.originalUrl.startsWith('/api/v1/auth/');
  },
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  /*
   * Normal application activity can involve many API calls:
   * /auth/me, cases, documents, dashboard, custody, etc.
   */
  max: 1000,

  standardHeaders: true,
  legacyHeaders: false,

  message: {
    error:
      'Too many requests, please try again later.',
  },
});

/*
 * Apply normal API limiter to all API requests.
 */
app.use('/api/', apiLimiter);

/*
 * Apply stricter authentication limiter to auth routes.
 *
 * Because both limiters are active:
 * - normal API requests get the higher application allowance
 * - auth requests ALSO get the stricter auth allowance
 */
app.use('/api/', authLimiter);

/**
 * ============================================================================
 * BODY PARSING
 * ============================================================================
 */

app.use(
  express.json({
    limit: '10mb',
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: '10mb',
  })
);

/**
 * ============================================================================
 * LOGGING
 * ============================================================================
 */

if (
  process.env.NODE_ENV !== 'test'
) {
  app.use(
    morgan('combined')
  );
}

/**
 * ============================================================================
 * HEALTH CHECK
 * ============================================================================
 */

app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      status: 'healthy',
      timestamp:
        new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({
      status: 'unhealthy',
      error: err.message,
    });
  }
});

/**
 * ============================================================================
 * API ROUTES
 * ============================================================================
 */

const apiPrefix =
  `/api/${
    process.env.API_VERSION ||
    'v1'
  }`;

app.use(
  `${apiPrefix}/auth`,
  authRoutes
);

app.use(
  `${apiPrefix}/cases`,
  caseRoutes
);

app.use(
  `${apiPrefix}/evidence`,
  evidenceRoutes
);

app.use(
  `${apiPrefix}/custody`,
  custodyRoutes
);

app.use(
  `${apiPrefix}/reports`,
  reportRoutes
);

app.use(
  `${apiPrefix}/dashboard`,
  dashboardRoutes
);
app.use(`${apiPrefix}/audit`, auditRoutes);
app.use(`${apiPrefix}/admin`, adminRoutes);
app.use(`${apiPrefix}/alerts`, alertRoutes);
app.use(
  `${apiPrefix}/permissions`,
  documentPermissionRoutes
);



/**
 * ============================================================================
 * 404 HANDLER
 * ============================================================================
 */

app.use(
  (req, res) => {
    res.status(404).json({
      error: 'Route not found',
    });
  }
);

/**
 * ============================================================================
 * GLOBAL ERROR HANDLER
 * ============================================================================
 */

app.use(
  errorHandler
);

/**
 * ============================================================================
 * SERVER STARTUP
 * ============================================================================
 */

async function startServer() {
  await prisma.$connect();

  console.log(
    'Connected to PostgreSQL via Prisma'
  );

  const server =
    listen();

  configureSocketTimeouts(
    server
  );

  registerShutdown(
    server
  );

  return server;
}

/**
 * ============================================================================
 * WINDOWS PORT CLEANUP
 * ============================================================================
 */

function killOrphanedPortListener(
  port
) {
  if (
    process.platform !==
    'win32'
  ) {
    return false;
  }

  try {
    const {
      execSync,
    } = require(
      'child_process'
    );

    const out =
      execSync(
        `netstat -ano | findstr :${port} | findstr LISTENING`,
        {
          encoding:
            'utf8',
          shell:
            'cmd.exe',
        }
      );

    const killed =
      new Set();

    for (
      const line of out
        .trim()
        .split(/\r?\n/)
    ) {
      const parts =
        line
          .trim()
          .split(/\s+/);

      const pid =
        parts[
          parts.length - 1
        ];

      if (
        !pid ||
        Number.isNaN(
          Number(pid)
        ) ||
        Number(pid) ===
          process.pid
      ) {
        continue;
      }

      try {
        execSync(
          `taskkill /F /PID ${pid}`,
          {
            stdio:
              'ignore',
          }
        );

        killed.add(
          pid
        );
      } catch (_) {
        // Process may already be gone.
      }
    }

    if (
      killed.size > 0
    ) {
      console.warn(
        `[server] freed orphaned listener(s) on port ${port}: ${[
          ...killed,
        ].join(', ')}`
      );
    }

    return (
      killed.size > 0
    );
  } catch (_) {
    return false;
  }
}

/**
 * ============================================================================
 * LISTEN
 * ============================================================================
 */

function listen(
  attempts = 2
) {
  const server =
    app.listen(PORT);

  server.on(
    'error',
    (err) => {
      if (
        err.code ===
          'EADDRINUSE' &&
        attempts > 0
      ) {
        console.error(
          `[server] port ${PORT} in use - freeing orphaned listener and retrying`
        );

        killOrphanedPortListener(
          PORT
        );

        setTimeout(
          () => {
            const retry =
              listen(
                attempts - 1
              );

            configureSocketTimeouts(
              retry
            );

            registerShutdown(
              retry
            );
          },
          1200
        );
      } else {
        console.error(
          '[server] failed to bind:',
          err.message
        );

        process.exit(1);
      }
    }
  );

  server.on(
    'listening',
    () => {
      const addr =
        server.address();

      const shown =
        addr &&
        typeof addr ===
          'object'
          ? addr.port
          : PORT;

      console.log(
        `Digital Document Management API running on port ${shown} [${process.env.NODE_ENV}]`
      );
    }
  );

  return server;
}

/**
 * ============================================================================
 * SOCKET TIMEOUTS
 * ============================================================================
 */

function configureSocketTimeouts(
  server
) {
  server.headersTimeout =
    65000;

  server.keepAliveTimeout =
    65000;

  server.requestTimeout =
    300000;

  server.maxRequestsPerSocket =
    0;
}

/**
 * ============================================================================
 * GRACEFUL SHUTDOWN
 * ============================================================================
 */

let shuttingDown =
  false;

function registerShutdown(
  server
) {
  const shutdown =
    (signal) => {
      if (
        shuttingDown
      ) {
        return;
      }

      shuttingDown =
        true;

      console.log(
        `\n[server] received ${signal}, closing listeners...`
      );

      server.close(
        () => {
          prisma
            .$disconnect()
            .catch(() => {})
            .finally(
              () =>
                process.exit(0)
            );
        }
      );

      setTimeout(
        () =>
          process.exit(0),
        3000
      ).unref();
    };

  process.once(
    'SIGINT',
    () =>
      shutdown(
        'SIGINT'
      )
  );

  process.once(
    'SIGTERM',
    () =>
      shutdown(
        'SIGTERM'
      )
  );
}

/**
 * ============================================================================
 * PROCESS-LEVEL ERROR HANDLING
 * ============================================================================
 */

process.on(
  'unhandledRejection',
  (reason) => {
    console.error(
      '[server] unhandled rejection:',
      reason
    );
  }
);

process.on(
  'uncaughtException',
  (err) => {
    console.error(
      '[server] uncaught exception:',
      err
    );
  }
);

/**
 * ============================================================================
 * START SERVER
 * ============================================================================
 */

startServer().catch(
  (err) => {
    console.error(
      'Failed to start server:',
      err
    );

    process.exit(1);
  }
);

module.exports =
  app;
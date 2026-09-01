/**
 * Prisma seed entrypoint.
 * Delegates to the canonical seed script at database/seeds/seed.js
 * so there is a single source of demo data.
 */
const path = require('path');

require(path.join(__dirname, '../../database/seeds/seed.js'));

const { sendError, HttpError } = require('../utils/responseHelper');

/**
 * Centralized Express error handler.
 * Every thrown/rejected error (including `HttpError` from `handleAsync`
 * handlers) is normalized here into the standard envelope:
 *   { success: false, data: null, error, timestamp }
 */
function errorHandler(err, req, res, _next) {
  console.error('Error:', err);

  // Pass through errors that already carry a status (thrown HttpError).
  if (err instanceof HttpError) {
    return sendError(res, err, err.statusCode);
  }

  // Prisma known-request errors -> 4xx with a safe message.
  if (err.name === 'PrismaClientKnownRequestError') {
    if (err.code === 'P2002') {
      return res.status(409).json({
        success: false,
        data: null,
        error: 'Resource already exists',
        field: err.meta?.target,
        timestamp: new Date().toISOString(),
      });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({
        success: false,
        data: null,
        error: 'Resource not found',
        timestamp: new Date().toISOString(),
      });
    }
  }

  if (err.name === 'JsonWebTokenError') {
    return sendError(res, 'Invalid token', 401);
  }

  if (err.name === 'MulterError') {
    return sendError(res, `File upload error: ${err.message}`, 400);
  }

  const statusCode = err.statusCode || 500;
  const message =
    process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message;

  return sendError(res, message, statusCode);
}

module.exports = { errorHandler };

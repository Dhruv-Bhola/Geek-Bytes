const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
};

/**
 * Error subclass carrying an HTTP status code.
 * Throw inside a `handleAsync` handler and the centralized errorHandler
 * will translate it into a standard {@link {success,data,error,timestamp}} response.
 */
class HttpError extends Error {
  constructor(statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, message = 'Internal server error') {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}

/**
 * Backward-compatible success responder.
 *
 * Wraps arbitrary payloads in the standard envelope
 * `{ success: true, data, timestamp, ...payload }`. The original top-level
 * payload fields are spread onto the response so existing frontend readers
 * (App.api -> data.*) and tests keep working unchanged.
 */
function sendSuccess(res, data, status = HTTP_STATUS.OK) {
  const payload = data == null ? {} : data;
  return res.status(status).json({
    success: true,
    data: payload,
    timestamp: new Date().toISOString(),
    ...payload,
  });
}

/**
 * Backward-compatible error responder (used directly when a handler must
 * respond inline). Prefer throwing `HttpError` from `handleAsync` handlers so
 * every error funnels through the centralized errorHandler instead.
 */
function sendError(res, error, status = HTTP_STATUS.INTERNAL_SERVER_ERROR) {
  const message =
    typeof error === 'string'
      ? error
      : error && error.message
        ? error.message
        : 'Internal server error';
  return res.status(status).json({
    success: false,
    data: null,
    error: message,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Wrap an async route handler so any rejection is forwarded to Express'
 * centralized error middleware instead of producing an unhandled rejection.
 *
 *   router.get('/x', handleAsync((req, res) => { ... }))
 */
function handleAsync(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  HTTP_STATUS,
  HttpError,
  sendSuccess,
  sendError,
  handleAsync,
};

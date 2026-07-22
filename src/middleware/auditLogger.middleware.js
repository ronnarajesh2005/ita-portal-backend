const pool = require('../config/db');

const ACTION_MAP = {
  POST: 'Created',
  PUT: 'Updated',
  DELETE: 'Deleted',
};

/**
 * Usage: attach per-resource, after `authenticate`, e.g.
 *   router.post('/', authenticate, authorize('admin'), auditLogger('Client'), createClient);
 *
 * Works by patching res.json so it fires AFTER the controller has already
 * sent its response — logging never blocks or can break the actual request.
 */
function auditLogger(entityType) {
  return function (req, res, next) {
    const originalJson = res.json.bind(res);

    res.json = (body) => {
      // Fire-and-forget — never let a logging failure affect the response
      writeAuditLog(req, entityType, body).catch((err) => {
        console.error('Audit log write failed:', err.message);
      });
      return originalJson(body);
    };

    next();
  };
}

async function writeAuditLog(req, entityType, responseBody) {
  const action = ACTION_MAP[req.method];
  if (!action) return; // only log POST/PUT/DELETE

  const success = !!(responseBody && responseBody.success);
  const status = success ? 'Success' : 'Failed';

  const responseData = responseBody && responseBody.data;
  const entityId =
    req.params.id ||
    (responseData &&
      (responseData.client_id ||
        responseData.jr_id ||
        responseData.candidate_id ||
        responseData.stage_id ||
        responseData.user_id)) ||
    null;

  const details = {
    method: req.method,
    path: req.originalUrl,
    requestBody: req.body,
    message: responseBody && responseBody.message,
  };

  const userId = (req.user && req.user.user_id) || null;
  const ipAddress = req.ip || (req.connection && req.connection.remoteAddress) || null;

  await pool.query(
    `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details, ip_address)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, action, entityType, entityId, JSON.stringify(details), ipAddress]
  );
}

module.exports = auditLogger;
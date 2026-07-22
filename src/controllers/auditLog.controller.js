const pool = require('../config/db');

function serializeLog(row) {
  let details = {};
  try {
    details = typeof row.details === 'string' ? JSON.parse(row.details) : (row.details || {});
  } catch (e) {
    details = {};
  }

  return {
    log_id: row.log_id,
    timestamp: row.created_at,
    user: row.username || 'System',
    user_id: row.user_id,
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    details,
    status: (details.message && /fail|error/i.test(details.message)) ? 'Failed' : 'Success',
    ip_address: row.ip_address,
  };
}

async function getAuditLogs(req, res, next) {
  try {
    const {
      search,
      action,
      entity_type,
      user_id,
      page = 1,
      limit = 20,
      sort = 'created_at',
      order = 'DESC',
    } = req.query;

    const allowedSort = ['created_at', 'action', 'entity_type'];
    const sortCol = allowedSort.includes(sort) ? sort : 'created_at';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = ['1 = 1'];
    let params = [];

    if (search) {
      where.push('(u.username LIKE ? OR al.entity_type LIKE ? OR al.details LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (action) {
      where.push('al.action = ?');
      params.push(action);
    }
    if (entity_type) {
      where.push('al.entity_type = ?');
      params.push(entity_type);
    }
    if (user_id) {
      where.push('al.user_id = ?');
      params.push(user_id);
    }

    const whereClause = 'WHERE ' + where.join(' AND ');

    const [rows] = await pool.query(
      `SELECT al.*, u.username
       FROM audit_log al
       LEFT JOIN users u ON al.user_id = u.user_id
       ${whereClause}
       ORDER BY al.${sortCol} ${sortOrder}
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total
       FROM audit_log al
       LEFT JOIN users u ON al.user_id = u.user_id
       ${whereClause}`,
      params
    );

    res.json({
      success: true,
      data: rows.map(serializeLog),
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getAuditLogs };
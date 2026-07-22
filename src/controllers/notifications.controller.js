const pool = require('../config/db');

async function getNotifications(req, res, next) {
  try {
    const { is_read, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = ['user_id = ?'];
    let params = [req.user.user_id];
    if (is_read !== undefined) {
      where.push('is_read = ?');
      params.push(is_read === 'true' ? 1 : 0);
    }
    const whereClause = 'WHERE ' + where.join(' AND ');

    const [rows] = await pool.query(
      `SELECT * FROM notifications
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM notifications ${whereClause}`, params
    );

    const [[{ unread }]] = await pool.query(
      `SELECT COUNT(*) as unread FROM notifications WHERE user_id = ? AND is_read = 0`,
      [req.user.user_id]
    );

    res.json({
      success: true,
      data: rows,
      unread_count: unread,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) },
    });
  } catch (err) { next(err); }
}

async function markAsRead(req, res, next) {
  try {
    const [result] = await pool.query(
      'UPDATE notifications SET is_read = 1 WHERE notification_id = ? AND user_id = ?',
      [req.params.id, req.user.user_id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ success: false, message: 'Notification not found' });
    res.json({ success: true, message: 'Notification marked as read' });
  } catch (err) { next(err); }
}

async function markAllAsRead(req, res, next) {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
      [req.user.user_id]
    );
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (err) { next(err); }
}

async function deleteNotification(req, res, next) {
  try {
    const [result] = await pool.query(
      'DELETE FROM notifications WHERE notification_id = ? AND user_id = ?',
      [req.params.id, req.user.user_id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ success: false, message: 'Notification not found' });
    res.json({ success: true, message: 'Notification deleted successfully' });
  } catch (err) { next(err); }
}

module.exports = { getNotifications, markAsRead, markAllAsRead, deleteNotification };
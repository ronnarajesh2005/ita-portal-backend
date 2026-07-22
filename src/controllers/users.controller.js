const { z } = require('zod');
const pool = require('../config/db');

const updateUserSchema = z.object({
  username: z.string().min(2).optional(),
  email: z.string().email().optional(),
  role: z.enum(['admin', 'ta']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

async function getAllUsers(req, res, next) {
  try {
    const { search, role, status, page = 1, limit = 10, sort = 'created_at', order = 'DESC' } = req.query;

    const allowedSort = ['username', 'email', 'role', 'status', 'created_at'];
    const sortCol = allowedSort.includes(sort) ? sort : 'created_at';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = [];
    let params = [];

    if (search) {
      where.push('(username LIKE ? OR email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    if (role) { where.push('role = ?'); params.push(role); }
    if (status) { where.push('status = ?'); params.push(status); }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const [rows] = await pool.query(
      `SELECT user_id, username, email, role, status, created_at, updated_at 
       FROM users ${whereClause} 
       ORDER BY ${sortCol} ${sortOrder} 
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM users ${whereClause}`, params
    );

    res.json({
      success: true,
      data: rows,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) },
    });
  } catch (err) { next(err); }
}

async function getUserById(req, res, next) {
  try {
    const [rows] = await pool.query(
      'SELECT user_id, username, email, role, status, created_at, updated_at FROM users WHERE user_id = ?',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
}

async function updateUser(req, res, next) {
  try {
    const data = updateUserSchema.parse(req.body);
    if (Object.keys(data).length === 0)
      return res.status(400).json({ success: false, message: 'No fields provided to update' });

    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(data), req.params.id];

    const [result] = await pool.query(`UPDATE users SET ${fields} WHERE user_id = ?`, values);
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'User not found' });

    const [updated] = await pool.query(
      'SELECT user_id, username, email, role, status, updated_at FROM users WHERE user_id = ?',
      [req.params.id]
    );
    res.json({ success: true, data: updated[0] });
  } catch (err) { next(err); }
}

async function deleteUser(req, res, next) {
  try {
    const [result] = await pool.query('UPDATE users SET status = ? WHERE user_id = ?', ['inactive', req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, message: 'User deactivated successfully' });
  } catch (err) { next(err); }
}

module.exports = { getAllUsers, getUserById, updateUser, deleteUser };
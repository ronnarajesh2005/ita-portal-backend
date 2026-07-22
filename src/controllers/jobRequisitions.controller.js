const { z } = require('zod');
const pool = require('../config/db');
const { createNotification } = require('../services/notifications.service');

const jrSchema = z.object({
  jr_title: z.string().min(2),
  client_id: z.number().int(),
  department: z.string().optional(),
  location: z.string().optional(),
  work_mode: z.enum(['remote', 'onsite', 'hybrid']).optional(),
  employment_type: z.enum(['full_time', 'part_time', 'contract', 'internship']).optional(),
  experience_level: z.enum(['junior', 'mid', 'senior', 'lead']).optional(),
  salary_min: z.number().optional(),
  salary_max: z.number().optional(),
  salary_currency: z.string().optional(),
  salary_period: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  openings: z.number().int().optional(),
  filled_count: z.number().int().optional(),
  description: z.string().optional(),
  requirements: z.array(z.string()).optional(),
  required_skills: z.array(z.object({
    name: z.string(),
    yearsOfExperience: z.number().optional(),
    proficiency: z.string().optional(),
  })).optional(),
  preferred_skills: z.array(z.object({
    name: z.string(),
    yearsOfExperience: z.number().optional(),
    proficiency: z.string().optional(),
  })).optional(),
  benefits: z.array(z.string()).optional(),
  brief: z.any().optional(),
  assigned_ta_ids: z.array(z.number().int()).optional(),
  skills: z.string().optional(),
  experience: z.string().optional(),
  status: z.enum(['draft', 'pending_approval', 'open', 'on_hold', 'closed', 'filled']).optional(),
  target_date: z.string().optional(),
  published_at: z.string().optional(),
});

const jsonFields = ['requirements', 'required_skills', 'preferred_skills', 'benefits', 'brief', 'assigned_ta_ids'];

function serializeJR(row) {
  const result = { ...row };
  jsonFields.forEach(f => {
    if (result[f] && typeof result[f] === 'string') {
      try { result[f] = JSON.parse(result[f]); } catch { result[f] = null; }
    }
  });
  return result;
}

async function getAllJRs(req, res, next) {
  try {
    const { search, status, client_id, priority, experience_level, page = 1, limit = 10, sort = 'created_at', order = 'DESC' } = req.query;
    const allowedSort = ['jr_title', 'status', 'priority', 'created_at', 'target_date'];
    const sortCol = allowedSort.includes(sort) ? sort : 'created_at';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = ['jr.is_deleted = FALSE'];
    let params = [];
    if (search) {
      where.push('(jr.jr_title LIKE ? OR jr.description LIKE ? OR jr.department LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status) { where.push('jr.status = ?'); params.push(status); }
    if (client_id) { where.push('jr.client_id = ?'); params.push(client_id); }
    if (priority) { where.push('jr.priority = ?'); params.push(priority); }
    if (experience_level) { where.push('jr.experience_level = ?'); params.push(experience_level); }
    const whereClause = 'WHERE ' + where.join(' AND ');
    const [rows] = await pool.query(
      `SELECT jr.*, c.client_name, u.username as created_by_name
       FROM job_requisitions jr
       LEFT JOIN clients c ON jr.client_id = c.client_id
       LEFT JOIN users u ON jr.created_by = u.user_id
       ${whereClause}
       ORDER BY jr.${sortCol} ${sortOrder}
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM job_requisitions jr ${whereClause}`, params
    );
    res.json({
      success: true,
      data: rows.map(serializeJR),
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) },
    });
  } catch (err) { next(err); }
}

async function getJRById(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT jr.*, c.client_name, u.username as created_by_name
       FROM job_requisitions jr
       LEFT JOIN clients c ON jr.client_id = c.client_id
       LEFT JOIN users u ON jr.created_by = u.user_id
       WHERE jr.jr_id = ? AND jr.is_deleted = FALSE`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Job requisition not found' });
    res.json({ success: true, data: serializeJR(rows[0]) });
  } catch (err) { next(err); }
}

async function createJR(req, res, next) {
  try {
    const data = jrSchema.parse(req.body);
    const [result] = await pool.query(
      `INSERT INTO job_requisitions (
        jr_title, client_id, created_by, department, location, work_mode,
        employment_type, experience_level, salary_min, salary_max,
        salary_currency, salary_period, priority, openings, filled_count,
        description, requirements, required_skills, preferred_skills,
        benefits, brief, assigned_ta_ids, skills, experience, status,
        target_date, published_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.jr_title, data.client_id, req.user.user_id,
        data.department || null, data.location || null,
        data.work_mode || 'hybrid', data.employment_type || 'full_time',
        data.experience_level || null, data.salary_min || null, data.salary_max || null,
        data.salary_currency || 'USD', data.salary_period || 'annual',
        data.priority || 'medium', data.openings || 1, data.filled_count || 0,
        data.description || null,
        data.requirements ? JSON.stringify(data.requirements) : null,
        data.required_skills ? JSON.stringify(data.required_skills) : null,
        data.preferred_skills ? JSON.stringify(data.preferred_skills) : null,
        data.benefits ? JSON.stringify(data.benefits) : null,
        data.brief ? JSON.stringify(data.brief) : null,
        data.assigned_ta_ids ? JSON.stringify(data.assigned_ta_ids) : null,
        data.skills || null, data.experience || null,
        data.status || 'draft',
        data.target_date || null,
        data.published_at || null,
      ]
    );

    const [created] = await pool.query(
      `SELECT jr.*, c.client_name, u.username as created_by_name
       FROM job_requisitions jr
       LEFT JOIN clients c ON jr.client_id = c.client_id
       LEFT JOIN users u ON jr.created_by = u.user_id
       WHERE jr.jr_id = ?`,
      [result.insertId]
    );

    // Notify any TAs assigned at creation time too, not just on later
    // updates — otherwise a JR created with assigned_ta_ids already
    // populated would never trigger a notification.
    if (data.assigned_ta_ids && data.assigned_ta_ids.length > 0) {
      const jrRow = created[0];
      data.assigned_ta_ids.forEach(taId => {
        createNotification(
          taId,
          'jr_assigned',
          { jr_title: jrRow.jr_title, client_name: jrRow.client_name },
          { type: 'job_requisition', id: jrRow.jr_id }
        ).catch(() => {});
      });
    }

    res.status(201).json({ success: true, data: serializeJR(created[0]) });
  } catch (err) { next(err); }
}

async function updateJR(req, res, next) {
  try {
    const data = jrSchema.partial().parse(req.body);
    if (Object.keys(data).length === 0)
      return res.status(400).json({ success: false, message: 'No fields provided to update' });

    // Fetch prior assigned_ta_ids so we can diff and notify only the
    // TAs newly added in this update, not ones already assigned.
    const [[existing]] = await pool.query(
      'SELECT assigned_ta_ids FROM job_requisitions WHERE jr_id = ?',
      [req.params.id]
    );
    let previousTaIds = [];
    if (existing && existing.assigned_ta_ids) {
      try {
        previousTaIds = typeof existing.assigned_ta_ids === 'string'
          ? JSON.parse(existing.assigned_ta_ids)
          : existing.assigned_ta_ids;
      } catch { previousTaIds = []; }
    }

    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
    const values = Object.entries(data).map(([k, v]) =>
      jsonFields.includes(k) ? JSON.stringify(v) : v
    );
    values.push(req.params.id);
    const [result] = await pool.query(
      `UPDATE job_requisitions SET ${fields} WHERE jr_id = ?`, values
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ success: false, message: 'Job requisition not found' });
    const [updated] = await pool.query(
      `SELECT jr.*, c.client_name, u.username as created_by_name
       FROM job_requisitions jr
       LEFT JOIN clients c ON jr.client_id = c.client_id
       LEFT JOIN users u ON jr.created_by = u.user_id
       WHERE jr.jr_id = ?`,
      [req.params.id]
    );

    if (data.assigned_ta_ids) {
      const newlyAdded = data.assigned_ta_ids.filter(id => !previousTaIds.includes(id));
      const jrRow = updated[0];
      newlyAdded.forEach(taId => {
        createNotification(
          taId,
          'jr_assigned',
          { jr_title: jrRow.jr_title, client_name: jrRow.client_name },
          { type: 'job_requisition', id: jrRow.jr_id }
        ).catch(() => {});
      });
    }

    res.json({ success: true, data: serializeJR(updated[0]) });
  } catch (err) { next(err); }
}

async function deleteJR(req, res, next) {
  try {
    const [result] = await pool.query(
      'UPDATE job_requisitions SET is_deleted = TRUE, deleted_at = NOW() WHERE jr_id = ?',
      [req.params.id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ success: false, message: 'Job requisition not found' });
    res.json({ success: true, message: 'Job requisition deleted successfully' });
  } catch (err) { next(err); }
}

module.exports = { getAllJRs, getJRById, createJR, updateJR, deleteJR };
const { z } = require('zod');
const pool = require('../config/db');

const clientSchema = z.object({
  client_name: z.string().min(2),
  industry: z.string().optional(),
  tier: z.enum(['startup', 'mid_market', 'enterprise']).optional(),
  website: z.string().optional(),
  headquarters: z.string().optional(),
  employee_count: z.number().int().optional(),
  description: z.string().optional(),
  contacts: z.array(z.object({
    name: z.string(),
    email: z.string().email(),
    phone: z.string().optional(),
    designation: z.string().optional(),
    isPrimary: z.boolean().optional(),
  })).optional(),
  assigned_ta_ids: z.array(z.number().int()).optional(),
  contact_person: z.string().optional(),
  contact_email: z.string().email().optional(),
  assigned_ta: z.number().int().optional(),
  active_jobs: z.number().int().optional(),
  total_hires: z.number().int().optional(),
  contract_start_date: z.string().optional(),
  contract_end_date: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

function serializeClient(row) {
  return {
    ...row,
    contacts: typeof row.contacts === 'string' ? JSON.parse(row.contacts) : (row.contacts || []),
    assigned_ta_ids: typeof row.assigned_ta_ids === 'string' ? JSON.parse(row.assigned_ta_ids) : (row.assigned_ta_ids || []),
  };
}

async function getAllClients(req, res, next) {
  try {
    const { search, status, tier, page = 1, limit = 10, sort = 'created_at', order = 'DESC' } = req.query;

    const allowedSort = ['client_name', 'industry', 'status', 'tier', 'created_at'];
    const sortCol = allowedSort.includes(sort) ? sort : 'created_at';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = ['c.is_deleted = FALSE'];
    let params = [];

    if (search) {
      where.push('(c.client_name LIKE ? OR c.industry LIKE ? OR c.contact_person LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status) { where.push('c.status = ?'); params.push(status); }
    if (tier) { where.push('c.tier = ?'); params.push(tier); }

    const whereClause = 'WHERE ' + where.join(' AND ');

    const [rows] = await pool.query(
      `SELECT c.*, u.username as assigned_ta_name
       FROM clients c
       LEFT JOIN users u ON c.assigned_ta = u.user_id
       ${whereClause}
       ORDER BY c.${sortCol} ${sortOrder}
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM clients c ${whereClause}`, params
    );

    res.json({
      success: true,
      data: rows.map(serializeClient),
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) },
    });
  } catch (err) { next(err); }
}

async function getClientById(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT c.*, u.username as assigned_ta_name
       FROM clients c
       LEFT JOIN users u ON c.assigned_ta = u.user_id
       WHERE c.client_id = ? AND c.is_deleted = FALSE`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Client not found' });
    res.json({ success: true, data: serializeClient(rows[0]) });
  } catch (err) { next(err); }
}

async function createClient(req, res, next) {
  try {
    const data = clientSchema.parse(req.body);
    const [result] = await pool.query(
      `INSERT INTO clients (
        client_name, industry, tier, website, headquarters, employee_count,
        description, contacts, assigned_ta_ids, contact_person, contact_email,
        assigned_ta, active_jobs, total_hires, contract_start_date,
        contract_end_date, notes, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.client_name, data.industry || null, data.tier || 'mid_market',
        data.website || null, data.headquarters || null, data.employee_count || null,
        data.description || null,
        data.contacts ? JSON.stringify(data.contacts) : null,
        data.assigned_ta_ids ? JSON.stringify(data.assigned_ta_ids) : null,
        data.contact_person || null, data.contact_email || null,
        data.assigned_ta || null, data.active_jobs || 0, data.total_hires || 0,
        data.contract_start_date || null, data.contract_end_date || null,
        data.notes || null, data.status || 'active'
      ]
    );
    const [created] = await pool.query('SELECT * FROM clients WHERE client_id = ?', [result.insertId]);
    res.status(201).json({ success: true, data: serializeClient(created[0]) });
  } catch (err) { next(err); }
}

async function updateClient(req, res, next) {
  try {
    const data = clientSchema.partial().parse(req.body);
    if (Object.keys(data).length === 0)
      return res.status(400).json({ success: false, message: 'No fields provided to update' });

    const jsonFields = ['contacts', 'assigned_ta_ids'];
    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
    const values = Object.entries(data).map(([k, v]) =>
      jsonFields.includes(k) ? JSON.stringify(v) : v
    );
    values.push(req.params.id);

    const [result] = await pool.query(`UPDATE clients SET ${fields} WHERE client_id = ?`, values);
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Client not found' });

    const [updated] = await pool.query('SELECT * FROM clients WHERE client_id = ?', [req.params.id]);
    res.json({ success: true, data: serializeClient(updated[0]) });
  } catch (err) { next(err); }
}

async function deleteClient(req, res, next) {
  try {
    const [result] = await pool.query(
      'UPDATE clients SET is_deleted = TRUE, deleted_at = NOW() WHERE client_id = ?',
      [req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Client not found' });
    res.json({ success: true, message: 'Client deleted successfully' });
  } catch (err) { next(err); }
}

module.exports = { getAllClients, getClientById, createClient, updateClient, deleteClient };
const { z } = require('zod');
const pool = require('../config/db');
const { createNotification } = require('../services/notifications.service');

const candidateSchema = z.object({
  full_name: z.string().min(2),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  avatar_url: z.string().optional(),
  linkedin_url: z.string().optional(),
  portfolio_url: z.string().optional(),
  location: z.string().optional(),
  current_title: z.string().optional(),
  current_company: z.string().optional(),
  experience_level: z.enum(['junior', 'mid', 'senior', 'lead']).optional(),
  total_years_experience: z.number().int().optional(),
  expected_salary: z.number().optional(),
  notice_period: z.number().int().optional(),
  source: z.string().optional(),
  jr_id: z.number().int().optional(),
  current_stage: z.string().optional(),
  pipeline_stage: z.string().optional(),
  status: z.enum(['active', 'rejected', 'hired', 'withdrawn', 'sourced']).optional(),
  cv_path: z.string().optional(),
  resume_url: z.string().optional(),
  skills: z.array(z.object({
    name: z.string(),
    yearsOfExperience: z.number().optional(),
    proficiency: z.string().optional(),
  })).optional(),
  education: z.array(z.any()).optional(),
  work_experience: z.array(z.any()).optional(),
  tags: z.array(z.string()).optional(),
  score: z.any().optional(),
  skill_gaps: z.array(z.any()).optional(),
  assigned_ta_id: z.number().int().optional(),
  notes: z.string().optional(),
});

const jsonFields = ['skills', 'education', 'work_experience', 'tags', 'score', 'skill_gaps'];

// Canonical funnel taxonomy used by the Reports page. Kept here so both
// candidates.controller.js and interviewStages.controller.js agree on the
// same stage names and ordering.
const PIPELINE_STAGE_ORDER = ['applied', 'screened', 'shortlisted', 'interviewed', 'offered', 'placed'];

function serializeCandidate(row) {
  const result = { ...row };
  jsonFields.forEach(f => {
    if (result[f] && typeof result[f] === 'string') {
      try { result[f] = JSON.parse(result[f]); } catch { result[f] = null; }
    }
  });
  return result;
}

async function getAllCandidates(req, res, next) {
  try {
    const { search, status, jr_id, pipeline_stage, experience_level, page = 1, limit = 10, sort = 'created_at', order = 'DESC' } = req.query;
    const allowedSort = ['full_name', 'status', 'pipeline_stage', 'created_at', 'experience_level'];
    const sortCol = allowedSort.includes(sort) ? sort : 'created_at';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = ['c.is_deleted = FALSE'];
    let params = [];
    if (search) {
      where.push('(c.full_name LIKE ? OR c.email LIKE ? OR c.current_title LIKE ? OR c.current_company LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status) { where.push('c.status = ?'); params.push(status); }
    if (jr_id) { where.push('c.jr_id = ?'); params.push(jr_id); }
    if (pipeline_stage) { where.push('c.pipeline_stage = ?'); params.push(pipeline_stage); }
    if (experience_level) { where.push('c.experience_level = ?'); params.push(experience_level); }
    const whereClause = 'WHERE ' + where.join(' AND ');
    const [rows] = await pool.query(
      `SELECT c.*, jr.jr_title, u.username as added_by_name
       FROM candidates c
       LEFT JOIN job_requisitions jr ON c.jr_id = jr.jr_id
       LEFT JOIN users u ON c.added_by = u.user_id
       ${whereClause}
       ORDER BY c.${sortCol} ${sortOrder}
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM candidates c ${whereClause}`, params
    );
    res.json({
      success: true,
      data: rows.map(serializeCandidate),
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) },
    });
  } catch (err) { next(err); }
}

async function getCandidateById(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT c.*, jr.jr_title, u.username as added_by_name
       FROM candidates c
       LEFT JOIN job_requisitions jr ON c.jr_id = jr.jr_id
       LEFT JOIN users u ON c.added_by = u.user_id
       WHERE c.candidate_id = ? AND c.is_deleted = FALSE`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Candidate not found' });
    res.json({ success: true, data: serializeCandidate(rows[0]) });
  } catch (err) { next(err); }
}

async function createCandidate(req, res, next) {
  try {
    const data = candidateSchema.parse(req.body);
    const [result] = await pool.query(
      `INSERT INTO candidates (
        full_name, first_name, last_name, email, phone, avatar_url,
        linkedin_url, portfolio_url, location, current_title, current_company,
        experience_level, total_years_experience, expected_salary, notice_period,
        source, jr_id, added_by, current_stage, pipeline_stage, status,
        cv_path, resume_url, skills, education, work_experience, tags,
        score, skill_gaps, assigned_ta_id, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.full_name,
        data.first_name || null, data.last_name || null,
        data.email || null, data.phone || null,
        data.avatar_url || null, data.linkedin_url || null,
        data.portfolio_url || null, data.location || null,
        data.current_title || null, data.current_company || null,
        data.experience_level || null, data.total_years_experience || null,
        data.expected_salary || null, data.notice_period || null,
        data.source || null, data.jr_id || null,
        req.user.user_id,
        data.current_stage || data.pipeline_stage || 'sourced',
        // Every candidate now enters the funnel at 'applied' by default,
        // instead of the old unused 'sourced' value, so the Reports pipeline
        // funnel has something real to count from day one.
        data.pipeline_stage || 'applied',
        data.status || 'active',
        data.cv_path || null, data.resume_url || null,
        data.skills ? JSON.stringify(data.skills) : null,
        data.education ? JSON.stringify(data.education) : null,
        data.work_experience ? JSON.stringify(data.work_experience) : null,
        data.tags ? JSON.stringify(data.tags) : null,
        data.score ? JSON.stringify(data.score) : null,
        data.skill_gaps ? JSON.stringify(data.skill_gaps) : null,
        data.assigned_ta_id || null,
        data.notes || null,
      ]
    );
    const [created] = await pool.query(
      `SELECT c.*, jr.jr_title, u.username as added_by_name
       FROM candidates c
       LEFT JOIN job_requisitions jr ON c.jr_id = jr.jr_id
       LEFT JOIN users u ON c.added_by = u.user_id
       WHERE c.candidate_id = ?`,
      [result.insertId]
    );
    res.status(201).json({ success: true, data: serializeCandidate(created[0]) });
  } catch (err) { next(err); }
}

async function updateCandidate(req, res, next) {
  try {
    const data = candidateSchema.partial().parse(req.body);
    if (Object.keys(data).length === 0)
      return res.status(400).json({ success: false, message: 'No fields provided to update' });

    // Fetch prior state before mutating, so we can tell whether
    // pipeline_stage genuinely changed and know who to notify (the
    // existing assigned_ta_id, since this request may not include one).
    const [[existing]] = await pool.query(
      `SELECT c.pipeline_stage, c.assigned_ta_id, c.full_name, jr.jr_title
       FROM candidates c
       LEFT JOIN job_requisitions jr ON c.jr_id = jr.jr_id
       WHERE c.candidate_id = ?`,
      [req.params.id]
    );

    // Hiring a candidate always means they reached the end of the funnel,
    // regardless of what pipeline_stage was previously set to or passed in
    // this request — this keeps the Reports funnel accurate without
    // requiring every caller to remember to set pipeline_stage manually.
    const isHiring = data.status === 'hired';
    if (isHiring) {
      data.pipeline_stage = 'placed';
    }

    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
    const values = Object.entries(data).map(([k, v]) =>
      jsonFields.includes(k) ? JSON.stringify(v) : v
    );
    values.push(req.params.id);
    const [result] = await pool.query(
      `UPDATE candidates SET ${fields} WHERE candidate_id = ?`, values
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    const [updated] = await pool.query(
      `SELECT c.*, jr.jr_title, u.username as added_by_name
       FROM candidates c
       LEFT JOIN job_requisitions jr ON c.jr_id = jr.jr_id
       LEFT JOIN users u ON c.added_by = u.user_id
       WHERE c.candidate_id = ?`,
      [req.params.id]
    );

    if (existing && existing.assigned_ta_id && data.pipeline_stage && data.pipeline_stage !== existing.pipeline_stage) {
      if (isHiring) {
        createNotification(
          existing.assigned_ta_id,
          'candidate_hired',
          {
            candidate_name: existing.full_name,
            jr_title: existing.jr_title,
          },
          { type: 'candidate', id: parseInt(req.params.id) }
        ).catch(() => {});
      } else {
        createNotification(
          existing.assigned_ta_id,
          'pipeline_stage_changed',
          {
            candidate_name: existing.full_name,
            old_stage: existing.pipeline_stage,
            new_stage: data.pipeline_stage,
            jr_title: existing.jr_title,
          },
          { type: 'candidate', id: parseInt(req.params.id) }
        ).catch(() => {});
      }
    }

    res.json({ success: true, data: serializeCandidate(updated[0]) });
  } catch (err) { next(err); }
}

async function deleteCandidate(req, res, next) {
  try {
    const [result] = await pool.query(
      'UPDATE candidates SET is_deleted = TRUE, deleted_at = NOW() WHERE candidate_id = ?',
      [req.params.id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    res.json({ success: true, message: 'Candidate deleted successfully' });
  } catch (err) { next(err); }
}

module.exports = { getAllCandidates, getCandidateById, createCandidate, updateCandidate, deleteCandidate, PIPELINE_STAGE_ORDER };
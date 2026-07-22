const { z } = require('zod');
const pool = require('../config/db');
const { createNotification } = require('../services/notifications.service');

const stageSchema = z.object({
  candidate_id: z.number().int(),
  jr_id: z.number().int(),
  round_name: z.string().min(1),
  stage_status: z.enum(['pending', 'scheduled', 'completed', 'cancelled']).optional(),
  scheduled_at: z.string().optional(),
  feedback: z.string().optional(),
});

// Must match candidates.controller.js's PIPELINE_STAGE_ORDER exactly.
const PIPELINE_STAGE_ORDER = ['applied', 'screened', 'shortlisted', 'interviewed', 'offered', 'placed'];

// Moves a candidate forward in the funnel, never backward. Since
// round_name is free text with no fixed meaning, we can't map an exact
// round to an exact funnel stage — instead we advance by position:
// scheduling any interview round means they've been screened; each
// completed round pushes them one step further, capped at 'interviewed'
// (offered/placed are set elsewhere, via explicit status changes).
async function advancePipelineStage(candidateId, targetStage) {
  const [[cand]] = await pool.query(
    'SELECT pipeline_stage FROM candidates WHERE candidate_id = ?', [candidateId]
  );
  if (!cand) return;
  const currentIndex = PIPELINE_STAGE_ORDER.indexOf(cand.pipeline_stage);
  const targetIndex = PIPELINE_STAGE_ORDER.indexOf(targetStage);
  if (targetIndex > currentIndex) {
    await pool.query(
      'UPDATE candidates SET pipeline_stage = ? WHERE candidate_id = ?', [targetStage, candidateId]
    );
  }
}

async function countCompletedStages(candidateId) {
  const [[{ cnt }]] = await pool.query(
    "SELECT COUNT(*) as cnt FROM interview_stages WHERE candidate_id = ? AND stage_status = 'completed'",
    [candidateId]
  );
  return cnt;
}

// Looks up the candidate's name, assigned TA, and JR title for use as
// notification context. Returns null if the candidate can't be found.
async function getCandidateNotificationContext(candidateId) {
  const [[row]] = await pool.query(
    `SELECT c.candidate_id, c.full_name, c.assigned_ta_id, jr.jr_title
     FROM candidates c
     LEFT JOIN job_requisitions jr ON c.jr_id = jr.jr_id
     WHERE c.candidate_id = ?`,
    [candidateId]
  );
  return row || null;
}

async function getAllStages(req, res, next) {
  try {
    const { candidate_id, jr_id, stage_status, page = 1, limit = 10, sort = 'scheduled_at', order = 'ASC' } = req.query;
    const allowedSort = ['round_name', 'stage_status', 'scheduled_at', 'updated_at'];
    const sortCol = allowedSort.includes(sort) ? sort : 'scheduled_at';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = [];
    let params = [];
    if (candidate_id) { where.push('s.candidate_id = ?'); params.push(candidate_id); }
    if (jr_id) { where.push('s.jr_id = ?'); params.push(jr_id); }
    if (stage_status) { where.push('s.stage_status = ?'); params.push(stage_status); }
    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const [rows] = await pool.query(
      `SELECT s.*, c.full_name as candidate_name, jr.jr_title
       FROM interview_stages s
       LEFT JOIN candidates c ON s.candidate_id = c.candidate_id
       LEFT JOIN job_requisitions jr ON s.jr_id = jr.jr_id
       ${whereClause}
       ORDER BY s.${sortCol} ${sortOrder}
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM interview_stages s ${whereClause}`, params
    );
    res.json({
      success: true,
      data: rows,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) },
    });
  } catch (err) { next(err); }
}

async function getStageById(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT s.*, c.full_name as candidate_name, jr.jr_title
       FROM interview_stages s
       LEFT JOIN candidates c ON s.candidate_id = c.candidate_id
       LEFT JOIN job_requisitions jr ON s.jr_id = jr.jr_id
       WHERE s.stage_id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Interview stage not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
}

async function createStage(req, res, next) {
  try {
    const data = stageSchema.parse(req.body);
    const [result] = await pool.query(
      `INSERT INTO interview_stages (candidate_id, jr_id, round_name, stage_status, scheduled_at, feedback)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [data.candidate_id, data.jr_id, data.round_name,
       data.stage_status || 'pending',
       data.scheduled_at || null,
       data.feedback || null]
    );
    // A candidate having any interview round on record means they've been
    // screened, at minimum — advance the funnel accordingly.
    await advancePipelineStage(data.candidate_id, 'screened');

    // Notify the assigned TA only if this round was created already
    // scheduled — a bare 'pending' round with no confirmed time isn't
    // worth a notification yet.
    if (data.stage_status === 'scheduled') {
      const ctx = await getCandidateNotificationContext(data.candidate_id);
      if (ctx && ctx.assigned_ta_id) {
        createNotification(
          ctx.assigned_ta_id,
          'interview_scheduled',
          {
            candidate_name: ctx.full_name,
            round_name: data.round_name,
            scheduled_at: data.scheduled_at,
            jr_title: ctx.jr_title,
          },
          { type: 'candidate', id: data.candidate_id }
        ).catch(() => {});
      }
    }

    const [created] = await pool.query(
      `SELECT s.*, c.full_name as candidate_name, jr.jr_title
       FROM interview_stages s
       LEFT JOIN candidates c ON s.candidate_id = c.candidate_id
       LEFT JOIN job_requisitions jr ON s.jr_id = jr.jr_id
       WHERE s.stage_id = ?`,
      [result.insertId]
    );
    res.status(201).json({ success: true, data: created[0] });
  } catch (err) { next(err); }
}

async function updateStage(req, res, next) {
  try {
    const data = stageSchema.partial().parse(req.body);
    if (Object.keys(data).length === 0)
      return res.status(400).json({ success: false, message: 'No fields provided to update' });

    // Fetch prior status so we only notify on a genuine transition into
    // 'scheduled', not on every update to an already-scheduled round.
    const [[existing]] = await pool.query(
      'SELECT stage_status, candidate_id FROM interview_stages WHERE stage_id = ?',
      [req.params.id]
    );

    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(data), req.params.id];
    const [result] = await pool.query(
      `UPDATE interview_stages SET ${fields} WHERE stage_id = ?`, values
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ success: false, message: 'Interview stage not found' });
    const [updated] = await pool.query(
      `SELECT s.*, c.full_name as candidate_name, jr.jr_title
       FROM interview_stages s
       LEFT JOIN candidates c ON s.candidate_id = c.candidate_id
       LEFT JOIN job_requisitions jr ON s.jr_id = jr.jr_id
       WHERE s.stage_id = ?`,
      [req.params.id]
    );
    if (data.stage_status === 'completed') {
      const candidateId = updated[0].candidate_id;
      const completedCount = await countCompletedStages(candidateId);
      const target = completedCount === 1 ? 'shortlisted' : 'interviewed';
      await advancePipelineStage(candidateId, target);
    }

    if (data.stage_status === 'scheduled' && existing && existing.stage_status !== 'scheduled') {
      const ctx = await getCandidateNotificationContext(updated[0].candidate_id);
      if (ctx && ctx.assigned_ta_id) {
        createNotification(
          ctx.assigned_ta_id,
          'interview_scheduled',
          {
            candidate_name: ctx.full_name,
            round_name: updated[0].round_name,
            scheduled_at: updated[0].scheduled_at,
            jr_title: ctx.jr_title,
          },
          { type: 'candidate', id: updated[0].candidate_id }
        ).catch(() => {});
      }
    }

    res.json({ success: true, data: updated[0] });
  } catch (err) { next(err); }
}

async function deleteStage(req, res, next) {
  try {
    // Need candidate_id before cancelling, since the UPDATE below doesn't
    // return it and we need it to resolve the assigned TA to notify.
    const [[existing]] = await pool.query(
      'SELECT candidate_id, round_name FROM interview_stages WHERE stage_id = ?',
      [req.params.id]
    );
    if (!existing)
      return res.status(404).json({ success: false, message: 'Interview stage not found' });

    const [result] = await pool.query(
      'UPDATE interview_stages SET stage_status = ? WHERE stage_id = ?', ['cancelled', req.params.id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ success: false, message: 'Interview stage not found' });

    const ctx = await getCandidateNotificationContext(existing.candidate_id);
    if (ctx && ctx.assigned_ta_id) {
      createNotification(
        ctx.assigned_ta_id,
        'interview_cancelled',
        {
          candidate_name: ctx.full_name,
          round_name: existing.round_name,
          jr_title: ctx.jr_title,
        },
        { type: 'candidate', id: existing.candidate_id }
      ).catch(() => {});
    }

    res.json({ success: true, message: 'Interview stage cancelled successfully' });
  } catch (err) { next(err); }
}

module.exports = { getAllStages, getStageById, createStage, updateStage, deleteStage };
const pool = require('../config/db');

// Must match the taxonomy in candidates.controller.js / interviewStages.controller.js / reports.controller.js
const STAGE_ORDER = ['applied', 'screened', 'shortlisted', 'interviewed', 'offered', 'placed'];
const STAGE_LABELS = {
  applied: 'Applied',
  screened: 'Screened',
  shortlisted: 'Shortlisted',
  interviewed: 'Interviewed',
  offered: 'Offered',
  placed: 'Placed',
};

async function getTAOverview(req, res, next) {
  try {
    const taId = req.user.user_id;

    const [[{ activeClients }]] = await pool.query(
      `SELECT COUNT(*) as activeClients FROM clients WHERE assigned_ta = ? AND status = 'active' AND is_deleted = FALSE`,
      [taId]
    );
    const [[{ openJRs }]] = await pool.query(
      `SELECT COUNT(*) as openJRs FROM job_requisitions
       WHERE status = 'open' AND is_deleted = FALSE AND JSON_CONTAINS(assigned_ta_ids, CAST(? AS JSON))`,
      [taId]
    );
    const [[{ candidatesInPipeline }]] = await pool.query(
      `SELECT COUNT(*) as candidatesInPipeline FROM candidates WHERE assigned_ta_id = ? AND status = 'active' AND is_deleted = FALSE`,
      [taId]
    );
    const [[{ interviewsThisWeek }]] = await pool.query(
      `SELECT COUNT(*) as interviewsThisWeek
       FROM interview_stages s
       JOIN candidates c ON s.candidate_id = c.candidate_id
       WHERE c.assigned_ta_id = ? AND c.is_deleted = FALSE
             AND s.stage_status IN ('scheduled', 'pending')
             AND s.scheduled_at BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)`,
      [taId]
    );

    res.json({
      success: true,
      data: { activeClients, openJRs, candidatesInPipeline, interviewsThisWeek },
    });
  } catch (err) { next(err); }
}

async function getTAPerformance(req, res, next) {
  try {
    const taId = req.user.user_id;
    const months = parseInt(req.query.months) || 6;

    const [placedRows] = await pool.query(
      `SELECT DATE_FORMAT(updated_at, '%Y-%m') as ym, COUNT(*) as cnt
       FROM candidates
       WHERE assigned_ta_id = ? AND status = 'hired' AND is_deleted = FALSE
             AND updated_at >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
       GROUP BY ym`,
      [taId, months]
    );
    const placedMap = Object.fromEntries(placedRows.map(r => [r.ym, Number(r.cnt)]));

    const data = [];
    const now = new Date();
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      data.push({ month: d.toLocaleString('default', { month: 'short' }), placements: placedMap[ym] || 0 });
    }

    res.json({
      success: true,
      data,
      note: 'Placement month is approximated from candidates.updated_at, since there is no dedicated hired-date column yet.',
    });
  } catch (err) { next(err); }
}

async function getTAPipeline(req, res, next) {
  try {
    const taId = req.user.user_id;

    const [rows] = await pool.query(
      `SELECT pipeline_stage, COUNT(*) as cnt
       FROM candidates
       WHERE assigned_ta_id = ? AND is_deleted = FALSE AND pipeline_stage IS NOT NULL
       GROUP BY pipeline_stage`,
      [taId]
    );

    const rawCounts = {};
    rows.forEach(r => { rawCounts[r.pipeline_stage] = Number(r.cnt); });

    const cumulativeCounts = STAGE_ORDER.map((_, i) => {
      let count = 0;
      for (let j = i; j < STAGE_ORDER.length; j++) {
        count += rawCounts[STAGE_ORDER[j]] || 0;
      }
      return count;
    });

    const data = STAGE_ORDER.map((stage, i) => ({
      stage: STAGE_LABELS[stage],
      count: cumulativeCounts[i],
    }));

    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function getTAUpcomingInterviews(req, res, next) {
  try {
    const taId = req.user.user_id;
    const limit = parseInt(req.query.limit) || 5;

    const [rows] = await pool.query(
      `SELECT s.stage_id, s.round_name, s.scheduled_at, s.stage_status,
              c.full_name as candidate_name, jr.jr_title, cl.client_name
       FROM interview_stages s
       JOIN candidates c ON s.candidate_id = c.candidate_id
       LEFT JOIN job_requisitions jr ON s.jr_id = jr.jr_id
       LEFT JOIN clients cl ON jr.client_id = cl.client_id
       WHERE c.assigned_ta_id = ? AND c.is_deleted = FALSE
             AND s.stage_status IN ('scheduled', 'pending')
             AND s.scheduled_at IS NOT NULL AND s.scheduled_at >= NOW()
       ORDER BY s.scheduled_at ASC
       LIMIT ?`,
      [taId, limit]
    );

    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
}

async function getTARecentActivity(req, res, next) {
  try {
    const taId = req.user.user_id;
    const limit = parseInt(req.query.limit) || 5;

    const [rows] = await pool.query(
      `SELECT log_id, action, entity_type, entity_id, created_at
       FROM audit_log
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [taId, limit]
    );

    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
}

// Generic profile stats — works for both admin and ta, scoped strictly to
// req.user.user_id, since "clients assigned" / "placements" mean "assigned
// to me" for either role rather than org-wide totals.
async function getProfileStats(req, res, next) {
  try {
    const userId = req.user.user_id;

    const [[{ clientsAssigned }]] = await pool.query(
      `SELECT COUNT(*) as clientsAssigned FROM clients WHERE assigned_ta = ? AND is_deleted = FALSE`,
      [userId]
    );
    const [[{ jrsCreated }]] = await pool.query(
      `SELECT COUNT(*) as jrsCreated FROM job_requisitions WHERE created_by = ? AND is_deleted = FALSE`,
      [userId]
    );
    const [[{ placements }]] = await pool.query(
      `SELECT COUNT(*) as placements FROM candidates WHERE assigned_ta_id = ? AND status = 'hired' AND is_deleted = FALSE`,
      [userId]
    );
    const [[{ avgTimeToFill }]] = await pool.query(
      `SELECT ROUND(AVG(avg_time_to_fill)) as avgTimeToFill
       FROM job_requisitions
       WHERE created_by = ? AND avg_time_to_fill IS NOT NULL AND is_deleted = FALSE`,
      [userId]
    );

    res.json({
      success: true,
      data: {
        clientsAssigned,
        jrsCreated,
        placements,
        avgTimeToFill: avgTimeToFill !== null ? Number(avgTimeToFill) : null,
      },
    });
  } catch (err) { next(err); }
}

module.exports = {
  getTAOverview, getTAPerformance, getTAPipeline, getTAUpcomingInterviews,
  getTARecentActivity, getProfileStats,
};
const pool = require('../config/db');

const STAGE_ORDER = ['applied', 'screened', 'shortlisted', 'interviewed', 'offered', 'placed'];
const STAGE_LABELS = {
  applied: 'Applied',
  screened: 'Screened',
  shortlisted: 'Shortlisted',
  interviewed: 'Interviewed',
  offered: 'Offered',
  placed: 'Placed',
};

async function getOverview(req, res, next) {
  try {
    const [[{ totalPlacements }]] = await pool.query(
      `SELECT COUNT(*) as totalPlacements FROM candidates WHERE status = 'hired' AND is_deleted = FALSE`
    );
    const [[{ avgTimeToFill }]] = await pool.query(
      `SELECT ROUND(AVG(avg_time_to_fill)) as avgTimeToFill FROM job_requisitions WHERE avg_time_to_fill IS NOT NULL AND is_deleted = FALSE`
    );
    const [[{ totalCandidates }]] = await pool.query(
      `SELECT COUNT(*) as totalCandidates FROM candidates WHERE is_deleted = FALSE`
    );
    const [[{ openRequisitions }]] = await pool.query(
      `SELECT COUNT(*) as openRequisitions FROM job_requisitions WHERE status = 'open' AND is_deleted = FALSE`
    );

    const pipelineConversion = totalCandidates > 0
      ? Number(((totalPlacements / totalCandidates) * 100).toFixed(1))
      : 0;

    res.json({
      success: true,
      data: {
        totalPlacements,
        avgTimeToFill: avgTimeToFill !== null ? Number(avgTimeToFill) : null,
        pipelineConversion,
        openRequisitions,
      },
    });
  } catch (err) { next(err); }
}

async function getTAComparison(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT u.user_id, u.username,
              COUNT(c.candidate_id) as submissions,
              SUM(CASE WHEN c.status = 'hired' THEN 1 ELSE 0 END) as placements
       FROM users u
       LEFT JOIN candidates c ON c.assigned_ta_id = u.user_id AND c.is_deleted = FALSE
       WHERE u.role = 'ta'
       GROUP BY u.user_id, u.username
       ORDER BY placements DESC, submissions DESC`
    );

    const data = rows.map((r, i) => {
      const submissions = Number(r.submissions);
      const placements = Number(r.placements);
      const conversionRate = submissions > 0 ? Number(((placements / submissions) * 100).toFixed(1)) : 0;
      // No scoring system exists in the DB. This is a simple, transparent
      // heuristic — placements weighted heaviest, conversion rate as a
      // secondary factor — not a real ML/performance score.
      const score = Math.min(100, Math.round(placements * 15 + conversionRate * 0.5));
      return {
        rank: i + 1,
        user_id: r.user_id,
        name: r.username,
        submissions,
        placements,
        conversionRate,
        score,
      };
    });

    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function getClientHiring(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT cl.client_id, cl.client_name, cl.status,
              COUNT(CASE WHEN c.status = 'hired' THEN 1 END) as hires
       FROM clients cl
       LEFT JOIN job_requisitions jr ON jr.client_id = cl.client_id AND jr.is_deleted = FALSE
       LEFT JOIN candidates c ON c.jr_id = jr.jr_id AND c.is_deleted = FALSE
       WHERE cl.is_deleted = FALSE
       GROUP BY cl.client_id, cl.client_name, cl.status
       ORDER BY hires DESC`
    );

    const data = rows.map(r => ({
      client_id: r.client_id,
      client: r.client_name,
      hires: Number(r.hires),
      active: r.status === 'active',
    }));

    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function getPipelineFunnel(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT pipeline_stage, COUNT(*) as cnt
       FROM candidates
       WHERE is_deleted = FALSE AND pipeline_stage IS NOT NULL
       GROUP BY pipeline_stage`
    );

    const rawCounts = {};
    rows.forEach(r => { rawCounts[r.pipeline_stage] = Number(r.cnt); });

    // Funnel is cumulative — a candidate currently at 'interviewed' also
    // counts toward 'applied' and 'screened', since they passed through
    // those stages on the way.
    const cumulativeCounts = STAGE_ORDER.map((_, i) => {
      let count = 0;
      for (let j = i; j < STAGE_ORDER.length; j++) {
        count += rawCounts[STAGE_ORDER[j]] || 0;
      }
      return count;
    });

    const total = cumulativeCounts[0] || 0;

    const data = STAGE_ORDER.map((stage, i) => ({
      stage: STAGE_LABELS[stage],
      count: cumulativeCounts[i],
      pct: total > 0 ? Number(((cumulativeCounts[i] / total) * 100).toFixed(1)) : 0,
    }));

    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function getTrends(req, res, next) {
  try {
    const months = parseInt(req.query.months) || 6;

    const [reqRows] = await pool.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') as ym, COUNT(*) as cnt
       FROM job_requisitions
       WHERE is_deleted = FALSE AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
       GROUP BY ym`,
      [months]
    );
    const [subRows] = await pool.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') as ym, COUNT(*) as cnt
       FROM candidates
       WHERE is_deleted = FALSE AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
       GROUP BY ym`,
      [months]
    );
    const [placedRows] = await pool.query(
      `SELECT DATE_FORMAT(updated_at, '%Y-%m') as ym, COUNT(*) as cnt
       FROM candidates
       WHERE is_deleted = FALSE AND status = 'hired' AND updated_at >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
       GROUP BY ym`,
      [months]
    );
    const [velocityRows] = await pool.query(
      `SELECT DATE_FORMAT(closed_at, '%Y-%m') as ym, ROUND(AVG(avg_time_to_fill)) as avgDays
       FROM job_requisitions
       WHERE is_deleted = FALSE AND closed_at IS NOT NULL AND avg_time_to_fill IS NOT NULL
             AND closed_at >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
       GROUP BY ym`,
      [months]
    );

    const reqMap = Object.fromEntries(reqRows.map(r => [r.ym, Number(r.cnt)]));
    const subMap = Object.fromEntries(subRows.map(r => [r.ym, Number(r.cnt)]));
    const placedMap = Object.fromEntries(placedRows.map(r => [r.ym, Number(r.cnt)]));
    const velocityMap = Object.fromEntries(velocityRows.map(r => [r.ym, r.avgDays !== null ? Number(r.avgDays) : null]));

    const data = [];
    const now = new Date();
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('default', { month: 'short' });
      data.push({
        month: label,
        requirements: reqMap[ym] || 0,
        submissions: subMap[ym] || 0,
        placements: placedMap[ym] || 0,
        velocity: velocityMap[ym] ?? null,
      });
    }

    res.json({
      success: true,
      data,
      note: 'Placement month is approximated from candidates.updated_at (last field change), since there is no dedicated hired-date column yet.',
    });
  } catch (err) { next(err); }
}

module.exports = { getOverview, getTAComparison, getClientHiring, getPipelineFunnel, getTrends };
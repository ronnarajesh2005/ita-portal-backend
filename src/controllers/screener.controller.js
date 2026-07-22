const pool = require('../config/db');
const { extractText } = require('../utils/cvParser');
const { analyzeCandidateRuleBased } = require('../utils/ruleBasedAnalyzer');

function parseJsonField(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
}

async function analyzeCVs(req, res, next) {
  try {
    const { jr_id } = req.body;
    if (!jr_id) return res.status(400).json({ success: false, message: 'jr_id is required' });
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one CV file is required' });
    }

    const [jrRows] = await pool.query(
      'SELECT * FROM job_requisitions WHERE jr_id = ? AND is_deleted = FALSE',
      [jr_id]
    );
    if (jrRows.length === 0) return res.status(404).json({ success: false, message: 'Job requisition not found' });
    const jr = jrRows[0];

    const jrSkills = parseJsonField(jr.required_skills, []);
    const jrPreferredSkills = parseJsonField(jr.preferred_skills, []);

    const results = [];
    const errors = [];

    for (const file of req.files) {
      try {
        const cvText = await extractText(file.buffer, file.originalname);

        const analysis = analyzeCandidateRuleBased({
          cvText,
          fileName: file.originalname,
          jrTitle: jr.jr_title,
          jrSkills,
          jrPreferredSkills,
          jrExperienceLevel: jr.experience_level,
        });

        const score = {
          matchScore: analysis.matchScore,
          experienceFit: analysis.experienceFit,
          skillMatch: analysis.skillMatch,
        };

        const fullName = analysis.candidate_name;
        const nameParts = fullName.split(' ');

        const [insertResult] = await pool.query(
          `INSERT INTO candidates (
            full_name, first_name, last_name, jr_id, added_by, current_stage, status,
            resume_url, current_title, current_company, total_years_experience,
            skills, education, score, skill_gaps, pipeline_stage, notes, source
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            fullName,
            nameParts[0] || null,
            nameParts.slice(1).join(' ') || null,
            jr_id,
            req.user.user_id,
            'Screened',
            'active',
            file.originalname,
            analysis.current_title || null,
            analysis.current_company || null,
            analysis.total_years_experience || null,
            JSON.stringify(analysis.skills || []),
            // education is a JSON-typed column — must be JSON-encoded like the
            // other JSON columns, not passed as a raw string. Passing a bare
            // string here caused "Invalid JSON text" errors from MySQL.
            JSON.stringify(analysis.education || null),
            JSON.stringify(score),
            JSON.stringify(analysis.skillGaps || []),
            'screened',
            analysis.reasoning || null,
            'Screener Agent',
          ]
        );

        results.push({
          candidate_id: insertResult.insertId,
          name: fullName,
          fileName: file.originalname,
          ...score,
          skillGaps: analysis.skillGaps || [],
          recommendation: analysis.recommendation,
          reasoning: analysis.reasoning,
          skills: analysis.skills || [],
          education: analysis.education,
          currentTitle: analysis.current_title,
          currentCompany: analysis.current_company,
          totalYearsExperience: analysis.total_years_experience,
        });

        // Audit log entry — flagged as an automated action for the Activity Logs page
        await pool.query(
          `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details, ip_address)
           VALUES (?, 'Created', 'Candidate', ?, ?, ?)`,
          [
            req.user.user_id,
            insertResult.insertId,
            JSON.stringify({
              isAI: false,
              method: 'rule-based',
              actor: 'Screener Agent',
              message: `Screened "${file.originalname}" against JR "${jr.jr_title}" — match score ${score.matchScore}%`,
              matchScore: score.matchScore,
              recommendation: analysis.recommendation,
            }),
            req.ip,
          ]
        );
      } catch (fileErr) {
        errors.push({ fileName: file.originalname, error: fileErr.message });
      }
    }

    res.json({ success: true, data: results, errors });
  } catch (err) {
    next(err);
  }
}

module.exports = { analyzeCVs };
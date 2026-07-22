const pool = require('../config/db');
const { callGemini } = require('../utils/geminiClient');

function parseJson(v, fallback) {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return fallback; }
  }
  return v;
}

// ── Report Generator ──────────────────────────────────────────
async function gatherReportContext(user) {
  const isAdmin = user.role === 'admin';
  const taId = user.user_id;

  const candidateScopeClause = isAdmin ? '' : 'AND assigned_ta_id = ?';
  const candidateScopeParams = isAdmin ? [] : [taId];

  const [[{ totalCandidates }]] = await pool.query(
    `SELECT COUNT(*) as totalCandidates FROM candidates WHERE is_deleted = FALSE ${candidateScopeClause}`,
    candidateScopeParams
  );
  const [[{ totalPlacements }]] = await pool.query(
    `SELECT COUNT(*) as totalPlacements FROM candidates WHERE status = 'hired' AND is_deleted = FALSE ${candidateScopeClause}`,
    candidateScopeParams
  );

  const [pipelineRows] = await pool.query(
    `SELECT pipeline_stage, COUNT(*) as cnt FROM candidates
     WHERE is_deleted = FALSE AND pipeline_stage IS NOT NULL ${candidateScopeClause}
     GROUP BY pipeline_stage`,
    candidateScopeParams
  );
  const pipelineCounts = {};
  pipelineRows.forEach((r) => { pipelineCounts[r.pipeline_stage] = Number(r.cnt); });

  const jrScopeClause = isAdmin ? '' : 'AND JSON_CONTAINS(assigned_ta_ids, CAST(? AS JSON))';
  const jrScopeParams = isAdmin ? [] : [taId];

  const [[{ openJRs }]] = await pool.query(
    `SELECT COUNT(*) as openJRs FROM job_requisitions WHERE status = 'open' AND is_deleted = FALSE ${jrScopeClause}`,
    jrScopeParams
  );

  const [stalledJRs] = await pool.query(
    `SELECT jr.jr_title, jr.created_at, c.client_name
     FROM job_requisitions jr
     LEFT JOIN clients c ON jr.client_id = c.client_id
     WHERE jr.status = 'open' AND jr.is_deleted = FALSE
           AND jr.created_at < DATE_SUB(CURDATE(), INTERVAL 30 DAY)
           ${jrScopeClause}
     ORDER BY jr.created_at ASC
     LIMIT 10`,
    jrScopeParams
  );

  const clientScopeClause = isAdmin ? '' : 'AND c.assigned_ta_id = ?';
  const clientScopeParams = isAdmin ? [] : [taId];

  const [clientRows] = await pool.query(
    `SELECT cl.client_name,
            COUNT(CASE WHEN c.status = 'hired' THEN 1 END) as hires,
            COUNT(c.candidate_id) as submissions
     FROM clients cl
     LEFT JOIN job_requisitions jr ON jr.client_id = cl.client_id AND jr.is_deleted = FALSE
     LEFT JOIN candidates c ON c.jr_id = jr.jr_id AND c.is_deleted = FALSE ${clientScopeClause}
     WHERE cl.is_deleted = FALSE
     GROUP BY cl.client_id, cl.client_name`,
    clientScopeParams
  );

  return {
    scope: isAdmin ? 'organization-wide (admin view)' : 'this recruiter only',
    totalCandidates,
    totalPlacements,
    openJRs,
    pipelineCounts,
    stalledJRsOver30Days: stalledJRs.map((j) => ({
      title: j.jr_title,
      client: j.client_name,
      openSince: j.created_at,
    })),
    clientHiring: clientRows.map((c) => ({
      client: c.client_name,
      hires: Number(c.hires),
      submissions: Number(c.submissions),
    })),
  };
}

async function reportQuery(req, res, next) {
  try {
    const { question } = req.body;
    if (!question || !question.trim()) {
      return res.status(400).json({ success: false, message: 'question is required' });
    }

    const context = await gatherReportContext(req.user);

    const systemInstruction = `You are a recruitment analytics assistant inside the ITA Portal. Answer the user's question using ONLY the JSON data below — never invent numbers, names, or facts not present in it. If the data doesn't contain what's needed to answer, say so plainly rather than guessing. Keep answers concise and business-relevant. Data scope: ${context.scope}.

DATA:
${JSON.stringify(context)}`;

    const answer = await callGemini({ systemInstruction, prompt: question });

    res.json({ success: true, data: { answer, scope: context.scope } });
  } catch (err) { next(err); }
}

// ── JR Drafter Agent ──────────────────────────────────────────
async function draftJR(req, res, next) {
  try {
    const {
      jr_title, client_name, department, location, work_mode,
      employment_type, experience_level, experience, skills, description,
    } = req.body;

    if (!jr_title || !jr_title.trim()) {
      return res.status(400).json({ success: false, message: 'jr_title is required' });
    }

    const systemInstruction = `You are a job requisition drafting assistant for a recruitment agency. Given a brief, produce a complete, professional job requisition. Respond with ONLY valid JSON matching this exact shape — no markdown fences, no commentary, no extra keys:
{
  "description": "2-4 sentence role summary as a string",
  "requirements": ["responsibility or requirement as a string", "..."],
  "required_skills": [{"name": "string", "yearsOfExperience": number}],
  "preferred_skills": [{"name": "string"}],
  "benefits": ["string", "..."]
}
Do not invent salary figures, company facts, or client details beyond what's given in the brief below.`;

    const prompt = `Role title: ${jr_title}
Client: ${client_name || 'not specified'}
Department: ${department || 'not specified'}
Location: ${location || 'not specified'}
Work mode: ${work_mode || 'not specified'}
Employment type: ${employment_type || 'not specified'}
Experience level: ${experience_level || 'not specified'}
Experience notes: ${experience || 'not specified'}
Key skills mentioned: ${skills || 'not specified'}
Recruiter's brief description: ${description || 'not specified'}`;

    const raw = await callGemini({ systemInstruction, prompt, jsonMode: true });

    let draft;
    try {
      draft = JSON.parse(raw);
    } catch {
      return res.status(502).json({ success: false, message: 'AI returned malformed JSON — please try again' });
    }

    res.json({ success: true, data: draft });
  } catch (err) { next(err); }
}

// ── JR Drafter Agent — refine an existing JR from a chat instruction ──
async function refineJR(req, res, next) {
  try {
    const { jr_id, instruction } = req.body;
    if (!jr_id || !instruction || !instruction.trim()) {
      return res.status(400).json({ success: false, message: 'jr_id and instruction are required' });
    }

    const [rows] = await pool.query(
      `SELECT jr_title, description, requirements, required_skills, preferred_skills, benefits
       FROM job_requisitions WHERE jr_id = ? AND is_deleted = FALSE`,
      [jr_id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Job requisition not found' });
    }
    const jr = rows[0];

    const current = {
      description: jr.description || '',
      requirements: parseJson(jr.requirements, []),
      required_skills: parseJson(jr.required_skills, []),
      preferred_skills: parseJson(jr.preferred_skills, []),
      benefits: parseJson(jr.benefits, []),
    };

    const systemInstruction = `You are revising an existing job requisition. You will be given the CURRENT content as JSON and an instruction describing the change to make. Apply ONLY the requested change, keep everything else as close to the original as sensible, and respond with ONLY valid JSON in this exact shape — no markdown fences, no commentary:
{
  "description": "string",
  "requirements": ["string", "..."],
  "required_skills": [{"name": "string", "yearsOfExperience": number}],
  "preferred_skills": [{"name": "string"}],
  "benefits": ["string", "..."]
}`;

    const prompt = `Role title: ${jr.jr_title}

CURRENT CONTENT:
${JSON.stringify(current)}

INSTRUCTION: ${instruction}`;

    const raw = await callGemini({ systemInstruction, prompt, jsonMode: true });

    let updated;
    try {
      updated = JSON.parse(raw);
    } catch {
      return res.status(502).json({ success: false, message: 'AI returned malformed JSON — please try again' });
    }

    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
}

// ── Screener Agent — Q&A grounded in already-screened candidates ──
// NOTE: scores were computed by the rule-based analyzer at screening time
// (src/utils/ruleBasedAnalyzer.js), not by this LLM call. Gemini is only
// asked to summarize/compare/answer questions about those existing scores
// — it does not re-score or re-judge candidates.
async function gatherScreenerContext(user) {
  const isAdmin = user.role === 'admin';
  const scopeClause = isAdmin ? '' : 'AND c.added_by = ?';
  const scopeParams = isAdmin ? [] : [user.user_id];

  const [rows] = await pool.query(
    `SELECT c.full_name, jr.jr_title, c.pipeline_stage, c.status, c.score, c.skill_gaps
     FROM candidates c
     LEFT JOIN job_requisitions jr ON c.jr_id = jr.jr_id
     WHERE c.is_deleted = FALSE AND c.score IS NOT NULL ${scopeClause}
     ORDER BY CAST(JSON_EXTRACT(c.score, '$.matchScore') AS UNSIGNED) DESC
     LIMIT 30`,
    scopeParams
  );

  return {
    scope: isAdmin ? 'organization-wide (admin view)' : 'candidates you screened',
    scoringMethod: 'Scores are computed by a rule-based keyword/heuristic scorer at screening time — not by this AI. This assistant only reads and discusses existing scores, it does not re-evaluate candidates.',
    candidates: rows.map((r) => ({
      name: r.full_name,
      jr: r.jr_title,
      pipelineStage: r.pipeline_stage,
      status: r.status,
      score: parseJson(r.score, null),
      skillGaps: parseJson(r.skill_gaps, []),
    })),
  };
}

async function screenerQuery(req, res, next) {
  try {
    const { question } = req.body;
    if (!question || !question.trim()) {
      return res.status(400).json({ success: false, message: 'question is required' });
    }

    const context = await gatherScreenerContext(req.user);

    const systemInstruction = `You are a candidate screening assistant inside the ITA Portal. Answer the user's question using ONLY the JSON data below — never invent candidates, scores, or skills not present in it. If no screened candidates exist for what they're asking about, say so plainly. Be clear that matchScore/skillMatch/experienceFit come from a rule-based scorer, not from you. Data scope: ${context.scope}.

DATA:
${JSON.stringify(context)}`;

    const answer = await callGemini({ systemInstruction, prompt: question });

    res.json({ success: true, data: { answer, scope: context.scope } });
  } catch (err) { next(err); }
}

// ── Pipeline Tracker — Q&A grounded in real pipeline/interview data ──
// NOTE: there is no SLA/deadline field in the schema. "Days in stage" is
// derived from candidates.updated_at (last field change), not a true
// stage-entry timestamp, and this is disclosed to the model and the user.
async function gatherPipelineContext(user) {
  const isAdmin = user.role === 'admin';
  const candidateScopeClause = isAdmin ? '' : 'AND c.assigned_ta_id = ?';
  const candidateScopeParams = isAdmin ? [] : [user.user_id];

  const [stageRows] = await pool.query(
    `SELECT c.full_name, jr.jr_title, c.pipeline_stage,
            DATEDIFF(NOW(), c.updated_at) as daysSinceLastUpdate
     FROM candidates c
     LEFT JOIN job_requisitions jr ON c.jr_id = jr.jr_id
     WHERE c.is_deleted = FALSE AND c.status = 'active' ${candidateScopeClause}
     ORDER BY daysSinceLastUpdate DESC
     LIMIT 30`,
    candidateScopeParams
  );

  const interviewScopeClause = isAdmin ? '' : 'AND c.assigned_ta_id = ?';
  const interviewScopeParams = isAdmin ? [] : [user.user_id];

  const [interviewRows] = await pool.query(
    `SELECT s.round_name, s.stage_status, s.scheduled_at, c.full_name as candidate_name, jr.jr_title
     FROM interview_stages s
     JOIN candidates c ON s.candidate_id = c.candidate_id
     LEFT JOIN job_requisitions jr ON s.jr_id = jr.jr_id
     WHERE c.is_deleted = FALSE AND s.stage_status IN ('scheduled', 'pending') ${interviewScopeClause}
     ORDER BY s.scheduled_at ASC
     LIMIT 20`,
    interviewScopeParams
  );

  return {
    scope: isAdmin ? 'organization-wide (admin view)' : 'this recruiter only',
    dataNote: 'There is no SLA or stage-deadline field in the schema. "daysSinceLastUpdate" is derived from candidates.updated_at, the timestamp of the last change to any field on the candidate — not a true stage-entry timestamp. Do not present this as an SLA breach; only describe it as time since last update.',
    activeCandidatesByStage: stageRows.map((r) => ({
      name: r.full_name,
      jr: r.jr_title,
      stage: r.pipeline_stage,
      daysSinceLastUpdate: r.daysSinceLastUpdate,
    })),
    upcomingInterviews: interviewRows.map((r) => ({
      candidate: r.candidate_name,
      jr: r.jr_title,
      round: r.round_name,
      status: r.stage_status,
      scheduledAt: r.scheduled_at,
    })),
  };
}

async function pipelineQuery(req, res, next) {
  try {
    const { question } = req.body;
    if (!question || !question.trim()) {
      return res.status(400).json({ success: false, message: 'question is required' });
    }

    const context = await gatherPipelineContext(req.user);

    const systemInstruction = `You are a pipeline monitoring assistant inside the ITA Portal. Answer the user's question using ONLY the JSON data below — never invent candidates, stages, or dates not present in it. There is no real SLA field in this system — do not claim any candidate has "breached SLA" or similar; only describe actual elapsed time as given. Data scope: ${context.scope}. ${context.dataNote}

DATA:
${JSON.stringify(context)}`;

    const answer = await callGemini({ systemInstruction, prompt: question });

    res.json({ success: true, data: { answer, scope: context.scope } });
  } catch (err) { next(err); }
}

// ── Generic assistant (fallback for anything else) ───────
async function assistChat(req, res, next) {
  try {
    const { message, agent } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'message is required' });
    }

    const systemInstruction = `You are the "${agent || 'Recruitment'} Assistant" inside the ITA Portal's chat panel. You can explain, advise, and answer general recruitment questions. You CANNOT create, edit, or delete any database records from this chat — there is no backend wiring connecting this conversation to the database. If the user asks you to take an action (create a JR, change a candidate's stage, schedule an interview, etc), clearly tell them which real page or feature to use instead. Never claim to have made a change you did not actually make.`;

    const answer = await callGemini({ systemInstruction, prompt: message });

    res.json({ success: true, data: { answer } });
  } catch (err) { next(err); }
}

module.exports = { reportQuery, draftJR, refineJR, screenerQuery, pipelineQuery, assistChat };
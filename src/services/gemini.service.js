const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';

// Plain, non-LLM fallback templates. Used only if the Gemini call fails or
// times out, so a notification still gets created even when the API is
// down. These intentionally read as generic/templated — they are NOT meant
// to look AI-generated, so a failure is honest about being a fallback.
function fallbackMessage(eventType, context) {
  switch (eventType) {
    case 'interview_scheduled':
      return {
        title: 'Interview scheduled',
        message: `An interview round ("${context.round_name}") has been scheduled for ${context.candidate_name}.`,
      };
    case 'interview_cancelled':
      return {
        title: 'Interview cancelled',
        message: `An interview round for ${context.candidate_name} has been cancelled.`,
      };
    case 'pipeline_stage_changed':
      return {
        title: 'Pipeline stage updated',
        message: `${context.candidate_name} moved to the "${context.new_stage}" stage.`,
      };
    case 'candidate_hired':
      return {
        title: 'Candidate hired',
        message: `${context.candidate_name} has been marked as hired for ${context.jr_title || 'the role'}.`,
      };
    case 'jr_assigned':
      return {
        title: 'New job requisition assigned',
        message: `You have been assigned to "${context.jr_title}" for ${context.client_name || 'a client'}.`,
      };
    default:
      return { title: 'Notification', message: 'You have a new update.' };
  }
}

function buildPrompt(eventType, context) {
  const base = `You are writing a short, human-readable in-app notification for a recruitment CRM called ITA Portal. Respond with ONLY valid JSON, no markdown fences, no preamble, in this exact shape: {"title": "...", "message": "..."}. The title should be under 8 words. The message should be one plain sentence, under 25 words, factual and professional (no exclamation marks, no fabricated details beyond what's given below).`;

  switch (eventType) {
    case 'interview_scheduled':
      return `${base}\n\nEvent: An interview round "${context.round_name}" was scheduled for candidate ${context.candidate_name}, applying to "${context.jr_title || 'a role'}", at ${context.scheduled_at || 'a time to be confirmed'}.`;
    case 'interview_cancelled':
      return `${base}\n\nEvent: The interview round "${context.round_name}" for candidate ${context.candidate_name} was cancelled.`;
    case 'pipeline_stage_changed':
      return `${base}\n\nEvent: Candidate ${context.candidate_name} moved from pipeline stage "${context.old_stage}" to "${context.new_stage}" for the role "${context.jr_title || 'unspecified'}".`;
    case 'candidate_hired':
      return `${base}\n\nEvent: Candidate ${context.candidate_name} was hired for the role "${context.jr_title || 'unspecified'}". This is a positive milestone, phrase it accordingly.`;
    case 'jr_assigned':
      return `${base}\n\nEvent: A recruiter was newly assigned to job requisition "${context.jr_title}" for client "${context.client_name || 'unspecified'}".`;
    default:
      return `${base}\n\nEvent: A general system update occurred.`;
  }
}

// Calls Gemini to generate {title, message} for a given event. Falls back
// to a plain templated message on any failure (network error, malformed
// response, timeout) so notification creation never blocks on the LLM.
async function generateNotificationText(eventType, context) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY not set — using fallback notification text');
    return fallbackMessage(eventType, context);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(eventType, context) }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 200 },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`Gemini API returned ${response.status} — using fallback notification text`);
      return fallbackMessage(eventType, context);
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      console.error('Gemini response missing text — using fallback notification text');
      return fallbackMessage(eventType, context);
    }

    const cleaned = rawText.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed.title || !parsed.message) {
      throw new Error('Gemini response missing title/message');
    }
    return { title: parsed.title, message: parsed.message };
  } catch (err) {
    console.error('Gemini notification generation failed:', err.message);
    return fallbackMessage(eventType, context);
  }
}

module.exports = { generateNotificationText };
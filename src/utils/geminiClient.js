// Thin wrapper around the Gemini API. No SDK dependency — uses Node's
// built-in fetch (Node 18+) to call the REST endpoint directly.
//
// Uses the 'gemini-flash-latest' alias rather than a pinned version like
// 'gemini-2.5-flash', since Google periodically deprecates specific model
// versions for new API keys (this is what caused the 404 you just hit).
// The alias auto-points to whatever the current stable Flash model is.

const GEMINI_MODEL = 'gemini-flash-latest';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

async function callGemini({ systemInstruction, prompt, jsonMode = false }) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set in the environment');
  }

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  };

  if (systemInstruction) {
    body.system_instruction = { parts: [{ text: systemInstruction }] };
  }

  if (jsonMode) {
    body.generationConfig = { responseMimeType: 'application/json' };
  }

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': process.env.GEMINI_API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';

  if (!text) {
    throw new Error('Gemini API returned an empty response');
  }

  return text;
}

module.exports = { callGemini };
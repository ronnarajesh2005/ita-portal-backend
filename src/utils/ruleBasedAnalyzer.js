const EXPERIENCE_LEVEL_YEARS = {
  entry: 1,
  junior: 1,
  mid: 3,
  'mid_market': 3,
  senior: 6,
  lead: 8,
  principal: 9,
  executive: 10,
};

function extractSkills(cvText, requiredSkills, preferredSkills) {
  const lowerText = cvText.toLowerCase();
  const matchedRequired = requiredSkills.filter((skill) => lowerText.includes(String(skill).toLowerCase()));
  const matchedPreferred = preferredSkills.filter((skill) => lowerText.includes(String(skill).toLowerCase()));
  const missingRequired = requiredSkills.filter((skill) => !matchedRequired.includes(skill));
  return { matchedRequired, matchedPreferred, missingRequired };
}

function extractYearsOfExperience(cvText) {
  const patterns = [
    /(\d+)\+?\s*years?\s+(?:of\s+)?experience/i,
    /experience\s*:?\s*(\d+)\+?\s*years?/i,
  ];
  for (const p of patterns) {
    const m = cvText.match(p);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

function extractEducation(cvText) {
  const degreePatterns = [
    /\b(Ph\.?D\.?|Doctorate)\b[^\n]{0,80}/i,
    /\b(M\.?Tech|M\.?S\.?|MBA|Master(?:'s)?\s+of\s+[A-Za-z]+)\b[^\n]{0,80}/i,
    /\b(B\.?Tech|B\.?E\.?|B\.?Sc|Bachelor(?:'s)?\s+of\s+[A-Za-z]+|BCA)\b[^\n]{0,80}/i,
  ];
  for (const p of degreePatterns) {
    const m = cvText.match(p);
    if (m) return m[0].trim().replace(/\s+/g, ' ');
  }
  return null;
}

function extractName(cvText, fallback) {
  const lines = cvText.split('\n').map((l) => l.trim()).filter(Boolean);
  const firstLine = lines[0];
  if (firstLine && firstLine.length < 60 && /^[A-Za-z.\s]+$/.test(firstLine)) {
    return firstLine;
  }
  return fallback;
}

function extractCurrentTitle(cvText) {
  const titleKeywords = ['Engineer', 'Developer', 'Manager', 'Analyst', 'Designer', 'Lead', 'Architect', 'Consultant', 'Specialist'];
  const lines = cvText.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 15)) {
    if (titleKeywords.some((k) => line.includes(k)) && line.length < 80) {
      return line;
    }
  }
  return null;
}

/**
 * Rule-based replacement for the Claude-powered analyzer.
 * No external API calls — pure text heuristics against the JR's skill lists.
 */
function analyzeCandidateRuleBased({ cvText, fileName, jrTitle, jrSkills, jrPreferredSkills, jrExperienceLevel }) {
  const requiredSkills = Array.isArray(jrSkills) ? jrSkills : [];
  const preferredSkills = Array.isArray(jrPreferredSkills) ? jrPreferredSkills : [];

  const { matchedRequired, matchedPreferred, missingRequired } = extractSkills(cvText, requiredSkills, preferredSkills);

  const skillMatch = requiredSkills.length > 0
    ? Math.round((matchedRequired.length / requiredSkills.length) * 100)
    : (matchedPreferred.length > 0 ? 70 : 50); // fallback when the JR has no listed skills

  const candidateYears = extractYearsOfExperience(cvText);
  const requiredYears = EXPERIENCE_LEVEL_YEARS[(jrExperienceLevel || '').toLowerCase()] || 3;
  const experienceFit = candidateYears !== null
    ? Math.min(100, Math.round((candidateYears / requiredYears) * 100))
    : 50;

  const matchScore = Math.round(skillMatch * 0.6 + experienceFit * 0.4);

  let recommendation = 'Reject';
  if (matchScore >= 80) recommendation = 'Shortlist';
  else if (matchScore >= 60) recommendation = 'Review';

  const allSkillsFound = [...new Set([...matchedRequired, ...matchedPreferred])];

  const reasoning = `Matched ${matchedRequired.length} of ${requiredSkills.length || 'N/A'} required skills` +
    (missingRequired.length ? ` (missing: ${missingRequired.slice(0, 5).join(', ')})` : '') +
    `. Estimated ${candidateYears ?? 'unknown'} years of experience vs. ~${requiredYears} expected for this "${jrTitle}" role.`;

  return {
    candidate_name: extractName(cvText, fileName.replace(/\.[^/.]+$/, '')),
    current_title: extractCurrentTitle(cvText),
    current_company: null, // not reliably extractable via regex — left blank, editable later
    total_years_experience: candidateYears,
    education: extractEducation(cvText),
    skills: allSkillsFound,
    matchScore,
    experienceFit,
    skillMatch,
    skillGaps: missingRequired,
    recommendation,
    reasoning,
  };
}

module.exports = { analyzeCandidateRuleBased };
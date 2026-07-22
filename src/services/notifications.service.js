const pool = require('../config/db');
const { generateNotificationText } = require('./gemini.service');

// Maps our internal event names to the notifications.type enum values.
const EVENT_TYPE_MAP = {
  interview_scheduled: 'interview',
  interview_cancelled: 'interview',
  pipeline_stage_changed: 'pipeline',
  candidate_hired: 'pipeline',
  jr_assigned: 'jr_assignment',
};

// Creates a notification row for a given user. Never throws — logs and
// swallows errors so a notification failure (Gemini down, DB hiccup) never
// breaks the calling controller's main request. Callers should invoke this
// without awaiting in the request's critical path, or await it but ignore
// the result.
async function createNotification(userId, eventType, context, relatedEntity = {}) {
  try {
    if (!userId) return null;

    const type = EVENT_TYPE_MAP[eventType];
    if (!type) {
      console.error(`Unknown notification event type: ${eventType}`);
      return null;
    }

    const { title, message } = await generateNotificationText(eventType, context);

    const [result] = await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, related_entity_type, related_entity_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        userId,
        type,
        title,
        message,
        relatedEntity.type || null,
        relatedEntity.id || null,
      ]
    );
    return result.insertId;
  } catch (err) {
    console.error('Failed to create notification:', err.message);
    return null;
  }
}

module.exports = { createNotification };

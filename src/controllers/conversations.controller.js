const { z } = require('zod');
const pool = require('../config/db');

// ── Validation ────────────────────────────────────────────────
const createConversationSchema = z.object({
  agent_id: z.string().min(1).max(30),
  agent_name: z.string().min(1).max(60),
  topic: z.string().max(120).optional(),
  greeting: z.string().optional(), // first AI message shown when the agent opens
});

const addMessageSchema = z.object({
  role: z.enum(['user', 'ai']),
  content: z.string().min(1),
  is_error: z.boolean().optional(),
});

// Confirms the conversation exists AND belongs to the requesting user.
// Returns the row, or null if not found / not owned — callers turn null
// into a 404 so one user can never read or write another's chats.
async function getOwnedConversation(conversationId, userId) {
  const [[row]] = await pool.query(
    `SELECT conversation_id, user_id, agent_id, agent_name, topic
     FROM ai_conversations
     WHERE conversation_id = ? AND user_id = ? AND is_deleted = FALSE`,
    [conversationId, userId]
  );
  return row || null;
}

// ── List the current user's conversations (newest first, no messages) ──
async function getConversations(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT conversation_id, agent_id, agent_name, topic, created_at, updated_at
       FROM ai_conversations
       WHERE user_id = ? AND is_deleted = FALSE
       ORDER BY updated_at DESC`,
      [req.user.user_id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
}

// ── Get one conversation's messages (ownership-checked) ────────
async function getConversationMessages(req, res, next) {
  try {
    const conv = await getOwnedConversation(req.params.id, req.user.user_id);
    if (!conv) return res.status(404).json({ success: false, message: 'Conversation not found' });

    const [messages] = await pool.query(
      `SELECT message_id, role, content, is_error, created_at
       FROM ai_messages
       WHERE conversation_id = ?
       ORDER BY message_id ASC`,
      [conv.conversation_id]
    );

    res.json({ success: true, data: { conversation: conv, messages } });
  } catch (err) { next(err); }
}

// ── Create a conversation (optionally with its greeting message) ──
async function createConversation(req, res, next) {
  try {
    const data = createConversationSchema.parse(req.body);

    const [result] = await pool.query(
      `INSERT INTO ai_conversations (user_id, agent_id, agent_name, topic)
       VALUES (?, ?, ?, ?)`,
      [req.user.user_id, data.agent_id, data.agent_name, data.topic || 'New conversation']
    );
    const conversationId = result.insertId;

    // Persist the agent's opening line so it's there on reload too.
    if (data.greeting && data.greeting.trim()) {
      await pool.query(
        `INSERT INTO ai_messages (conversation_id, role, content) VALUES (?, 'ai', ?)`,
        [conversationId, data.greeting]
      );
    }

    const [[conversation]] = await pool.query(
      `SELECT conversation_id, agent_id, agent_name, topic, created_at, updated_at
       FROM ai_conversations WHERE conversation_id = ?`,
      [conversationId]
    );
    const [messages] = await pool.query(
      `SELECT message_id, role, content, is_error, created_at
       FROM ai_messages WHERE conversation_id = ? ORDER BY message_id ASC`,
      [conversationId]
    );

    res.status(201).json({ success: true, data: { conversation, messages } });
  } catch (err) { next(err); }
}

// ── Append a message to a conversation (ownership-checked) ─────
async function addMessage(req, res, next) {
  try {
    const conv = await getOwnedConversation(req.params.id, req.user.user_id);
    if (!conv) return res.status(404).json({ success: false, message: 'Conversation not found' });

    const data = addMessageSchema.parse(req.body);

    const [result] = await pool.query(
      `INSERT INTO ai_messages (conversation_id, role, content, is_error)
       VALUES (?, ?, ?, ?)`,
      [conv.conversation_id, data.role, data.content, data.is_error ? 1 : 0]
    );

    // The first user message becomes the conversation's title (mirrors the
    // frontend's old behaviour). Only rename while still the default topic.
    if (data.role === 'user' && conv.topic === 'New conversation') {
      await pool.query(
        `UPDATE ai_conversations SET topic = ? WHERE conversation_id = ?`,
        [data.content.slice(0, 40), conv.conversation_id]
      );
    } else {
      // Touch updated_at so the conversation re-sorts to the top of the list.
      await pool.query(
        `UPDATE ai_conversations SET updated_at = CURRENT_TIMESTAMP WHERE conversation_id = ?`,
        [conv.conversation_id]
      );
    }

    const [[message]] = await pool.query(
      `SELECT message_id, role, content, is_error, created_at
       FROM ai_messages WHERE message_id = ?`,
      [result.insertId]
    );

    res.status(201).json({ success: true, data: message });
  } catch (err) { next(err); }
}

// ── Soft-delete a conversation (ownership-checked) ────────────
async function deleteConversation(req, res, next) {
  try {
    const conv = await getOwnedConversation(req.params.id, req.user.user_id);
    if (!conv) return res.status(404).json({ success: false, message: 'Conversation not found' });

    await pool.query(
      `UPDATE ai_conversations SET is_deleted = TRUE WHERE conversation_id = ?`,
      [conv.conversation_id]
    );

    res.json({ success: true, message: 'Conversation deleted' });
  } catch (err) { next(err); }
}

module.exports = {
  getConversations,
  getConversationMessages,
  createConversation,
  addMessage,
  deleteConversation,
};

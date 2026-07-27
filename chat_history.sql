-- ============================================================
-- Chat history persistence for the AI Conversations page.
--
-- Goal 4 of the AI feature: conversations were previously kept only in
-- React state and lost on refresh. These two tables persist them per user.
--
-- Run once against the ita_portal database:
--   mysql -u root -p ita_portal < chat_history.sql
--
-- Safe to re-run: it drops and recreates the two tables (this WILL wipe
-- existing saved chats, so only re-run intentionally).
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `ai_messages`;
DROP TABLE IF EXISTS `ai_conversations`;
SET FOREIGN_KEY_CHECKS = 1;

--
-- One row per conversation, owned by the user who started it.
--
CREATE TABLE `ai_conversations` (
  `conversation_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `agent_id` varchar(30) NOT NULL,
  `agent_name` varchar(60) NOT NULL,
  `topic` varchar(120) NOT NULL DEFAULT 'New conversation',
  `is_deleted` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`conversation_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `ai_conversations_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- One row per message within a conversation. Deleting a conversation
-- cascades to its messages.
--
CREATE TABLE `ai_messages` (
  `message_id` int NOT NULL AUTO_INCREMENT,
  `conversation_id` int NOT NULL,
  `role` enum('user','ai') NOT NULL,
  `content` text NOT NULL,
  `is_error` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`message_id`),
  KEY `conversation_id` (`conversation_id`),
  CONSTRAINT `ai_messages_ibfk_1` FOREIGN KEY (`conversation_id`) REFERENCES `ai_conversations` (`conversation_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

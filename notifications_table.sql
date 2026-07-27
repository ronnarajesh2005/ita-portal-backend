-- ============================================================
-- notifications table.
--
-- The backend (notifications.controller.js + notifications.service.js)
-- reads/writes a `notifications` table, but it was missing from the
-- committed schema.sql — so a fresh database setup errors with
-- "Table 'ita_portal.notifications' doesn't exist". This adds it.
--
-- Columns/enum values match what the code inserts (see EVENT_TYPE_MAP).
-- Run once:  mysql -u root -p ita_portal < notifications_table.sql
--
-- NOTE for the repo: ideally this table definition gets folded into
-- schema.sql so future fresh setups include it automatically.
-- ============================================================

USE ita_portal;

DROP TABLE IF EXISTS `notifications`;
CREATE TABLE `notifications` (
  `notification_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `type` enum('interview','pipeline','jr_assignment') NOT NULL,
  `title` varchar(150) NOT NULL,
  `message` text NOT NULL,
  `related_entity_type` varchar(50) DEFAULT NULL,
  `related_entity_id` int DEFAULT NULL,
  `is_read` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`notification_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- MySQL dump 10.13  Distrib 8.0.46, for Win64 (x86_64)
--
-- Host: localhost    Database: ita_portal
-- ------------------------------------------------------
-- Server version	8.0.46

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `audit_log`
--

DROP TABLE IF EXISTS `audit_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_log` (
  `log_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `action` varchar(50) NOT NULL,
  `entity_type` varchar(50) NOT NULL,
  `entity_id` int DEFAULT NULL,
  `details` json DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`log_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `audit_log_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `candidates`
--

DROP TABLE IF EXISTS `candidates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `candidates` (
  `candidate_id` int NOT NULL AUTO_INCREMENT,
  `full_name` varchar(150) NOT NULL,
  `first_name` varchar(100) DEFAULT NULL,
  `last_name` varchar(100) DEFAULT NULL,
  `avatar_url` varchar(255) DEFAULT NULL,
  `linkedin_url` varchar(255) DEFAULT NULL,
  `portfolio_url` varchar(255) DEFAULT NULL,
  `email` varchar(150) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `jr_id` int NOT NULL,
  `added_by` int NOT NULL,
  `current_stage` varchar(100) DEFAULT NULL,
  `status` enum('active','rejected','hired','withdrawn','sourced') NOT NULL DEFAULT 'active',
  `cv_path` varchar(255) DEFAULT NULL,
  `resume_url` varchar(255) DEFAULT NULL,
  `location` varchar(150) DEFAULT NULL,
  `current_title` varchar(150) DEFAULT NULL,
  `current_company` varchar(150) DEFAULT NULL,
  `experience_level` enum('junior','mid','senior','lead') DEFAULT NULL,
  `total_years_experience` int DEFAULT NULL,
  `expected_salary` decimal(15,2) DEFAULT NULL,
  `notice_period` int DEFAULT NULL,
  `source` varchar(50) DEFAULT NULL,
  `skills` json DEFAULT NULL,
  `education` json DEFAULT NULL,
  `work_experience` json DEFAULT NULL,
  `tags` json DEFAULT NULL,
  `pipeline_stage` varchar(50) DEFAULT NULL,
  `score` json DEFAULT NULL,
  `skill_gaps` json DEFAULT NULL,
  `assigned_ta_id` int DEFAULT NULL,
  `notes` text,
  `is_deleted` tinyint(1) DEFAULT '0',
  `deleted_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`candidate_id`),
  KEY `jr_id` (`jr_id`),
  KEY `added_by` (`added_by`),
  KEY `assigned_ta_id` (`assigned_ta_id`),
  CONSTRAINT `candidates_ibfk_1` FOREIGN KEY (`jr_id`) REFERENCES `job_requisitions` (`jr_id`) ON DELETE CASCADE,
  CONSTRAINT `candidates_ibfk_2` FOREIGN KEY (`added_by`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT,
  CONSTRAINT `candidates_ibfk_3` FOREIGN KEY (`assigned_ta_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `clients`
--

DROP TABLE IF EXISTS `clients`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `clients` (
  `client_id` int NOT NULL AUTO_INCREMENT,
  `client_name` varchar(150) NOT NULL,
  `industry` varchar(100) DEFAULT NULL,
  `tier` enum('startup','mid_market','enterprise') DEFAULT 'mid_market',
  `website` varchar(255) DEFAULT NULL,
  `headquarters` varchar(255) DEFAULT NULL,
  `employee_count` int DEFAULT NULL,
  `description` text,
  `contacts` json DEFAULT NULL,
  `assigned_ta_ids` json DEFAULT NULL,
  `active_jobs` int DEFAULT '0',
  `total_hires` int DEFAULT '0',
  `contract_start_date` date DEFAULT NULL,
  `contract_end_date` date DEFAULT NULL,
  `notes` text,
  `is_deleted` tinyint(1) DEFAULT '0',
  `deleted_at` timestamp NULL DEFAULT NULL,
  `contact_person` varchar(100) DEFAULT NULL,
  `contact_email` varchar(150) DEFAULT NULL,
  `assigned_ta` int DEFAULT NULL,
  `status` enum('active','inactive') NOT NULL DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`client_id`),
  KEY `assigned_ta` (`assigned_ta`),
  CONSTRAINT `clients_ibfk_1` FOREIGN KEY (`assigned_ta`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `interview_stages`
--

DROP TABLE IF EXISTS `interview_stages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `interview_stages` (
  `stage_id` int NOT NULL AUTO_INCREMENT,
  `candidate_id` int NOT NULL,
  `jr_id` int NOT NULL,
  `round_name` varchar(100) NOT NULL,
  `stage_status` enum('pending','scheduled','completed','cancelled') NOT NULL DEFAULT 'pending',
  `scheduled_at` datetime DEFAULT NULL,
  `feedback` text,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`stage_id`),
  KEY `candidate_id` (`candidate_id`),
  KEY `jr_id` (`jr_id`),
  CONSTRAINT `interview_stages_ibfk_1` FOREIGN KEY (`candidate_id`) REFERENCES `candidates` (`candidate_id`) ON DELETE CASCADE,
  CONSTRAINT `interview_stages_ibfk_2` FOREIGN KEY (`jr_id`) REFERENCES `job_requisitions` (`jr_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `job_requisitions`
--

DROP TABLE IF EXISTS `job_requisitions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `job_requisitions` (
  `jr_id` int NOT NULL AUTO_INCREMENT,
  `jr_title` varchar(150) NOT NULL,
  `department` varchar(100) DEFAULT NULL,
  `location` varchar(150) DEFAULT NULL,
  `work_mode` enum('remote','onsite','hybrid') DEFAULT 'hybrid',
  `employment_type` enum('full_time','part_time','contract','internship') DEFAULT 'full_time',
  `experience_level` enum('junior','mid','senior','lead') DEFAULT NULL,
  `salary_min` decimal(15,2) DEFAULT NULL,
  `salary_max` decimal(15,2) DEFAULT NULL,
  `salary_currency` varchar(10) DEFAULT 'USD',
  `salary_period` varchar(20) DEFAULT 'annual',
  `priority` enum('low','medium','high','urgent') DEFAULT 'medium',
  `openings` int DEFAULT '1',
  `filled_count` int DEFAULT '0',
  `requirements` json DEFAULT NULL,
  `required_skills` json DEFAULT NULL,
  `preferred_skills` json DEFAULT NULL,
  `benefits` json DEFAULT NULL,
  `brief` json DEFAULT NULL,
  `assigned_ta_ids` json DEFAULT NULL,
  `target_date` date DEFAULT NULL,
  `published_at` timestamp NULL DEFAULT NULL,
  `closed_at` timestamp NULL DEFAULT NULL,
  `total_applicants` int DEFAULT '0',
  `shortlisted` int DEFAULT '0',
  `interviewed` int DEFAULT '0',
  `avg_time_to_fill` int DEFAULT NULL,
  `is_deleted` tinyint(1) DEFAULT '0',
  `deleted_at` timestamp NULL DEFAULT NULL,
  `client_id` int NOT NULL,
  `created_by` int NOT NULL,
  `description` text,
  `skills` text,
  `experience` varchar(100) DEFAULT NULL,
  `status` enum('draft','pending_approval','open','on_hold','closed','filled') NOT NULL DEFAULT 'draft',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`jr_id`),
  KEY `client_id` (`client_id`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `job_requisitions_ibfk_1` FOREIGN KEY (`client_id`) REFERENCES `clients` (`client_id`) ON DELETE CASCADE,
  CONSTRAINT `job_requisitions_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `user_id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(100) NOT NULL,
  `email` varchar(150) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` enum('admin','ta') NOT NULL DEFAULT 'ta',
  `status` enum('active','inactive') NOT NULL DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-12 21:47:34

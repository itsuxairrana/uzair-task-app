<?php
require_once __DIR__ . '/helpers.php';
cors();

$key = $_GET['key'] ?? '';
$expected = substr(JWT_SECRET, 0, 8);
if ($key !== $expected) err('Unauthorized — wrong key', 401);

$db = db();

// Users table
$db->exec("CREATE TABLE IF NOT EXISTS users (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    name         VARCHAR(100) NOT NULL,
    email        VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role         ENUM('admin','employee') DEFAULT 'employee',
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

// Tasks table (synced from admin for employee access)
$db->exec("CREATE TABLE IF NOT EXISTS tasks (
    id           VARCHAR(36) PRIMARY KEY,
    title        VARCHAR(500) NOT NULL,
    notes        TEXT,
    priority     ENUM('high','medium','low') DEFAULT 'medium',
    status       ENUM('todo','in_progress','done') DEFAULT 'todo',
    due_date     DATE NULL,
    due_time     VARCHAR(10) DEFAULT '',
    assigned_to  VARCHAR(100) DEFAULT '',
    assigned_user_id INT NULL,
    workspace    VARCHAR(50) DEFAULT 'personal',
    client_tag   VARCHAR(100) DEFAULT '',
    created_by   INT NOT NULL,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

// Milestones table
$db->exec("CREATE TABLE IF NOT EXISTS milestones (
    id          VARCHAR(36) PRIMARY KEY,
    task_id     VARCHAR(36) NOT NULL,
    title       VARCHAR(500) NOT NULL,
    instruction TEXT,
    done        TINYINT(1) DEFAULT 0,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

// Notifications table
$db->exec("CREATE TABLE IF NOT EXISTS notifications (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT NOT NULL,
    type       VARCHAR(50) DEFAULT 'task_completed',
    message    TEXT NOT NULL,
    task_id    VARCHAR(36) DEFAULT NULL,
    is_read    TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

// Create default admin if not exists
$stmt = $db->prepare("SELECT id FROM users WHERE email = ?");
$stmt->execute([ADMIN_EMAIL]);
if ($stmt->fetch()) {
    ok(['ok' => true, 'message' => 'Already set up. Tables exist.']);
}

$tmpPass = 'Uzair@2026!';
$hash = password_hash($tmpPass, PASSWORD_BCRYPT, ['cost' => 12]);
$stmt = $db->prepare("INSERT INTO users (name, email, password_hash, role) VALUES ('Uzair', ?, ?, 'admin')");
$stmt->execute([ADMIN_EMAIL, $hash]);

ok(['ok' => true, 'message' => 'Setup complete!', 'email' => ADMIN_EMAIL, 'password' => $tmpPass]);

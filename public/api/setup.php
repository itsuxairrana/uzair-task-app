<?php
/**
 * Run ONCE to create tables and default admin account.
 * Visit: https://tasks.uzairvisuals.com/api/setup.php?key=SETUP_KEY
 * SETUP_KEY = first 8 chars of JWT_SECRET
 */
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

ok([
    'ok'       => true,
    'message'  => 'Setup complete! Admin account created.',
    'email'    => ADMIN_EMAIL,
    'password' => $tmpPass,
    'warning'  => 'Change your password after first login!'
]);

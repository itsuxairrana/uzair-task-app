<?php
require_once __DIR__ . '/helpers.php';
cors();

$user = getAuthUser();
if (!$user) err('Unauthorized', 401);

$body = json_decode(file_get_contents('php://input'), true);
$current = $body['current_password'] ?? '';
$new     = $body['new_password'] ?? '';

if (!$current || !$new) err('Both current and new password are required');
if (strlen($new) < 8)   err('New password must be at least 8 characters');

$db   = db();
$stmt = $db->prepare("SELECT password_hash FROM users WHERE id = ?");
$stmt->execute([$user['sub']]);
$row  = $stmt->fetch();

if (!$row || !password_verify($current, $row['password_hash'])) {
    err('Current password is incorrect', 401);
}

$hash = password_hash($new, PASSWORD_BCRYPT, ['cost' => 12]);
$stmt = $db->prepare("UPDATE users SET password_hash = ? WHERE id = ?");
$stmt->execute([$hash, $user['sub']]);

ok(['ok' => true, 'message' => 'Password changed successfully']);

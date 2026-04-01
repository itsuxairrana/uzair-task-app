<?php
require_once __DIR__ . '/helpers.php';
cors();

$auth = getAuthUser();
if (!$auth) err('Unauthorized', 401);

$method = $_SERVER['REQUEST_METHOD'];
$userId = (int) $auth['sub'];

// GET — fetch unread notifications for current user
if ($method === 'GET') {
    $stmt = db()->prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50");
    $stmt->execute([$userId]);
    $all   = $stmt->fetchAll();
    $unread = array_filter($all, fn($n) => !$n['is_read']);
    ok(['notifications' => $all, 'unread_count' => count($unread)]);
}

// PUT — mark notification(s) as read
if ($method === 'PUT') {
    $b  = json_decode(file_get_contents('php://input'), true);
    $id = $b['id'] ?? 'all';

    if ($id === 'all') {
        $stmt = db()->prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?");
        $stmt->execute([$userId]);
    } else {
        $stmt = db()->prepare("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?");
        $stmt->execute([$id, $userId]);
    }
    ok(['ok' => true]);
}

err('Method not allowed', 405);

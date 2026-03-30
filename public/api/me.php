<?php
require_once __DIR__ . '/helpers.php';
cors();

$auth = getAuthUser();
if (!$auth) err('Unauthorized', 401);

$stmt = db()->prepare("SELECT id, name, email, role FROM users WHERE id = ? LIMIT 1");
$stmt->execute([$auth['sub']]);
$user = $stmt->fetch();
if (!$user) err('User not found', 404);

ok(['user' => $user]);

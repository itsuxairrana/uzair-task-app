<?php
require_once __DIR__ . '/helpers.php';
cors();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') err('Method not allowed', 405);

$body = json_decode(file_get_contents('php://input'), true);
$email    = trim($body['email'] ?? '');
$password = $body['password'] ?? '';

if (!$email || !$password) err('Email and password are required');

$stmt = db()->prepare("SELECT * FROM users WHERE email = ? LIMIT 1");
$stmt->execute([$email]);
$user = $stmt->fetch();

if (!$user || !password_verify($password, $user['password_hash'])) {
    err('Invalid email or password', 401);
}

$token = createJWT($user['id'], $user['name'], $user['email'], $user['role']);

ok([
    'token' => $token,
    'user'  => [
        'id'    => $user['id'],
        'name'  => $user['name'],
        'email' => $user['email'],
        'role'  => $user['role'],
    ]
]);

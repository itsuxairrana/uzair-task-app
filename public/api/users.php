<?php
/**
 * Manage team members — admin only.
 * GET    /api/users.php          → list all employees
 * POST   /api/users.php          → add employee { name, email, password? }
 * DELETE /api/users.php?id=X     → remove employee
 */
require_once __DIR__ . '/helpers.php';
cors();

$auth = getAuthUser();
if (!$auth || $auth['role'] !== 'admin') err('Unauthorized', 401);

$method = $_SERVER['REQUEST_METHOD'];

// ── GET ───────────────────────────────────────────────────────────────────────
if ($method === 'GET') {
    $stmt = db()->query("SELECT id, name, email, role, created_at FROM users ORDER BY role DESC, name ASC");
    ok(['users' => $stmt->fetchAll()]);
}

// ── POST (add employee) ───────────────────────────────────────────────────────
if ($method === 'POST') {
    $body     = json_decode(file_get_contents('php://input'), true);
    $name     = trim($body['name'] ?? '');
    $email    = trim($body['email'] ?? '');
    $password = $body['password'] ?? 'Welcome@2026!';
    $role     = $body['role'] === 'admin' ? 'admin' : 'employee';

    if (!$name || !$email) err('Name and email are required');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) err('Invalid email address');

    $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
    try {
        $stmt = db()->prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)");
        $stmt->execute([$name, $email, $hash, $role]);
        ok([
            'ok'                => true,
            'id'                => (int) db()->lastInsertId(),
            'temporary_password'=> $password,
            'message'           => "Account created. Share the temporary password with $name."
        ], 201);
    } catch (Exception $e) {
        err('Email already exists');
    }
}

// ── PATCH (admin resets employee password) ───────────────────────────────────
if ($method === 'PATCH') {
    $b   = json_decode(file_get_contents('php://input'), true);
    $id  = intval($b['id'] ?? 0);
    $pwd = $b['new_password'] ?? '';
    if (!$id || strlen($pwd) < 6) err('User ID and password (min 6 chars) required');
    $hash = password_hash($pwd, PASSWORD_BCRYPT, ['cost' => 12]);
    $stmt = db()->prepare("UPDATE users SET password_hash = ? WHERE id = ? AND role = 'employee'");
    $stmt->execute([$hash, $id]);
    ok(['ok' => true, 'message' => 'Password updated']);
}

// ── DELETE ────────────────────────────────────────────────────────────────────
if ($method === 'DELETE') {
    $id = intval($_GET['id'] ?? 0);
    if (!$id) err('User ID required');
    // Prevent deleting yourself or other admins
    if ($id === (int) $auth['sub']) err('Cannot delete your own account');
    $stmt = db()->prepare("DELETE FROM users WHERE id = ? AND role = 'employee'");
    $stmt->execute([$id]);
    ok(['ok' => true]);
}

err('Method not allowed', 405);

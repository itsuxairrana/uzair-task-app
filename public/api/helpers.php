<?php
require_once __DIR__ . '/config.php';

// ── CORS ──────────────────────────────────────────────────────────────────────
function cors() {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if (in_array($origin, ALLOWED_ORIGINS)) {
        header("Access-Control-Allow-Origin: $origin");
    }
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    header('Content-Type: application/json; charset=utf-8');
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204); exit;
    }
}

// ── Database ──────────────────────────────────────────────────────────────────
function db() {
    static $pdo;
    if (!$pdo) {
        $pdo = new PDO(
            "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4",
            DB_USER, DB_PASS,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
             PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
        );
    }
    return $pdo;
}

// ── JWT ───────────────────────────────────────────────────────────────────────
function b64url_enc($data) {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}
function b64url_dec($data) {
    $pad = strlen($data) % 4;
    if ($pad) $data .= str_repeat('=', 4 - $pad);
    return base64_decode(strtr($data, '-_', '+/'));
}

function createJWT($userId, $name, $email, $role) {
    $h = b64url_enc(json_encode(['typ' => 'JWT', 'alg' => 'HS256']));
    $p = b64url_enc(json_encode([
        'sub'   => $userId,
        'name'  => $name,
        'email' => $email,
        'role'  => $role,
        'iat'   => time(),
        'exp'   => time() + 7 * 24 * 3600   // 7 days
    ]));
    $sig = b64url_enc(hash_hmac('sha256', "$h.$p", JWT_SECRET, true));
    return "$h.$p.$sig";
}

function verifyJWT($token) {
    if (!$token) return false;
    $parts = explode('.', $token);
    if (count($parts) !== 3) return false;
    [$h, $p, $sig] = $parts;
    $expected = b64url_enc(hash_hmac('sha256', "$h.$p", JWT_SECRET, true));
    if (!hash_equals($expected, $sig)) return false;
    $data = json_decode(b64url_dec($p), true);
    if (!$data || $data['exp'] < time()) return false;
    return $data;
}

function getAuthUser() {
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/Bearer\s+(.+)/i', $auth, $m)) return false;
    return verifyJWT(trim($m[1]));
}

// ── Response helpers ──────────────────────────────────────────────────────────
function ok($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data);
    exit;
}
function err($msg, $code = 400) {
    http_response_code($code);
    echo json_encode(['error' => $msg]);
    exit;
}

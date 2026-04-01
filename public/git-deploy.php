<?php
$secret = $_GET['secret'] ?? '';
if ($secret !== 'uzair_deploy_2026') {
    http_response_code(403);
    die(json_encode(['error' => 'Unauthorized']));
}

header('Content-Type: application/json');

// Test which exec function is available
$functions = ['exec', 'shell_exec', 'passthru', 'system', 'popen', 'proc_open'];
$available = array_filter($functions, function($f) {
    return function_exists($f) && !in_array($f, array_map('trim', explode(',', ini_get('disable_functions'))));
});

if (empty($available)) {
    echo json_encode(['error' => 'No exec functions available', 'available' => [], 'ok' => false]);
    exit;
}

$cwd = __DIR__;
$results = [];

if (function_exists('shell_exec') && !in_array('shell_exec', array_map('trim', explode(',', ini_get('disable_functions'))))) {
    $results['fetch'] = shell_exec("cd " . escapeshellarg($cwd) . " && git fetch origin 2>&1");
    $results['reset'] = shell_exec("cd " . escapeshellarg($cwd) . " && git reset --hard origin/deploy 2>&1");
    $results['ok'] = true;
} elseif (function_exists('exec') && !in_array('exec', array_map('trim', explode(',', ini_get('disable_functions'))))) {
    exec("cd " . escapeshellarg($cwd) . " && git fetch origin 2>&1", $out1);
    exec("cd " . escapeshellarg($cwd) . " && git reset --hard origin/deploy 2>&1", $out2);
    $results['fetch'] = implode("\n", $out1);
    $results['reset'] = implode("\n", $out2);
    $results['ok'] = true;
} else {
    $results['error'] = 'exec/shell_exec disabled';
    $results['ok'] = false;
}

$results['available_functions'] = array_values($available);
$results['php_version'] = PHP_VERSION;
$results['disable_functions'] = ini_get('disable_functions');

echo json_encode($results, JSON_PRETTY_PRINT);

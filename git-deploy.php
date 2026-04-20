<?php
$secret = $_GET['secret'] ?? '';
if ($secret !== 'uzair_deploy_2026') {
    http_response_code(403);
    die(json_encode(['error' => 'Unauthorized']));
}

header('Content-Type: application/json');

function run($cmd) {
    $desc = [1 => ['pipe','w'], 2 => ['pipe','w']];
    $proc = proc_open($cmd, $desc, $pipes, __DIR__);
    if (!is_resource($proc)) return ['out' => '', 'err' => 'proc_open failed', 'code' => -1];
    $out  = stream_get_contents($pipes[1]); fclose($pipes[1]);
    $err  = stream_get_contents($pipes[2]); fclose($pipes[2]);
    $code = proc_close($proc);
    return ['out' => trim($out), 'err' => trim($err), 'code' => $code];
}

$fetch = run('git fetch origin');
$reset = run('git reset --hard origin/deploy');

echo json_encode([
    'ok'    => $reset['code'] === 0,
    'fetch' => $fetch,
    'reset' => $reset,
], JSON_PRETTY_PRINT);

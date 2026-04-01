<?php
/**
 * Called by GitHub Actions after pushing to deploy branch.
 * Forces git to reset working files to match the latest deploy commit.
 */
$secret = $_GET['secret'] ?? '';
if ($secret !== 'uzair_deploy_2026') {
    http_response_code(403);
    die(json_encode(['error' => 'Unauthorized']));
}

header('Content-Type: application/json');

$output = [];
$cwd = __DIR__;

// Force working tree to match origin/deploy
exec("cd $cwd && git fetch origin 2>&1", $out1, $code1);
exec("cd $cwd && git reset --hard origin/deploy 2>&1", $out2, $code2);

echo json_encode([
    'fetch'  => ['code' => $code1, 'out' => $out1],
    'reset'  => ['code' => $code2, 'out' => $out2],
    'ok'     => $code2 === 0,
]);

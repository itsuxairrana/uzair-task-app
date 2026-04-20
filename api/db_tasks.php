<?php
/**
 * Task sync API
 * Admin: full CRUD on all tasks
 * Employee: GET own tasks, PUT status/milestones only
 */
require_once __DIR__ . '/helpers.php';
cors();

$auth = getAuthUser();
if (!$auth) err('Unauthorized', 401);

$method  = $_SERVER['REQUEST_METHOD'];
$isAdmin = $auth['role'] === 'admin';
$userId  = (int) $auth['sub'];

// ── GET ───────────────────────────────────────────────────────────────────────
if ($method === 'GET') {
    if ($isAdmin) {
        $stmt = db()->query("SELECT t.*, u.name as assignee_name
            FROM tasks t LEFT JOIN users u ON t.assigned_user_id = u.id
            ORDER BY t.created_at DESC");
    } else {
        $stmt = db()->prepare("SELECT t.* FROM tasks t
            WHERE t.assigned_user_id = ? ORDER BY t.created_at DESC");
        $stmt->execute([$userId]);
    }
    $tasks = $stmt->fetchAll();

    // Attach milestones
    foreach ($tasks as &$task) {
        $ms = db()->prepare("SELECT * FROM milestones WHERE task_id = ? ORDER BY id ASC");
        $ms->execute([$task['id']]);
        $task['milestones'] = $ms->fetchAll();
    }
    ok(['tasks' => $tasks]);
}

// ── POST (admin creates/syncs task) ──────────────────────────────────────────
if ($method === 'POST') {
    if (!$isAdmin) err('Forbidden', 403);
    $b = json_decode(file_get_contents('php://input'), true);

    $assigneeId = null;
    if (!empty($b['assigned_to'])) {
        $s = db()->prepare("SELECT id FROM users WHERE name = ? AND role = 'employee'");
        $s->execute([trim($b['assigned_to'])]);
        $row = $s->fetch();
        if ($row) $assigneeId = $row['id'];
    }

    $stmt = db()->prepare("INSERT INTO tasks
        (id, title, notes, priority, status, due_date, due_time, assigned_to, assigned_user_id, workspace, client_tag, created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE
        title=VALUES(title), notes=VALUES(notes), priority=VALUES(priority),
        status=VALUES(status), due_date=VALUES(due_date), due_time=VALUES(due_time),
        assigned_to=VALUES(assigned_to), assigned_user_id=VALUES(assigned_user_id),
        workspace=VALUES(workspace), client_tag=VALUES(client_tag)");

    $stmt->execute([
        $b['id'], $b['title'] ?? '', $b['notes'] ?? '',
        $b['priority'] ?? 'medium', $b['status'] ?? 'todo',
        $b['due_date'] ?: null, $b['due_time'] ?? '',
        $b['assigned_to'] ?? '', $assigneeId,
        $b['workspace'] ?? 'personal', $b['client_tag'] ?? '',
        $userId,
    ]);

    // Sync milestones
    if (!empty($b['milestones'])) {
        db()->prepare("DELETE FROM milestones WHERE task_id = ?")->execute([$b['id']]);
        $ms = db()->prepare("INSERT INTO milestones (id, task_id, title, instruction, done) VALUES (?,?,?,?,?)");
        foreach ($b['milestones'] as $m) {
            $ms->execute([$m['id'], $b['id'], $m['title'], $m['instruction'] ?? '', $m['done'] ? 1 : 0]);
        }
    }
    ok(['ok' => true]);
}

// ── PUT (update task status or milestone) ─────────────────────────────────────
if ($method === 'PUT') {
    $b = json_decode(file_get_contents('php://input'), true);
    $id = $b['id'] ?? '';
    if (!$id) err('Task ID required');

    // Verify access
    if (!$isAdmin) {
        $s = db()->prepare("SELECT id FROM tasks WHERE id = ? AND assigned_user_id = ?");
        $s->execute([$id, $userId]);
        if (!$s->fetch()) err('Forbidden', 403);
    }

    // Update milestone
    if (isset($b['milestone_id'])) {
        $stmt = db()->prepare("UPDATE milestones SET done = ? WHERE id = ? AND task_id = ?");
        $stmt->execute([$b['done'] ? 1 : 0, $b['milestone_id'], $id]);
        ok(['ok' => true]);
    }

    // Update status
    if (isset($b['status'])) {
        $stmt = db()->prepare("UPDATE tasks SET status = ? WHERE id = ?");
        $stmt->execute([$b['status'], $id]);

        // Notify admin when employee marks task done
        if (!$isAdmin && $b['status'] === 'done') {
            $task = db()->prepare("SELECT title, created_by FROM tasks WHERE id = ?");
            $task->execute([$id]);
            $t = $task->fetch();
            if ($t) {
                $msg = $auth['name'] . ' completed task: "' . $t['title'] . '"';
                $n = db()->prepare("INSERT INTO notifications (user_id, type, message, task_id) VALUES (?, 'task_completed', ?, ?)");
                $n->execute([$t['created_by'], $msg, $id]);
            }
        }
        ok(['ok' => true]);
    }

    err('Nothing to update');
}

// ── DELETE (admin only) ───────────────────────────────────────────────────────
if ($method === 'DELETE') {
    if (!$isAdmin) err('Forbidden', 403);
    $id = $_GET['id'] ?? '';
    if (!$id) err('Task ID required');
    db()->prepare("DELETE FROM tasks WHERE id = ?")->execute([$id]);
    ok(['ok' => true]);
}

err('Method not allowed', 405);

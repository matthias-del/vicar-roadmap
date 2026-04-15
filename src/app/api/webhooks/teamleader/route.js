import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getTeamleaderTask } from '@/lib/teamleaderClient';

const DB_PATH = path.join(process.cwd(), 'src/data/roadmapData.json');

function readDb() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function writeDb(db) {
  if (process.env.VERCEL) {
    console.warn('[Webhook] Running on Vercel: skipping JSON write. Use Zapier → Google Sheet to update statuses.');
    return;
  }
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

// Calculate whether a roadmap bar should turn green based on
// what percentage of its linked Teamleader tasks are completed.
function recalcStatus(task) {
  const ids = task.teamleaderIds ?? [];
  if (ids.length === 0) return; // no TL tasks linked — leave status as-is

  const statuses = task.teamleaderTaskStatuses ?? {};
  const completedCount = ids.filter(id => statuses[id] === 'completed').length;
  const pct = (completedCount / ids.length) * 100;
  const threshold = task.completionThreshold ?? 100;

  task.status = pct >= threshold ? 'completed' : 'planned';
  console.log(`[Webhook] "${task.title}" — ${completedCount}/${ids.length} done (${pct.toFixed(0)}%) vs threshold ${threshold}% → ${task.status}`);
}

export async function POST(request) {
  try {
    const payload = await request.json();
    console.log('[Teamleader Webhook] Received:', payload);

    if (!payload.event) {
      return NextResponse.json({ error: 'Missing event field' }, { status: 400 });
    }

    const db = readDb();
    let updated = false;

    // ── Phase 2: real Teamleader webhook ──────────────────────────────────────
    // Payload: { event: 'task.updated', subject: { type: 'task', id: 'uuid' } }
    if (payload.subject?.type === 'task' && payload.subject?.id) {
      const tlId = payload.subject.id;

      const tlTask = await getTeamleaderTask(tlId);
      if (!tlTask) {
        return NextResponse.json({ error: 'Could not fetch task from Teamleader' }, { status: 502 });
      }

      for (const client of db.clients) {
        for (const group of client.roadmap.groups) {
          for (const row of group.rows) {
            for (const task of row.tasks) {
              if ((task.teamleaderIds ?? []).includes(tlId)) {
                if (!task.teamleaderTaskStatuses) task.teamleaderTaskStatuses = {};
                task.teamleaderTaskStatuses[tlId] = tlTask.status;
                recalcStatus(task);
                updated = true;
              }
            }
          }
        }
      }

      if (!updated) {
        return NextResponse.json({ success: false, message: 'No roadmap bar linked to this Teamleader task ID' });
      }

      writeDb(db);
      return NextResponse.json({ success: true, message: 'Roadmap updated from Teamleader webhook' });
    }

    // ── Phase 1: local testing override ───────────────────────────────────────
    // Payload: { event: 'task.updated', tlTaskId: 'uuid', tlStatus: 'completed' }
    // OR:      { event: 'task.updated', taskId: 'tw1', status: 'completed' }
    const { taskId, status, tlTaskId, tlStatus, newStartWeek, newDuration } = payload;

    for (const client of db.clients) {
      for (const group of client.roadmap.groups) {
        for (const row of group.rows) {
          for (const task of row.tasks) {
            // Match by Teamleader UUID (percentage flow)
            if (tlTaskId && (task.teamleaderIds ?? []).includes(tlTaskId)) {
              if (!task.teamleaderTaskStatuses) task.teamleaderTaskStatuses = {};
              task.teamleaderTaskStatuses[tlTaskId] = tlStatus ?? 'completed';
              recalcStatus(task);
              updated = true;
            }

            // Match by internal roadmap task ID (direct override)
            if (task.id === taskId) {
              if (status)       task.status    = status;
              if (newStartWeek) task.startWeek = newStartWeek;
              if (newDuration)  task.duration  = newDuration;
              updated = true;
            }
          }
        }
      }
    }

    if (!updated) {
      return NextResponse.json({ success: false, message: 'No matching task found' });
    }

    writeDb(db);
    return NextResponse.json({ success: true, message: 'Roadmap updated' });

  } catch (err) {
    console.error('[Webhook] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

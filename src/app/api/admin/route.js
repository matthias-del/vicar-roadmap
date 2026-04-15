import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { generatePhases, totalWeeksFromPhases } from '@/lib/calendarUtils';

const DB_PATH = path.join(process.cwd(), 'src/data/roadmapData.json');

function readDb() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function writeDb(db) {
  if (process.env.VERCEL) {
    // Vercel has a read-only filesystem — sheet is the source of truth in production
    console.warn('[Admin] Running on Vercel: skipping JSON write. Use the Google Sheet to manage data.');
    return;
  }
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// PATCH /api/admin — update a single task field
export async function PATCH(request) {
  try {
    const { taskId, ...updates } = await request.json();
    if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 });

    const db = readDb();
    let found = false;
    for (const client of db.clients) {
      for (const group of client.roadmap.groups) {
        for (const row of group.rows) {
          for (const task of row.tasks) {
            if (task.id === taskId) {
              if (updates.title               !== undefined) task.title               = updates.title;
              if (updates.startWeek           !== undefined) task.startWeek           = Number(updates.startWeek);
              if (updates.duration            !== undefined) task.duration            = Number(updates.duration);
              if (updates.status              !== undefined) task.status              = updates.status;
              if (updates.teamleaderIds       !== undefined) task.teamleaderIds       = updates.teamleaderIds; // array of UUIDs
              if (updates.completionThreshold !== undefined) task.completionThreshold = Number(updates.completionThreshold);
              found = true;
            }
          }
        }
      }
    }
    if (!found) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    writeDb(db);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Admin PATCH]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// PUT /api/admin — update timeline (startMonthIndex, startYear, durationMonths)
export async function PUT(request) {
  try {
    const { clientId = 'vicar-demo', startMonthIndex, startYear, durationMonths } = await request.json();
    const db = readDb();
    const client = db.clients.find(c => c.id === clientId);
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

    const months = Math.max(1, Number(durationMonths));
    const mIdx   = Number(startMonthIndex);
    const yr     = Number(startYear);
    const phases = generatePhases(mIdx, yr, months);

    client.roadmap.startMonthIndex = mIdx;
    client.roadmap.startYear       = yr;
    client.roadmap.durationMonths  = months;
    client.roadmap.phases          = phases;
    client.roadmap.totalWeeks      = totalWeeksFromPhases(phases);

    writeDb(db);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Admin PUT]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// POST /api/admin — add a group or task
export async function POST(request) {
  try {
    const body = await request.json();
    const { operation, clientId = 'vicar-demo' } = body;
    const db = readDb();
    const client = db.clients.find(c => c.id === clientId);
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

    if (operation === 'add-group') {
      const { label } = body;
      const groupId = uid('group');
      client.roadmap.groups.push({ id: groupId, label: label.toUpperCase(), rows: [] });
      writeDb(db);
      return NextResponse.json({ success: true, groupId });
    }

    if (operation === 'add-task') {
      const { groupId, title } = body;
      const group = client.roadmap.groups.find(g => g.id === groupId);
      if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

      const taskId = uid('task');
      const rowId  = uid('row');
      group.rows.push({
        id: rowId,
        tasks: [{ id: taskId, title, startWeek: 1, duration: 2, status: 'planned', teamleaderIds: [], completionThreshold: 100, teamleaderTaskStatuses: {} }],
      });
      writeDb(db);
      return NextResponse.json({ success: true, taskId, rowId });
    }

    return NextResponse.json({ error: 'Unknown operation' }, { status: 400 });
  } catch (err) {
    console.error('[Admin POST]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// DELETE /api/admin — remove a group or task
export async function DELETE(request) {
  try {
    const { operation, clientId = 'vicar-demo', groupId, taskId } = await request.json();
    const db = readDb();
    const client = db.clients.find(c => c.id === clientId);
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

    if (operation === 'delete-group') {
      client.roadmap.groups = client.roadmap.groups.filter(g => g.id !== groupId);
      writeDb(db);
      return NextResponse.json({ success: true });
    }

    if (operation === 'delete-task') {
      for (const group of client.roadmap.groups) {
        group.rows = group.rows.filter(row => !row.tasks.some(t => t.id === taskId));
      }
      writeDb(db);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown operation' }, { status: 400 });
  } catch (err) {
    console.error('[Admin DELETE]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

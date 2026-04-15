import { NextResponse } from 'next/server';
import { syncRoadmapToTeamleader } from '@/lib/teamleaderSync';
import { getClientRoadmap } from '@/data/mockRoadmapData';
import { getValidToken } from '@/lib/teamleaderAuth';
import { getTeamleaderTask } from '@/lib/teamleaderClient';

async function tlPost(endpoint, body, token) {
  const res = await fetch(`https://api.focus.teamleader.eu/${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

// GET /api/teamleader                          → verify API auth (users.me)
// GET /api/teamleader?taskId=<int|uuid>        → verify lookup of a specific task
// GET /api/teamleader?projectId=<uuid>         → list milestones + tasks in a project
// GET /api/teamleader?listTasks=1[&page=1]     → list recent tasks (with uuid + description)
// GET /api/teamleader?migrateIntId=<int>       → integer→UUID + full task details (description)
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const taskId        = searchParams.get('taskId');
  const projectId     = searchParams.get('projectId');
  const listTasks     = searchParams.get('listTasks');
  const migrateIntId  = searchParams.get('migrateIntId');
  const page          = Number(searchParams.get('page') || 1);

  try {
    const token = await getValidToken();

    // 1. Auth check via users.me
    const meRes = await tlPost('users.me', {}, token);
    if (!meRes.ok) {
      return NextResponse.json({ step: 'users.me', status: meRes.status, error: meRes.data }, { status: 502 });
    }
    const me = meRes.data.data;
    const result = { authenticated: true, user: { name: `${me.first_name} ${me.last_name}`, email: me.email } };

    // 2. Optional task lookup
    if (taskId) {
      const task = await getTeamleaderTask(taskId);
      result.task = task || { notFound: true, taskId };
    }

    // 3. Optional: list recent tasks
    if (listTasks) {
      const list = await tlPost('tasks.list', { page: { size: 50, number: page } }, token);
      result.tasks = list.ok
        ? list.data.data.map(t => ({ id: t.id, description: t.description, completed: t.completed, due_on: t.due_on }))
        : { error: list.data };
    }

    // 4. Optional: list milestones + tasks in a project
    if (projectId) {
      const proj = await tlPost('projects.info', { id: projectId }, token);
      if (!proj.ok) {
        result.project = { error: proj.data, status: proj.status };
      } else {
        const milestones = proj.data.data.milestones || [];
        const withTasks = await Promise.all(milestones.map(async m => {
          const mInfo = await tlPost('milestones.info', { id: m.id }, token);
          return {
            id: m.id,
            name: mInfo.ok ? (mInfo.data.data.name || mInfo.data.data.title) : m.id,
            tasks: mInfo.ok && mInfo.data.data.tasks ? mInfo.data.data.tasks : [],
          };
        }));
        result.project = {
          id: proj.data.data.id,
          title: proj.data.data.title,
          milestones: withTasks,
        };
      }
    }

    // 5. Integer → UUID → full task details
    if (migrateIntId) {
      const mig = await tlPost('migrate.id', { id: Number(migrateIntId), type: 'task' }, token);
      if (!mig.ok) {
        result.migrate = { error: mig.data, status: mig.status };
      } else {
        const uuid = mig.data.data.id;
        const info = await tlPost('tasks.info', { id: uuid }, token);
        result.migrate = { integerId: migrateIntId, uuid };
        if (info.ok) {
          result.migrate.task = info.data.data; // full raw response for now
        } else {
          result.migrate.taskInfoError = info.data;
        }
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { clientId } = await request.json();
    
    // Fetch the client data from JSON
    const clientData = getClientRoadmap(clientId);
    if (!clientData) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    // Trigger sync
    const result = await syncRoadmapToTeamleader(clientData);

    if (result.success) {
      return NextResponse.json({ success: true, message: result.message, projectId: result.projectId });
    } else {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

  } catch (error) {
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}

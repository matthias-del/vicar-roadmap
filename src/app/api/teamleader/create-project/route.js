import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isAdminAuthed } from '@/lib/authCookie';
import {
  createProject,
  createMilestone,
  createTask,
} from '@/lib/teamleaderCreate';

export async function POST(request) {
  const cookieStore = await cookies();
  if (!isAdminAuthed(request, cookieStore)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { project, milestones } = payload || {};
  if (!project?.title) {
    return NextResponse.json({ error: 'project.title is required' }, { status: 400 });
  }
  if (!Array.isArray(milestones) || milestones.length === 0) {
    return NextResponse.json({ error: 'At least one milestone is required' }, { status: 400 });
  }

  const result = {
    projectId: null,
    milestones: [],
    taskIds: [],
    failedAt: null,
  };

  // Step 1 — project.
  try {
    const { id } = await createProject({
      title: project.title,
      description: project.description,
      startsOn: project.startsOn,
      customerType: project.customerType,
      customerId: project.customerId,
      dealId: project.dealId,
    });
    result.projectId = id;
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Failed to create project',
        step: err.endpoint || 'projects-v2/projects.create',
        status: err.status,
        details: err.body,
      },
      { status: 502 },
    );
  }

  // Step 2 — milestones, one call each.
  for (let i = 0; i < milestones.length; i++) {
    const ms = milestones[i];
    try {
      const { id } = await createMilestone({
        projectId: result.projectId,
        name: ms.name,
        dueOn: ms.dueOn,
      });
      result.milestones.push({ id, name: ms.name });
    } catch (err) {
      result.failedAt = result.failedAt || {
        step: err.endpoint || 'projects-v2/milestones.create',
        milestoneIndex: i,
        name: ms.name,
        status: err.status,
        details: err.body,
      };
      result.milestones.push({ id: null, name: ms.name });
    }
  }

  // Step 3 — tasks under each milestone (continuing on per-task failures).
  for (let i = 0; i < milestones.length; i++) {
    const ms = milestones[i];
    const milestoneId = result.milestones[i]?.id;
    if (!milestoneId) continue;
    const tasks = Array.isArray(ms.tasks) ? ms.tasks : [];
    for (const task of tasks) {
      try {
        const { id } = await createTask({
          projectId: result.projectId,
          milestoneId,
          title: task.title,
          description: task.description,
          dueOn: task.dueOn,
        });
        result.taskIds.push({ milestoneId, id, title: task.title });
      } catch (err) {
        result.failedAt = result.failedAt || {
          step: err.endpoint || 'projects-v2/tasks.create',
          milestoneId,
          task: task.title,
          status: err.status,
          details: err.body,
        };
      }
    }
  }

  return NextResponse.json({
    success: !result.failedAt,
    ...result,
  });
}

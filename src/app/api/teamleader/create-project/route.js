import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isAdminAuthed } from '@/lib/authCookie';
import {
  createProjectWithMilestones,
  createTaskForMilestone,
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

  try {
    const created = await createProjectWithMilestones({
      title: project.title,
      description: project.description,
      startsOn: project.startsOn,
      customerType: project.customerType,
      customerId: project.customerId,
      milestones: milestones.map(m => ({
        name: m.name,
        dueOn: m.dueOn,
      })),
    });
    result.projectId = created.projectId;
    result.milestones = created.milestones;
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Failed to create project',
        step: 'projects.create',
        status: err.status,
        details: err.body,
      },
      { status: 502 },
    );
  }

  // Create tasks per milestone, continuing on individual failures so the
  // admin gets a clear partial-success report rather than a silent abort.
  for (let i = 0; i < milestones.length; i++) {
    const ms = milestones[i];
    const milestoneId = result.milestones[i]?.id;
    if (!milestoneId) {
      result.failedAt = result.failedAt || {
        step: 'milestone-id-missing',
        milestoneIndex: i,
      };
      continue;
    }
    const tasks = Array.isArray(ms.tasks) ? ms.tasks : [];
    for (const task of tasks) {
      try {
        const { id } = await createTaskForMilestone({
          milestoneId,
          title: task.title,
          description: task.description,
          dueOn: task.dueOn,
        });
        result.taskIds.push({ milestoneId, id, title: task.title });
      } catch (err) {
        result.failedAt = result.failedAt || {
          step: 'tasks.create',
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

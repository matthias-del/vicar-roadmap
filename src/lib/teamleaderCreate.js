import { getValidToken } from './teamleaderAuth';

const TL_API = 'https://api.focus.teamleader.eu';

// Endpoint paths kept here so they can be swapped to `projects-v2/*` if needed.
const EP_PROJECT_CREATE = 'projects.create';
const EP_TASK_CREATE = 'tasks.create';

async function tlPost(endpoint, body) {
  const token = await getValidToken();
  const res = await fetch(`${TL_API}/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const err = new Error(`Teamleader ${endpoint} failed (${res.status})`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

// Creates a project with milestones nested. Teamleader's projects.create
// accepts the full milestone list in a single call and returns their ids.
// Returns { projectId, milestones: [{ id, name }] }.
export async function createProjectWithMilestones({
  title,
  description,
  startsOn,
  customerType,
  customerId,
  milestones,
}) {
  const body = {
    title,
    ...(description ? { description } : {}),
    ...(startsOn ? { starts_on: startsOn } : {}),
    ...(customerType && customerId
      ? { customer: { type: customerType, id: customerId } }
      : {}),
    milestones: milestones.map(m => ({
      name: m.name,
      ...(m.dueOn ? { due_on: m.dueOn } : {}),
      ...(m.responsibleUserId
        ? { responsible_user_id: m.responsibleUserId }
        : {}),
    })),
  };

  const res = await tlPost(EP_PROJECT_CREATE, body);
  const projectId = res?.data?.id;
  const createdMilestones = Array.isArray(res?.data?.milestones)
    ? res.data.milestones
    : [];

  // Teamleader returns milestones in the same order they were submitted,
  // so zip by index to pair the server ids back to our input names.
  const milestonesById = milestones.map((m, i) => ({
    id: createdMilestones[i]?.id,
    name: m.name,
  }));

  return { projectId, milestones: milestonesById };
}

// Creates a single task under an existing milestone.
// Returns { id }.
export async function createTaskForMilestone({
  milestoneId,
  title,
  description,
  dueOn,
  assigneeUserId,
}) {
  const body = {
    title,
    ...(description ? { description } : {}),
    ...(dueOn ? { due_on: dueOn } : {}),
    milestone_id: milestoneId,
    ...(assigneeUserId
      ? { assignee: { type: 'user', id: assigneeUserId } }
      : {}),
  };
  const res = await tlPost(EP_TASK_CREATE, body);
  return { id: res?.data?.id };
}

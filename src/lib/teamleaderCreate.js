import { getValidToken } from './teamleaderAuth';

const TL_API = 'https://api.focus.teamleader.eu';

// V2 endpoints. V1 projects.create returns 403 "no access to this module" on
// accounts migrated to V2 — reads across the app already use projects-v2/*.
const EP_PROJECT_CREATE = 'projects-v2/projects.create';
const EP_MILESTONE_CREATE = 'projects-v2/milestones.create';
const EP_TASK_CREATE = 'projects-v2/tasks.create';

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
    err.endpoint = endpoint;
    throw err;
  }
  return data;
}

// V2 projects.create — no nested milestones; those go via a separate endpoint.
// Returns { id }.
export async function createProject({
  title,
  description,
  startsOn,
  customerType,
  customerId,
}) {
  const body = {
    title,
    ...(description ? { description } : {}),
    ...(startsOn ? { starts_on: startsOn } : {}),
    ...(customerType && customerId
      ? { customer: { type: customerType, id: customerId } }
      : {}),
  };
  const res = await tlPost(EP_PROJECT_CREATE, body);
  return { id: res?.data?.id };
}

// V2 milestones.create — one call per milestone, bound to the project.
// Returns { id }.
export async function createMilestone({
  projectId,
  name,
  startsOn,
  dueOn,
  responsibleUserId,
}) {
  const body = {
    project_id: projectId,
    name,
    ...(startsOn ? { starts_on: startsOn } : {}),
    ...(dueOn ? { due_on: dueOn } : {}),
    ...(responsibleUserId ? { responsible_user_id: responsibleUserId } : {}),
  };
  const res = await tlPost(EP_MILESTONE_CREATE, body);
  return { id: res?.data?.id };
}

// V2 tasks.create — bound to a project and optionally a milestone.
// Returns { id }.
export async function createTask({
  projectId,
  milestoneId,
  title,
  description,
  dueOn,
  assigneeUserId,
}) {
  const body = {
    project_id: projectId,
    title,
    ...(description ? { description } : {}),
    ...(dueOn ? { due_on: dueOn } : {}),
    ...(milestoneId ? { milestone_id: milestoneId } : {}),
    ...(assigneeUserId ? { assignee: { type: 'user', id: assigneeUserId } } : {}),
  };
  const res = await tlPost(EP_TASK_CREATE, body);
  return { id: res?.data?.id };
}

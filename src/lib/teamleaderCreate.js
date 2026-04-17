import { getValidToken } from './teamleaderAuth';

const TL_API = 'https://api.focus.teamleader.eu';

// V2 endpoints. V1 projects.create returns 403 "no access to this module" on
// accounts migrated to V2 — reads across the app already use projects-v2/*.
// V2 renames "milestones" to "project groups" (see projects-v2/projectGroups.info
// used elsewhere), so there's no milestones.create — it's projectGroups.create.
const EP_PROJECT_CREATE = 'projects-v2/projects.create';
const EP_GROUP_CREATE = 'projects-v2/projectGroups.create';
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
  dealId,
}) {
  const body = {
    title,
    ...(description ? { description } : {}),
    ...(startsOn ? { starts_on: startsOn } : {}),
    ...(customerType && customerId
      ? { customers: [{ type: customerType, id: customerId }] }
      : {}),
    ...(dealId ? { deals: [{ id: dealId }] } : {}),
  };
  const res = await tlPost(EP_PROJECT_CREATE, body);
  return { id: res?.data?.id };
}

// V2 projectGroups.create — V2's equivalent of V1 milestones. One call each.
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
    title: name,
    ...(startsOn ? { starts_on: startsOn } : {}),
    ...(dueOn ? { due_on: dueOn } : {}),
    ...(responsibleUserId ? { responsible_user_id: responsibleUserId } : {}),
  };
  const res = await tlPost(EP_GROUP_CREATE, body);
  return { id: res?.data?.id };
}

// V2 tasks.create — bound to a project and optionally a project group.
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
    ...(milestoneId ? { group_id: milestoneId } : {}),
    ...(assigneeUserId ? { assignee: { type: 'user', id: assigneeUserId } } : {}),
  };
  const res = await tlPost(EP_TASK_CREATE, body);
  return { id: res?.data?.id };
}

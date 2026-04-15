// src/lib/teamleaderClient.js
import { getValidToken } from './teamleaderAuth';

const TL_API = 'https://api.focus.teamleader.eu';

async function tlPost(endpoint, body) {
  const token = await getValidToken();
  const res = await fetch(`${TL_API}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Teamleader ${endpoint} failed (${res.status}): ${err}`);
  }
  return res.json();
}

// Fetch a single task by UUID and return normalised status
export async function getTeamleaderTask(taskId) {
  try {
    // Try tasks (to-dos)
    const data = await tlPost('tasks.info', { id: taskId });
    if (data?.data) {
      return {
        id: data.data.id,
        title: data.data.description || data.data.title || taskId,
        status: data.data.completed ? 'completed' : 'planned',
      };
    }
  } catch { /* fall through to meetings */ }

  try {
    // Fallback: meetings (calendar tasks inside projects)
    const data = await tlPost('meetings.info', { id: taskId });
    if (data?.data) {
      return {
        id: data.data.id,
        title: data.data.title || taskId,
        status: data.data.status === 'done' ? 'completed' : 'planned',
      };
    }
  } catch { /* ignore */ }

  return null;
}

// List all tasks for a project (nextgen projects use milestones + work items)
export async function getProjectTasks(projectId) {
  const data = await tlPost('projects.info', { id: projectId });
  return data?.data ?? null;
}

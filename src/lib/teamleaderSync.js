// src/lib/teamleaderSync.js

/**
 * Utility to simulate (Phase 1) or perform (Phase 2) syncing roadmap data
 * to Teamleader Focus.
 *
 * Teamleader structure:
 *   Project  = one client  (e.g. "Antwerpen Moos")
 *   Phases/Services = service groups  (e.g. Website, Socials, Visuals)
 *   Tasks    = individual tasks under each service
 *
 * Real Phase 2 implementation:
 *   1. Authenticate via OAuth2 to get an Access Token.
 *   2. POST to /projects.create with the Client Name.
 *   3. Iterate over groups (services) and POST to /milestones.create.
 *   4. Iterate over tasks and POST to /tasks.create under respective milestones.
 */
export async function syncRoadmapToTeamleader(clientData) {
  console.log(`[Teamleader Sync] Starting sync for: ${clientData.name}`);

  try {
    // 1. Simulate Project Creation
    const projectId = `mock_proj_${Date.now()}`;
    console.log(`✅ Project created: ${clientData.name} (${projectId})`);

    // 2. Iterate groups (services) and their tasks
    for (const group of clientData.roadmap.groups) {
      console.log(`  -> Milestone: ${group.label}`);

      for (const row of group.rows) {
        for (const task of row.tasks) {
          console.log(`    --> Task: ${task.title} [Start: week ${task.startWeek}, Duration: ${task.duration}w, Status: ${task.status}]`);
          // Phase 2: real API call goes here
          // await createTeamleaderTask({ projectId, milestoneId, task });
        }
      }
    }

    return { success: true, message: "Synced to Teamleader (mock)", projectId };
  } catch (error) {
    console.error("[Teamleader Sync] Failed:", error);
    return { success: false, error: "Failed to connect to Teamleader API" };
  }
}

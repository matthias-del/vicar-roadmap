import fs from 'fs';
import path from 'path';

export function getClientRoadmap(clientId) {
  // Dynamically read the file to ensure we get live Webhook updates without restarting Next.js server
  const filePath = path.join(process.cwd(), 'src/data/roadmapData.json');
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(fileContent);
    return data.clients.find(client => client.id === clientId);
  } catch (error) {
    console.error("Error reading roadmap data:", error);
    return null;
  }
}

export function getAllClients() {
  const filePath = path.join(process.cwd(), 'src/data/roadmapData.json');
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(fileContent);
    return data.clients;
  } catch (error) {
    console.error("Error reading roadmap data:", error);
    return [];
  }
}

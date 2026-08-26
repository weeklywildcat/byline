import { Routes, type Client, type RESTPostAPIApplicationCommandsJSONBody } from 'discord.js';

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key, child]) => child !== undefined && child !== null && !(key === 'nsfw' && child === false) && key !== 'dm_permission' && key !== 'contexts' && key !== 'integration_types' && !(key === 'options' && Array.isArray(child) && child.length === 0))
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, normalize(child)]));
  return value;
}
export function commandsEqual(current: readonly unknown[], desired: readonly unknown[]): boolean {
  const strip = (command: unknown) => { const copy = { ...(command as Record<string, unknown>) }; for (const key of ['id', 'application_id', 'guild_id', 'version']) delete copy[key]; return normalize(copy); };
  return JSON.stringify(current.map(strip).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))) === JSON.stringify(desired.map(strip).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
}
export async function syncCommands(client: Client<true>, clientId: string, guildId: string, desired: RESTPostAPIApplicationCommandsJSONBody[]): Promise<boolean> {
  const route = Routes.applicationGuildCommands(clientId, guildId);
  const current = await client.rest.get(route) as unknown[];
  if (commandsEqual(current, desired)) return false;
  await client.rest.put(route, { body: desired });
  return true;
}

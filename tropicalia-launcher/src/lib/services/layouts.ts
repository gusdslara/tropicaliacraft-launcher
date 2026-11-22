import { getJson } from '$lib/platform';
import { normalizeControls, type ControlsConfig } from '$lib/controls';
import { validLayout } from '$lib/layout-schema';

const API = (import.meta.env.VITE_LAYOUTS_API_URL || 'https://tropicaliacraft.gustavolara.pro/api').replace(/\/$/, '');
export interface OnlineLayout { id: string; name: string; createdAt: string; layout: ControlsConfig }
export function parseLayout(value: unknown): ControlsConfig {
  const data = value as { layout?: unknown } | null;
  const layout = data?.layout ?? value;
  if (!validLayout(layout)) throw new Error('Invalid controller layout (version 1 required).');
  return normalizeControls(layout as ControlsConfig);
}
export async function listLayouts(query = '', offset = 0): Promise<{ items: OnlineLayout[]; hasMore: boolean }> {
  return getJson(`${API}/layouts?q=${encodeURIComponent(query.trim())}&offset=${offset}`);
}
export async function publishLayout(name: string, layout: ControlsConfig): Promise<OnlineLayout> {
  return getJson(`${API}/layouts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), layout: parseLayout(layout) }) });
}

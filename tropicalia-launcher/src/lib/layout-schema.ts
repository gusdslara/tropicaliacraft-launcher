// Shared wire-format validation for files and public controller layouts.
export const CONTROL_IDS = ['move', 'sprint', 'jump', 'sneak', 'attack', 'use', 'chat', 'pause', 'settings', 'inventory', 'debug', 'perspective', 'offhand', 'shield', 'keyboard'] as const;
const color = (v: unknown) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const number = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

export function validLayout(v: any): boolean {
  if (!v || v.version !== 1 || !number(v.scale, 0.5, 2) || !v.style || !v.items) return false;
  const s = v.style;
  if (!['pixel', 'circle', 'rounded', 'square'].includes(s.shape) || !number(s.fillOpacity, 0, 1) || !number(s.borderWidth, 0, 8)) return false;
  if (![s.fill, s.border, s.icon, s.pressed].every(color)) return false;
  return CONTROL_IDS.every(id => {
    const i = v.items[id];
    return i && number(i.x, 0, 1) && number(i.y, 0, 1) && number(i.size, 0.045, 0.45) && number(i.opacity, 0, 1) && typeof i.visible === 'boolean'
      && typeof i.icon === 'string' && /^[a-z0-9-]{1,64}$/.test(i.icon)
      && (i.fill === undefined || color(i.fill)) && (i.iconColor === undefined || color(i.iconColor));
  });
}

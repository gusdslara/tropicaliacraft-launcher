import { expect, test } from 'bun:test';
import { CONTROL_IDS, defaultControls, normalizeControls, fitControl } from '../src/lib/controls';
import { validLayout } from '../src/lib/layout-schema';

test('restoring defaults returns an independent valid layout with transparent buttons', () => {
    const custom = defaultControls();
    custom.items.jump.opacity = 1;
    custom.style.fillOpacity = 1;
    custom.items.attack.visible = false;
    const restored = defaultControls();
    expect(validLayout(restored)).toBe(true);
    expect(CONTROL_IDS.every(id => restored.items[id].opacity <= 0.3)).toBe(true);
    expect(restored.style.fillOpacity).toBe(0.3);
    expect(restored.items.attack.visible).toBe(true);
    expect(normalizeControls(custom).items.jump.opacity).toBe(1);
    expect(normalizeControls({version: 1, items: {} as any}).items.jump).toEqual(restored.items.jump);
});

test('large buttons stay fully inside the screen at each edge', () => {
    const button = defaultControls().items.jump;
    Object.assign(button, {x: 0, y: 1, size: 0.4});
    fitControl(button, 1, 2);
    expect(button.x).toBe(0.1);
    expect(button.y).toBe(0.8);
});

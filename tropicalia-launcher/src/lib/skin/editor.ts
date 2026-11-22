/**
 * Pixel editing for a 64x64 Minecraft skin. Framework free, so the Svelte page only wires UI.
 * Ported from the Skin Studio of the TropicaliaCraft site.
 */
import type { BodyPartName } from './skin-model';

export type Tool = 'pencil' | 'eraser' | 'picker' | 'bucket' | 'lighten' | 'darken' | 'noise';
export type Layer = 'all' | 'base' | 'overlay';

export interface UvFace { name: string; x: number; y: number; w: number; h: number }
export interface UvBox {
	label: string;
	x: number; y: number; w: number; h: number;
	color: string;
	overlay: boolean;
	part: BodyPartName;
	faces: UvFace[];
}

/** Six faces of a cuboid laid out the Minecraft way, starting at (x, y). */
function cuboid(x: number, y: number, w: number, h: number, d: number, names: [string, string, string, string, string, string]): UvFace[] {
	return [
		{ name: names[0], x: x + d, y, w, h: d },
		{ name: names[1], x: x + d + w, y, w, h: d },
		{ name: names[2], x, y: y + d, w: d, h },
		{ name: names[3], x: x + d, y: y + d, w, h },
		{ name: names[4], x: x + d + w, y: y + d, w: d, h },
		{ name: names[5], x: x + d * 2 + w, y: y + d, w, h }
	];
}
const LIMB: [string, string, string, string, string, string] = ['TOPO', 'BASE', 'LADO', 'FRENTE', 'LADO', 'TRÁS'];
const HEAD: [string, string, string, string, string, string] = ['TOPO', 'QUEIXO', 'DIR', 'ROSTO', 'ESQ', 'NUCA'];

export const UV_BOXES: UvBox[] = [
	{ label: 'CABEÇA', x: 0, y: 0, w: 32, h: 16, color: '#38bdf8', overlay: false, part: 'head', faces: cuboid(0, 0, 8, 8, 8, HEAD) },
	{ label: 'CHAPÉU 3D', x: 32, y: 0, w: 32, h: 16, color: '#f59e0b', overlay: true, part: 'head', faces: cuboid(32, 0, 8, 8, 8, HEAD) },
	{ label: 'PERNA DIR', x: 0, y: 16, w: 16, h: 16, color: '#ec4899', overlay: false, part: 'rightLeg', faces: cuboid(0, 16, 4, 12, 4, LIMB) },
	{ label: 'TRONCO', x: 16, y: 16, w: 24, h: 16, color: '#22c55e', overlay: false, part: 'torso', faces: cuboid(16, 16, 8, 12, 4, LIMB) },
	{ label: 'BRAÇO DIR', x: 40, y: 16, w: 16, h: 16, color: '#a855f7', overlay: false, part: 'rightArm', faces: cuboid(40, 16, 4, 12, 4, LIMB) },
	{ label: 'CALÇA DIR 3D', x: 0, y: 32, w: 16, h: 16, color: '#f472b6', overlay: true, part: 'rightLeg', faces: cuboid(0, 32, 4, 12, 4, LIMB) },
	{ label: 'JAQUETA 3D', x: 16, y: 32, w: 24, h: 16, color: '#eab308', overlay: true, part: 'torso', faces: cuboid(16, 32, 8, 12, 4, LIMB) },
	{ label: 'MANGA DIR 3D', x: 40, y: 32, w: 16, h: 16, color: '#c084fc', overlay: true, part: 'rightArm', faces: cuboid(40, 32, 4, 12, 4, LIMB) },
	{ label: 'CALÇA ESQ 3D', x: 0, y: 48, w: 16, h: 16, color: '#e879f9', overlay: true, part: 'leftLeg', faces: cuboid(0, 48, 4, 12, 4, LIMB) },
	{ label: 'PERNA ESQ', x: 16, y: 48, w: 16, h: 16, color: '#d946ef', overlay: false, part: 'leftLeg', faces: cuboid(16, 48, 4, 12, 4, LIMB) },
	{ label: 'BRAÇO ESQ', x: 32, y: 48, w: 16, h: 16, color: '#8b5cf6', overlay: false, part: 'leftArm', faces: cuboid(32, 48, 4, 12, 4, LIMB) },
	{ label: 'MANGA ESQ 3D', x: 48, y: 48, w: 16, h: 16, color: '#a78bfa', overlay: true, part: 'leftArm', faces: cuboid(48, 48, 4, 12, 4, LIMB) }
];

export const PART_LABELS: Record<BodyPartName | 'all', string> = {
	all: 'Tudo',
	head: 'Cabeça',
	torso: 'Tronco',
	rightArm: 'Braço dir.',
	leftArm: 'Braço esq.',
	rightLeg: 'Perna dir.',
	leftLeg: 'Perna esq.'
};

/** Region and face under a pixel, or null for unused texture space. */
export function regionAt(x: number, y: number): { box: UvBox; face: UvFace | null } | null {
	for (const box of UV_BOXES) {
		if (x < box.x || x >= box.x + box.w || y < box.y || y >= box.y + box.h) continue;
		const face = box.faces.find((f) => x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h) ?? null;
		return face ? { box, face } : null;
	}
	return null;
}

export function isOverlayPixel(x: number, y: number): boolean {
	return (
		(x >= 32 && y < 16) || // hat
		(x < 56 && y >= 32 && y < 48) || // right trouser, jacket, right sleeve
		(x >= 48 && y >= 48) || // left sleeve
		(x < 16 && y >= 48) // left trouser
	);
}

export function allowedOnLayer(layer: Layer, x: number, y: number): boolean {
	if (layer === 'all') return true;
	return layer === 'overlay' ? isOverlayPixel(x, y) : !isOverlayPixel(x, y);
}

/** Mirrors the front faces of head, hat, torso and jacket. */
export function mirroredX(x: number, y: number): number | null {
	if (x >= 8 && x <= 15 && y >= 8 && y <= 15) return 23 - x;
	if (x >= 40 && x <= 47 && y >= 8 && y <= 15) return 87 - x;
	if (x >= 20 && x <= 27 && y >= 20 && y <= 31) return 47 - x;
	if (x >= 20 && x <= 27 && y >= 36 && y <= 47) return 47 - x;
	return null;
}

export function hexToRgb(hex: string): [number, number, number] | null {
	const c = hex.replace('#', '');
	const full = c.length === 3 ? c.split('').map((v) => v + v).join('') : c;
	if (!/^[0-9a-f]{6}$/i.test(full)) return null;
	return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

export function rgbToHex(r: number, g: number, b: number): string {
	return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/** The 64x64 texture plus undo history. */
export class SkinDocument {
	readonly canvas: HTMLCanvasElement;
	readonly ctx: CanvasRenderingContext2D;
	private past: ImageData[] = [];
	private future: ImageData[] = [];
	private readonly max = 50;

	constructor() {
		this.canvas = document.createElement('canvas');
		this.canvas.width = 64;
		this.canvas.height = 64;
		this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
		this.ctx.imageSmoothingEnabled = false;
	}

	/** Call before a change; the current texture becomes an undo step. */
	checkpoint(): void {
		this.past.push(this.snapshot());
		if (this.past.length > this.max) this.past.shift();
		this.future = [];
	}

	get canUndo(): boolean { return this.past.length > 0; }
	get canRedo(): boolean { return this.future.length > 0; }

	undo(): boolean {
		const previous = this.past.pop();
		if (!previous) return false;
		this.future.push(this.snapshot());
		this.ctx.putImageData(previous, 0, 0);
		return true;
	}

	redo(): boolean {
		const next = this.future.pop();
		if (!next) return false;
		this.past.push(this.snapshot());
		this.ctx.putImageData(next, 0, 0);
		return true;
	}

	private snapshot(): ImageData {
		return this.ctx.getImageData(0, 0, 64, 64);
	}

	replace(source: CanvasImageSource): void {
		this.checkpoint();
		this.ctx.clearRect(0, 0, 64, 64);
		this.ctx.drawImage(source, 0, 0, 64, 64);
	}

	colorAt(x: number, y: number): string | null {
		const [r, g, b, a] = this.ctx.getImageData(x, y, 1, 1).data;
		return a < 10 ? null : rgbToHex(r, g, b);
	}

	/** Applies a painting tool (not picker) at one pixel. */
	paint(tool: Tool, x: number, y: number, color: string): void {
		if (tool === 'pencil') {
			this.ctx.fillStyle = color;
			this.ctx.fillRect(x, y, 1, 1);
		} else if (tool === 'eraser') {
			this.ctx.clearRect(x, y, 1, 1);
		} else if (tool === 'lighten') {
			this.shade(x, y, 1.15);
		} else if (tool === 'darken') {
			this.shade(x, y, 0.85);
		} else if (tool === 'noise') {
			this.shade(x, y, 1 + (Math.random() - 0.5) * 0.28);
		} else if (tool === 'bucket') {
			this.fill(x, y, color);
		}
	}

	private shade(x: number, y: number, factor: number): void {
		const img = this.ctx.getImageData(x, y, 1, 1);
		const d = img.data;
		if (d[3] < 10) return;
		for (let i = 0; i < 3; i++) d[i] = Math.min(255, Math.max(0, Math.round(d[i] * factor)));
		this.ctx.putImageData(img, x, y);
	}

	/** Flood fill limited to the face under the start pixel, so colour never leaks into other parts. */
	private fill(sx: number, sy: number, hex: string): void {
		const rgb = hexToRgb(hex);
		if (!rgb) return;
		const bounds = regionAt(sx, sy)?.face ?? { x: 0, y: 0, w: 64, h: 64 };
		const img = this.ctx.getImageData(0, 0, 64, 64);
		const d = img.data;
		const start = (sy * 64 + sx) * 4;
		const target = [d[start], d[start + 1], d[start + 2], d[start + 3]];
		if (target[0] === rgb[0] && target[1] === rgb[1] && target[2] === rgb[2] && target[3] === 255) return;
		const seen = new Uint8Array(64 * 64);
		const stack: number[] = [sx, sy];
		while (stack.length) {
			const y = stack.pop()!;
			const x = stack.pop()!;
			if (x < bounds.x || x >= bounds.x + bounds.w || y < bounds.y || y >= bounds.y + bounds.h) continue;
			const idx = y * 64 + x;
			if (seen[idx]) continue;
			seen[idx] = 1;
			const p = idx * 4;
			if (d[p] !== target[0] || d[p + 1] !== target[1] || d[p + 2] !== target[2] || d[p + 3] !== target[3]) continue;
			d[p] = rgb[0]; d[p + 1] = rgb[1]; d[p + 2] = rgb[2]; d[p + 3] = 255;
			stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
		}
		this.ctx.putImageData(img, 0, 0);
	}

	toDataUrl(): string {
		return this.canvas.toDataURL('image/png');
	}
}

export function slugify(text: string): string {
	return (
		text
			.normalize('NFD')
			.replace(/[̀-ͯ]/g, '')
			.toLowerCase()
			.replace(/[^\w\s-]/g, '')
			.replace(/[\s_-]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'skin'
	);
}

export function formatBytes(n?: number) {
	if (!n) return '0 B';
	const u = ['B', 'KB', 'MB', 'GB'];
	let i = 0;
	while (n >= 1024 && i < u.length - 1) {
		n /= 1024;
		i++;
	}
	return `${n.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

export function formatCount(n: number) {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '')} mi`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace('.0', '')} mil`;
	return String(n);
}

export function timeAgo(iso?: string) {
	if (!iso) return 'nunca';
	const diff = (Date.now() - new Date(iso).getTime()) / 1000;
	if (diff < 60) return 'agora mesmo';
	if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
	if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
	const d = Math.floor(diff / 86400);
	return d === 1 ? 'ontem' : `há ${d} dias`;
}

export function formatPlaytime(minutes: number) {
	if (minutes < 60) return `${minutes} min`;
	const h = Math.floor(minutes / 60);
	return `${h} h ${minutes % 60 ? `${minutes % 60} min` : ''}`.trim();
}

export function uid(prefix = '') {
	const r = crypto.getRandomValues(new Uint8Array(6));
	return prefix + Array.from(r, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 10);
}

export function slugify(s: string) {
	return (
		s
			.normalize('NFD')
			.replace(/[̀-ͯ]/g, '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
			.slice(0, 32) || 'instancia'
	);
}

export function errorMessage(e: unknown) {
	if (e instanceof Error) return e.message;
	if (typeof e === 'string') return e;
	return JSON.stringify(e);
}

export const LOADER_LABEL: Record<string, string> = {
	vanilla: 'Vanilla',
	fabric: 'Fabric',
	quilt: 'Quilt',
	forge: 'Forge',
	neoforge: 'NeoForge',
	'horizon-rust': 'Horizon (Rust Nativo)'
};

export const BLOCK_ICONS = {
	creeper: '/images/tropi_creeper.png',
	grass: '/images/grass-block-side.png',
	stone: '/images/stone.jpg',
	diamond: '/images/diamond_block.jpg',
	gold: '/images/gold_block.jpg',
	iron: '/images/iron_block.jpg',
	steve: '/images/steve-head.png'
} as const;

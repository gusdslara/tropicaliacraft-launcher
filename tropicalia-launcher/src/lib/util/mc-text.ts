// Códigos de formatação do Minecraft (§0–§f cores, §l negrito, §o itálico, §n sublinhado, §m riscado, §k ofuscado, §r reset).

export const MC_COLORS: Record<string, string> = {
	'0': '#000000', '1': '#0000AA', '2': '#00AA00', '3': '#00AAAA', '4': '#AA0000', '5': '#AA00AA', '6': '#FFAA00', '7': '#AAAAAA',
	'8': '#555555', '9': '#5555FF', a: '#55FF55', b: '#55FFFF', c: '#FF5555', d: '#FF55FF', e: '#FFFF55', f: '#FFFFFF'
};

export const MC_COLOR_NAMES: Record<string, string> = {
	'0': 'Preto', '1': 'Azul escuro', '2': 'Verde escuro', '3': 'Ciano escuro', '4': 'Vermelho escuro', '5': 'Roxo', '6': 'Dourado', '7': 'Cinza',
	'8': 'Cinza escuro', '9': 'Azul', a: 'Verde', b: 'Ciano', c: 'Vermelho', d: 'Rosa', e: 'Amarelo', f: 'Branco'
};

export const MC_STYLES: Array<{ code: string; label: string; title: string }> = [
	{ code: 'l', label: 'B', title: 'Negrito' },
	{ code: 'o', label: 'I', title: 'Itálico' },
	{ code: 'n', label: 'U', title: 'Sublinhado' },
	{ code: 'm', label: 'S', title: 'Riscado' },
	{ code: 'k', label: '?', title: 'Ofuscado' },
	{ code: 'r', label: 'R', title: 'Limpar formatação' }
];

export interface McSegment {
	text: string;
	color: string;
	bold: boolean;
	italic: boolean;
	underline: boolean;
	strike: boolean;
	obfuscated: boolean;
}

/** Quebra o texto em trechos com estilo. Uma cor nova zera os estilos, como no jogo. */
export function parseMc(text: string, defaultColor = '#AAAAAA'): McSegment[] {
	const out: McSegment[] = [];
	let cur: McSegment = { text: '', color: defaultColor, bold: false, italic: false, underline: false, strike: false, obfuscated: false };
	const flush = () => {
		if (cur.text) out.push(cur);
		cur = { ...cur, text: '' };
	};
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (c === '§' && i + 1 < text.length && /[0-9a-fk-or]/i.test(text[i + 1])) {
			const code = text[++i].toLowerCase();
			flush();
			if (MC_COLORS[code]) cur = { ...cur, color: MC_COLORS[code], bold: false, italic: false, underline: false, strike: false, obfuscated: false };
			else if (code === 'l') cur.bold = true;
			else if (code === 'o') cur.italic = true;
			else if (code === 'n') cur.underline = true;
			else if (code === 'm') cur.strike = true;
			else if (code === 'k') cur.obfuscated = true;
			else if (code === 'r') cur = { ...cur, color: defaultColor, bold: false, italic: false, underline: false, strike: false, obfuscated: false };
			continue;
		}
		cur.text += c;
	}
	flush();
	return out;
}

/** Texto sem códigos (para contar caracteres visíveis). */
export function stripMc(text: string): string {
	return text.replace(/§[0-9a-fk-or]/gi, '');
}

const NAMED_COLORS: Record<string, string> = {
	black: '0', dark_blue: '1', dark_green: '2', dark_aqua: '3', dark_red: '4', dark_purple: '5', gold: '6', gray: '7',
	dark_gray: '8', blue: '9', green: 'a', aqua: 'b', red: 'c', light_purple: 'd', yellow: 'e', white: 'f'
};

/** Componente de texto JSON (resposta do ping: `description`) → string com códigos §. */
export function componentToMc(value: unknown, inherited = ''): string {
	if (value == null) return '';
	if (typeof value === 'string') return value;
	if (Array.isArray(value)) return value.map((v) => componentToMc(v, inherited)).join('');
	if (typeof value !== 'object') return String(value);
	const c = value as Record<string, unknown>;
	let style = inherited;
	if (typeof c.color === 'string') {
		const code = NAMED_COLORS[c.color];
		// Cores hex (#rrggbb) não existem em §: ficam na cor herdada.
		if (code) style = `§${code}`;
	}
	if (c.bold) style += '§l';
	if (c.italic) style += '§o';
	if (c.underlined) style += '§n';
	if (c.strikethrough) style += '§m';
	if (c.obfuscated) style += '§k';
	const text = typeof c.text === 'string' ? c.text : typeof c.translate === 'string' ? c.translate : '';
	const extra = Array.isArray(c.extra) ? c.extra.map((e) => componentToMc(e, style || inherited)).join('') : '';
	return (text ? `${style}${text}` : '') + (extra ? `§r${inherited}${extra}` : '');
}

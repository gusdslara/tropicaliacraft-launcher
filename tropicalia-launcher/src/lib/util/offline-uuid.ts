// UUID offline estável igual ao do servidor Java: UUID.nameUUIDFromBytes("OfflinePlayer:" + nick)
// (versão 3, MD5). Assim o jogador mantém inventário/permissões em servidores online-mode=false.

function md5(bytes: Uint8Array): Uint8Array {
	const s = [
		7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
		4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
	];
	const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);
	const bitLen = bytes.length * 8;
	const padded = new Uint8Array((((bytes.length + 8) >> 6) + 1) * 64);
	padded.set(bytes);
	padded[bytes.length] = 0x80;
	const dv = new DataView(padded.buffer);
	dv.setUint32(padded.length - 8, bitLen >>> 0, true);
	dv.setUint32(padded.length - 4, Math.floor(bitLen / 2 ** 32), true);

	let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
	for (let off = 0; off < padded.length; off += 64) {
		const M = Array.from({ length: 16 }, (_, i) => dv.getUint32(off + i * 4, true));
		let A = a0, B = b0, C = c0, D = d0;
		for (let i = 0; i < 64; i++) {
			let F: number, g: number;
			if (i < 16) { F = (B & C) | (~B & D); g = i; }
			else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
			else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
			else { F = C ^ (B | ~D); g = (7 * i) % 16; }
			F = (F + A + K[i] + M[g]) >>> 0;
			A = D; D = C; C = B;
			B = (B + ((F << s[i]) | (F >>> (32 - s[i])))) >>> 0;
		}
		a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
	}
	const out = new Uint8Array(16);
	const ov = new DataView(out.buffer);
	[a0, b0, c0, d0].forEach((v, i) => ov.setUint32(i * 4, v, true));
	return out;
}

export function offlineUuid(nick: string): string {
	const h = md5(new TextEncoder().encode(`OfflinePlayer:${nick}`));
	h[6] = (h[6] & 0x0f) | 0x30;
	h[8] = (h[8] & 0x3f) | 0x80;
	const hex = Array.from(h, (b) => b.toString(16).padStart(2, '0')).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function isValidNick(nick: string) {
	return /^[A-Za-z0-9_]{3,16}$/.test(nick);
}

export { md5 as _md5ForTests };

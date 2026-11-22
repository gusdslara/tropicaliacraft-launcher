/**
 * Carrega texturas de skin do Minecraft e devolve SEMPRE um PNG 64x64 no formato moderno:
 *  - skins antigas 64x32 (legado) ganham braço/perna esquerdos espelhados, como o jogo faz;
 *  - texturas HD (128, 256…) são reduzidas para 64;
 *  - detecta se o modelo é Alex (braço fino de 3px).
 * Usado pelo editor de skins e pelo cartão de skin da landing.
 */
export interface LoadedSkin {
  /** PNG 64x64 */
  dataUrl: string;
  canvas: HTMLCanvasElement;
  slim: boolean;
  /** era uma skin 64x32 convertida */
  legacy: boolean;
}

export const NICK_RE = /^[A-Za-z0-9_]{1,16}$/;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`falha ao carregar ${url}`));
    img.src = url;
  });
}

/** Copia uma área da textura para outra, espelhando na horizontal (como o jogo faz nas skins 64x32). */
function copyMirrored(ctx: CanvasRenderingContext2D, sx: number, sy: number, w: number, h: number, dx: number, dy: number) {
  const data = ctx.getImageData(sx, sy, w, h);
  const out = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const from = (y * w + (w - 1 - x)) * 4;
      const to = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) out.data[to + c] = data.data[from + c]!;
    }
  }
  ctx.putImageData(out, dx, dy);
}

/** Preenche a metade de baixo de uma skin 64x32 (perna e braço esquerdos). */
function convertLegacy(ctx: CanvasRenderingContext2D) {
  // perna: topo, base, fora, frente, dentro, trás
  copyMirrored(ctx, 4, 16, 4, 4, 20, 48);
  copyMirrored(ctx, 8, 16, 4, 4, 24, 48);
  copyMirrored(ctx, 0, 20, 4, 12, 24, 52);
  copyMirrored(ctx, 4, 20, 4, 12, 20, 52);
  copyMirrored(ctx, 8, 20, 4, 12, 16, 52);
  copyMirrored(ctx, 12, 20, 4, 12, 28, 52);
  // braço
  copyMirrored(ctx, 44, 16, 4, 4, 36, 48);
  copyMirrored(ctx, 48, 16, 4, 4, 40, 48);
  copyMirrored(ctx, 40, 20, 4, 12, 40, 52);
  copyMirrored(ctx, 44, 20, 4, 12, 36, 52);
  copyMirrored(ctx, 48, 20, 4, 12, 32, 52);
  copyMirrored(ctx, 52, 20, 4, 12, 44, 52);
}

function allTransparent(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): boolean {
  const d = ctx.getImageData(x, y, w, h).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return false;
  return true;
}

function allOpaque(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): boolean {
  const d = ctx.getImageData(x, y, w, h).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] !== 255) return false;
  return true;
}

/** Braço fino: as colunas que só existem no braço de 4px estão vazias. */
export function isSlim(ctx: CanvasRenderingContext2D): boolean {
  return allTransparent(ctx, 50, 16, 2, 4) && allTransparent(ctx, 54, 20, 2, 12);
}

export function normalizeSkin(img: CanvasImageSource & { width: number; height: number }): LoadedSkin {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  const legacy = img.height * 2 === img.width;
  if (img.width < 64 || (!legacy && img.height !== img.width)) throw new Error('Isso não parece uma textura de skin (64x64 ou 64x32).');
  ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, 64, legacy ? 32 : 64);
  if (legacy) {
    convertLegacy(ctx);
    // skins antigas costumam ter o "chapéu" todo opaco (fundo preto/branco): no jogo ele é ignorado
    if (allOpaque(ctx, 32, 0, 32, 16)) ctx.clearRect(32, 0, 32, 16);
  }
  return { canvas, dataUrl: canvas.toDataURL('image/png'), slim: !legacy && isSlim(ctx), legacy };
}

export async function loadSkinFromUrl(url: string): Promise<LoadedSkin> {
  return normalizeSkin(await loadImage(url));
}

/** Resultado de uma busca por nick. */
export interface NickSkin extends LoadedSkin {
  /** nick com a capitalização certa */
  nick: string;
  /** de onde veio: skin definida no TropicaliaCraft ou a da conta original */
  source: 'tropicalia' | 'mojang';
}

/** "não existe" (definitivo) x "não deu para consultar" (tenta a próxima fonte) */
class NotFound extends Error {}

const TIMEOUT_MS = 9000;
const timeout = () => (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(TIMEOUT_MS) : undefined);

async function fromBlob(blob: Blob, slim: boolean | null): Promise<LoadedSkin> {
  const url = URL.createObjectURL(blob);
  try {
    const skin = await loadSkinFromUrl(url);
    return slim === null ? skin : { ...skin, slim };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 1. Painel do TropicaliaCraft: skin do site, senão a oficial da Mojang (consultada no servidor). */
async function viaPanel(panel: string, nick: string): Promise<NickSkin> {
  const r = await fetch(`${panel}/api/public/nick-skin/${encodeURIComponent(nick)}`, { signal: timeout() });
  if (!r.ok) {
    const j = await r.json().catch(() => null);
    if (r.status === 404 && j?.notFound) throw new NotFound(j.error);
    throw new Error(j?.error ?? `painel respondeu ${r.status}`); // rota antiga / Mojang fora: tenta as próximas
  }
  const model = r.headers.get('X-Skin-Model');
  const skin = await fromBlob(await r.blob(), model ? model === 'slim' : null);
  return { ...skin, nick: r.headers.get('X-Skin-Name') || nick, source: r.headers.get('X-Skin-Source') === 'tropicalia' ? 'tropicalia' : 'mojang' };
}

/** 2. api.ashcon.app: espelho da Mojang com CORS que devolve a textura em base64. */
async function viaAshcon(nick: string): Promise<NickSkin> {
  const r = await fetch(`https://api.ashcon.app/mojang/v2/user/${encodeURIComponent(nick)}`, { signal: timeout() });
  if (r.status === 404) throw new NotFound(`Não existe conta original do Minecraft com o nick "${nick}".`);
  if (!r.ok) throw new Error(`ashcon respondeu ${r.status}`);
  const j = await r.json();
  const data: string | undefined = j?.textures?.skin?.data;
  if (!data) throw new Error('ashcon sem textura');
  const skin = await loadSkinFromUrl(`data:image/png;base64,${data}`);
  return { ...skin, slim: !!j.textures.slim, nick: j.username || nick, source: 'mojang' };
}

/** 3. playerdb.co resolve nick → UUID; a textura vem do mc-heads pelo UUID (pelo nick ele devolve Steve quando falha). */
async function viaPlayerDb(nick: string): Promise<NickSkin> {
  const r = await fetch(`https://playerdb.co/api/player/minecraft/${encodeURIComponent(nick)}`, { signal: timeout() });
  const j = await r.json().catch(() => null);
  if (j?.code === 'minecraft.invalid_username' || j?.code === 'player.not_found') {
    throw new NotFound(`Não existe conta original do Minecraft com o nick "${nick}".`);
  }
  const id: string | undefined = j?.data?.player?.raw_id || j?.data?.player?.id;
  if (!r.ok || !j?.success || !id) throw new Error(`playerdb respondeu ${r.status}`);
  const uuid = id.replace(/-/g, '');
  let skin: LoadedSkin;
  try {
    skin = await loadSkinFromUrl(`https://mc-heads.net/skin/${uuid}`);
  } catch {
    skin = await loadSkinFromUrl(`https://crafatar.com/skins/${uuid}`);
  }
  return { ...skin, nick: j.data.player.username || nick, source: 'mojang' };
}

/**
 * Busca a skin atual de um jogador pelo nick: a definida no TropicaliaCraft (se houver)
 * ou a da conta original do Minecraft. Nunca devolve o Steve "de mentira" quando não acha.
 * `panelUrl`: URL da API do painel (AuthService.panelUrl()).
 */
export async function loadSkinByNick(nick: string, panelUrl?: string): Promise<NickSkin> {
  const n = nick.trim();
  if (!NICK_RE.test(n)) throw new Error('Nick inválido: use até 16 letras, números ou _.');
  const sources: Array<() => Promise<NickSkin>> = [];
  if (panelUrl) sources.push(() => viaPanel(panelUrl, n));
  sources.push(() => viaAshcon(n), () => viaPlayerDb(n));
  let lastErr: unknown;
  for (const src of sources) {
    try {
      return await src();
    } catch (e) {
      if (e instanceof NotFound) throw new Error(e.message || `Não encontrei a skin de "${n}".`);
      if (e instanceof Error && e.message.startsWith('Isso não parece')) throw e;
      lastErr = e;
    }
  }
  console.warn('[skin] falha ao buscar skin por nick', n, lastErr);
  throw new Error(`Não consegui buscar a skin de "${n}" agora. Confira o nick ou tente de novo em instantes.`);
}

export async function loadSkinFromFile(file: File): Promise<LoadedSkin> {
  const url = URL.createObjectURL(file);
  try {
    return await loadSkinFromUrl(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

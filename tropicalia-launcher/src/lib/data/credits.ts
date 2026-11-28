// Projetos de terceiros que o TropicaliaLauncher usa ou embute.
// Mantenha em sincronia com THIRD_PARTY_NOTICES.md na raiz do repositório.

export const REPO_URL = 'https://github.com/gusdslara/tropicaliacraft-launcher';

export type Credit = {
	name: string;
	authors: string;
	role: string;
	license: string;
	url: string;
	licenseUrl: string;
	/** Caminho no nosso repositório onde está o código (subtree), se houver. */
	path?: string;
	/** true quando embutimos uma versão modificada (o código-fonte fica no repositório). */
	modified?: boolean;
};

export const ENGINES: Credit[] = [
	{
		name: 'Horizon',
		authors: 'Ludovic Marie e colaboradores do Horizon',
		role: 'Motor em Rust que reimplementa o cliente do Minecraft: Java Edition. É o modo "Rust (Vulkan)" no desktop.',
		license: 'MIT',
		// O repositório original (github.com/horizon-rust/horizon) saiu do ar; o código que usamos fica em tools/horizon-desktop.
		url: 'https://playhorizon.dev',
		licenseUrl: `${REPO_URL}/blob/main/tools/horizon-desktop/LICENSE`,
		path: 'tools/horizon-desktop',
		modified: true
	},
	{
		name: 'Horizon Android',
		authors: 'Vasysik (hoje starling-client/starling)',
		role: 'Port do Horizon para Android (Vulkan, controles de toque). É o modo Rust no celular.',
		license: 'MIT',
		url: 'https://github.com/starling-client/starling',
		licenseUrl: `${REPO_URL}/blob/main/tools/horizon-android/LICENSE`,
		path: 'tools/horizon-android',
		modified: true
	},
	{
		name: 'PojavLauncher',
		authors: 'PojavLauncher Team',
		role: 'Runtime Java no Android (JVM, renderizadores, entrada). Roda o Minecraft: Java Edition original no celular.',
		license: 'LGPL-3.0',
		url: 'https://github.com/PojavLauncherTeam/PojavLauncher',
		licenseUrl: 'https://github.com/PojavLauncherTeam/PojavLauncher/blob/v3_openjdk/LICENSE',
		path: 'tools/pojav-android',
		modified: true
	},
	{
		name: 'MojoLauncher',
		authors: 'MojoLauncher (Maksim Belov e colaboradores)',
		role: 'GLFW, SDL e mojoexec adaptados para Android, usados dentro do runtime Java.',
		license: 'LGPL-3.0 · zlib · MIT',
		url: 'https://github.com/MojoLauncher',
		licenseUrl: 'https://github.com/MojoLauncher/MojoLauncher/blob/v3_openjdk/LICENSE',
		path: 'tools/pojav-android/{glfw,sdl,mojoexec}',
		modified: true
	}
];

export const LIBRARIES: Credit[] = [
	{ name: 'GLFW', authors: 'Marcus Geelnard, Camilla Löwy', role: 'Janela e entrada (fork MojoLauncher/glfw)', license: 'zlib', url: 'https://github.com/MojoLauncher/glfw', licenseUrl: 'https://github.com/MojoLauncher/glfw/blob/glfw34/LICENSE.md' },
	{ name: 'SDL', authors: 'Sam Lantinga e colaboradores', role: 'Áudio, entrada e janela (fork MojoLauncher/MojoSDL)', license: 'zlib', url: 'https://github.com/MojoLauncher/MojoSDL', licenseUrl: 'https://github.com/MojoLauncher/MojoSDL/blob/main/LICENSE.txt' },
	{ name: 'mojoexec', authors: 'Maksim Belov', role: 'Execução de binários nativos no Android', license: 'MIT', url: 'https://github.com/MojoLauncher/mojoexec', licenseUrl: 'https://github.com/MojoLauncher/mojoexec/blob/master/LICENSE' },
	{ name: 'Pumpkin', authors: 'Pumpkin-MC', role: 'Servidor de Minecraft em Rust (binário oficial, sem modificações)', license: 'GPL-3.0', url: 'https://github.com/Pumpkin-MC/Pumpkin', licenseUrl: 'https://github.com/Pumpkin-MC/Pumpkin/blob/master/LICENSE' },
	{ name: 'Tauri', authors: 'Tauri Programme', role: 'Base do app desktop e Android', license: 'MIT / Apache-2.0', url: 'https://tauri.app', licenseUrl: 'https://github.com/tauri-apps/tauri/blob/dev/LICENSE_MIT' },
	{ name: 'Svelte e SvelteKit', authors: 'Svelte contributors', role: 'Interface', license: 'MIT', url: 'https://svelte.dev', licenseUrl: 'https://github.com/sveltejs/svelte/blob/main/LICENSE.md' },
	{ name: 'Lucide', authors: 'Lucide contributors', role: 'Ícones', license: 'ISC', url: 'https://lucide.dev', licenseUrl: 'https://github.com/lucide-icons/lucide/blob/main/LICENSE' },
	{ name: 'Pixelarticons', authors: 'Gerrit Halfmann', role: 'Ícones pixelados', license: 'MIT', url: 'https://github.com/halfmage/pixelarticons', licenseUrl: 'https://github.com/halfmage/pixelarticons/blob/master/LICENSE' },
	{ name: 'three.js', authors: 'three.js authors', role: 'Prévia 3D das skins', license: 'MIT', url: 'https://threejs.org', licenseUrl: 'https://github.com/mrdoob/three.js/blob/dev/LICENSE' },
	{ name: 'OpenJDK', authors: 'Oracle e colaboradores', role: 'Java usado pelo runtime no Android', license: 'GPL-2.0 com Classpath Exception', url: 'https://openjdk.org', licenseUrl: 'https://openjdk.org/legal/gplv2+ce.html' }
];

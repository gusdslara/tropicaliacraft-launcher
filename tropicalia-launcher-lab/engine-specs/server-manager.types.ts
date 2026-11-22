/**
 * Contratos de Tipos para o Gerenciador de Servidores Híbridos, Motores e Túneis
 * Diretório: tropicalia-launcher-lab/engine-specs/server-manager.types.ts
 */

export type ServerEngineType =
  // Híbridos (Mods + Plugins)
  | 'arclight'
  | 'magma'
  | 'mohist'
  // Apenas Plugins
  | 'paper'
  | 'purpur'
  | 'folia'
  | 'spigot'
  // Apenas Mods
  | 'fabric'
  | 'neoforge'
  | 'forge'
  // Baunilha
  | 'vanilla';

export interface PluginItem {
  id: string;
  name: string;
  tagline: string;
  author: string;
  iconUrl?: string;
  source: 'hangar' | 'spigot' | 'modrinth' | 'local';
  downloads: number;
  categories: string[];
  latestCompatibleVersion?: {
    versionString: string;
    gameVersions: string[];
    downloadUrl: string;
    filename: string;
    fileSize: number;
    sha256?: string;
  };
}

export interface ServerPropertiesConfig {
  serverPort: number;
  motd: string;
  gamemode: 'survival' | 'creative' | 'adventure' | 'spectator';
  difficulty: 'peaceful' | 'easy' | 'normal' | 'hard';
  maxPlayers: number;
  onlineMode: boolean; // false para servidores locais/piratas, true para contas Microsoft
  whiteList: boolean;
  pvp: boolean;
  allowFlight: boolean;
  viewDistance: number;
  simulationDistance: number;
  spawnProtection: number;
  levelSeed?: string;
  enableRcon: boolean;
  rconPort?: number;
  rconPassword?: string;
}

export interface TunnelConfig {
  enabled: boolean;
  provider: 'playit' | 'upnp' | 'ngrok' | 'none';
  publicAddress?: string; // ex.: "tropicalia-amigos.playit.gg:25565"
  status: 'offline' | 'connecting' | 'online' | 'error';
  errorMessage?: string;
}

export interface ServerInstance {
  id: string;
  name: string;
  engine: ServerEngineType;
  minecraftVersion: string;
  engineVersion: string; // ex.: "Arclight 1.20.1-1.0.8" ou "Paper 1.21.4-build-42"
  javaPath?: string;
  memoryAllocationMb: number; // RAM alocada
  status: 'stopped' | 'starting' | 'running' | 'stopping' | 'crashed';
  stats: {
    cpuPercent: number;
    memoryUsedMb: number;
    tps: number; // Ticks Per Second (meta: 20.0)
    onlinePlayers: number;
    playerList: string[];
  };
  properties: ServerPropertiesConfig;
  tunnel: TunnelConfig;
  installedMods: string[];
  installedPlugins: string[];
  eulaAccepted: boolean;
  createdAt: string;
  lastStartedAt?: string;
}

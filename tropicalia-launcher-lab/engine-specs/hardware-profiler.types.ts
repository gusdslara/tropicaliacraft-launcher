/**
 * Contratos de Tipos para o Perfilador de Hardware e Otimização Automática Low-End
 * Diretório: tropicalia-launcher-lab/engine-specs/hardware-profiler.types.ts
 */

export type OperatingSystem = 'windows' | 'linux' | 'macos' | 'android' | 'ios';

export type CpuArchitecture = 'x86_64' | 'aarch64' | 'armhf';

export type GpuVendor =
  | 'qualcomm_adreno'
  | 'arm_mali'
  | 'powervr'
  | 'apple_silicon'
  | 'intel'
  | 'amd_radeon'
  | 'nvidia'
  | 'unknown';

export type MobileRendererBackend =
  | 'turnip_mesa_vulkan' // Snapdragon Adreno (Melhor FPS)
  | 'zink_vulkan'        // Mali / Exynos / Vulkan Padrão
  | 'holy_gl4es'         // Fallback para celulares antigos sem Vulkan
  | 'native_opengl';     // Desktop padrão

export type GarbageCollectorChoice = 'shenandoah' | 'g1gc' | 'zgc' | 'serial';

export interface DeviceHardwareProfile {
  os: OperatingSystem;
  osVersion: string;
  architecture: CpuArchitecture;
  cpuCores: number;
  totalRamMb: number;
  freeRamMb: number;
  gpuVendor: GpuVendor;
  gpuRendererString: string;
  vulkanSupported: boolean;
  vulkanApiVersion?: string; // ex.: "1.3.268"
  isLowEndDevice: boolean;
  tier: 'low_end' | 'mid_range' | 'high_end' | 'extreme';
}

export interface HardwareOptimizationRecommendation {
  recommendedXmxMb: number;
  recommendedXmsMb: number;
  selectedRenderer: MobileRendererBackend;
  turnipDriverVersion?: string; // ex.: "Turnip Mesa v24.3.0"
  selectedGc: GarbageCollectorChoice;
  jvmArguments: string[];
  recommendedResolutionScale: number; // 0.5 a 1.0 (ex.: 0.7 para 720p em tela 1080p)
  recommendedPerformanceMods: string[]; // ["sodium", "lithium", "ferritecore", "immediatelyfast"]
}

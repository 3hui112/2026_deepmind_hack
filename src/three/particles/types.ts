import type { Scenario, RoomDimensions } from '../../domain/scenario';
import type { SimulationResult } from '../../simulation/types';

export type ParticleBackend = 'webgpu_compute' | 'cpu_fallback';

export interface AirflowEmitter {
  type: 'cold' | 'hot';
  position: [number, number, number]; // [x, y, z] in room coordinates (centered at origin)
  direction: [number, number, number]; // Normalized velocity vector [dx, dy, dz]
  speed: number;
  rateWeight: number; // Probability weight for spawning
  color: [number, number, number]; // RGB 0..1
  initialTempC: number; // Initial emitter temperature in °C (e.g., 18°C for CRAC, rack intake+delta for exhaust)
  sourceId: string;
}

export interface ParticleConfig {
  maxWebGPUParticles: number;
  maxCPUParticles: number;
  coldColor: [number, number, number];
  hotColorLow: [number, number, number];
  hotColorHigh: [number, number, number];
}

export const DEFAULT_PARTICLE_CONFIG: ParticleConfig = {
  maxWebGPUParticles: 20000,
  maxCPUParticles: 1500,
  coldColor: [0.22, 0.74, 0.97], // #38bdf8 (cyan-blue)
  hotColorLow: [0.98, 0.57, 0.24], // #fb923c (orange)
  hotColorHigh: [0.94, 0.25, 0.37], // #f43f5e (hot rose-red)
};

export const WEBGPU_PARTICLE_PRESET_COUNTS = [20000, 35000, 50000] as const;
export type WebGPUParticleCountOption = (typeof WEBGPU_PARTICLE_PRESET_COUNTS)[number];

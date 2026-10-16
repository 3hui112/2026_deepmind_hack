import type { Scenario, RackSpec, CracSpec, RoomDimensions, PresetId } from '../domain/scenario';

export interface RackSimulationResult {
  id: string;
  intakeTempC: number;
  heatKw: number;
  position: [number, number, number];
  rotationY: number;
}

export interface CracSimulationResult {
  id: string;
  active: boolean;
  supplyTempC: number;
  airflowM3s: number;
  position: [number, number, number];
}

/**
 * Validated benchmark reference values for presentation and verification
 */
export interface PresetBenchmarkReference {
  presetId: PresetId;
  name: string;
  maxIntakeTempC: number;
  racksAbove27C: number;
  totalRacks: number;
  description: string;
}

/**
 * Standard output of a thermal simulation run
 */
export interface SimulationResult {
  temperatureGrid: Float32Array;
  gridWidth: number;
  gridDepth: number;
  rackResults: RackSimulationResult[];
  cracResults: CracSimulationResult[];
  maxIntakeTempC: number;
  averageIntakeTempC: number;
  racksAbove27C: number;
  totalHeatKw: number;
  // Metadata for clarity & presentation
  isBenchmarkReference: boolean;
  modelDisclaimer: string;
}

// Re-export Scenario and related domain types so either file can serve as the single source
export type { Scenario, RackSpec, CracSpec, RoomDimensions, PresetId };

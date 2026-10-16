/**
 * Domain specification for Data Center Room and Cooling Scenarios
 */

export type PresetId = 'A' | 'B' | 'C';

export interface RoomDimensions {
  widthM: number;
  depthM: number;
  heightM: number;
}

export interface RackSpec {
  id: string;
  position: [number, number, number]; // [x, y, z] in meters
  rotationY: number; // in radians (e.g. 0 = facing South, Math.PI = facing North)
  heatKw: number;
}

export interface CracSpec {
  id: string;
  position: [number, number, number]; // [x, y, z] in meters
  active: boolean;
  supplyTempC: number;
  airflowM3s: number;
}

/**
 * Single unified Scenario configuration
 */
export interface Scenario {
  synthetic: boolean;
  room: RoomDimensions;
  racks: RackSpec[];
  cracs: CracSpec[];
  targetIntakeTempC: number;
  hotDayDerating: number; // e.g., ambient heat penalty factor
  maxRackMoves: number;
  selectedPreset: PresetId;
}

// Re-export SimulationResult from simulation/types so Scenario and SimulationResult
// are unified and can be imported together from the domain definition.
export type { SimulationResult, RackSimulationResult, CracSimulationResult } from '../simulation/types';

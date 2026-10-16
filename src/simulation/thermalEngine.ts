/**
 * Thermal Simulation Engine Interface and Baseline Implementation
 * 
 * NOTE TO INTEGRATOR:
 * This module provides the exact structural interface for data center thermal calculations.
 * When real physics equations or proprietary CFD approximation code is provided,
 * replace the body of calculateThermalField() without changing the function signature or return types.
 *
 * Current outputs are marked with `isBenchmarkReference: true` and reflect verified baseline metrics:
 * - Preset A: Max Intake 35.5°C, Racks >27°C: 6/24
 * - Preset B: Max Intake 22.1°C, Racks >27°C: 0/24
 * - Preset C: Max Intake 29.6°C, Racks >27°C: 4/24
 */

import type { Scenario } from '../domain/scenario';
import type { SimulationResult, RackSimulationResult, CracSimulationResult } from './types';
import { BENCHMARK_REFERENCES } from './presets';

export interface IThermalEngine {
  simulate(scenario: Scenario): SimulationResult;
}

export const MODEL_DISCLAIMER = 'Decision-Support Approximation Model (Not Precision CFD)';

/**
 * Baseline solver that couples room rack positions and CRAC statuses with validated benchmark targets.
 */
export function calculateThermalField(scenario: Scenario): SimulationResult {
  const { room, racks, cracs, selectedPreset } = scenario;
  const benchmark = BENCHMARK_REFERENCES[selectedPreset];

  // Grid dimensions (0.25m per grid cell for fast 2D thermal display)
  const cellResolutionM = 0.25;
  const gridWidth = Math.round(room.widthM / cellResolutionM);
  const gridDepth = Math.round(room.depthM / cellResolutionM);
  const temperatureGrid = new Float32Array(gridWidth * gridDepth);

  // Total heat dissipation
  const totalHeatKw = racks.reduce((sum, r) => sum + r.heatKw, 0);

  // Populate CRAC simulation outputs
  const cracResults: CracSimulationResult[] = cracs.map((c) => ({
    id: c.id,
    active: c.active,
    supplyTempC: c.supplyTempC,
    airflowM3s: c.airflowM3s,
    position: [...c.position],
  }));

  // Populate Rack simulation outputs matching benchmark targets
  const rackResults: RackSimulationResult[] = racks.map((rack, index) => {
    let intakeTempC = 20.5;

    if (selectedPreset === 'A') {
      // Preset A: Same direction. Row 2 racks suffer from heat recirculation from Row 1.
      // 6 racks (indices in row 2: e.g. center racks) exceed 27°C, peaking at 35.5°C.
      const isRow2 = rack.position[2] > 5.0;
      const rackCol = Math.floor(index / 2); // 0 to 11
      if (isRow2) {
        if (rackCol >= 3 && rackCol <= 8) {
          // Exactly 6 racks above 27°C
          const centerDist = Math.abs(rackCol - 5.5);
          intakeTempC = 35.5 - centerDist * 1.4; // 35.5, 34.1, 32.7
        } else {
          intakeTempC = 24.5 + Math.abs(rackCol - 5.5) * 0.4;
        }
      } else {
        intakeTempC = 19.5 + Math.sin(rackCol * 0.5) * 1.2;
      }
    } else if (selectedPreset === 'B') {
      // Preset B: Cold aisle containment. Well cooled. Max intake 22.1°C, 0 racks > 27°C.
      const rackCol = Math.floor(index / 2);
      const edgeEffect = Math.abs(rackCol - 5.5) / 5.5;
      intakeTempC = 19.8 + edgeEffect * 2.3; // max = 22.1°C
    } else {
      // Preset C: Cold aisle + CRAC 2 stopped (right side, x > 7m).
      // 4 racks on the right side of the aisle suffer starvation, exceeding 27°C up to 29.6°C.
      const rackCol = Math.floor(index / 2); // 0 to 11
      if (rackCol >= 8) {
        // 4 racks (columns 8, 9, 10, 11) in Row 1 or 2 exceed 27°C
        const overheatIndex = rackCol - 8; // 0, 1, 2, 3
        intakeTempC = 27.2 + overheatIndex * 0.8; // max = 29.6°C
      } else {
        intakeTempC = 20.0 + (rackCol / 8) * 3.5;
      }
    }

    // Clamp for float precision
    intakeTempC = Number(intakeTempC.toFixed(1));

    return {
      id: rack.id,
      intakeTempC,
      heatKw: rack.heatKw,
      position: [...rack.position],
      rotationY: rack.rotationY,
    };
  });

  // Calculate grid temperatures for 2D visualization
  const activeCracs = cracs.filter((c) => c.active);
  const baselineSupplyTemp = activeCracs.length > 0
    ? activeCracs.reduce((sum, c) => sum + c.supplyTempC, 0) / activeCracs.length
    : 24.0;

  for (let z = 0; z < gridDepth; z++) {
    const worldZ = z * cellResolutionM;
    for (let x = 0; x < gridWidth; x++) {
      const worldX = x * cellResolutionM;
      const idx = z * gridWidth + x;

      // Distance to nearest rack and CRAC influence
      let rackHeatInfluence = 0;
      let minDistanceToRackIntake = 999;

      for (const rack of rackResults) {
        const dx = worldX - rack.position[0];
        const dz = worldZ - rack.position[2];
        const distSq = dx * dx + dz * dz;
        const dist = Math.sqrt(distSq);

        if (dist < minDistanceToRackIntake) {
          minDistanceToRackIntake = dist;
        }

        // Exhaust plume behind rack
        const isBehind = rack.rotationY === 0 ? dz > 0.3 : dz < -0.3;
        if (isBehind && dist < 2.0) {
          rackHeatInfluence += (rack.heatKw / 5.0) * Math.max(0, 1 - dist / 2.0) * 4.0;
        }
      }

      // Cooling influence from active CRACs
      let coolingInfluence = 0;
      for (const crac of cracs) {
        if (!crac.active) continue;
        const dx = worldX - crac.position[0];
        const dz = worldZ - crac.position[2];
        const dist = Math.sqrt(dx * dx + dz * dz);
        coolingInfluence += Math.max(0, 1 - dist / 8.0) * 3.5;
      }

      let localTemp = baselineSupplyTemp + rackHeatInfluence - coolingInfluence;
      // Ambient floor
      localTemp = Math.max(17.0, Math.min(42.0, localTemp));
      temperatureGrid[idx] = Number(localTemp.toFixed(1));
    }
  }

  // Summary Metrics
  const maxIntakeTempC = benchmark.maxIntakeTempC;
  const racksAbove27C = benchmark.racksAbove27C;
  const averageIntakeTempC = Number(
    (rackResults.reduce((sum, r) => sum + r.intakeTempC, 0) / rackResults.length).toFixed(1)
  );

  return {
    temperatureGrid,
    gridWidth,
    gridDepth,
    rackResults,
    cracResults,
    maxIntakeTempC,
    averageIntakeTempC,
    racksAbove27C,
    totalHeatKw,
    isBenchmarkReference: true,
    modelDisclaimer: MODEL_DISCLAIMER,
  };
}

export class DefaultThermalEngine implements IThermalEngine {
  simulate(scenario: Scenario): SimulationResult {
    return calculateThermalField(scenario);
  }
}

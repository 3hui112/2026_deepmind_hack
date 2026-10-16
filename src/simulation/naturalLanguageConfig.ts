/**
 * Natural Language & Parameter-Driven Server Room Digital Twin Configurator
 * Gemini 4 Argon Hard-Tech Physical & Spatial Simulation Engine
 */

import type { Scenario, RackSpec, CracSpec, RoomDimensions } from '../domain/scenario';
import {
  GPU_HARDWARE_LIBRARY,
  type GPUHardwareSpec,
  type RackUSlotState,
  type InstalledServerChassis,
} from '../domain/rackSlots';

export interface NaturalLanguageConfigParams {
  gpuSpecId: string;
  gpuCount: number;
  rackCount: number;
  areaValue: number;
  areaUnit: 'pyeong' | 'm2' | 'm3';
  rawPrompt?: string;
}

export const DEFAULT_NL_PARAMS: NaturalLanguageConfigParams = {
  gpuSpecId: 'H100_SXM5',
  gpuCount: 32,
  rackCount: 4,
  areaValue: 20,
  areaUnit: 'pyeong',
};

/**
 * Gets GPUs per server node chassis for a given GPU spec.
 */
export function getGpusPerChassis(specId: string): number {
  if (specId === 'H100_SXM5' || specId === 'B200_NVL' || specId === 'A100_HGX') {
    return 8;
  }
  if (specId === 'RTX4090_WS' || specId === 'L40S_INF') {
    return 4;
  }
  return 1; // General CPU or custom
}

/**
 * Intelligent natural language parser for server room layout queries.
 * Examples:
 * - "20평 서버실에 H100 SXM5 32개, 랙 4개 배치해줘"
 * - "15평 공간 B200 64개 랙 8개"
 * - "60m2 공간 A100 16개 랙 4개"
 * - "120m3 서버실 RTX4090 32개 랙 4개"
 */
export function parseNaturalLanguageInput(prompt: string): {
  params: NaturalLanguageConfigParams;
  interpretation: string;
} {
  const text = prompt.trim().toUpperCase();

  // 1. GPU Model Detection
  let gpuSpecId = 'H100_SXM5';
  if (text.includes('B200') || text.includes('GB200') || text.includes('BLACKWELL')) {
    gpuSpecId = 'B200_NVL';
  } else if (text.includes('A100') || text.includes('HGX')) {
    gpuSpecId = 'A100_HGX';
  } else if (text.includes('4090') || text.includes('RTX')) {
    gpuSpecId = 'RTX4090_WS';
  } else if (text.includes('L40S') || text.includes('L40')) {
    gpuSpecId = 'L40S_INF';
  } else if (text.includes('CPU') || text.includes('STORAGE') || text.includes('HEAD')) {
    gpuSpecId = 'GENERAL_CPU';
  } else if (text.includes('H100') || text.includes('SXM')) {
    gpuSpecId = 'H100_SXM5';
  }

  // 2. GPU Count Detection (e.g. "32개", "64 GPU", "128개", "16")
  let gpuCount = 32;
  const gpuMatch =
    prompt.match(/(\d+)\s*(?:개|장|대|GPU|POD|NODES?)/i) ||
    prompt.match(/(?:H100|B200|A100|4090|L40S|RTX|CPU)\D*(\d+)/i);
  if (gpuMatch && gpuMatch[1]) {
    const val = parseInt(gpuMatch[1], 10);
    if (val > 0 && val <= 512) {
      gpuCount = val;
    }
  }

  // 3. Rack Count Detection (e.g. "4개 랙", "8랙", "랙 6개", "4 RACKS")
  let rackCount = Math.max(2, Math.ceil(gpuCount / (getGpusPerChassis(gpuSpecId) * 2)));
  const rackMatch =
    prompt.match(/(\d+)\s*(?:개\s*)?(?:랙|렉|RACK|RACKS)/i) ||
    prompt.match(/(?:랙|렉|RACK)\D*(\d+)/i);
  if (rackMatch && rackMatch[1]) {
    const val = parseInt(rackMatch[1], 10);
    if (val >= 1 && val <= 48) {
      rackCount = val;
    }
  }

  // 4. Area / Volume Detection (e.g. "20평", "50m2", "50M^2", "150m3")
  let areaValue = 20;
  let areaUnit: 'pyeong' | 'm2' | 'm3' = 'pyeong';

  const pyeongMatch = prompt.match(/(\d+(?:\.\d+)?)\s*(?:평|PYEONG)/i);
  const m2Match = prompt.match(/(\d+(?:\.\d+)?)\s*(?:M2|M\^2|제곱미터|METER)/i);
  const m3Match = prompt.match(/(\d+(?:\.\d+)?)\s*(?:M3|M\^3|세제곱미터|CUBIC)/i);

  if (pyeongMatch) {
    areaValue = parseFloat(pyeongMatch[1]);
    areaUnit = 'pyeong';
  } else if (m2Match) {
    areaValue = parseFloat(m2Match[1]);
    areaUnit = 'm2';
  } else if (m3Match) {
    areaValue = parseFloat(m3Match[1]);
    areaUnit = 'm3';
  }

  const spec = GPU_HARDWARE_LIBRARY[gpuSpecId] || GPU_HARDWARE_LIBRARY.H100_SXM5;
  const chassisCount = Math.ceil(gpuCount / getGpusPerChassis(gpuSpecId));
  const unitStr = areaUnit === 'pyeong' ? '평' : areaUnit === 'm2' ? 'm²' : 'm³';

  const interpretation = `AI 자연어 해석: ${areaValue}${unitStr} 서버실 공간에 ${spec.name} GPU ${gpuCount}개 (서버 노드 ${chassisCount}대, 랙 ${rackCount}개) 자동 구성`;

  return {
    params: {
      gpuSpecId,
      gpuCount,
      rackCount,
      areaValue,
      areaUnit,
      rawPrompt: prompt,
    },
    interpretation,
  };
}

/**
 * Builds physical 3D Scenario and Rack U-Slot State allocations from NaturalLanguageConfigParams.
 */
export function buildCustomScenarioFromParams(params: NaturalLanguageConfigParams): {
  scenario: Scenario;
  rackSlotStates: Record<string, RackUSlotState>;
  summary: {
    areaM2: number;
    areaPyeong: number;
    dimensionsStr: string;
    totalChassisCount: number;
    totalPowerKw: number;
    totalCFM: number;
    racksPerRow: number;
    rowsCount: number;
  };
} {
  const { gpuSpecId, gpuCount, rackCount, areaValue, areaUnit } = params;

  // 1. Calculate Area in m^2 and Pyeong
  let areaM2 = 66.1; // Default ~20 pyeong
  if (areaUnit === 'pyeong') {
    areaM2 = areaValue * 3.305785;
  } else if (areaUnit === 'm3') {
    areaM2 = areaValue / 3.0; // Assuming 3m ceiling height
  } else {
    areaM2 = areaValue;
  }
  areaM2 = Math.max(25, Math.min(1200, areaM2));
  const areaPyeong = Number((areaM2 / 3.305785).toFixed(1));

  // 2. Room Proportions (Width W : Depth D = 2 : 1 rectangular aspect ratio)
  const calculatedWidth = Math.sqrt(2 * areaM2);
  const calculatedDepth = calculatedWidth / 2;

  const widthM = Number(Math.max(8.0, Math.min(40.0, calculatedWidth)).toFixed(1));
  const depthM = Number(Math.max(6.0, Math.min(30.0, calculatedDepth)).toFixed(1));
  const heightM = 3.0;

  const room: RoomDimensions = { widthM, depthM, heightM };

  // 3. Hardware Spec & Chassis Calculation
  const spec = GPU_HARDWARE_LIBRARY[gpuSpecId] || GPU_HARDWARE_LIBRARY.H100_SXM5;
  const gpusPerNode = getGpusPerChassis(gpuSpecId);
  const totalChassisCount = Math.max(1, Math.ceil(gpuCount / gpusPerNode));

  // 4. Generate Racks in 3D Space (2 alternating rows facing Hot/Cold Aisle)
  const rowsCount = rackCount > 6 ? 2 : 1;
  const racksPerRow = Math.ceil(rackCount / rowsCount);
  const spacingX = Math.min(1.4, Math.max(0.9, (widthM - 3.6) / Math.max(1, racksPerRow - 1)));
  const startX = -((racksPerRow - 1) * spacingX) / 2;

  const racks: RackSpec[] = [];
  const rackSlotStates: Record<string, RackUSlotState> = {};

  let assignedChassisCount = 0;

  for (let r = 0; r < rackCount; r++) {
    const rowIdx = r % rowsCount;
    const colIdx = Math.floor(r / rowsCount);
    const x = Number((startX + colIdx * spacingX).toFixed(2));

    // Row positions along Z axis (Cold Aisle / Hot Aisle alternating)
    const z = rowIdx === 0 ? -depthM * 0.15 : depthM * 0.15;
    const rotationY = rowIdx === 0 ? 0 : Math.PI;

    const rackId = `RACK-${rowIdx + 1}-${String(colIdx + 1).padStart(2, '0')}`;

    // Create 42U rack slot state
    const rackState: RackUSlotState = {
      rackId,
      totalU: 42,
      breakerAmps: 32,
      voltageV: 220,
      phases: 1,
      installedServers: [],
    };

    // Calculate how many chassis to assign to this rack
    const chassisForThisRack = Math.ceil(
      (totalChassisCount - assignedChassisCount) / (rackCount - r)
    );

    let currentStartU = 10;
    for (let c = 0; c < chassisForThisRack && assignedChassisCount < totalChassisCount; c++) {
      assignedChassisCount++;
      const chassisId = `${rackId}-NODE-${String(c + 1).padStart(2, '0')}`;
      const installed: InstalledServerChassis = {
        id: chassisId,
        specId: spec.id,
        name: `${spec.name} (${assignedChassisCount})`,
        uHeight: spec.uHeight,
        startU: currentStartU,
        powerKw: spec.powerKw,
        loadFactor: 0.85,
      };
      rackState.installedServers.push(installed);
      currentStartU += spec.uHeight + 2; // Leave 2U spacing between chassis
    }

    // Calculate initial heatKw from installed servers
    const rackHeatKw = rackState.installedServers.reduce(
      (sum, s) => sum + s.powerKw * s.loadFactor,
      0
    );

    racks.push({
      id: rackId,
      position: [x, 0, Number(z.toFixed(2))],
      rotationY,
      heatKw: Number(rackHeatKw.toFixed(2)),
    });

    rackSlotStates[rackId] = rackState;
  }

  // 5. Generate Perimeter CRAC Units based on total room heat load
  const totalPowerKw = totalChassisCount * spec.powerKw * 0.85;
  const totalCFM = totalChassisCount * spec.defaultCFM;

  const cracSupplyTempC = 18.0;
  const cracCount = Math.max(2, Math.ceil(totalPowerKw / 30.0));
  const airflowPerCrac = Number((totalCFM / 2118.88 / cracCount).toFixed(1)); // Convert CFM to m^3/s

  const cracs: CracSpec[] = [
    {
      id: 'CRAC-01',
      position: [-widthM * 0.4, 0, -depthM * 0.4],
      active: true,
      supplyTempC: cracSupplyTempC,
      airflowM3s: Math.max(4.0, airflowPerCrac),
    },
    {
      id: 'CRAC-02',
      position: [widthM * 0.4, 0, -depthM * 0.4],
      active: true,
      supplyTempC: cracSupplyTempC,
      airflowM3s: Math.max(4.0, airflowPerCrac),
    },
  ];

  if (cracCount >= 3) {
    cracs.push({
      id: 'CRAC-03',
      position: [-widthM * 0.4, 0, depthM * 0.4],
      active: true,
      supplyTempC: cracSupplyTempC,
      airflowM3s: Math.max(4.0, airflowPerCrac),
    });
  }
  if (cracCount >= 4) {
    cracs.push({
      id: 'CRAC-04',
      position: [widthM * 0.4, 0, depthM * 0.4],
      active: true,
      supplyTempC: cracSupplyTempC,
      airflowM3s: Math.max(4.0, airflowPerCrac),
    });
  }

  const scenario: Scenario = {
    synthetic: true,
    room,
    racks,
    cracs,
    targetIntakeTempC: 24.0,
    hotDayDerating: 1.0,
    maxRackMoves: 5,
    selectedPreset: 'B',
  };

  return {
    scenario,
    rackSlotStates,
    summary: {
      areaM2: Number(areaM2.toFixed(1)),
      areaPyeong,
      dimensionsStr: `${widthM}m × ${depthM}m × ${heightM}m`,
      totalChassisCount,
      totalPowerKw: Number(totalPowerKw.toFixed(1)),
      totalCFM: Math.round(totalCFM),
      racksPerRow,
      rowsCount,
    },
  };
}

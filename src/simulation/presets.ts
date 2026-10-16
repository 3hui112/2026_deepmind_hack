import type { Scenario, RackSpec, CracSpec, RoomDimensions, PresetId } from '../domain/scenario';
import type { PresetBenchmarkReference } from './types';

export const BENCHMARK_REFERENCES: Record<PresetId, PresetBenchmarkReference> = {
  A: {
    presetId: 'A',
    name: 'A. Same Direction Layout',
    maxIntakeTempC: 35.5,
    racksAbove27C: 6,
    totalRacks: 24,
    description: 'Baseline layout where all racks face the same direction, causing front rack exhaust heat to recirculate into rear rack intakes.',
  },
  B: {
    presetId: 'B',
    name: 'B. Hot/Cold Aisle Layout',
    maxIntakeTempC: 22.1,
    racksAbove27C: 0,
    totalRacks: 24,
    description: 'High-efficiency containment layout with alternating Hot and Cold Aisles facing each other to prevent airflow recirculation.',
  },
  C: {
    presetId: 'C',
    name: 'C. Hot/Cold Aisle + 1 CRAC Trip',
    maxIntakeTempC: 29.6,
    racksAbove27C: 4,
    totalRacks: 24,
    description: 'Emergency scenario where 1 CRAC unit fails (N+1 trip) in a Hot/Cold Aisle layout, reducing localized cooling airflow.',
  },
};

const DEFAULT_ROOM: RoomDimensions = {
  widthM: 18.0,
  depthM: 9.0,
  heightM: 3.0,
};

function generateRacks(preset: PresetId): RackSpec[] {
  const racks: RackSpec[] = [];
  const racksPerRow = 12;
  const startX = 2.4;
  const spacingX = 1.2;

  for (let i = 0; i < racksPerRow; i++) {
    const x = startX + i * spacingX;
    // Row 1
    racks.push({
      id: `RACK-1-${String(i + 1).padStart(2, '0')}`,
      position: [Number(x.toFixed(2)), 0, 3.3],
      // In preset A, all racks face south (0). In B & C, Row 1 faces south towards the cold aisle (0).
      rotationY: 0,
      heatKw: 5.0,
    });

    // Row 2
    racks.push({
      id: `RACK-2-${String(i + 1).padStart(2, '0')}`,
      position: [Number(x.toFixed(2)), 0, 5.7],
      // In preset A, Row 2 also faces south (0) -> receives Row 1 hot exhaust.
      // In preset B & C, Row 2 faces north (Math.PI) -> cold aisle faces Row 1 cold intake.
      rotationY: preset === 'A' ? 0 : Math.PI,
      heatKw: 5.0,
    });
  }

  return racks;
}

function generateCracs(preset: PresetId): CracSpec[] {
  return [
    {
      id: 'CRAC-01',
      position: [2.5, 0, 1.2],
      active: true,
      supplyTempC: 18.0,
      airflowM3s: 5.5,
    },
    {
      id: 'CRAC-02',
      position: [15.5, 0, 1.2],
      // In preset C, 1 CRAC unit is stopped (CRAC 1대 정지)
      active: preset !== 'C',
      supplyTempC: 18.0,
      airflowM3s: 5.5,
    },
    {
      id: 'CRAC-03',
      position: [2.5, 0, 7.8],
      active: true,
      supplyTempC: 18.0,
      airflowM3s: 5.5,
    },
    {
      id: 'CRAC-04',
      position: [15.5, 0, 7.8],
      active: true,
      supplyTempC: 18.0,
      airflowM3s: 5.5,
    },
  ];
}

export function createPresetScenario(preset: PresetId): Scenario {
  return {
    synthetic: true,
    room: { ...DEFAULT_ROOM },
    racks: generateRacks(preset),
    cracs: generateCracs(preset),
    targetIntakeTempC: 24.0,
    hotDayDerating: 1.0,
    maxRackMoves: 5,
    selectedPreset: preset,
  };
}

export const PRESET_OPTIONS: Array<{ id: PresetId; label: string; badge: string }> = [
  { id: 'A', label: 'A. Same Direction Layout', badge: 'Max 35.5°C' },
  { id: 'B', label: 'B. Hot/Cold Aisle Layout', badge: 'Max 22.1°C' },
  { id: 'C', label: 'C. Hot/Cold Aisle + 1 CRAC Trip', badge: 'Max 29.6°C' },
];

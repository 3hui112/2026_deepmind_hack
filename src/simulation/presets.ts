import type { Scenario, RackSpec, CracSpec, RoomDimensions, PresetId } from '../domain/scenario';
import type { PresetBenchmarkReference } from './types';

export const BENCHMARK_REFERENCES: Record<PresetId, PresetBenchmarkReference> = {
  A: {
    presetId: 'A',
    name: 'A. 같은 방향 배치',
    maxIntakeTempC: 35.5,
    racksAbove27C: 6,
    totalRacks: 24,
    description: '모든 랙이 동일 방향을 향해 전면 랙 배기열이 후면 랙 흡입구로 재유입되는 기본 배치입니다.',
  },
  B: {
    presetId: 'B',
    name: 'B. 냉기·열기 통로',
    maxIntakeTempC: 22.1,
    racksAbove27C: 0,
    totalRacks: 24,
    description: '냉기 통로(Cold Aisle)와 열기 통로(Hot Aisle)가 마주보도록 정렬하여 기류 재순환을 방지한 고효율 배치입니다.',
  },
  C: {
    presetId: 'C',
    name: 'C. 냉기·열기 통로 + CRAC 1대 정지',
    maxIntakeTempC: 29.6,
    racksAbove27C: 4,
    totalRacks: 24,
    description: '냉기·열기 통로 구성 중 CRAC 1기가 정지(N+1 비상 상황)되어 국소 풍량이 저하된 시나리오입니다.',
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
  { id: 'A', label: 'A. 같은 방향 배치', badge: '최대 35.5°C' },
  { id: 'B', label: 'B. 냉기·열기 통로', badge: '최대 22.1°C' },
  { id: 'C', label: 'C. 냉기·열기 통로 + CRAC 1대 정지', badge: '최대 29.6°C' },
];

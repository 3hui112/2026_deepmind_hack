/**
 * Gemini 4 Argon Slot Optimization & Vertical Thermal Physics Engine
 */

import type { Scenario, RackSimulationResult } from '../domain/scenario';
import {
  GPU_HARDWARE_LIBRARY,
  getEmptyUSlotRanges,
  getRackPowerMetrics,
  type RackUSlotState,
  type InstalledServerChassis,
} from '../domain/rackSlots';

export interface SlotRecommendation {
  id: string;
  type: 'MOVE_SLOT' | 'EXPANSION' | 'EMERGENCY_SHED';
  title: string;
  targetChassisId?: string;
  sourceRackId?: string;
  sourceStartU?: number;
  destRackId: string;
  destStartU: number;
  expectedTempDeltaC: number;
  rationale: string;
  slurmCommand?: string;
  gpuPowerCapCommand?: string;
}

export interface SlotOptimizationResult {
  rackSlotStates: Record<string, RackUSlotState>;
  slotIntakeTemps: Record<string, Record<number, number>>; // rackId -> U_slot -> tempC
  recommendations: SlotRecommendation[];
  emergencyCutKw: number;
  slurmCommands: string[];
  gpuCapCommands: string[];
}

/**
 * Computes vertical thermal stratification for each U-slot (U01 to U_total) in a rack.
 */
export function calculateSlotThermalPhysics(
  rackState: RackUSlotState,
  baseRackIntakeC: number
): Record<number, number> {
  const slotTemps: Record<number, number> = {};
  const totalU = rackState.totalU;

  // Proximity heat penalty for high-density adjacent GPU servers
  const densityCount = rackState.installedServers.filter((s) => s.powerKw >= 6.0).length;
  const densityPenalty = Math.min(2.5, densityCount * 0.6);

  for (let u = 1; u <= totalU; u++) {
    const heightFrac = (u - 1) / Math.max(1, totalU - 1); // 0.0 at U01 (bottom), 1.0 at U42 (top)

    // Chimney effect: Top slots receive buoyant recirculation rolling over rack top
    const chimneyStratification = heightFrac * 4.2;

    // Sub-floor cold tile effect: Bottom slots U01-U10 receive cooler air
    const coldTileBenefit = (1.0 - Math.min(1.0, u / 12.0)) * -1.8;

    const slotTemp = baseRackIntakeC + chimneyStratification + coldTileBenefit + densityPenalty;
    slotTemps[u] = Number(slotTemp.toFixed(1));
  }

  return slotTemps;
}

/**
 * Creates default initial rack U-slot allocations matching Preset A / B / C scenarios.
 */
export function createDefaultRackSlotStates(scenario: Scenario): Record<string, RackUSlotState> {
  const states: Record<string, RackUSlotState> = {};

  scenario.racks.forEach((rack, index) => {
    // Standard 42U rack with 32A @ 220V PDU
    const rackState: RackUSlotState = {
      rackId: rack.id,
      totalU: 42,
      breakerAmps: 32,
      voltageV: 220,
      phases: 1,
      installedServers: [],
    };

    // Populate initial servers based on rack heatKw
    if (rack.heatKw >= 9.0) {
      // High-density H100 + A100 rack
      rackState.installedServers = [
        {
          id: `${rack.id}-NODE-01`,
          specId: 'H100_SXM5',
          name: 'NVIDIA H100 SXM5 Pod',
          uHeight: 4,
          startU: 32, // Upper slot prone to chimney heat
          powerKw: 10.2,
          loadFactor: 0.85,
        },
        {
          id: `${rack.id}-NODE-02`,
          specId: 'A100_HGX',
          name: 'NVIDIA A100 HGX Node',
          uHeight: 4,
          startU: 16,
          powerKw: 6.5,
          loadFactor: 0.80,
        },
      ];
    } else if (rack.heatKw >= 5.0) {
      // Standard GPU rack
      rackState.installedServers = [
        {
          id: `${rack.id}-NODE-01`,
          specId: 'A100_HGX',
          name: 'NVIDIA A100 HGX Node',
          uHeight: 4,
          startU: 20,
          powerKw: 6.5,
          loadFactor: 0.80,
        },
        {
          id: `${rack.id}-NODE-02`,
          specId: 'RTX4090_WS',
          name: 'NVIDIA RTX 4090 DL Node',
          uHeight: 4,
          startU: 8,
          powerKw: 2.8,
          loadFactor: 0.75,
        },
      ];
    } else {
      // Light / Storage rack
      rackState.installedServers = [
        {
          id: `${rack.id}-NODE-01`,
          specId: 'L40S_INF',
          name: 'NVIDIA L40S Inference Node',
          uHeight: 2,
          startU: 12,
          powerKw: 3.2,
          loadFactor: 0.70,
        },
        {
          id: `${rack.id}-NODE-02`,
          specId: 'GENERAL_CPU',
          name: 'Storage & Slurm Controller',
          uHeight: 1,
          startU: 4,
          powerKw: 0.5,
          loadFactor: 0.60,
        },
      ];
    }

    states[rack.id] = rackState;
  });

  return states;
}

/**
 * Evaluates current slot allocations, computes vertical temperatures, and generates
 * Argon AI optimization & rebalancing recommendations.
 */
export function analyzeAndOptimizeSlots(
  scenario: Scenario,
  rackResults: RackSimulationResult[],
  customSlotStates?: Record<string, RackUSlotState>
): SlotOptimizationResult {
  const rackSlotStates = customSlotStates || createDefaultRackSlotStates(scenario);
  const slotIntakeTemps: Record<string, Record<number, number>> = {};
  const recommendations: SlotRecommendation[] = [];
  const slurmCommands: string[] = [];
  const gpuCapCommands: string[] = [];

  // 1. Compute vertical slot thermal physics for all racks
  rackResults.forEach((r) => {
    const state = rackSlotStates[r.id];
    if (state) {
      const temps = calculateSlotThermalPhysics(state, r.intakeTempC);
      slotIntakeTemps[r.id] = temps;

      // Assign calculated slot temp back to installed servers
      state.installedServers.forEach((server) => {
        server.slotIntakeTempC = temps[server.startU] || r.intakeTempC;
      });
    }
  });

  // 2. Find hottest server chassis that can benefit from lower U-slot or cooler rack
  let hottestServer: { server: InstalledServerChassis; rackId: string; tempC: number } | null = null;

  Object.entries(rackSlotStates).forEach(([rackId, state]) => {
    state.installedServers.forEach((server) => {
      const temp = server.slotIntakeTempC || 22.0;
      // Trigger move recommendation if chassis intake is warm (> 24.5°C) or significantly elevated
      if (temp > 24.5) {
        if (!hottestServer || temp > hottestServer.tempC) {
          hottestServer = { server, rackId, tempC: temp };
        }
      }
    });
  });

  // 3. Generate Slot Move Suggestion if a warm/hot server exists
  if (hottestServer !== null) {
    const targetHotServer: { server: InstalledServerChassis; rackId: string; tempC: number } = hottestServer;
    const server = targetHotServer.server;
    const srcRackId = targetHotServer.rackId;
    const srcTemp = targetHotServer.tempC;

    // Search for coolest available empty U-slot range that fits `server.uHeight` (including same rack lower slots)
    let bestDest: { rackId: string; startU: number; expectedTempC: number } | null = null;

    Object.entries(rackSlotStates).forEach(([destRackId, destState]) => {
      const isSameRack = destRackId === srcRackId;
      const metrics = getRackPowerMetrics(destState);
      const addedKw = isSameRack ? 0 : server.powerKw * server.loadFactor;

      // Check PDU 80% NEC breaker headroom (if moving to a different rack)
      if (!isSameRack && metrics.totalPowerKw + addedKw > metrics.necSafeLimitKw) return;

      const emptyRanges = getEmptyUSlotRanges(destState);
      emptyRanges.forEach((range) => {
        if (range.availableU >= server.uHeight) {
          const candidateStartU = range.startU;
          // Skip if same rack and same startU
          if (isSameRack && candidateStartU === server.startU) return;

          const baseIntake = rackResults.find((r) => r.id === destRackId)?.intakeTempC || 20.0;
          const destSlotTemp = (slotIntakeTemps[destRackId] || {})[candidateStartU] || baseIntake;

          const currentBestTemp = bestDest !== null ? (bestDest as { expectedTempC: number }).expectedTempC : 999;
          // Accept if moving yields at least 0.5°C temperature drop
          if (destSlotTemp < srcTemp - 0.5 && (bestDest === null || destSlotTemp < currentBestTemp)) {
            bestDest = { rackId: destRackId, startU: candidateStartU, expectedTempC: destSlotTemp };
          }
        }
      });
    });

    if (bestDest !== null) {
      const dest: { rackId: string; startU: number; expectedTempC: number } = bestDest;
      const tempDelta = dest.expectedTempC - srcTemp;
      const locationLabel = dest.rackId === srcRackId ? `${dest.rackId} 하단` : dest.rackId;
      recommendations.push({
        id: 'REC-MOVE-01',
        type: 'MOVE_SLOT',
        title: `재배치 권고: ${server.name} (${srcRackId} U${server.startU} ➔ ${locationLabel} U${dest.startU})`,
        targetChassisId: server.id,
        sourceRackId: srcRackId,
        sourceStartU: server.startU,
        destRackId: dest.rackId,
        destStartU: dest.startU,
        expectedTempDeltaC: Number(tempDelta.toFixed(1)),
        rationale: `${srcRackId} 상단(U${server.startU})의 열기둥 재순환으로 인해 서버 흡입 온도가 ${srcTemp.toFixed(
          1
        )}°C까지 상승했습니다. 여유 수용 공간과 냉기 공급이 양호한 ${locationLabel} U${
          dest.startU
        } 슬롯으로 이동 시 약 ${Math.abs(tempDelta).toFixed(1)}°C 강하 효과가 예상됩니다.`,
      });
    }
  }

  // 4. Generate Expansion Suggestion for adding a new 4U GPU chassis
  let bestExpansion: { rackId: string; startU: number; expectedTempC: number } | null = null;
  Object.entries(rackSlotStates).forEach(([destRackId, destState]) => {
    const metrics = getRackPowerMetrics(destState);
    if (metrics.totalPowerKw + 10.2 * 0.85 > metrics.necSafeLimitKw) return;

    const emptyRanges = getEmptyUSlotRanges(destState);
    emptyRanges.forEach((range) => {
      if (range.availableU >= 4) {
        const startU = range.startU;
        const baseIntake = rackResults.find((r) => r.id === destRackId)?.intakeTempC || 20.0;
        const slotTemp = (slotIntakeTemps[destRackId] || {})[startU] || baseIntake;

        const currentBestTemp = bestExpansion !== null ? (bestExpansion as { expectedTempC: number }).expectedTempC : 999;
        if (bestExpansion === null || slotTemp < currentBestTemp) {
          bestExpansion = { rackId: destRackId, startU: startU, expectedTempC: slotTemp };
        }
      }
    });
  });

  if (bestExpansion !== null) {
    const exp: { rackId: string; startU: number; expectedTempC: number } = bestExpansion;
    recommendations.push({
      id: 'REC-EXPAND-01',
      type: 'EXPANSION',
      title: '신규 GPU 서버 증설 최적 슬롯 제안',
      destRackId: exp.rackId,
      destStartU: exp.startU,
      expectedTempDeltaC: 0.0,
      rationale: `신규 4U GPU 서버(H100/B200) 증설 시, ${exp.rackId} U${exp.startU}–U${
        exp.startU + 3
      } 슬롯이 PDU 차단기 안전 여유율(80% 이내)과 최적 하부 냉기 흐름을 가장 잘 충족합니다. (예상 흡입 온도: ${exp.expectedTempC.toFixed(
        1
      )}°C)`,
    });
  }

  // 5. Emergency Load Shedding Calculation (Reference capacity-check.js)
  const totalHeatKw = rackResults.reduce((sum, r) => sum + r.heatKw, 0);
  const activeCracs = scenario.cracs.filter((c) => c.active);
  const cracCoolingKw = activeCracs.length * 30.0; // 30 kW per CRAC
  const emergencyCutKw = Math.max(0, Number((totalHeatKw - cracCoolingKw * 0.80).toFixed(1)));

  if (emergencyCutKw > 0 || scenario.selectedPreset === 'C') {
    const slurmCmd = `scontrol hold job $(squeue -h -o "%i" -p gpu-high) # Shed ${emergencyCutKw.toFixed(
      1
    )}kW GPU load`;
    const gpuCmd = `nvidia-smi -pl 250 # Dynamically cap GPU power to 250W during CRAC trip`;

    slurmCommands.push(slurmCmd);
    gpuCapCommands.push(gpuCmd);

    recommendations.push({
      id: 'REC-EMERGENCY-01',
      type: 'EMERGENCY_SHED',
      title: '비상 부하 차단 (Slurm & GPU Power Cap)',
      destRackId: 'ALL_RACKS',
      destStartU: 1,
      expectedTempDeltaC: -3.5,
      rationale: `항온항습기(CRAC) 정지 또는 열 폭주 위험 감지 시, 즉시 약 ${emergencyCutKw.toFixed(
        1
      )} kW의 발열을 즉시 차단해야 합니다. 자동화 명령으로 Slurm 학습 작업 일시 중지 및 GPU 전력 제한(Power Capping)을 실행하세요.`,
      slurmCommand: slurmCmd,
      gpuPowerCapCommand: gpuCmd,
    });
  }

  return {
    rackSlotStates,
    slotIntakeTemps,
    recommendations,
    emergencyCutKw,
    slurmCommands,
    gpuCapCommands,
  };
}

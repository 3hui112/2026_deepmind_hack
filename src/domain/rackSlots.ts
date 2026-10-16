/**
 * GPU Server Hardware Specs & Rack U-Slot Spatial Management Domain Definitions
 */

export interface GPUHardwareSpec {
  id: string;
  name: string;
  manufacturer: string;
  uHeight: number; // 1U to 8U
  powerKw: number; // Max rated dissipation in kW
  defaultCFM: number; // Cooling airflow requirements
  description: string;
  badgeColor: string;
}

export const GPU_HARDWARE_LIBRARY: Record<string, GPUHardwareSpec> = {
  H100_SXM5: {
    id: 'H100_SXM5',
    name: 'NVIDIA H100 SXM5 Pod (8-GPU)',
    manufacturer: 'NVIDIA',
    uHeight: 4,
    powerKw: 10.2,
    defaultCFM: 1200,
    description: '10.2 kW / 4U - AI Training Master Node (700W per GPU)',
    badgeColor: '#10b981', // Emerald
  },
  B200_NVL: {
    id: 'B200_NVL',
    name: 'NVIDIA B200 / GB200 NVL Pod',
    manufacturer: 'NVIDIA',
    uHeight: 4,
    powerKw: 14.3,
    defaultCFM: 1500,
    description: '14.3 kW / 4U - Next-Gen Blackwell Liquid/Hybrid Node',
    badgeColor: '#8b5cf6', // Purple
  },
  A100_HGX: {
    id: 'A100_HGX',
    name: 'NVIDIA A100 HGX (8-GPU)',
    manufacturer: 'NVIDIA',
    uHeight: 4,
    powerKw: 6.5,
    defaultCFM: 900,
    description: '6.5 kW / 4U - Standard Enterprise Training Chassis',
    badgeColor: '#0284c7', // Sky
  },
  RTX4090_WS: {
    id: 'RTX4090_WS',
    name: 'NVIDIA RTX 4090 DL Workstation',
    manufacturer: 'Custom/Lab',
    uHeight: 4,
    powerKw: 2.8,
    defaultCFM: 450,
    description: '2.8 kW / 4U - Academic Lab Budget Training Node',
    badgeColor: '#f59e0b', // Amber
  },
  L40S_INF: {
    id: 'L40S_INF',
    name: 'NVIDIA L40S Inference Node',
    manufacturer: 'NVIDIA',
    uHeight: 2,
    powerKw: 3.2,
    defaultCFM: 500,
    description: '3.2 kW / 2U - High-Throughput LLM Servicing Node',
    badgeColor: '#ec4899', // Pink
  },
  GENERAL_CPU: {
    id: 'GENERAL_CPU',
    name: 'Head / Storage / Slurm Master Node',
    manufacturer: 'Generic',
    uHeight: 1,
    powerKw: 0.5,
    defaultCFM: 150,
    description: '0.5 kW / 1U - Slurm Controller & Storage Head',
    badgeColor: '#64748b', // Slate
  },
};

export interface InstalledServerChassis {
  id: string; // Unique chassis ID (e.g., 'NODE-H100-01')
  specId: string;
  name: string;
  uHeight: number;
  startU: number; // 1-indexed U position (e.g. U12 means occupying U12..U12+uHeight-1)
  powerKw: number;
  loadFactor: number; // 0.0 to 1.0 (e.g. 0.85 = 85% active ML training load)
  slotIntakeTempC?: number; // Slot-level vertical stratified intake temperature
}

export interface RackUSlotState {
  rackId: string;
  totalU: number; // Default 42U, 48U, or 52U
  breakerAmps: number; // 16A or 32A
  voltageV: number; // 220V or 380V
  phases: 1 | 3;
  installedServers: InstalledServerChassis[];
}

export interface EmptyUSlotRange {
  startU: number; // 1-indexed
  endU: number;
  availableU: number;
}

/**
 * Calculates continuous empty U ranges in a rack from U01 to U_total.
 */
export function getEmptyUSlotRanges(rackState: RackUSlotState): EmptyUSlotRange[] {
  const occupied = new Set<number>();
  for (const server of rackState.installedServers) {
    for (let u = server.startU; u < server.startU + server.uHeight; u++) {
      occupied.add(u);
    }
  }

  const ranges: EmptyUSlotRange[] = [];
  let currentStart: number | null = null;

  for (let u = 1; u <= rackState.totalU; u++) {
    if (!occupied.has(u)) {
      if (currentStart === null) currentStart = u;
    } else {
      if (currentStart !== null) {
        ranges.push({
          startU: currentStart,
          endU: u - 1,
          availableU: u - currentStart,
        });
        currentStart = null;
      }
    }
  }

  if (currentStart !== null) {
    ranges.push({
      startU: currentStart,
      endU: rackState.totalU,
      availableU: rackState.totalU - currentStart + 1,
    });
  }

  return ranges;
}

/**
 * Calculates cumulative rack power in kW and NEC 80% continuous breaker limit headroom.
 */
export function getRackPowerMetrics(rackState: RackUSlotState) {
  const totalPowerKw = rackState.installedServers.reduce(
    (sum, s) => sum + s.powerKw * s.loadFactor,
    0
  );

  // Rated power: V * A * sqrt(phases) / 1000
  const phaseMultiplier = rackState.phases === 3 ? Math.sqrt(3) : 1;
  const breakerRatedKw = (rackState.voltageV * rackState.breakerAmps * phaseMultiplier) / 1000;
  const necSafeLimitKw = breakerRatedKw * 0.80; // NEC 80% continuous load rule

  const isBreakerOverloaded = totalPowerKw > necSafeLimitKw;
  const breakerUtilization = breakerRatedKw > 0 ? totalPowerKw / breakerRatedKw : 0;

  return {
    totalPowerKw: Number(totalPowerKw.toFixed(2)),
    breakerRatedKw: Number(breakerRatedKw.toFixed(2)),
    necSafeLimitKw: Number(necSafeLimitKw.toFixed(2)),
    isBreakerOverloaded,
    breakerUtilization: Number(breakerUtilization.toFixed(3)),
  };
}

/**
 * Validates whether a server node of uHeight and powerKw can be placed at target startU in rackState.
 */
export function canPlaceServerNode(
  rackState: RackUSlotState,
  uHeight: number,
  startU: number,
  powerKw: number = 0,
  ignoreNodeId?: string,
  loadFactor: number = 0.85
): { valid: boolean; reason?: string; resolution?: string } {
  const emptyRanges = getEmptyUSlotRanges(rackState);
  const emptySummary = emptyRanges.length > 0
    ? emptyRanges.map((r) => `U${r.startU}~U${r.endU}(${r.availableU}U)`).join(', ')
    : 'None';

  if (startU < 1 || startU + uHeight - 1 > rackState.totalU) {
    return {
      valid: false,
      reason: `Out of U-Slot range (1~${rackState.totalU}U)`,
      resolution: `Drag and place within the empty slot range (${emptySummary}) inside total rack height (${rackState.totalU}U).`,
    };
  }

  const endU = startU + uHeight - 1;
  for (const server of rackState.installedServers) {
    if (ignoreNodeId && server.id === ignoreNodeId) continue;
    const sEndU = server.startU + server.uHeight - 1;
    if (Math.max(startU, server.startU) <= Math.min(endU, sEndU)) {
      return {
        valid: false,
        reason: `Overlaps with an occupied slot (${server.name || server.id}: U${server.startU}~U${sEndU})`,
        resolution: `Drag to an empty slot range (${emptySummary}) or relocate/swap the existing server first.`,
      };
    }
  }

  const currentMetrics = getRackPowerMetrics(rackState);
  let existingNodePower = 0;
  if (ignoreNodeId) {
    const existing = rackState.installedServers.find((s) => s.id === ignoreNodeId);
    if (existing) existingNodePower = existing.powerKw * existing.loadFactor;
  }
  const projectedPowerKw = currentMetrics.totalPowerKw - existingNodePower + powerKw * loadFactor;

  if (projectedPowerKw > currentMetrics.necSafeLimitKw) {
    return {
      valid: false,
      reason: `Exceeds PDU NEC 80% power limit (Projected load: ${projectedPowerKw.toFixed(1)}kW > Safe limit: ${currentMetrics.necSafeLimitKw.toFixed(1)}kW)`,
      resolution: `Relocate existing high-power GPU nodes to another rack to free up PDU power headroom.`,
    };
  }

  return { valid: true };
}

/**
 * Architectural Blueprint Floorplan Overlay Settings
 */
export interface BlueprintOverlayConfig {
  enabled: boolean;
  imageUrl: string;
  opacity: number; // 0.0 to 1.0 (UI slider 0-100%)
  scale: number; // 0.5 to 2.0 (UI slider 50-200%)
  offsetXM: number; // In meters relative to room center
  offsetYM: number;
  autoAligned: boolean;
}

export const DEFAULT_BLUEPRINT_CONFIG: BlueprintOverlayConfig = {
  enabled: true,
  imageUrl: '', // Blank defaults to built-in vector CAD canvas
  opacity: 0.45,
  scale: 1.0,
  offsetXM: 0,
  offsetYM: 0,
  autoAligned: true,
};

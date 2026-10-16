import type { Scenario } from '../../domain/scenario';
import type { SimulationResult } from '../../simulation/types';
import type { AirflowEmitter } from './types';
import { DEFAULT_PARTICLE_CONFIG } from './types';

/**
 * Extracts active cold emitters (active CRACs) and hot emitters (rack exhausts)
 * strictly synchronized with Scenario and SimulationResult.
 *
 * Rules:
 * - Stopped CRACs (active: false) generate ZERO cold particles.
 * - Rack exhaust emission rate is weighted by heatKw.
 * - Exhaust particle color and initialTempC reflect rack intake/exhaust thermal state.
 */
export function buildAirflowEmitters(
  scenario: Scenario,
  simulationResult: SimulationResult
): { coldEmitters: AirflowEmitter[]; hotEmitters: AirflowEmitter[] } {
  const { room, racks, cracs } = scenario;
  const hw = room.widthM / 2;
  const hd = room.depthM / 2;
  const floorY = -room.heightM / 2;

  // 1. Cold Emitters: ONLY ACTIVE CRACS
  const coldEmitters: AirflowEmitter[] = [];
  cracs.forEach((crac) => {
    // CRITICAL: Skip stopped CRACs (e.g. CRAC-02 in Preset C)
    if (!crac.active) return;

    const cx = crac.position[0] - hw;
    const cz = crac.position[2] - hd;
    // CRAC supply airflow blows from floor towards central room aisle
    const dirZ = cz < 0 ? 1.0 : -1.0;
    const dirX = cx < 0 ? 0.35 : -0.35;
    const len = Math.hypot(dirX, 0.08, dirZ);

    coldEmitters.push({
      type: 'cold',
      sourceId: crac.id,
      position: [cx, floorY + 0.28, cz + (dirZ > 0 ? 0.65 : -0.65)],
      direction: [dirX / len, 0.08 / len, dirZ / len],
      speed: 3.4 * (crac.airflowM3s / 5.5),
      rateWeight: crac.airflowM3s,
      color: [...DEFAULT_PARTICLE_CONFIG.coldColor],
      initialTempC: crac.supplyTempC,
    });
  });

  // 2. Hot Exhaust Emitters: Rack Rears
  const hotEmitters: AirflowEmitter[] = [];
  const rackTempMap = new Map(
    simulationResult.rackResults.map((r) => [r.id, r.intakeTempC])
  );

  racks.forEach((rack, idx) => {
    const rx = rack.position[0] - hw;
    const rz = rack.position[2] - hd;
    const temp = rackTempMap.get(rack.id) ?? 20.0;

    // In Three.js: rack rotationY:
    // rotationY = 0 -> Front is +Z, Rear exhaust is -Z
    // rotationY = Math.PI -> Front is -Z, Rear exhaust is +Z
    const isFacingSouth = Math.abs(rack.rotationY) < 0.1;
    const exhaustZ = isFacingSouth ? -0.65 : 0.65;
    const exhaustDirZ = isFacingSouth ? -0.75 : 0.75;

    // Upward thermal buoyancy: hot air rises!
    const dirY = 0.72;
    const dirX = ((idx % 5) - 2) * 0.06;
    const len = Math.hypot(dirX, dirY, exhaustDirZ);

    // Color: if overheated (>27°C) use hot red, else warm orange
    const isOverheated = temp > 27.0;
    const color = isOverheated
      ? DEFAULT_PARTICLE_CONFIG.hotColorHigh
      : DEFAULT_PARTICLE_CONFIG.hotColorLow;

    hotEmitters.push({
      type: 'hot',
      sourceId: rack.id,
      position: [rx, floorY + 1.15, rz + exhaustZ],
      direction: [dirX / len, dirY / len, exhaustDirZ / len],
      speed: 1.9 + (rack.heatKw / 5.0) * 0.85,
      rateWeight: Math.max(1.0, rack.heatKw),
      color: [...color],
      initialTempC: Math.min(42.0, temp + 4.5),
    });
  });

  return { coldEmitters, hotEmitters };
}

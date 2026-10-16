import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  instancedArray,
  instanceIndex,
  storage,
  uniform,
  vec3,
  vec4,
  float,
  uint,
  hash,
  select,
  sin,
  cos,
  mix,
  clamp,
  smoothstep,
  length,
  uv,
} from 'three/tsl';
import type { Scenario } from '../../domain/scenario';
import type { SimulationResult } from '../../simulation/types';
import type { AirflowEmitter } from './types';
import { buildAirflowEmitters } from './particleEmitters';
import { DEFAULT_PARTICLE_CONFIG } from './types';

/**
 * WebGPU Hardware-Accelerated Airflow Particle System (Three.js TSL Compute Pipeline)
 *
 * Scales from 20,000 to 50,000 particles computed entirely in parallel on the GPU:
 * - Storage buffers (`instancedArray` & `storage`):
 *   1. `positions` (vec3): Real-time 3D particle position [x, y, z]
 *   2. `velocities` (vec3): Real-time 3D velocity vector [vx, vy, vz]
 *   3. `states` (vec4): [remainingLife, maxLife, particleType (0=cold, 1=hot), tempC]
 *   4. `colors` (vec3): Dynamic thermal RGB color evaluated on GPU
 *   5. `spawnOrigins` (vec3): Assigned emitter world origin [ex, ey, ez]
 *   6. `spawnMeta` (vec4): Assigned emitter velocity [vx, vy, vz] + emitter initialTempC
 *   7. `thermalGridStorage` (float storage buffer): 2D temperatureGrid from thermalEngine.ts
 */
export class WebGPUParticleSystem {
  public points: THREE.Object3D | null = null;
  public count: number;
  private renderer: any;
  private computeUpdate: any = null;

  // TSL Uniforms
  private dtUniform: any;
  private timeUniform: any;
  private presetModeUniform: any; // 0 = Preset A, 1 = Preset B, 2 = Preset C

  // GPU Storage Buffer Nodes (retained for in-place scenario updates & clean disposal)
  private positionsNode: any = null;
  private velocitiesNode: any = null;
  private statesNode: any = null;
  private colorsNode: any = null;
  private spawnOriginsNode: any = null;
  private spawnMetaNode: any = null;
  private thermalGridAttr: THREE.StorageBufferAttribute | null = null;
  private thermalGridNode: any = null;

  // CPU backing typed arrays for fast in-place re-seeding on preset change
  private initPositionsArr: Float32Array;
  private initVelocitiesArr: Float32Array;
  private initStatesArr: Float32Array;
  private initColorsArr: Float32Array;
  private initSpawnOriginsArr: Float32Array;
  private initSpawnMetaArr: Float32Array;

  private coldEmitters: AirflowEmitter[] = [];
  private hotEmitters: AirflowEmitter[] = [];
  private elapsedTime: number = 0;
  public isReady: boolean = false;

  constructor(
    renderer: any,
    scenario: Scenario,
    simulationResult: SimulationResult,
    count: number = DEFAULT_PARTICLE_CONFIG.maxWebGPUParticles
  ) {
    this.renderer = renderer;
    this.count = Math.max(1000, Math.min(count, 50000));

    this.dtUniform = uniform(0.016);
    this.timeUniform = uniform(0.0);
    this.presetModeUniform = uniform(this.getPresetCode(scenario.selectedPreset));

    this.initPositionsArr = new Float32Array(this.count * 3);
    this.initVelocitiesArr = new Float32Array(this.count * 3);
    this.initStatesArr = new Float32Array(this.count * 4);
    this.initColorsArr = new Float32Array(this.count * 3);
    this.initSpawnOriginsArr = new Float32Array(this.count * 3);
    this.initSpawnMetaArr = new Float32Array(this.count * 4);

    const { coldEmitters, hotEmitters } = buildAirflowEmitters(scenario, simulationResult);
    this.coldEmitters = coldEmitters;
    this.hotEmitters = hotEmitters;

    this.init(simulationResult);
  }

  private getPresetCode(preset: string): number {
    if (preset === 'A') return 0;
    if (preset === 'B') return 1;
    return 2;
  }

  /**
   * Populates CPU typed arrays from active Cold (CRAC) and Hot (Rack Exhaust) emitters.
   */
  private populateSeedArrays(): void {
    const count = this.count;

    for (let i = 0; i < count; i++) {
      // 52% Cold CRAC supply air, 48% Hot Rack exhaust plumes
      const isCold = i % 25 < 13;
      const emitterList = isCold ? this.coldEmitters : this.hotEmitters;
      const emitter: AirflowEmitter =
        emitterList.length > 0
          ? emitterList[i % emitterList.length]
          : {
              position: [0, -1.2, 0],
              direction: [0, 1, 0],
              speed: 2.0,
              rateWeight: 1.0,
              color: [0.22, 0.74, 0.97],
              initialTempC: 18.0,
              type: 'cold',
              sourceId: 'DEFAULT',
            };

      const idx3 = i * 3;
      const idx4 = i * 4;
      const progress = (i * 0.61803398875) % 1.0; // Low-discrepancy Golden Ratio phase distribution
      const maxLife = isCold ? 2.2 + (i % 17) * 0.14 : 1.8 + (i % 19) * 0.12;

      const speed = emitter.speed * (0.85 + ((i * 7) % 100) * 0.003);
      const jitterX = (((i * 13) % 100) / 100 - 0.5) * 0.32;
      const jitterY = (((i * 29) % 100) / 100 - 0.5) * 0.18;
      const jitterZ = (((i * 47) % 100) / 100 - 0.5) * 0.32;

      const vx = emitter.direction[0] * speed + jitterX * 0.6;
      const vy = emitter.direction[1] * speed + jitterY * 0.4;
      const vz = emitter.direction[2] * speed + jitterZ * 0.6;

      const ox = emitter.position[0] + jitterX;
      const oy = emitter.position[1] + jitterY;
      const oz = emitter.position[2] + jitterZ;

      // Distribute initial positions along streamline trajectory
      const elapsed = maxLife * progress * 0.65;
      this.initPositionsArr[idx3] = Math.max(-8.8, Math.min(8.8, ox + vx * elapsed));
      this.initPositionsArr[idx3 + 1] = Math.max(-1.4, Math.min(1.4, oy + vy * elapsed));
      this.initPositionsArr[idx3 + 2] = Math.max(-4.3, Math.min(4.3, oz + vz * elapsed));

      this.initVelocitiesArr[idx3] = vx;
      this.initVelocitiesArr[idx3 + 1] = vy;
      this.initVelocitiesArr[idx3 + 2] = vz;

      this.initColorsArr[idx3] = emitter.color[0];
      this.initColorsArr[idx3 + 1] = emitter.color[1];
      this.initColorsArr[idx3 + 2] = emitter.color[2];

      // states: [remainingLife, maxLife, type (0=cold, 1=hot), temperatureC]
      this.initStatesArr[idx4] = Math.max(0.05, maxLife * (1.0 - progress));
      this.initStatesArr[idx4 + 1] = maxLife;
      this.initStatesArr[idx4 + 2] = isCold ? 0.0 : 1.0;
      this.initStatesArr[idx4 + 3] = emitter.initialTempC;

      // spawnOrigins: [ox, oy, oz]
      this.initSpawnOriginsArr[idx3] = ox;
      this.initSpawnOriginsArr[idx3 + 1] = oy;
      this.initSpawnOriginsArr[idx3 + 2] = oz;

      // spawnMeta: [vx, vy, vz, initialTempC]
      this.initSpawnMetaArr[idx4] = vx;
      this.initSpawnMetaArr[idx4 + 1] = vy;
      this.initSpawnMetaArr[idx4 + 2] = vz;
      this.initSpawnMetaArr[idx4 + 3] = emitter.initialTempC;
    }
  }

  private init(simulationResult: SimulationResult): void {
    try {
      const count = this.count;
      this.populateSeedArrays();

      // 1. Storage buffers using Three.js TSL instancedArray & storage
      this.positionsNode = instancedArray(this.initPositionsArr, 'vec3');
      this.velocitiesNode = instancedArray(this.initVelocitiesArr, 'vec3');
      this.statesNode = instancedArray(this.initStatesArr, 'vec4');
      this.colorsNode = instancedArray(this.initColorsArr, 'vec3');
      this.spawnOriginsNode = instancedArray(this.initSpawnOriginsArr, 'vec3').toReadOnly();
      this.spawnMetaNode = instancedArray(this.initSpawnMetaArr, 'vec4').toReadOnly();

      // Upload 2D temperatureGrid from thermalEngine.ts into a WebGPU StorageBuffer
      const gridLength = simulationResult.temperatureGrid.length;
      const gridCopy = new Float32Array(gridLength);
      gridCopy.set(simulationResult.temperatureGrid);
      this.thermalGridAttr = new THREE.StorageBufferAttribute(gridCopy, 1);
      this.thermalGridNode = storage(this.thermalGridAttr, 'float', gridLength).toReadOnly();

      const positions = this.positionsNode;
      const velocities = this.velocitiesNode;
      const states = this.statesNode;
      const colors = this.colorsNode;
      const spawnOrigins = this.spawnOriginsNode;
      const spawnMeta = this.spawnMetaNode;
      const thermalGrid = this.thermalGridNode;

      const dt = this.dtUniform;
      const time = this.timeUniform;
      const presetMode = this.presetModeUniform;
      const gridW = uint(simulationResult.gridWidth);
      const gridD = uint(simulationResult.gridDepth);

      // 2. WebGPU Compute Shader using TSL Fn()
      this.computeUpdate = Fn(() => {
        const pos = positions.element(instanceIndex);
        const vel = velocities.element(instanceIndex);
        const state = states.element(instanceIndex); // x: life, y: maxLife, z: isHot, w: tempC
        const col = colors.element(instanceIndex);
        const origin = spawnOrigins.element(instanceIndex);
        const meta = spawnMeta.element(instanceIndex);

        // Advance remaining lifetime
        state.x.subAssign(dt);

        const isHot = state.z.greaterThan(0.5);

        // Sample 2D Thermal Grid at current (pos.x, pos.z) in 18m x 9m room
        const normX = clamp(pos.x.add(9.0).div(18.0), float(0.0), float(0.999));
        const normZ = clamp(pos.z.add(4.5).div(9.0), float(0.0), float(0.999));
        const gx = uint(normX.mul(float(simulationResult.gridWidth)));
        const gz = uint(normZ.mul(float(simulationResult.gridDepth)));
        const gridIdx = gz.mul(gridW).add(gx);
        const floorTempC = thermalGrid.element(gridIdx);

        // Update particle temperature on GPU via convective heat transfer with local thermal field
        const targetTemp = select(
          isHot,
          floorTempC.add(float(4.0)),
          mix(float(18.0), floorTempC, smoothstep(float(-1.4), float(0.5), pos.y))
        );
        state.w.assign(mix(state.w, targetTemp, clamp(dt.mul(1.8), float(0.0), float(1.0))));

        // Real-time 3D Vector Field (Convection, Buoyancy, Cold Aisle Draw, & Turbulence)
        const wavePhase = time.mul(2.2).add(float(instanceIndex).mul(0.013));
        const swirlX = sin(pos.z.mul(1.4).add(wavePhase)).mul(0.35);
        const swirlZ = cos(pos.x.mul(1.1).sub(wavePhase)).mul(0.35);

        // Thermal buoyancy: hot exhaust rises faster as temperature increases
        const hotBuoyancy = clamp(state.w.sub(20.0).mul(0.09), float(0.45), float(1.65));
        // Cold supply air stays near the floor until drawn into rack intakes near |z| < 1.8
        const nearAisle = smoothstep(float(2.5), float(0.4), pos.z.abs());
        const coldVertical = mix(float(-0.22), float(0.38), nearAisle);
        const verticalAccel = select(isHot, hotBuoyancy, coldVertical);

        // Convective Z-axis circulation:
        // - Cold particles get pulled toward the central aisle (z -> 0)
        // - Hot particles near the ceiling (y > 0.4) return toward outer perimeter CRAC intakes
        const coldAislePullZ = pos.z.negate().mul(0.45);
        const hotCeilingReturnZ = select(
           presetMode.lessThan(0.5),
          // Preset A: Same-direction layout causes Row 1 exhaust to sweep South (+Z) into Row 2
          float(0.65),
          // Preset B & C: Hot air vents outward toward North/South return plenums
          select(pos.z.lessThan(0.0), float(-0.55), float(0.55))
        );
        const zFieldAccel = select(isHot, hotCeilingReturnZ, coldAislePullZ);

        // Preset C starvation drift: CRAC-02 (right side) is stopped, inducing rightward thermal drift
        const presetCDriftX = select(
          presetMode.greaterThan(1.5).and(pos.x.greaterThan(1.0)),
          float(0.4),
          float(0.0)
        );

        vel.x.addAssign(swirlX.add(presetCDriftX).mul(dt));
        vel.y.addAssign(verticalAccel.mul(dt));
        vel.z.addAssign(zFieldAccel.add(swirlZ).mul(dt));

        // Mild aerodynamic damping for numerical stability
        vel.mulAssign(float(1.0).sub(dt.mul(0.18)));

        // Integrate position
        pos.addAssign(vel.mul(dt));

        // Room boundary check (18m x 3m x 9m -> X: [-9, 9], Y: [-1.5, 1.5], Z: [-4.5, 4.5])
        const isOutOfBounds = pos.y
          .greaterThan(1.48)
          .or(pos.y.lessThan(-1.48))
          .or(pos.x.greaterThan(8.9))
          .or(pos.x.lessThan(-8.9))
          .or(pos.z.greaterThan(4.4))
          .or(pos.z.lessThan(-4.4));

        // Respawn at exact assigned CRAC or Rack emitter when expired or out of bounds
        If(state.x.lessThanEqual(0.0).or(isOutOfBounds), () => {
          state.x.assign(state.y);
          state.w.assign(meta.w);

          const seed = instanceIndex.add(uint(time.mul(60.0)));
          const jx = hash(seed).sub(0.5).mul(0.35);
          const jy = hash(seed.add(uint(17))).sub(0.5).mul(0.18);
          const jz = hash(seed.add(uint(31))).sub(0.5).mul(0.35);

          pos.assign(origin.add(vec3(jx, jy, jz)));
          vel.assign(meta.xyz.add(vec3(jx.mul(0.5), jy.mul(0.3), jz.mul(0.5))));
        });

        // Dynamic GPU Color Evaluation from particle temperature (state.w) & lifetime ratio
        const lifeRatio = clamp(state.x.div(state.y), float(0.0), float(1.0));
        // Smooth fade-in during first 15% of life and fade-out near expiration
        const fade = smoothstep(float(0.0), float(0.15), lifeRatio).mul(
          smoothstep(float(0.0), float(0.25), float(1.0).sub(lifeRatio.mul(0.85)))
        );

        const coldCyan = vec3(0.22, 0.74, 0.97); // #38bdf8 (<22°C)
        const coolGreen = vec3(0.2, 0.83, 0.6); // #34d399 (22-25°C)
        const warmOrange = vec3(0.98, 0.57, 0.24); // #fb923c (25-28°C)
        const hotRed = vec3(0.94, 0.25, 0.37); // #f43f5e (>=28°C)

        const coldDynamicCol = mix(
          coldCyan,
          coolGreen,
          smoothstep(float(20.5), float(25.0), state.w)
        );
        const hotDynamicCol = mix(
          warmOrange,
          hotRed,
          smoothstep(float(26.5), float(31.5), state.w)
        );

        const baseColor = select(isHot, hotDynamicCol, coldDynamicCol);
        col.assign(baseColor.mul(clamp(fade.mul(0.75), float(0.12), float(0.75))));
      })().compute(count);

      // 3. Instanced Sprite with PointsNodeMaterial for subtle multi-pixel particle rendering
      const material = new THREE.PointsNodeMaterial();
      material.positionNode = positions.element(instanceIndex);
      material.colorNode = colors.element(instanceIndex);
      material.sizeNode = float(1.5);
      // Soft radial circle falloff per particle sprite with 80% transparency (opacity 0.20)
      const distFromCenter = length(uv().sub(0.5));
      material.opacityNode = smoothstep(float(0.5), float(0.12), distFromCenter).mul(0.20);
      material.transparent = true;
      material.depthWrite = false;
      material.blending = THREE.NormalBlending;

      const sprite = new THREE.Sprite(material);
      sprite.count = count;
      sprite.frustumCulled = false;
      sprite.name = 'webgpuAirflowParticles';

      this.points = sprite;
      this.isReady = true;
    } catch (err) {
      console.warn('[WebGPUParticleSystem] Failed to initialize WebGPU compute particles:', err);
      this.isReady = false;
      this.dispose();
    }
  }

  public update(dt: number): void {
    if (!this.isReady || !this.computeUpdate || !this.renderer) return;

    try {
      const clampedDt = Math.min(dt, 0.05);
      this.elapsedTime += clampedDt;
      this.dtUniform.value = clampedDt;
      this.timeUniform.value = this.elapsedTime;

      // Dispatch WebGPU Compute Shader
      this.renderer.compute(this.computeUpdate);
    } catch (err) {
      console.warn('[WebGPUParticleSystem] Compute execution failed, switching flag:', err);
      this.isReady = false;
    }
  }

  /**
   * Synchronizes emitters and thermal grid buffer in-place when Preset A / B / C changes,
   * avoiding GPU buffer re-allocation and preventing memory leaks.
   */
  public setScenario(scenario: Scenario, simulationResult: SimulationResult): void {
    const { coldEmitters, hotEmitters } = buildAirflowEmitters(scenario, simulationResult);
    this.coldEmitters = coldEmitters;
    this.hotEmitters = hotEmitters;
    this.presetModeUniform.value = this.getPresetCode(scenario.selectedPreset);

    if (
      this.isReady &&
      this.positionsNode &&
      this.velocitiesNode &&
      this.statesNode &&
      this.colorsNode &&
      this.spawnOriginsNode &&
      this.spawnMetaNode &&
      this.thermalGridAttr
    ) {
      this.populateSeedArrays();

      this.positionsNode.value.array.set(this.initPositionsArr);
      this.positionsNode.value.needsUpdate = true;

      this.velocitiesNode.value.array.set(this.initVelocitiesArr);
      this.velocitiesNode.value.needsUpdate = true;

      this.statesNode.value.array.set(this.initStatesArr);
      this.statesNode.value.needsUpdate = true;

      this.colorsNode.value.array.set(this.initColorsArr);
      this.colorsNode.value.needsUpdate = true;

      this.spawnOriginsNode.value.array.set(this.initSpawnOriginsArr);
      this.spawnOriginsNode.value.needsUpdate = true;

      this.spawnMetaNode.value.array.set(this.initSpawnMetaArr);
      this.spawnMetaNode.value.needsUpdate = true;

      const gridArr = this.thermalGridAttr.array as Float32Array;
      if (gridArr.length === simulationResult.temperatureGrid.length) {
        gridArr.set(simulationResult.temperatureGrid);
        this.thermalGridAttr.needsUpdate = true;
      }
      return;
    }

    // Full re-init if buffers were not ready
    this.dispose();
    this.init(simulationResult);
  }

  /**
   * Explicitly disposes all WebGPU StorageBufferNodes, ComputeNodes, and materials.
   */
  public dispose(): void {
    if (this.computeUpdate && typeof this.computeUpdate.dispose === 'function') {
      try {
        this.computeUpdate.dispose();
      } catch {
        // ignore
      }
    }
    this.computeUpdate = null;

    const bufferNodes = [
      this.positionsNode,
      this.velocitiesNode,
      this.statesNode,
      this.colorsNode,
      this.spawnOriginsNode,
      this.spawnMetaNode,
      this.thermalGridNode,
    ];
    for (const node of bufferNodes) {
      if (node && typeof node.dispose === 'function') {
        try {
          node.dispose();
        } catch {
          // ignore
        }
      }
    }

    this.positionsNode = null;
    this.velocitiesNode = null;
    this.statesNode = null;
    this.colorsNode = null;
    this.spawnOriginsNode = null;
    this.spawnMetaNode = null;
    this.thermalGridNode = null;
    this.thermalGridAttr = null;

    if (this.points) {
      // Do NOT dispose shared Sprite geometry; only dispose custom non-Sprite geometry
      if (!(this.points as any).isSprite && (this.points as any).geometry) {
        (this.points as any).geometry.dispose();
      }
      const mat = (this.points as any).material;
      if (mat) {
        if (Array.isArray(mat)) {
          mat.forEach((m) => m.dispose());
        } else {
          mat.dispose();
        }
      }
      this.points = null;
    }

    this.isReady = false;
  }
}

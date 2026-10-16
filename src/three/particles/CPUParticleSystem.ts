import * as THREE from 'three';
import type { Scenario } from '../../domain/scenario';
import type { SimulationResult } from '../../simulation/types';
import type { AirflowEmitter } from './types';
import { buildAirflowEmitters } from './particleEmitters';
import { DEFAULT_PARTICLE_CONFIG } from './types';

interface CPUParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  type: 'cold' | 'hot';
  r: number;
  g: number;
  b: number;
}

export class CPUParticleSystem {
  public points: THREE.Points;
  private count: number;
  private particles: CPUParticle[] = [];
  private positions: Float32Array;
  private colors: Float32Array;
  private coldEmitters: AirflowEmitter[] = [];
  private hotEmitters: AirflowEmitter[] = [];
  private roomBounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };

  constructor(
    scenario: Scenario,
    simulationResult: SimulationResult,
    count: number = DEFAULT_PARTICLE_CONFIG.maxCPUParticles
  ) {
    this.count = count;
    this.positions = new Float32Array(count * 3);
    this.colors = new Float32Array(count * 3);

    const hw = scenario.room.widthM / 2;
    const hd = scenario.room.depthM / 2;
    const hh = scenario.room.heightM / 2;
    this.roomBounds = {
      minX: -hw,
      maxX: hw,
      minY: -hh,
      maxY: hh,
      minZ: -hd,
      maxZ: hd,
    };

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

    const material = new THREE.PointsMaterial({
      size: 1.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.20,
      blending: THREE.NormalBlending,
      depthWrite: false,
    });

    this.points = new THREE.Points(geometry, material);
    this.points.name = 'cpuAirflowParticles';

    this.setScenario(scenario, simulationResult);
    this.initParticles();
  }

  public setScenario(scenario: Scenario, simulationResult: SimulationResult): void {
    const { coldEmitters, hotEmitters } = buildAirflowEmitters(scenario, simulationResult);
    this.coldEmitters = coldEmitters;
    this.hotEmitters = hotEmitters;

    const hw = scenario.room.widthM / 2;
    const hd = scenario.room.depthM / 2;
    const hh = scenario.room.heightM / 2;
    this.roomBounds = {
      minX: -hw,
      maxX: hw,
      minY: -hh,
      maxY: hh,
      minZ: -hd,
      maxZ: hd,
    };
  }

  private initParticles(): void {
    this.particles = [];
    for (let i = 0; i < this.count; i++) {
      const p: CPUParticle = {
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        type: i % 2 === 0 ? 'cold' : 'hot',
        r: 1,
        g: 1,
        b: 1,
      };
      this.respawnParticle(p, Math.random());
      this.particles.push(p);

      const idx = i * 3;
      this.positions[idx] = p.x;
      this.positions[idx + 1] = p.y;
      this.positions[idx + 2] = p.z;

      this.colors[idx] = p.r;
      this.colors[idx + 1] = p.g;
      this.colors[idx + 2] = p.b;
    }

    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }

  private respawnParticle(p: CPUParticle, progressOffset: number = 0): void {
    // 55% cold particles, 45% hot exhaust particles
    const isCold = Math.random() < 0.55;
    const emitterList = isCold ? this.coldEmitters : this.hotEmitters;

    if (emitterList.length === 0) {
      // Fallback if no emitters of this type
      p.x = 0;
      p.y = 0;
      p.z = 0;
      p.vx = 0;
      p.vy = 0;
      p.vz = 0;
      p.life = 0;
      return;
    }

    const emitter = emitterList[Math.floor(Math.random() * emitterList.length)];
    p.type = emitter.type;

    // Position around emitter with jitter
    const jitter = 0.25;
    p.x = emitter.position[0] + (Math.random() - 0.5) * jitter;
    p.y = emitter.position[1] + (Math.random() - 0.5) * jitter;
    p.z = emitter.position[2] + (Math.random() - 0.5) * jitter;

    // Velocity based on emitter direction + slight divergence
    const speed = emitter.speed * (0.8 + Math.random() * 0.4);
    p.vx = emitter.direction[0] * speed + (Math.random() - 0.5) * 0.3;
    p.vy = emitter.direction[1] * speed + (Math.random() - 0.5) * 0.2;
    p.vz = emitter.direction[2] * speed + (Math.random() - 0.5) * 0.3;

    // Lifetime
    p.maxLife = 2.0 + Math.random() * 2.5;
    p.life = p.maxLife * (1 - progressOffset);

    // Initial offset along trajectory if spawning at startup
    if (progressOffset > 0) {
      p.x += p.vx * (p.maxLife * progressOffset);
      p.y += p.vy * (p.maxLife * progressOffset);
      p.z += p.vz * (p.maxLife * progressOffset);
    }

    // Color
    p.r = emitter.color[0];
    p.g = emitter.color[1];
    p.b = emitter.color[2];
  }

  public update(dt: number): void {
    const clampedDt = Math.min(dt, 0.05);

    for (let i = 0; i < this.count; i++) {
      const p = this.particles[i];
      p.life -= clampedDt;

      // Check boundary or lifetime expiration
      const outOfBounds =
        p.x < this.roomBounds.minX ||
        p.x > this.roomBounds.maxX ||
        p.y < this.roomBounds.minY ||
        p.y > this.roomBounds.maxY ||
        p.z < this.roomBounds.minZ ||
        p.z > this.roomBounds.maxZ;

      if (p.life <= 0 || outOfBounds) {
        this.respawnParticle(p);
      } else {
        // Natural airflow physics:
        // Hot air rises (buoyancy)
        if (p.type === 'hot') {
          p.vy += 0.8 * clampedDt;
        } else {
          // Cold air is dense, tends to stay closer to floor level
          p.vy -= 0.2 * clampedDt;
        }

        p.x += p.vx * clampedDt;
        p.y += p.vy * clampedDt;
        p.z += p.vz * clampedDt;
      }

      const idx = i * 3;
      this.positions[idx] = p.x;
      this.positions[idx + 1] = p.y;
      this.positions[idx + 2] = p.z;

      // Fade color towards end of life
      const lifeRatio = Math.max(0.1, Math.min(1.0, p.life / p.maxLife));
      this.colors[idx] = p.r * lifeRatio;
      this.colors[idx + 1] = p.g * lifeRatio;
      this.colors[idx + 2] = p.b * lifeRatio;
    }

    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }

  public dispose(): void {
    if (this.points) {
      if (this.points.geometry) this.points.geometry.dispose();
      if (this.points.material) {
        if (Array.isArray(this.points.material)) {
          this.points.material.forEach((m) => m.dispose());
        } else {
          this.points.material.dispose();
        }
      }
    }
  }
}

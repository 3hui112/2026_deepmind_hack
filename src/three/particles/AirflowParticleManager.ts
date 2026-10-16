import * as THREE from 'three';
import type { Scenario } from '../../domain/scenario';
import type { SimulationResult } from '../../simulation/types';
import type { ParticleBackend } from './types';
import { DEFAULT_PARTICLE_CONFIG } from './types';
import { CPUParticleSystem } from './CPUParticleSystem';
import { WebGPUParticleSystem } from './WebGPUParticleSystem';

export class AirflowParticleManager {
  private scene: THREE.Scene;
  private renderer: any;
  private scenario: Scenario;
  private simulationResult: SimulationResult;
  private forceCpuFallback: boolean;
  private targetWebGPUCount: number;

  private webgpuSystem: WebGPUParticleSystem | null = null;
  private cpuSystem: CPUParticleSystem | null = null;
  private activeBackend: ParticleBackend = 'cpu_fallback';

  // Performance tracking
  private frameCount = 0;
  private lastFpsTime = performance.now();
  private currentFps = 60;

  constructor(
    scene: THREE.Scene,
    renderer: any,
    scenario: Scenario,
    simulationResult: SimulationResult,
    forceCpuFallback: boolean = false,
    optionsOrCount: number | { maxWebGPUParticles?: number } = DEFAULT_PARTICLE_CONFIG.maxWebGPUParticles
  ) {
    this.scene = scene;
    this.renderer = renderer;
    this.scenario = scenario;
    this.simulationResult = simulationResult;
    this.forceCpuFallback = forceCpuFallback;
    this.targetWebGPUCount =
      typeof optionsOrCount === 'number'
        ? optionsOrCount
        : optionsOrCount?.maxWebGPUParticles ?? DEFAULT_PARTICLE_CONFIG.maxWebGPUParticles;

    this.rebuildSystem();
  }

  public setVisible(visible: boolean): void {
    if (this.webgpuSystem?.points) {
      this.webgpuSystem.points.visible = visible;
    }
    if (this.cpuSystem?.points) {
      this.cpuSystem.points.visible = visible;
    }
  }

  public rebuildSystem(): void {
    this.disposeCurrent();

    const isWebGPURenderer =
      this.renderer &&
      typeof this.renderer.compute === 'function' &&
      !this.forceCpuFallback;

    if (isWebGPURenderer) {
      try {
        const gpuSys = new WebGPUParticleSystem(
          this.renderer,
          this.scenario,
          this.simulationResult,
          this.targetWebGPUCount
        );

        if (gpuSys.isReady && gpuSys.points) {
          this.webgpuSystem = gpuSys;
          this.activeBackend = 'webgpu_compute';
          this.scene.add(gpuSys.points);
          return;
        }
      } catch (e) {
        console.warn('[AirflowParticleManager] Falling back to CPU particle system:', e);
      }
    }

    // CPU Fallback
    const cpuSys = new CPUParticleSystem(
      this.scenario,
      this.simulationResult,
      DEFAULT_PARTICLE_CONFIG.maxCPUParticles
    );
    this.cpuSystem = cpuSys;
    this.activeBackend = 'cpu_fallback';
    this.scene.add(cpuSys.points);
  }

  public setTargetParticleCount(count: number): void {
    const clamped = Math.max(1000, Math.min(50000, count));
    if (this.targetWebGPUCount !== clamped) {
      this.targetWebGPUCount = clamped;
      if (this.activeBackend === 'webgpu_compute') {
        this.rebuildSystem();
      }
    }
  }

  public setForceCpuFallback(force: boolean): void {
    if (this.forceCpuFallback !== force) {
      this.forceCpuFallback = force;
      this.rebuildSystem();
    }
  }

  public setScenario(scenario: Scenario, simulationResult: SimulationResult): void {
    this.scenario = scenario;
    this.simulationResult = simulationResult;

    if (this.webgpuSystem && this.webgpuSystem.isReady) {
      this.webgpuSystem.setScenario(scenario, simulationResult);
      if (this.webgpuSystem.points && !this.webgpuSystem.points.parent) {
        this.scene.add(this.webgpuSystem.points);
      }
    } else if (this.cpuSystem) {
      this.cpuSystem.setScenario(scenario, simulationResult);
    }
  }

  public update(dt: number, isTabVisible: boolean = true): void {
    // If tab is hidden/minimized, skip particle updates to save power
    if (!isTabVisible) return;

    // FPS calculation
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsTime >= 500) {
      this.currentFps = Math.round((this.frameCount * 1000) / (now - this.lastFpsTime));
      this.frameCount = 0;
      this.lastFpsTime = now;
    }

    if (this.activeBackend === 'webgpu_compute' && this.webgpuSystem) {
      if (this.webgpuSystem.isReady) {
        this.webgpuSystem.update(dt);
      } else {
        // Fallback to CPU if compute failed during runtime
        this.forceCpuFallback = true;
        this.rebuildSystem();
      }
    } else if (this.cpuSystem) {
      this.cpuSystem.update(dt);
    }
  }

  public getStatus(): {
    backend: ParticleBackend;
    particleCount: number;
    fps: number;
    isCompute: boolean;
  } {
    const isCompute = this.activeBackend === 'webgpu_compute';
    const particleCount = isCompute
      ? this.webgpuSystem?.count ?? this.targetWebGPUCount
      : DEFAULT_PARTICLE_CONFIG.maxCPUParticles;

    return {
      backend: this.activeBackend,
      particleCount,
      fps: this.currentFps,
      isCompute,
    };
  }

  private disposeCurrent(): void {
    if (this.webgpuSystem) {
      if (this.webgpuSystem.points) {
        this.scene.remove(this.webgpuSystem.points);
      }
      this.webgpuSystem.dispose();
      this.webgpuSystem = null;
    }

    if (this.cpuSystem) {
      if (this.cpuSystem.points) {
        this.scene.remove(this.cpuSystem.points);
      }
      this.cpuSystem.dispose();
      this.cpuSystem = null;
    }
  }

  public dispose(): void {
    this.disposeCurrent();
  }
}

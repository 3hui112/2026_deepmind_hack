import * as THREE from 'three';
import * as THREE_WEBGPU from 'three/webgpu';
import {
  Fn,
  instancedArray,
  instanceIndex,
  storage,
  uniform,
  vec3,
  float,
  uint,
  select,
  sin,
  mix,
  clamp,
  smoothstep,
  length,
  uv,
} from 'three/tsl';
import type { Scenario } from '../domain/scenario';
import type { SimulationResult } from '../simulation/types';
import { createThermalDataTexture } from './thermalTexture';

/**
 * WebGPU-Accelerated 3D Thermal Grid Volume Renderer
 *
 * Reads the CPU 2D `SimulationResult.temperatureGrid` (from `thermalEngine.ts`)
 * into a WebGPU TSL StorageBuffer (`storage(gridAttr, 'float', gridSize)`) and runs
 * a GPU Compute Shader across a 3D volumetric lattice (36 × 5 × 18 = 3,240 voxels)
 * plus elevated isothermal slice planes to visualize vertical thermal stratification
 * (sub-floor cold supply -> rack intake zone -> ceiling hot exhaust plume).
 */
export class WebGPUThermalGridVolume {
  public group: THREE.Group;
  private renderer: any;
  private isWebGPU: boolean = false;
  private computeVolumeNode: any = null;
  private timeUniform: any;
  private elapsedTime: number = 0;

  // 3D lattice dimensions (36 x 5 x 18 = 3,240 volumetric thermal nodes)
  private readonly nx = 36;
  private readonly ny = 5;
  private readonly nz = 18;
  private readonly voxelCount = 36 * 5 * 18;

  // GPU Storage Buffer Nodes
  private voxelPositionsNode: any = null;
  private voxelColorsNode: any = null;
  private voxelSizesNode: any = null;
  private grid2DAttr: THREE_WEBGPU.StorageBufferAttribute | null = null;
  private grid2DNode: any = null;
  private volumeSprite: THREE.Object3D | null = null;

  // Multi-elevation thermal slice planes (Intake Height & Ceiling Exhaust Height)
  private midSliceMesh: THREE.Mesh | null = null;
  private topSliceMesh: THREE.Mesh | null = null;

  private scene: THREE.Scene;

  constructor(
    scene: THREE.Scene,
    renderer: any,
    scenario: Scenario,
    simulationResult: SimulationResult,
    enableWebGPUCompute: boolean = true
  ) {
    this.scene = scene;
    this.renderer = renderer;
    this.group = new THREE.Group();
    this.group.name = 'webgpuThermalGridVolume';
    this.timeUniform = uniform(0.0);

    const canUseWebGPU =
      renderer &&
      typeof renderer.compute === 'function' &&
      enableWebGPUCompute;

    this.initSlicePlanes(scenario, simulationResult);

    if (canUseWebGPU) {
      this.initWebGPUVolume(scenario, simulationResult);
    }

    this.scene.add(this.group);
  }

  /**
   * Creates horizontal isothermal slice planes at mid-rack intake height (Y = -0.1m)
   * and ceiling return plenum height (Y = +1.05m) derived from `temperatureGrid`.
   */
  private initSlicePlanes(scenario: Scenario, simulationResult: SimulationResult): void {
    const { widthM, depthM } = scenario.room;

    const tex = createThermalDataTexture(
      simulationResult.temperatureGrid,
      simulationResult.gridWidth,
      simulationResult.gridDepth
    );

    const midGeo = new THREE.PlaneGeometry(widthM, depthM);
    const midMat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.06,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.midSliceMesh = new THREE.Mesh(midGeo, midMat);
    this.midSliceMesh.rotation.x = -Math.PI / 2;
    this.midSliceMesh.position.y = -0.1; // Rack intake level
    this.group.add(this.midSliceMesh);

    const topGeo = new THREE.PlaneGeometry(widthM, depthM);
    const topMat = new THREE.MeshBasicMaterial({
      map: tex.clone(),
      transparent: true,
      opacity: 0.05,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    if (topMat.map) topMat.map.needsUpdate = true;
    this.topSliceMesh = new THREE.Mesh(topGeo, topMat);
    this.topSliceMesh.rotation.x = -Math.PI / 2;
    this.topSliceMesh.position.y = 1.05; // Ceiling hot exhaust plume level
    this.group.add(this.topSliceMesh);
  }

  /**
   * Initializes the WebGPU TSL Compute Pipeline that reads `SimulationResult.temperatureGrid`
   * from a GPU StorageBuffer and computes the 3D volumetric thermal lattice.
   */
  private initWebGPUVolume(scenario: Scenario, simulationResult: SimulationResult): void {
    try {
      const count = this.voxelCount;
      const initPositions = new Float32Array(count * 3);
      const initColors = new Float32Array(count * 3);
      const initSizes = new Float32Array(count);

      const { widthM, heightM, depthM } = scenario.room;
      const hw = widthM / 2;
      const hd = depthM / 2;
      const floorY = -heightM / 2;

      let idx = 0;
      for (let iy = 0; iy < this.ny; iy++) {
        const y = floorY + 0.35 + (iy / (this.ny - 1)) * (heightM - 0.65);
        for (let iz = 0; iz < this.nz; iz++) {
          const z = -hd + ((iz + 0.5) / this.nz) * depthM;
          for (let ix = 0; ix < this.nx; ix++) {
            const x = -hw + ((ix + 0.5) / this.nx) * widthM;
            const i3 = idx * 3;
            initPositions[i3] = x;
            initPositions[i3 + 1] = y;
            initPositions[i3 + 2] = z;

            initColors[i3] = 0.22;
            initColors[i3 + 1] = 0.74;
            initColors[i3 + 2] = 0.97;
            initSizes[idx] = 10.0;
            idx++;
          }
        }
      }

      this.voxelPositionsNode = instancedArray(initPositions, 'vec3');
      this.voxelColorsNode = instancedArray(initColors, 'vec3');
      this.voxelSizesNode = instancedArray(initSizes, 'float');

      // Upload 2D temperatureGrid into GPU StorageBufferAttribute
      const gridLength = simulationResult.temperatureGrid.length;
      const gridCopy = new Float32Array(gridLength);
      gridCopy.set(simulationResult.temperatureGrid);
      this.grid2DAttr = new THREE_WEBGPU.StorageBufferAttribute(gridCopy, 1);
      this.grid2DNode = storage(this.grid2DAttr, 'float', gridLength).toReadOnly();

      const positions = this.voxelPositionsNode;
      const colors = this.voxelColorsNode;
      const sizes = this.voxelSizesNode;
      const grid2D = this.grid2DNode;
      const time = this.timeUniform;
      const gridW = uint(simulationResult.gridWidth);

      this.computeVolumeNode = Fn(() => {
        const pos = positions.element(instanceIndex);
        const col = colors.element(instanceIndex);
        const sz = sizes.element(instanceIndex);

        // Map 3D voxel (pos.x, pos.z) to 2D temperatureGrid cell index
        const normX = clamp(pos.x.add(9.0).div(18.0), float(0.0), float(0.999));
        const normZ = clamp(pos.z.add(4.5).div(9.0), float(0.0), float(0.999));
        const gx = uint(normX.mul(float(simulationResult.gridWidth)));
        const gz = uint(normZ.mul(float(simulationResult.gridDepth)));
        const cellIdx = gz.mul(gridW).add(gx);

        const baseTemp = grid2D.element(cellIdx);

        // Vertical height fraction (0 = floor, 1 = ceiling)
        const hFrac = clamp(pos.y.add(1.5).div(3.0), float(0.0), float(1.0));

        // Vertical thermal stratification:
        // Floor layer is cooler, upper ceiling layer accumulates buoyant heat from hot spots
        const thermalDelta = select(
          baseTemp.greaterThan(25.0),
          hFrac.mul(2.4),
          hFrac.sub(0.5).mul(1.2)
        );
        const shimmer = sin(time.mul(2.0).add(pos.x.mul(0.8)).add(pos.z.mul(0.8))).mul(0.15);
        const voxelTemp = baseTemp.add(thermalDelta).add(shimmer);

        // Map voxelTemp strictly to the 5-band ASHRAE thermal color scale
        const cBlue = vec3(0.22, 0.74, 0.97); // <22°C (#38bdf8)
        const cGreen = vec3(0.2, 0.83, 0.6); // 22-25°C (#34d399)
        const cYellow = vec3(0.98, 0.8, 0.08); // 25-27°C (#facc15)
        const cOrange = vec3(0.98, 0.57, 0.24); // 27-30°C (#fb923c)
        const cRed = vec3(0.94, 0.27, 0.27); // >=30°C (#ef4444)

        const band1 = mix(cBlue, cGreen, smoothstep(float(21.5), float(23.5), voxelTemp));
        const band2 = mix(band1, cYellow, smoothstep(float(24.5), float(26.5), voxelTemp));
        const band3 = mix(band2, cOrange, smoothstep(float(26.8), float(28.8), voxelTemp));
        const finalCol = mix(band3, cRed, smoothstep(float(29.5), float(32.0), voxelTemp));

        col.assign(finalCol);

        // Emphasize hot zones (>26°C) and cool supply plumes (<20.5°C) in volumetric rendering
        const hotEmphasis = smoothstep(float(25.0), float(31.0), voxelTemp);
        const coldEmphasis = smoothstep(float(21.0), float(18.5), voxelTemp);
        const importance = clamp(hotEmphasis.add(coldEmphasis.mul(0.6)), float(0.15), float(1.0));
        sz.assign(mix(float(2.0), float(4.5), importance));
      })().compute(count);

      const mat = new THREE_WEBGPU.PointsNodeMaterial();
      mat.positionNode = positions.element(instanceIndex);
      mat.colorNode = colors.element(instanceIndex);
      mat.sizeNode = sizes.element(instanceIndex);
      const radialDist = length(uv().sub(0.5));
      mat.opacityNode = smoothstep(float(0.5), float(0.05), radialDist).mul(0.06);
      mat.transparent = true;
      mat.depthWrite = false;
      mat.blending = THREE.NormalBlending;

      const sprite = new THREE_WEBGPU.Sprite(mat);
      sprite.count = count;
      sprite.frustumCulled = false;
      sprite.name = 'webgpuThermalVolumeVoxels';

      this.volumeSprite = sprite;
      this.group.add(sprite);
      this.isWebGPU = true;

      // Run initial compute pass
      this.renderer.compute(this.computeVolumeNode);
    } catch (err) {
      console.warn('[WebGPUThermalGridVolume] WebGPU volume compute fallback to slice planes:', err);
      this.isWebGPU = false;
    }
  }

  public update(dt: number): void {
    if (!this.group.visible) return;
    if (this.isWebGPU && this.computeVolumeNode && this.renderer) {
      try {
        this.elapsedTime += Math.min(dt, 0.05);
        this.timeUniform.value = this.elapsedTime;
        this.renderer.compute(this.computeVolumeNode);
      } catch {
        this.isWebGPU = false;
      }
    }
  }

  public setScenario(_scenario: Scenario, simulationResult: SimulationResult): void {
    // Update slice plane textures
    const updateMeshTex = (mesh: THREE.Mesh | null) => {
      if (!mesh || !mesh.material) return;
      const mat = mesh.material as THREE.MeshBasicMaterial;
      if (mat.map) mat.map.dispose();
      mat.map = createThermalDataTexture(
        simulationResult.temperatureGrid,
        simulationResult.gridWidth,
        simulationResult.gridDepth
      );
      mat.needsUpdate = true;
    };

    updateMeshTex(this.midSliceMesh);
    updateMeshTex(this.topSliceMesh);

    // Update GPU StorageBuffer for 3D Compute Volume
    if (this.grid2DAttr) {
      const arr = this.grid2DAttr.array as Float32Array;
      if (arr.length === simulationResult.temperatureGrid.length) {
        arr.set(simulationResult.temperatureGrid);
        this.grid2DAttr.needsUpdate = true;
      }
    }
  }

  public setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  public dispose(): void {
    if (this.computeVolumeNode && typeof this.computeVolumeNode.dispose === 'function') {
      try {
        this.computeVolumeNode.dispose();
      } catch {
        // ignore
      }
    }
    this.computeVolumeNode = null;

    for (const node of [
      this.voxelPositionsNode,
      this.voxelColorsNode,
      this.voxelSizesNode,
      this.grid2DNode,
    ]) {
      if (node && typeof node.dispose === 'function') {
        try {
          node.dispose();
        } catch {
          // ignore
        }
      }
    }
    this.voxelPositionsNode = null;
    this.voxelColorsNode = null;
    this.voxelSizesNode = null;
    this.grid2DNode = null;
    this.grid2DAttr = null;

    if (this.volumeSprite) {
      const mat = (this.volumeSprite as any).material;
      if (mat && typeof mat.dispose === 'function') mat.dispose();
      this.group.remove(this.volumeSprite);
      this.volumeSprite = null;
    }

    for (const mesh of [this.midSliceMesh, this.topSliceMesh]) {
      if (mesh) {
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.MeshBasicMaterial;
        if (mat) {
          if (mat.map) mat.map.dispose();
          mat.dispose();
        }
        this.group.remove(mesh);
      }
    }
    this.midSliceMesh = null;
    this.topSliceMesh = null;

    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
  }
}

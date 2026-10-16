import * as THREE from 'three';
import type { Scenario, RoomDimensions } from '../domain/scenario';
import type { SimulationResult } from '../simulation/types';
import { createRackMesh } from './createRackMesh';
import { createCracMesh } from './createCracMesh';
import { disposeHierarchy } from './disposeScene';
import { createThermalDataTexture } from './thermalTexture';

import type { RackUSlotState, BlueprintOverlayConfig } from '../domain/rackSlots';

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  dynamicObjectsGroup: THREE.Group;
}

/**
 * Creates and initializes the 3D Server Room Scene according to strict requirements:
 * - Room: 18m × 3m × 9m
 * - Origin: Room center (0, 0, 0)
 * - Floor and translucent walls
 * - Heatmap plane slightly above floor mapped with SimulationResult.temperatureGrid DataTexture
 * - Blueprint CAD floorplan overlay mapped slightly above floor (Y = floorY + 0.01)
 * - AmbientLight and DirectionalLight ONLY (No shadows, no reflections, no external GLTF)
 */
export function createScene(
  scenario: Scenario,
  simulationResult: SimulationResult,
  aspectRatio: number,
  showLabels: boolean = true,
  showHeatPillars: boolean = true,
  rackSlotStates?: Record<string, RackUSlotState>,
  blueprintConfig?: BlueprintOverlayConfig
): SceneContext {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060913); // Deep slate background

  const { room } = scenario;

  // 1. Perspective Camera positioned to clearly show the 18m x 9m rectangular room proportion
  const camera = new THREE.PerspectiveCamera(45, aspectRatio, 0.1, 100);
  camera.position.set(10.5, 8.5, 16.5);
  camera.lookAt(0, 0, 0);

  // 2. Pure Lighting: AmbientLight & DirectionalLight ONLY
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
  directionalLight.position.set(12, 16, 10);
  directionalLight.castShadow = false;
  scene.add(directionalLight);

  // 3. Room Floor, Enclosure Walls & Heatmap Plane
  createRoomEnclosure(scene, room, simulationResult);
  updateBlueprintOverlayTexture(scene, room, blueprintConfig);

  // 4. Dynamic Objects Group (racks and CRACs created strictly from Scenario)
  const dynamicObjectsGroup = new THREE.Group();
  dynamicObjectsGroup.name = 'dynamicObjects';
  scene.add(dynamicObjectsGroup);

  // Populate initial meshes
  populateSceneMeshes(
    dynamicObjectsGroup,
    scenario,
    simulationResult,
    showLabels,
    showHeatPillars,
    rackSlotStates
  );

  return {
    scene,
    camera,
    dynamicObjectsGroup,
  };
}

/**
 * Creates room floor, solid back/side walls, boundary wireframe, and thermal heatmap plane.
 */
function createRoomEnclosure(
  scene: THREE.Scene,
  room: RoomDimensions,
  simulationResult: SimulationResult
): void {
  const { widthM, depthM, heightM } = room;
  const floorY = -heightM / 2;

  // 1. Back Wall Plane (Z = -depthM / 2)
  const backWallGeo = new THREE.PlaneGeometry(widthM, heightM);
  const backWallMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.9,
    metalness: 0.1,
  });
  const backWallMesh = new THREE.Mesh(backWallGeo, backWallMat);
  backWallMesh.position.set(0, 0, -depthM / 2);
  scene.add(backWallMesh);

  // 2. Left Side Wall Plane (X = -widthM / 2)
  const leftWallGeo = new THREE.PlaneGeometry(depthM, heightM);
  const leftWallMat = new THREE.MeshStandardMaterial({
    color: 0x131e33,
    roughness: 0.9,
    metalness: 0.1,
  });
  const leftWallMesh = new THREE.Mesh(leftWallGeo, leftWallMat);
  leftWallMesh.rotation.y = Math.PI / 2;
  leftWallMesh.position.set(-widthM / 2, 0, 0);
  scene.add(leftWallMesh);

  // 3. Floor Plane (Y = floorY)
  const floorGeo = new THREE.PlaneGeometry(widthM, depthM);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x0c1322,
    roughness: 0.85,
    metalness: 0.1,
  });
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.y = floorY;
  scene.add(floorMesh);

  // Floor subtle tile grid helper
  const gridHelper = new THREE.GridHelper(widthM, Math.round(widthM), 0x1e293b, 0x0f172a);
  gridHelper.position.y = floorY + 0.002;
  scene.add(gridHelper);

  // 4. Thermal Heatmap Plane (elevated slightly above floor: floorY + 0.05)
  const heatmapGeo = new THREE.PlaneGeometry(widthM, depthM);
  const heatmapTex = createThermalDataTexture(
    simulationResult.temperatureGrid,
    simulationResult.gridWidth,
    simulationResult.gridDepth
  );
  const heatmapMat = new THREE.MeshBasicMaterial({
    map: heatmapTex,
    transparent: true,
    opacity: 0.82,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const heatmapMesh = new THREE.Mesh(heatmapGeo, heatmapMat);
  heatmapMesh.name = 'thermalHeatmapMesh';
  heatmapMesh.rotation.x = -Math.PI / 2;
  heatmapMesh.position.y = floorY + 0.05;
  scene.add(heatmapMesh);

  // 5. Translucent Boundary Wireframe Box (18m × 3m × 9m)
  const wallBoxGeo = new THREE.BoxGeometry(widthM, heightM, depthM);
  const edgesGeo = new THREE.EdgesGeometry(wallBoxGeo);
  const edgesMat = new THREE.LineBasicMaterial({
    color: 0x0284c7,
    transparent: true,
    opacity: 0.5,
  });
  const edgesLines = new THREE.LineSegments(edgesGeo, edgesMat);
  scene.add(edgesLines);
}

/**
 * Updates the 3D floor heatmap DataTexture using SimulationResult.
 * Explicitly disposes the previous texture to prevent GPU memory leaks.
 */
export function updateHeatmapTexture(
  scene: THREE.Scene,
  simulationResult: SimulationResult
): void {
  const heatmapMesh = scene.getObjectByName('thermalHeatmapMesh') as THREE.Mesh;
  if (heatmapMesh && heatmapMesh.material) {
    const mat = heatmapMesh.material as THREE.MeshBasicMaterial;
    if (mat.map) {
      mat.map.dispose(); // CRITICAL: Dispose previous texture
    }
    mat.map = createThermalDataTexture(
      simulationResult.temperatureGrid,
      simulationResult.gridWidth,
      simulationResult.gridDepth
    );
    mat.needsUpdate = true;
  }
}

/**
 * Safely updates or populates rack and CRAC meshes from Scenario state.
 * Uses ONLY the scenario.racks and scenario.cracs arrays without separate local data.
 */
export function populateSceneMeshes(
  group: THREE.Group,
  scenario: Scenario,
  simulationResult: SimulationResult,
  showLabels: boolean = true,
  showHeatPillars: boolean = true,
  rackSlotStates?: Record<string, RackUSlotState>
): void {
  // Dispose all existing children inside the dynamic group
  while (group.children.length > 0) {
    const child = group.children[0];
    disposeHierarchy(child);
    group.remove(child);
  }

  // Create rack meshes from scenario.racks using identical SimulationResult rackResults
  const rackResultMap = new Map(
    simulationResult.rackResults.map((r) => [r.id, r.intakeTempC])
  );

  scenario.racks.forEach((rack) => {
    const intakeTemp = rackResultMap.get(rack.id) ?? 20.0;
    const slotState = rackSlotStates ? rackSlotStates[rack.id] : undefined;
    const rackMesh = createRackMesh(
      rack,
      intakeTemp,
      scenario.room,
      showLabels,
      showHeatPillars,
      slotState
    );
    group.add(rackMesh);
  });

  // Create CRAC meshes from scenario.cracs
  scenario.cracs.forEach((crac) => {
    const cracMesh = createCracMesh(crac, scenario.room);
    group.add(cracMesh);
  });
}

/**
 * Creates a canvas texture drawing clean 2D CAD architectural blueprint lines & grid for data center floor.
 */
function createProceduralBlueprintTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // White paper background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Fine grid lines (0.6m tile representation)
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    const step = 32;
    for (let x = 0; x <= canvas.width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Wall perimeter
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 8;
    ctx.strokeRect(16, 16, canvas.width - 32, canvas.height - 32);

    // Architectural text watermark
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 20px monospace';
    ctx.fillText('Data Center Architectural CAD Blueprint Floorplan', 36, 48);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'procedural_blueprint';
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Updates or creates the 3D floor blueprint texture overlay mesh (Y = floorY + 0.01).
 */
export function updateBlueprintOverlayTexture(
  scene: THREE.Scene,
  room: RoomDimensions,
  blueprintConfig?: BlueprintOverlayConfig
): void {
  let blueprintMesh = scene.getObjectByName('blueprintOverlayMesh') as THREE.Mesh;
  const { widthM, depthM, heightM } = room;
  const floorY = -heightM / 2;

  if (!blueprintConfig || !blueprintConfig.enabled) {
    if (blueprintMesh) {
      blueprintMesh.visible = false;
    }
    return;
  }

  const scale = blueprintConfig.scale || 1.0;
  const planeWidth = widthM * scale;
  const planeDepth = depthM * scale;

  if (!blueprintMesh) {
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: blueprintConfig.opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    blueprintMesh = new THREE.Mesh(geo, mat);
    blueprintMesh.name = 'blueprintOverlayMesh';
    blueprintMesh.rotation.x = -Math.PI / 2;
    scene.add(blueprintMesh);
  }

  blueprintMesh.visible = true;
  blueprintMesh.scale.set(planeWidth, planeDepth, 1);
  blueprintMesh.position.set(
    blueprintConfig.offsetXM || 0,
    floorY + 0.01,
    blueprintConfig.offsetYM || 0
  );

  const mat = blueprintMesh.material as THREE.MeshBasicMaterial;
  mat.opacity = blueprintConfig.opacity;

  if (blueprintConfig.imageUrl) {
    const loader = new THREE.TextureLoader();
    loader.load(
      blueprintConfig.imageUrl,
      (texture) => {
        if (mat.map && mat.map.name !== 'procedural_blueprint') {
          mat.map.dispose();
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        mat.map = texture;
        mat.needsUpdate = true;
      },
      undefined,
      () => {
        if (!mat.map) {
          mat.map = createProceduralBlueprintTexture();
          mat.needsUpdate = true;
        }
      }
    );
  } else {
    if (!mat.map) {
      mat.map = createProceduralBlueprintTexture();
      mat.needsUpdate = true;
    }
  }
}

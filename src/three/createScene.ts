import * as THREE from 'three';
import type { Scenario, RoomDimensions } from '../domain/scenario';
import type { SimulationResult } from '../simulation/types';
import { createRackMesh } from './createRackMesh';
import { createCracMesh } from './createCracMesh';
import { disposeHierarchy } from './disposeScene';
import { createThermalDataTexture } from './thermalTexture';

import type { RackUSlotState } from '../domain/rackSlots';

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
 * - AmbientLight and DirectionalLight ONLY (No shadows, no reflections, no external GLTF)
 */
export function createScene(
  scenario: Scenario,
  simulationResult: SimulationResult,
  aspectRatio: number,
  showLabels: boolean = true,
  showHeatPillars: boolean = true,
  rackSlotStates?: Record<string, RackUSlotState>
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

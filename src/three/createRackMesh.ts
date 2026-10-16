import * as THREE from 'three';
import type { RackSpec, RoomDimensions } from '../domain/scenario';
import { getThermalColorHex, getThermalColorCss } from './thermalTexture';
import { GPU_HARDWARE_LIBRARY, getEmptyUSlotRanges, type RackUSlotState } from '../domain/rackSlots';

/**
 * Creates a text billboard sprite displaying Rack ID and Intake Temperature.
 */
function createRackLabelSprite(id: string, temp: number): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = temp > 27.0 ? '#ef4444' : '#0284c7';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(8, 8, 240, 80, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 26px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(id.replace('RACK-', 'R-'), 128, 42);

    ctx.fillStyle = getThermalColorCss(temp);
    ctx.font = 'bold 30px monospace';
    ctx.fillText(`${temp.toFixed(1)}°C`, 128, 76);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.name = 'labelSprite';
  sprite.scale.set(0.9, 0.35, 1);
  return sprite;
}

/**
 * Creates a server rack 3D mesh (THREE.Group) based on 0.6m × 2.0m × 1.2m specs.
 * Rack color and intake strip are strictly colored by `rackResults.intakeTempC`.
 */
export function createRackMesh(
  rack: RackSpec,
  intakeTempC: number,
  room: RoomDimensions,
  showLabel: boolean = true,
  showHeatPillar: boolean = true,
  rackSlotState?: RackUSlotState
): THREE.Group {
  const group = new THREE.Group();
  group.name = `RACK_${rack.id}`;

  const width = 0.6;
  const height = 2.0;
  const depth = 1.2;

  const tempColorHex = getThermalColorHex(intakeTempC);

  // 1. Chassis body - subtle dark body with temperature edge accent
  const bodyGeo = new THREE.BoxGeometry(width, height, depth);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x182234,
    roughness: 0.65,
    metalness: 0.25,
  });
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  group.add(bodyMesh);

  // Chassis colored edge frame
  const edgeBezelGeo = new THREE.BoxGeometry(width + 0.01, height + 0.01, 0.04);
  const edgeBezelMat = new THREE.MeshStandardMaterial({
    color: tempColorHex,
    roughness: 0.4,
    metalness: 0.2,
  });
  const edgeBezelMesh = new THREE.Mesh(edgeBezelGeo, edgeBezelMat);
  edgeBezelMesh.position.set(0, 0, depth / 2 + 0.005);
  group.add(edgeBezelMesh);

  // 2. Front intake color strip (front face is +Z: depth / 2)
  const stripGeo = new THREE.BoxGeometry(width * 0.88, 0.16, 0.02);
  const stripMat = new THREE.MeshStandardMaterial({
    color: tempColorHex,
    roughness: 0.25,
    metalness: 0.1,
  });
  const stripMesh = new THREE.Mesh(stripGeo, stripMat);
  stripMesh.position.set(0, height * 0.4, depth / 2 + 0.028);
  group.add(stripMesh);

  // Front server slot bay background
  const slotGeo = new THREE.BoxGeometry(width * 0.85, 1.6, 0.015);
  const slotMat = new THREE.MeshStandardMaterial({
    color: 0x0a101d,
    roughness: 0.9,
  });
  const slotMesh = new THREE.Mesh(slotGeo, slotMat);
  slotMesh.position.set(0, -height * 0.06, depth / 2 + 0.027);
  group.add(slotMesh);

  // Render individual 3D server node sub-meshes and empty U slot outlines inside rack if rackSlotState exists
  if (rackSlotState) {
    const totalU = rackSlotState.totalU || 42;
    const bayHeight = 1.6;
    const unitH = bayHeight / totalU;
    const bayStartY = -height * 0.06 - bayHeight / 2;

    // 1) Render installed server chassis nodes
    if (rackSlotState.installedServers) {
      rackSlotState.installedServers.forEach((server) => {
        const spec = GPU_HARDWARE_LIBRARY[server.specId];
        const hexStr = spec?.badgeColor ? spec.badgeColor.replace('#', '0x') : '0x0284c7';
        const nodeColor = parseInt(hexStr, 16);
        const serverHeight = Math.max(0.02, server.uHeight * unitH - 0.005);
        const centerU = (server.startU - 1) + server.uHeight / 2;
        const nodeY = bayStartY + (centerU / totalU) * bayHeight;

        const serverGeo = new THREE.BoxGeometry(width * 0.82, serverHeight, 0.04);
        const serverMat = new THREE.MeshStandardMaterial({
          color: nodeColor,
          roughness: 0.35,
          metalness: 0.4,
        });
        const serverMesh = new THREE.Mesh(serverGeo, serverMat);
        serverMesh.name = `SERVER_${server.id}`;
        serverMesh.position.set(0, nodeY, depth / 2 + 0.035);

        // Front bezel accent LED strip
        const ledGeo = new THREE.BoxGeometry(width * 0.76, Math.min(serverHeight * 0.25, 0.012), 0.01);
        const ledMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
        const ledMesh = new THREE.Mesh(ledGeo, ledMat);
        ledMesh.position.set(0, 0, 0.022);
        serverMesh.add(ledMesh);

        // Attach 3D Pickable userData for Direct 3D Gizmo Dragging
        serverMesh.userData = {
          isServerNode: true,
          nodeId: server.id,
          specId: server.specId,
          name: server.name,
          uHeight: server.uHeight,
          startU: server.startU,
          rackId: rack.id,
          powerKw: server.powerKw,
          loadFactor: server.loadFactor,
          badgeColor: spec?.badgeColor || '#0284c7',
        };

        group.add(serverMesh);
      });
    }

    // 2) Render wireframe outline boxes for empty U-slot spaces
    const emptyRanges = getEmptyUSlotRanges(rackSlotState);
    emptyRanges.forEach((range) => {
      const rangeHeight = Math.max(0.02, range.availableU * unitH - 0.004);
      const centerU = (range.startU - 1) + range.availableU / 2;
      const emptyY = bayStartY + (centerU / totalU) * bayHeight;

      // Outer wireframe outline box for empty space
      const emptyGeo = new THREE.BoxGeometry(width * 0.82, rangeHeight, 0.03);
      const emptyMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8, // Sky blue wireframe outline for empty slots
        wireframe: true,
        transparent: true,
        opacity: 0.35,
      });
      const emptyMesh = new THREE.Mesh(emptyGeo, emptyMat);
      emptyMesh.name = `EMPTY_SLOTS_${rack.id}_U${range.startU}_U${range.endU}`;
      emptyMesh.position.set(0, emptyY, depth / 2 + 0.03);
      group.add(emptyMesh);
    });
  }

  // Rear exhaust marker
  const rearGeo = new THREE.BoxGeometry(width * 0.85, 0.08, 0.02);
  const rearMat = new THREE.MeshStandardMaterial({
    color: 0x7f1d1d,
    roughness: 0.5,
  });
  const rearMesh = new THREE.Mesh(rearGeo, rearMat);
  rearMesh.position.set(0, height * 0.35, -depth / 2 - 0.011);
  group.add(rearMesh);

  // 3. Optional: Translucent exhaust thermal indicator pillar above rack
  // (Not a CFD volumetric cloud; clearly an engineering indicator column)
  if (showHeatPillar) {
    const pillarHeight = Math.max(0.2, Math.min(1.2, (intakeTempC - 18.0) * 0.07));
    const pillarGeo = new THREE.BoxGeometry(width * 0.7, pillarHeight, depth * 0.7);
    const pillarMat = new THREE.MeshStandardMaterial({
      color: tempColorHex,
      transparent: true,
      opacity: intakeTempC > 27 ? 0.35 : 0.18,
      roughness: 0.3,
      depthWrite: false,
    });
    const pillarMesh = new THREE.Mesh(pillarGeo, pillarMat);
    pillarMesh.name = 'heatPillar';
    pillarMesh.position.set(0, height / 2 + pillarHeight / 2, 0);
    group.add(pillarMesh);
  }

  // 4. Rack ID & Temperature Label Billboard Sprite
  const labelSprite = createRackLabelSprite(rack.id, intakeTempC);
  labelSprite.position.set(0, height / 2 + 0.45, 0);
  labelSprite.visible = showLabel;
  group.add(labelSprite);

  // Coordinate transformation: Room center is origin (0, 0, 0)
  const worldX = rack.position[0] - room.widthM / 2;
  const worldY = -room.heightM / 2 + height / 2;
  const worldZ = rack.position[2] - room.depthM / 2;

  group.position.set(worldX, worldY, worldZ);
  group.rotation.y = rack.rotationY;

  group.userData = {
    id: rack.id,
    type: 'rack',
    intakeTempC,
    heatKw: rack.heatKw,
    position: rack.position,
    rotationY: rack.rotationY,
  };

  return group;
}

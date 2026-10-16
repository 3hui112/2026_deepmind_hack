import * as THREE from 'three';
import type { CracSpec, RoomDimensions } from '../domain/scenario';

/**
 * Creates a CRAC (Computer Room Air Handler) 3D mesh (THREE.Group) based on 1.0m × 2.0m × 1.0m specs.
 * Active CRAC is rendered in vibrant bright blue; inactive/stopped CRAC is rendered in neutral gray.
 */
export function createCracMesh(
  crac: CracSpec,
  room: RoomDimensions
): THREE.Group {
  const group = new THREE.Group();
  group.name = `CRAC_${crac.id}`;

  const width = 1.0;
  const height = 2.0;
  const depth = 1.0;

  // 1. Main unit body: bright blue when active, gray when stopped
  const bodyGeo = new THREE.BoxGeometry(width, height, depth);
  const bodyColor = crac.active ? 0x0284c7 : 0x64748b; // sky-600 vs slate-500
  const bodyMat = new THREE.MeshStandardMaterial({
    color: bodyColor,
    roughness: 0.45,
    metalness: 0.2,
  });
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  group.add(bodyMesh);

  // 2. Air supply discharge vent grill (top section)
  const ventGeo = new THREE.BoxGeometry(width * 0.85, height * 0.2, depth * 0.05);
  const ventMat = new THREE.MeshStandardMaterial({
    color: crac.active ? 0xbae6fd : 0x94a3b8,
    roughness: 0.3,
  });
  const ventMesh = new THREE.Mesh(ventGeo, ventMat);
  // Point vent towards center of the room
  const ventZ = crac.position[2] < room.depthM / 2 ? depth / 2 + 0.005 : -depth / 2 - 0.005;
  ventMesh.position.set(0, height * 0.35, ventZ);
  group.add(ventMesh);

  // 3. Status indicator beacon/strip
  const beaconGeo = new THREE.BoxGeometry(width * 0.4, 0.06, 0.04);
  const beaconMat = new THREE.MeshStandardMaterial({
    color: crac.active ? 0x38bdf8 : 0xef4444, // active cool blue vs offline red
    roughness: 0.2,
  });
  const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
  beaconMesh.position.set(0, height * 0.1, ventZ + (ventZ > 0 ? 0.01 : -0.01));
  group.add(beaconMesh);

  // Coordinate transformation: Room center is origin (0, 0, 0)
  const worldX = crac.position[0] - room.widthM / 2;
  const worldY = -room.heightM / 2 + height / 2;
  const worldZ = crac.position[2] - room.depthM / 2;

  group.position.set(worldX, worldY, worldZ);

  group.userData = {
    id: crac.id,
    type: 'crac',
    active: crac.active,
    supplyTempC: crac.supplyTempC,
    airflowM3s: crac.airflowM3s,
  };

  return group;
}

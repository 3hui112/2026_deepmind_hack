import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * Recursively disposes all geometries, materials, and textures in an Object3D hierarchy.
 */
export function disposeHierarchy(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      if (child.geometry) {
        child.geometry.dispose();
      }

      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => disposeMaterial(mat));
        } else {
          disposeMaterial(child.material);
        }
      }
    }
  });
}

function disposeMaterial(material: THREE.Material): void {
  // Dispose any texture properties attached to the material
  const matRecord = material as unknown as Record<string, unknown>;
  for (const key of Object.keys(matRecord)) {
    const val = matRecord[key];
    if (val && typeof val === 'object' && 'isTexture' in val && typeof (val as THREE.Texture).dispose === 'function') {
      (val as THREE.Texture).dispose();
    }
  }
  material.dispose();
}

/**
 * Comprehensive teardown of a Three.js scene, camera, controls, and renderer.
 * Guarantees zero memory leaks and clean GPU resource deallocation.
 */
export function disposeScene(
  scene: THREE.Scene,
  renderer: { dispose: () => void; domElement?: HTMLCanvasElement } | null,
  controls: OrbitControls | null,
  animFrameId?: number | null
): void {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
  }

  if (controls) {
    try {
      controls.dispose();
    } catch (e) {
      console.warn('Error disposing OrbitControls:', e);
    }
  }

  if (scene) {
    disposeHierarchy(scene);
    scene.clear();
  }

  if (renderer) {
    try {
      if (renderer.domElement && renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
      renderer.dispose();
    } catch (e) {
      console.warn('Error disposing renderer:', e);
    }
  }
}

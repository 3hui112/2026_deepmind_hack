import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Scenario } from '../domain/scenario';
import type { SimulationResult } from '../simulation/types';
import {
  canPlaceServerNode,
  getEmptyUSlotRanges,
  getRackPowerMetrics,
  type RackUSlotState,
  type InstalledServerChassis,
  type BlueprintOverlayConfig,
} from '../domain/rackSlots';
import {
  createScene,
  populateSceneMeshes,
  updateHeatmapTexture,
  updateBlueprintOverlayTexture,
} from './createScene';
import { disposeScene } from './disposeScene';
import { Isometric3DView } from './Isometric3DView';
import { ThermalLegend } from '../components/ThermalLegend';
import { AirflowParticleManager } from './particles/AirflowParticleManager';
import { WEBGPU_PARTICLE_PRESET_COUNTS, type ParticleBackend } from './particles/types';
import { WebGPUThermalGridVolume } from './WebGPUThermalGridVolume';
import { probeWebGPUAdapter, type WebGPUAdapterReport } from './webgpuAdapter';
import {
  RotateCcw,
  CheckCircle,
  HelpCircle,
  Layers,
  Tag,
  Flame,
  Wind,
  Cpu,
  Activity,
  AlertCircle,
  Box,
  Gauge,
} from 'lucide-react';

interface ServerRoom3DProps {
  scenario: Scenario;
  simulationResult: SimulationResult;
  onAdapterReport?: (report: WebGPUAdapterReport) => void;
  rackSlotStates?: Record<string, RackUSlotState>;
  onUpdateRackSlotStates?: (newStates: Record<string, RackUSlotState>) => void;
  blueprintConfig?: BlueprintOverlayConfig;
  onUpdateRackPosition?: (rackId: string, newPosition: [number, number, number]) => void;
  onRotateRack?: (rackId: string) => void;
}

type RendererStatus = 'initializing' | 'webgpu' | 'webgl_fallback' | 'software_3d';

/**
 * Safely inspects whether WebGL context creation is allowed by the browser/sandbox.
 */
function isWebGLAvailable(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl');
    return !!(gl && 'getExtension' in gl);
  } catch {
    return false;
  }
}

/**
 * Checks whether WebGPU API is present in navigator.
 */
function isWebGPUAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator && !!navigator.gpu;
}

export const ServerRoom3D: React.FC<ServerRoom3DProps> = ({
  scenario,
  simulationResult,
  onAdapterReport,
  rackSlotStates,
  onUpdateRackSlotStates,
  blueprintConfig,
  onUpdateRackPosition,
  onRotateRack,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [rendererStatus, setRendererStatus] = useState<RendererStatus>('initializing');
  const [fallbackNotice, setFallbackNotice] = useState<string>('');
  const [resetCount, setResetCount] = useState<number>(0);
  const [adapterReport, setAdapterReport] = useState<WebGPUAdapterReport | null>(null);

  // Visual feature toggles
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [showHeatPillars, setShowHeatPillars] = useState<boolean>(true);
  const [showParticles, setShowParticles] = useState<boolean>(true);
  const [showThermalVolume, setShowThermalVolume] = useState<boolean>(true);
  const [forceCpuFallback, setForceCpuFallback] = useState<boolean>(false);
  const [showFps, setShowFps] = useState<boolean>(true);
  const [targetParticleCount, setTargetParticleCount] = useState<number>(20000);

  // Particle performance & backend status
  const [particleInfo, setParticleInfo] = useState<{
    backend: ParticleBackend;
    particleCount: number;
    fps: number;
    isCompute: boolean;
  }>({
    backend: 'cpu_fallback',
    particleCount: 20000,
    fps: 60,
    isCompute: false,
  });

  const [selectedInfo, setSelectedInfo] = useState<{
    id: string;
    type: string;
    temp?: number;
    heatKw?: number;
    active?: boolean;
  } | null>(null);

  // Three.js instances
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<{
    render: (scene: THREE.Scene, camera: THREE.Camera) => void;
    setSize: (w: number, h: number) => void;
    dispose: () => void;
    domElement: HTMLCanvasElement;
  } | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const dynamicGroupRef = useRef<THREE.Group | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const particleManagerRef = useRef<AirflowParticleManager | null>(null);
  const thermalVolumeRef = useRef<WebGPUThermalGridVolume | null>(null);

  const showParticlesRef = useRef<boolean>(showParticles);
  showParticlesRef.current = showParticles;

  const showThermalVolumeRef = useRef<boolean>(showThermalVolume);
  showThermalVolumeRef.current = showThermalVolume;

  const rackSlotStatesRef = useRef<Record<string, RackUSlotState> | undefined>(rackSlotStates);
  rackSlotStatesRef.current = rackSlotStates;

  const onUpdateRackSlotStatesRef = useRef<((newStates: Record<string, RackUSlotState>) => void) | undefined>(onUpdateRackSlotStates);
  onUpdateRackSlotStatesRef.current = onUpdateRackSlotStates;

  // 3D Server Node Gizmo Dragging State
  const isDraggingRef = useRef<boolean>(false);
  const draggedServerRef = useRef<any>(null);
  const dropCandidateRef = useRef<{ rackId: string; startU: number; valid: boolean; reason?: string; resolution?: string } | null>(null);
  const ghostMeshRef = useRef<THREE.Mesh | null>(null);
  const highlightMeshRef = useRef<THREE.Mesh | null>(null);

  // Initialize Scene, Renderer, OrbitControls, Airflow Particle System, and 3D Thermal Volume
  useEffect(() => {
    let isDisposed = false;
    let rendererInstance: any = null;
    let currentControls: OrbitControls | null = null;
    const clock = new THREE.Clock();

    async function init3D(targetEl: HTMLDivElement) {
      const width = targetEl.clientWidth || 800;
      const height = Math.max(targetEl.clientHeight || 520, 520);
      const aspect = width / height;

      // 0. Probe WebGPU Adapter & log hardware info to console
      const gpuProbe = await probeWebGPUAdapter();
      if (!isDisposed) {
        setAdapterReport(gpuProbe);
        onAdapterReport?.(gpuProbe);
      }

      // 1. Create Scene & Camera with initial heatmap and mesh configuration
      const { scene, camera, dynamicObjectsGroup } = createScene(
        scenario,
        simulationResult,
        aspect,
        showLabels,
        showHeatPillars,
        rackSlotStatesRef.current,
        blueprintConfig
      );
      sceneRef.current = scene;
      cameraRef.current = camera;
      dynamicGroupRef.current = dynamicObjectsGroup;

      // 2. Try initializing WebGPURenderer first (as required)
      let activeType: RendererStatus = 'webgpu';
      let failureReason = '';

      const webgpuSupported = isWebGPUAvailable() && gpuProbe.available && !forceCpuFallback;

      if (webgpuSupported) {
        try {
          const gpuRenderer = new WebGPURenderer({
            antialias: true,
            powerPreference: 'high-performance',
          });
          await gpuRenderer.init();

          if (isDisposed) {
            gpuRenderer.dispose();
            return;
          }

          gpuRenderer.setSize(width, height);
          gpuRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
          rendererInstance = gpuRenderer;
          activeType = 'webgpu';
        } catch (gpuError: any) {
          failureReason = gpuError?.message || 'WebGPU renderer initialization failed';
        }
      } else {
        failureReason = forceCpuFallback
          ? 'WebGPU compute disabled by developer settings; CPU fallback mode enforced.'
          : gpuProbe.fallbackReason ||
            'WebGPU API (navigator.gpu) is not enabled in current browser/sandbox environment.';
      }

      // If WebGPU failed or unavailable, try WebGL2
      if (!rendererInstance) {
        if (isWebGLAvailable()) {
          try {
            const glRenderer = new THREE.WebGLRenderer({
              antialias: true,
              powerPreference: 'high-performance',
            });
            glRenderer.setSize(width, height);
            glRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            rendererInstance = glRenderer;
            activeType = 'webgl_fallback';
          } catch {
            activeType = 'software_3d';
            failureReason = 'Hardware graphics context (WebGL/WebGPU) disabled environment detected';
          }
        } else {
          activeType = 'software_3d';
          failureReason =
            'Hardware acceleration is disabled by sandbox security settings; running on 2.5D software 3D engine.';
        }
      }

      if (isDisposed) {
        if (rendererInstance) rendererInstance.dispose();
        return;
      }

      setRendererStatus(activeType);
      setFallbackNotice(failureReason);

      if (activeType === 'software_3d' || !rendererInstance) {
        setParticleInfo({
          backend: 'cpu_fallback',
          particleCount: 300,
          fps: 60,
          isCompute: false,
        });
        return;
      }

      rendererRef.current = rendererInstance;
      targetEl.appendChild(rendererInstance.domElement);

      // 3. OrbitControls setup
      currentControls = new OrbitControls(camera, rendererInstance.domElement);
      currentControls.enableDamping = true;
      currentControls.dampingFactor = 0.05;
      currentControls.minDistance = 4;
      currentControls.maxDistance = 45;
      currentControls.maxPolarAngle = Math.PI / 2 - 0.02;
      controlsRef.current = currentControls;

      // 4. Airflow Particle Manager (WebGPU TSL compute vs CPU fallback)
      const particleManager = new AirflowParticleManager(
        scene,
        rendererInstance,
        scenario,
        simulationResult,
        forceCpuFallback,
        { maxWebGPUParticles: targetParticleCount }
      );
      particleManager.setVisible(showParticlesRef.current);
      particleManagerRef.current = particleManager;
      setParticleInfo(particleManager.getStatus());

      // 5. GPU-Accelerated 3D Thermal Grid Volume (StorageBuffer + 3D Isothermal Slices)
      const thermalVolume = new WebGPUThermalGridVolume(
        scene,
        rendererInstance,
        scenario,
        simulationResult,
        activeType === 'webgpu' && !forceCpuFallback
      );
      thermalVolume.setVisible(showThermalVolumeRef.current);
      thermalVolumeRef.current = thermalVolume;

      // 6. Raycaster & 3D Direct Gizmo Drag & Drop Handlers
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();

      const getPointerPos = (event: MouseEvent) => {
        const rect = targetEl.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      };

      const handlePointerDown = (event: MouseEvent) => {
        if (!rendererRef.current) return;
        getPointerPos(event);
        raycaster.setFromCamera(mouse, camera);

        if (dynamicGroupRef.current) {
          const intersects = raycaster.intersectObjects(
            dynamicGroupRef.current.children,
            true
          );
          if (intersects.length > 0) {
            // Check if user picked a 3D server node sub-mesh
            let nodeObj: THREE.Object3D | null = null;
            for (const hit of intersects) {
              let curr: THREE.Object3D | null = hit.object;
              while (curr && curr !== dynamicGroupRef.current) {
                if (curr.userData && curr.userData.isServerNode) {
                  nodeObj = curr;
                  break;
                }
                curr = curr.parent;
              }
              if (nodeObj) break;
            }

            if (nodeObj && nodeObj.userData) {
              // Initiate 3D Gizmo Dragging
              isDraggingRef.current = true;
              draggedServerRef.current = { ...nodeObj.userData };

              if (currentControls) currentControls.enabled = false;

              // Ghost mesh preview
              const hexStr = nodeObj.userData.badgeColor
                ? nodeObj.userData.badgeColor.replace('#', '0x')
                : '0x0284c7';
              const uH = nodeObj.userData.uHeight || 4;
              const unitH = 1.6 / 42;
              const ghostGeo = new THREE.BoxGeometry(0.5, Math.max(0.04, uH * unitH), 0.5);
              const ghostMat = new THREE.MeshBasicMaterial({
                color: parseInt(hexStr, 16),
                transparent: true,
                opacity: 0.65,
              });
              const ghost = new THREE.Mesh(ghostGeo, ghostMat);
              ghost.name = 'dragGhostMesh';
              ghost.position.copy(intersects[0].point);
              scene.add(ghost);
              ghostMeshRef.current = ghost;

              // Target slot highlight bounding box (Yellow wireframe outline as requested)
              const hlGeo = new THREE.BoxGeometry(0.56, Math.max(0.05, uH * unitH + 0.012), 1.12);
              const hlMat = new THREE.MeshBasicMaterial({
                color: 0xfacc15, // Bright yellow outline
                transparent: true,
                opacity: 0.65,
                wireframe: true,
              });
              const hlMesh = new THREE.Mesh(hlGeo, hlMat);
              hlMesh.name = 'dragHighlightMesh';
              hlMesh.visible = false;
              scene.add(hlMesh);
              highlightMeshRef.current = hlMesh;

              return;
            }

            // Normal Rack / CRAC Click Selection
            let obj: THREE.Object3D | null = intersects[0].object;
            while (
              obj &&
              (!obj.userData || !obj.userData.type) &&
              obj !== dynamicGroupRef.current
            ) {
              obj = obj.parent;
            }
            if (obj && obj.userData && obj.userData.type) {
              setSelectedInfo({
                id: obj.userData.id,
                type: obj.userData.type,
                temp: obj.userData.intakeTempC,
                heatKw: obj.userData.heatKw,
                active: obj.userData.active,
              });
            }
          }
        }
      };

      const handlePointerMove = (event: MouseEvent) => {
        if (!isDraggingRef.current || !ghostMeshRef.current) return;
        getPointerPos(event);
        raycaster.setFromCamera(mouse, camera);

        // Move ghost mesh along camera drag plane
        const camDir = camera.getWorldDirection(new THREE.Vector3()).negate();
        const dragPlane = new THREE.Plane(camDir, 0);
        dragPlane.setFromNormalAndCoplanarPoint(camDir, ghostMeshRef.current.position);
        const intersectPt = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(dragPlane, intersectPt)) {
          ghostMeshRef.current.position.copy(intersectPt);
        }

        // Raycast against 3D rack meshes to detect target U-slot
        if (dynamicGroupRef.current) {
          const intersects = raycaster.intersectObjects(
            dynamicGroupRef.current.children,
            true
          );
          let targetRackMesh: THREE.Object3D | null = null;
          let hitPoint: THREE.Vector3 | null = null;

          for (const hit of intersects) {
            let curr: THREE.Object3D | null = hit.object;
            while (curr && curr !== dynamicGroupRef.current) {
              if (curr.userData && curr.userData.type === 'rack') {
                targetRackMesh = curr;
                hitPoint = hit.point;
                break;
              }
              curr = curr.parent;
            }
            if (targetRackMesh) break;
          }

          if (targetRackMesh && hitPoint && draggedServerRef.current) {
            const rackId = targetRackMesh.userData.id;
            const rackStates = rackSlotStatesRef.current || {};
            const rackState = rackStates[rackId];
            const totalU = rackState ? rackState.totalU : 42;
            const rackHeight = 2.0;
            const bayHeight = 1.6;
            const bayStartY = targetRackMesh.position.y - rackHeight * 0.06 - bayHeight / 2;

            const relY = Math.max(0, Math.min(bayHeight, hitPoint.y - bayStartY));
            const uHeight = draggedServerRef.current.uHeight;
            const calcStartU = Math.max(
              1,
              Math.min(totalU - uHeight + 1, Math.floor((relY / bayHeight) * totalU) + 1)
            );

            const check = rackState
              ? canPlaceServerNode(
                  rackState,
                  uHeight,
                  calcStartU,
                  draggedServerRef.current.powerKw,
                  draggedServerRef.current.nodeId
                )
              : { valid: false, reason: 'Slot state information for this rack could not be found.' };

            dropCandidateRef.current = {
              rackId,
              startU: calcStartU,
              valid: check.valid,
              reason: check.reason,
              resolution: check.resolution,
            };

            if (highlightMeshRef.current) {
              const unitH = bayHeight / totalU;
              const centerU = (calcStartU - 1) + uHeight / 2;
              const hlY = bayStartY + (centerU / totalU) * bayHeight;

              highlightMeshRef.current.position.set(
                targetRackMesh.position.x,
                hlY,
                targetRackMesh.position.z
              );
              highlightMeshRef.current.rotation.y = targetRackMesh.rotation.y;
              const mat = highlightMeshRef.current.material as THREE.MeshBasicMaterial;
              // Yellow outline for active drag target slot box
              mat.color.setHex(check.valid ? 0xfacc15 : 0xef4444);
              highlightMeshRef.current.visible = true;
            }
          } else {
            dropCandidateRef.current = null;
            if (highlightMeshRef.current) highlightMeshRef.current.visible = false;
          }
        }
      };

      const handlePointerUp = () => {
        if (!isDraggingRef.current) return;
        isDraggingRef.current = false;

        if (currentControls) currentControls.enabled = true;

        if (ghostMeshRef.current) {
          scene.remove(ghostMeshRef.current);
          if (ghostMeshRef.current.geometry) ghostMeshRef.current.geometry.dispose();
          ghostMeshRef.current = null;
        }

        if (highlightMeshRef.current) {
          scene.remove(highlightMeshRef.current);
          if (highlightMeshRef.current.geometry) highlightMeshRef.current.geometry.dispose();
          highlightMeshRef.current = null;
        }

        const candidate = dropCandidateRef.current;
        const dragged = draggedServerRef.current;
        dropCandidateRef.current = null;
        draggedServerRef.current = null;

        if (candidate && candidate.valid && dragged && rackSlotStatesRef.current) {
          const sourceRackId = dragged.rackId;
          const targetRackId = candidate.rackId;
          const targetStartU = candidate.startU;

          if (sourceRackId === targetRackId && dragged.startU === targetStartU) {
            return;
          }

          const newStates = JSON.parse(JSON.stringify(rackSlotStatesRef.current));
          const sourceState = newStates[sourceRackId];
          const targetState = newStates[targetRackId];

          if (sourceState && targetState) {
            const nodeIdx = sourceState.installedServers.findIndex(
              (s: InstalledServerChassis) => s.id === dragged.nodeId
            );
            if (nodeIdx !== -1) {
              const [movedNode] = sourceState.installedServers.splice(nodeIdx, 1);
              movedNode.startU = targetStartU;
              targetState.installedServers.push(movedNode);
              onUpdateRackSlotStatesRef.current?.(newStates);
            }
          }
        } else if (dragged) {
          // Failure Reason & Actionable Resolution Alert as requested
          const failureReason = candidate?.reason || 'This space is occupied or not a valid slot.';
          const failureResolution = candidate?.resolution || 'Try moving to an empty slot range highlighted with cyan outline.';
          const targetText = candidate ? `${candidate.rackId} (U${candidate.startU})` : 'Unspecified Location';
          alert(
            `⚠️ [Server Node Slot Placement Failed]\n\n` +
            `• Target Slot: ${targetText}\n` +
            `• Reason: ${failureReason}\n` +
            `• Resolution: ${failureResolution}\n\n` +
            `Server chassis (${dragged.name || dragged.nodeId}) restored to original rack (${dragged.rackId}, U${dragged.startU}).`
          );
        }
      };

      targetEl.addEventListener('pointerdown', handlePointerDown);
      targetEl.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);

      // 7. Render loop
      let lastStatusUpdate = performance.now();

      const animate = () => {
        if (isDisposed) return;
        animFrameRef.current = requestAnimationFrame(animate);

        const dt = Math.min(clock.getDelta(), 0.08);
        const isTabVisible = !document.hidden;

        if (currentControls) {
          currentControls.update();
        }

        // Update Airflow Particles (TSL Compute dispatch on GPU)
        if (particleManagerRef.current && showParticlesRef.current) {
          particleManagerRef.current.update(dt, isTabVisible);
        }

        // Update 3D Thermal Volume (TSL StorageBuffer compute dispatch)
        if (thermalVolumeRef.current && showThermalVolumeRef.current && isTabVisible) {
          thermalVolumeRef.current.update(dt);
        }

        // Throttle status reporting
        const now = performance.now();
        if (now - lastStatusUpdate >= 500) {
          if (particleManagerRef.current) {
            setParticleInfo(particleManagerRef.current.getStatus());
          }
          lastStatusUpdate = now;
        }

        if (rendererRef.current && sceneRef.current && cameraRef.current) {
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        }
      };

      animate();

      // 8. Resize handling
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width: newW, height: newH } = entry.contentRect;
          if (newW > 0 && newH > 0 && cameraRef.current && rendererRef.current) {
            cameraRef.current.aspect = newW / newH;
            cameraRef.current.updateProjectionMatrix();
            rendererRef.current.setSize(newW, newH);
          }
        }
      });

      resizeObserver.observe(targetEl);

      return () => {
        targetEl.removeEventListener('pointerdown', handlePointerDown);
        targetEl.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        resizeObserver.disconnect();
      };
    }

    const hostEl = mountRef.current;
    let cleanupListeners: (() => void) | undefined;
    if (hostEl) {
      init3D(hostEl).then((fn) => {
        cleanupListeners = fn;
      });
    }

    return () => {
      isDisposed = true;
      cleanupListeners?.();

      if (particleManagerRef.current) {
        particleManagerRef.current.dispose();
        particleManagerRef.current = null;
      }

      if (thermalVolumeRef.current) {
        thermalVolumeRef.current.dispose();
        thermalVolumeRef.current = null;
      }

      disposeScene(
        sceneRef.current as any,
        rendererRef.current,
        controlsRef.current,
        animFrameRef.current
      );

      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
      dynamicGroupRef.current = null;
      animFrameRef.current = null;
    };
  }, [forceCpuFallback]);

  // Safe update when scenario, simulationResult, or rackSlotStates change
  useEffect(() => {
    if (dynamicGroupRef.current) {
      populateSceneMeshes(
        dynamicGroupRef.current,
        scenario,
        simulationResult,
        showLabels,
        showHeatPillars,
        rackSlotStates
      );
    }
    if (sceneRef.current) {
      updateHeatmapTexture(sceneRef.current, simulationResult);
      updateBlueprintOverlayTexture(sceneRef.current, scenario.room, blueprintConfig);
    }
    if (particleManagerRef.current) {
      particleManagerRef.current.setScenario(scenario, simulationResult);
    }
    if (thermalVolumeRef.current) {
      thermalVolumeRef.current.setScenario(scenario, simulationResult);
    }
  }, [scenario, simulationResult, showLabels, showHeatPillars, rackSlotStates, blueprintConfig]);

  // Toggle particle visibility cleanly
  useEffect(() => {
    if (particleManagerRef.current) {
      particleManagerRef.current.setVisible(showParticles);
    }
  }, [showParticles]);

  // Toggle 3D thermal volume visibility cleanly
  useEffect(() => {
    if (thermalVolumeRef.current) {
      thermalVolumeRef.current.setVisible(showThermalVolume);
    }
  }, [showThermalVolume]);

  // Handle dynamic WebGPU particle count scaling (20,000 / 35,000 / 50,000)
  const handleSelectParticleCount = (count: number) => {
    setTargetParticleCount(count);
    if (particleManagerRef.current) {
      particleManagerRef.current.setTargetParticleCount(count);
      setParticleInfo(particleManagerRef.current.getStatus());
    }
  };

  // Reset Camera View helper
  const handleResetCamera = () => {
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(10.5, 8.5, 16.5);
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
    setResetCount((prev) => prev + 1);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
      {/* 3D Viewport Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <Layers className="w-5 h-5 text-sky-400" />
            3D Server Room Digital Twin &amp; WebGPU Compute Airflow/Thermal Volume
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Dimensions: {scenario.room.widthM}m &times; {scenario.room.heightM}m &times; {scenario.room.depthM}m | CRAC cold supply (blue) &amp; Rack rear exhaust heat (orange/red) 3D vector field convection
          </p>
        </div>

        {/* Status Badges: GPU Adapter Vendor, Active Compute Backend & FPS */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Hardware GPU Adapter Vendor Badge */}
          {adapterReport && adapterReport.available && !forceCpuFallback && (
            <span
              title={`GPU Vendor: ${adapterReport.vendor} | Architecture: ${adapterReport.architecture} | Device: ${adapterReport.device} | MaxWorkgroupSizeX: ${adapterReport.limits.maxComputeWorkgroupSizeX}`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-semibold bg-sky-950/90 text-sky-300 border border-sky-700/80 shadow-sm"
            >
              <Gauge className="w-3.5 h-3.5 text-sky-400" />
              {adapterReport.badgeLabel}
            </span>
          )}

          {/* Active Compute Pipeline Badge */}
          {particleInfo.isCompute ? (
            <span
              title="Particles & 3D thermal volume updated via GPU parallel compute on WebGPU TSL ComputeNode + instancedArray + StorageBuffer pipeline."
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-800/80"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              TSL Compute ({particleInfo.particleCount.toLocaleString()} particles)
            </span>
          ) : (
            <span
              title={fallbackNotice || 'Particle trajectories updated in CPU memory buffer.'}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-medium bg-amber-950/80 text-amber-300 border border-amber-800/80"
            >
              <Cpu className="w-3.5 h-3.5 text-amber-400" />
              {rendererStatus === 'webgl_fallback' ? 'WebGL2 + CPU' : 'CPU fallback'} (
              {particleInfo.particleCount.toLocaleString()} particles)
            </span>
          )}

          {/* Real-time FPS Badge */}
          {showFps && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-mono font-semibold bg-slate-950 text-sky-300 border border-slate-800">
              <Activity className="w-3.5 h-3.5 text-sky-400" />
              {particleInfo.fps} FPS
            </span>
          )}

          <button
            type="button"
            onClick={handleResetCamera}
            className="px-2.5 py-1 text-xs rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1 transition-colors"
            title="Reset camera view to default position."
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset View
          </button>
        </div>
      </div>

      {/* GPU Adapter & Compute Pipeline Diagnostics Strip */}
      {adapterReport && (
        <div className="bg-slate-950/80 border border-slate-800/90 rounded-lg px-3 py-2 text-[11px] font-mono text-slate-300 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              <span className="text-slate-500">GPU Adapter:</span>{' '}
              <span className="text-sky-300 font-semibold">{adapterReport.badgeLabel}</span>
            </span>
            <span>
              <span className="text-slate-500">Arch/Device:</span>{' '}
              <span className="text-slate-200">
                {adapterReport.architecture} / {adapterReport.device}
              </span>
            </span>
            <span>
              <span className="text-slate-500">Workgroup:</span>{' '}
              <span className="text-emerald-300">
                {adapterReport.limits.maxComputeWorkgroupSizeX} threads (max{' '}
                {adapterReport.limits.maxComputeWorkgroupsPerDimension.toLocaleString()} groups)
              </span>
            </span>
            <span>
              <span className="text-slate-500">Thermal Volume:</span>{' '}
              <span className="text-amber-300">
                36&times;18&times;5 3D StorageBuffer ({(36 * 18 * 5).toLocaleString()} voxels)
              </span>
            </span>
          </div>

          {/* WebGPU Particle Count Scale Selector (20,000 ~ 50,000) */}
          {particleInfo.isCompute && (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Particles:</span>
              {WEBGPU_PARTICLE_PRESET_COUNTS.map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => handleSelectParticleCount(count)}
                  className={`px-2 py-0.5 rounded border text-[11px] transition-colors ${
                    targetParticleCount === count
                      ? 'bg-emerald-600/30 text-emerald-300 border-emerald-500/70 font-bold'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {(count / 1000).toFixed(0)}k
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Feature Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950/90 p-2.5 rounded-lg border border-slate-800 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Airflow Particles Toggle */}
          <button
            type="button"
            onClick={() => setShowParticles((prev) => !prev)}
            className={`px-2.5 py-1 rounded-md border flex items-center gap-1.5 font-medium transition-colors ${
              showParticles
                ? 'bg-sky-600/30 text-sky-300 border-sky-500/60'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
            title="Toggle airflow particle vector visualization."
          >
            <Wind className="w-3.5 h-3.5" />
            <span>Airflow Particles {showParticles ? 'ON' : 'OFF'}</span>
          </button>

          {/* 3D Thermal Volume Toggle */}
          <button
            type="button"
            onClick={() => setShowThermalVolume((prev) => !prev)}
            className={`px-2.5 py-1 rounded-md border flex items-center gap-1.5 font-medium transition-colors ${
              showThermalVolume
                ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/60'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
            title="Toggle GPU StorageBuffer-based 3D thermal grid volume & isothermal slice planes."
          >
            <Box className="w-3.5 h-3.5" />
            <span>3D Thermal Volume {showThermalVolume ? 'ON' : 'OFF'}</span>
          </button>

          {/* Force CPU Fallback Toggle (Verification Testing) */}
          <button
            type="button"
            onClick={() => setForceCpuFallback((prev) => !prev)}
            className={`px-2.5 py-1 rounded-md border flex items-center gap-1.5 font-medium transition-colors ${
              forceCpuFallback
                ? 'bg-amber-600/30 text-amber-300 border-amber-500/60 ring-1 ring-amber-500/50'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
            title="Developer testing: Force disable WebGPU to test CPU fallback pipeline."
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Force CPU Fallback {forceCpuFallback ? 'ON' : 'OFF'}</span>
          </button>

          {/* Rack Labels Toggle */}
          <button
            type="button"
            onClick={() => setShowLabels((prev) => !prev)}
            className={`px-2.5 py-1 rounded-md border flex items-center gap-1.5 font-medium transition-colors ${
              showLabels
                ? 'bg-sky-600/30 text-sky-300 border-sky-500/60'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Rack Labels {showLabels ? 'ON' : 'OFF'}</span>
          </button>

          {/* Heat Pillars Toggle */}
          <button
            type="button"
            onClick={() => setShowHeatPillars((prev) => !prev)}
            className={`px-2.5 py-1 rounded-md border flex items-center gap-1.5 font-medium transition-colors ${
              showHeatPillars
                ? 'bg-amber-600/30 text-amber-300 border-amber-500/60'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>Exhaust Pillars {showHeatPillars ? 'ON' : 'OFF'}</span>
          </button>

          {/* FPS Counter Toggle */}
          <button
            type="button"
            onClick={() => setShowFps((prev) => !prev)}
            className={`px-2 py-1 rounded-md border text-slate-400 border-slate-800 hover:text-slate-200 transition-colors ${
              showFps ? 'text-sky-300 border-slate-700' : ''
            }`}
          >
            Toggle FPS
          </button>
        </div>

        {/* Visual disclaimer tag */}
        <div className="flex items-center gap-1 text-[11px] text-slate-400">
          <AlertCircle className="w-3 h-3 text-sky-400 shrink-0" />
          <span>TSL Compute Visualization (Preserves exact physics)</span>
        </div>
      </div>

      {/* Notice Bar for fallback details */}
      {fallbackNotice && (
        <div className="text-[11px] text-slate-300/90 bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800 flex items-center gap-2">
          <HelpCircle className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span>{fallbackNotice}</span>
        </div>
      )}

      {/* 3D Canvas Mount Container */}
      <div className="w-full h-[520px] rounded-lg bg-slate-950 border border-slate-800 relative overflow-hidden">
        {/* Render Three.js mount container if hardware accelerated */}
        {rendererStatus !== 'software_3d' ? (
          <div
            ref={mountRef}
            className="w-full h-full cursor-grab active:cursor-grabbing"
          />
        ) : (
          /* Render Isometric3DView with software particles when GPU context is disabled in sandbox */
          <Isometric3DView
            scenario={scenario}
            simulationResult={simulationResult}
            selectedId={selectedInfo?.id ?? null}
            onSelect={setSelectedInfo}
            resetSignal={resetCount}
            showLabels={showLabels}
            showParticles={showParticles}
          />
        )}

        {/* Selected object floating card with Rack Slot Empty Space Details */}
        {selectedInfo && (
          <div className="absolute top-3 left-3 bg-slate-900/95 backdrop-blur-md border border-sky-500/60 rounded-xl p-3.5 text-xs shadow-2xl min-w-[260px] max-w-[320px] pointer-events-auto z-10 space-y-2">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
              <span className="font-bold font-mono text-sky-400 flex items-center gap-1.5">
                <Box className="w-3.5 h-3.5 text-sky-400" />
                {selectedInfo.id}
              </span>
              <button
                type="button"
                onClick={() => setSelectedInfo(null)}
                className="text-slate-500 hover:text-slate-300 p-0.5 rounded"
              >
                &#10005;
              </button>
            </div>

            <div className="space-y-1.5 text-slate-300 font-mono text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-500">Equipment Type:</span>
                <span className="capitalize font-semibold text-slate-200">
                  {selectedInfo.type === 'rack' ? 'Server Rack (19-inch)' : 'CRAC AC Unit'}
                </span>
              </div>

              {selectedInfo.type === 'rack' && selectedInfo.temp !== undefined && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Front Intake Temp:</span>
                  <span
                    className={`font-bold ${
                      selectedInfo.temp > 27 ? 'text-rose-400' : 'text-emerald-400'
                    }`}
                  >
                    {selectedInfo.temp.toFixed(1)} &deg;C
                  </span>
                </div>
              )}

              {/* Detailed Rack U-Slot Empty Space Summary */}
              {selectedInfo.type === 'rack' && (() => {
                const rackState = rackSlotStates?.[selectedInfo.id];
                if (!rackState) return null;

                const totalU = rackState.totalU || 42;
                const usedU = rackState.installedServers.reduce((sum, s) => sum + s.uHeight, 0);
                const emptyU = totalU - usedU;
                const emptyRanges = getEmptyUSlotRanges(rackState);
                const powerMetrics = getRackPowerMetrics(rackState);

                const emptyRangesText = emptyRanges.length > 0
                  ? emptyRanges.map(r => r.startU === r.endU ? `U${r.startU}` : `U${r.startU}~U${r.endU}(${r.availableU}U)`).join(', ')
                  : 'None (100% Occupied)';

                return (
                  <div className="pt-2 border-t border-slate-800/80 space-y-1.5 text-[11px]">
                    <div className="bg-slate-950 p-2 rounded border border-slate-800 space-y-1">
                      <div className="flex justify-between text-slate-300 font-semibold">
                        <span>Slot Utilization:</span>
                        <span className="text-sky-300">{usedU}/{totalU} U ({((usedU / totalU) * 100).toFixed(0)}%)</span>
                      </div>
                      <div className="flex justify-between text-amber-300 font-semibold">
                        <span>Available Free Slots:</span>
                        <span>{emptyU} U ({((emptyU / totalU) * 100).toFixed(0)}% free)</span>
                      </div>
                    </div>

                    <div className="bg-slate-950/60 p-2 rounded border border-slate-800/60 space-y-1 text-[10.5px]">
                      <span className="text-slate-400 block font-bold text-sky-400">
                        📦 Empty Slot Ranges (Wireframe):
                      </span>
                      <p className="text-slate-200 leading-snug break-words font-mono">
                        {emptyRangesText}
                      </p>
                    </div>

                    <div className="flex justify-between text-[10.5px] text-slate-400 pt-0.5">
                      <span>PDU Load (NEC 80%):</span>
                      <span className={powerMetrics.isBreakerOverloaded ? 'text-rose-400 font-bold' : 'text-emerald-400 font-semibold'}>
                        {powerMetrics.totalPowerKw} / {powerMetrics.necSafeLimitKw} kW ({Math.round(powerMetrics.breakerUtilization * 100)}%)
                      </span>
                    </div>

                    <div className="flex gap-1.5 pt-1">
                      {onRotateRack && (
                        <button
                          type="button"
                          onClick={() => onRotateRack(selectedInfo.id)}
                          className="flex-1 px-2 py-1 rounded bg-amber-900/60 hover:bg-amber-800 text-amber-200 font-sans text-center transition-colors font-medium text-[10.5px] flex items-center justify-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3 text-amber-400" />
                          <span>Rotate Rack 180&deg;</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          alert(
                            `📊 [${selectedInfo.id} Server Rack Slot & Power Report]\n\n` +
                            `• Intake Temp: ${selectedInfo.temp?.toFixed(1)}°C\n` +
                            `• Total U-Space: ${totalU} U\n` +
                            `• Occupied Slots: ${usedU} U (${((usedU / totalU) * 100).toFixed(1)}%)\n` +
                            `• Free Slots: ${emptyU} U (${((emptyU / totalU) * 100).toFixed(1)}%)\n\n` +
                            `• Empty Slot Ranges:\n  ${emptyRangesText}\n\n` +
                            `• Installed Servers (${rackState.installedServers.length}):\n` +
                            rackState.installedServers.map(s => `  - U${s.startU}~U${s.startU + s.uHeight - 1}: ${s.name} (${s.powerKw * s.loadFactor}kW)`).join('\n') + `\n\n` +
                            `• PDU Power: ${powerMetrics.totalPowerKw} kW / NEC 80% limit ${powerMetrics.necSafeLimitKw} kW`
                          );
                        }}
                        className="flex-1 px-2 py-1 rounded bg-sky-900/60 hover:bg-sky-800 text-sky-200 font-sans text-center transition-colors font-medium text-[10.5px]"
                      >
                        View Details
                      </button>
                    </div>

                    {/* 3D Rack Position Adjustment Controls */}
                    {onUpdateRackPosition && (() => {
                      const currentRack = scenario.racks.find((r) => r.id === selectedInfo.id);
                      if (!currentRack) return null;

                      const posX = currentRack.position[0];
                      const posZ = currentRack.position[2];

                      return (
                        <div className="bg-slate-950 p-2 rounded border border-slate-800/80 space-y-1.5 text-[10.5px]">
                          <div className="flex justify-between items-center text-slate-400 font-bold">
                            <span>📍 3D Position (X, Z coords):</span>
                            <span className="font-mono text-sky-300">
                              [{posX.toFixed(1)}m, {posZ.toFixed(1)}m]
                            </span>
                          </div>

                          <div className="grid grid-cols-4 gap-1 pt-0.5 font-mono">
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateRackPosition(selectedInfo.id, [
                                  Math.max(-scenario.room.widthM / 2 + 0.5, posX - 0.5),
                                  0,
                                  posZ,
                                ])
                              }
                              className="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-center font-bold"
                              title="Move X -0.5m"
                            >
                              &#9664; X-
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateRackPosition(selectedInfo.id, [
                                  Math.min(scenario.room.widthM / 2 - 0.5, posX + 0.5),
                                  0,
                                  posZ,
                                ])
                              }
                              className="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-center font-bold"
                              title="Move X +0.5m"
                            >
                              X+ &#9654;
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateRackPosition(selectedInfo.id, [
                                  posX,
                                  0,
                                  Math.max(-scenario.room.depthM / 2 + 0.5, posZ - 0.5),
                                ])
                              }
                              className="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-center font-bold"
                              title="Move Z -0.5m"
                            >
                              &#9650; Z-
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateRackPosition(selectedInfo.id, [
                                  posX,
                                  0,
                                  Math.min(scenario.room.depthM / 2 - 0.5, posZ + 0.5),
                                ])
                              }
                              className="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-center font-bold"
                              title="Move Z +0.5m"
                            >
                              Z+ &#9660;
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}

              {selectedInfo.type === 'crac' && (
                <div>
                  <span className="text-slate-500">Operating Status: </span>
                  <span className={selectedInfo.active ? 'text-sky-400 font-bold' : 'text-rose-400 font-bold'}>
                    {selectedInfo.active ? 'Active (Cool Air Supply)' : 'Inactive (Off - No Airflow)'}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Airflow type indicator overlay at top-right */}
        {showParticles && (
          <div className="absolute top-3 right-3 bg-slate-900/90 backdrop-blur px-3 py-1.5 rounded-lg border border-slate-800 text-[11px] space-y-1 select-none pointer-events-none">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#38bdf8] inline-block shadow-sm" />
              <span className="text-slate-300">Cold Emitter (CRAC floor supply airflow)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#f43f5e] inline-block shadow-sm" />
              <span className="text-slate-300">Hot Emitter (Rack rear thermal chimney)</span>
            </div>
            {showThermalVolume && (
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-400/80 inline-block shadow-sm" />
                <span className="text-slate-300">3D Thermal Grid Volume (GPU Grid)</span>
              </div>
            )}
          </div>
        )}

        {/* Orbit navigation tips at bottom-right */}
        <div className="absolute bottom-3 right-3 bg-slate-900/90 backdrop-blur px-2.5 py-1.5 rounded-md border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2 select-none pointer-events-none">
          <span>Left Click: 3D Rotate</span>
          <span className="text-slate-600">|</span>
          <span>Right Click / Shift: Pan</span>
          <span className="text-slate-600">|</span>
          <span>Wheel: Zoom</span>
        </div>
      </div>

      {/* Thermal Heatmap 5-Color Legend & 27C Limit Marker */}
      <ThermalLegend />
    </div>
  );
};

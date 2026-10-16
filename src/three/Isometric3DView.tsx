import React, { useEffect, useRef, useCallback } from 'react';
import type { Scenario } from '../domain/scenario';
import type { SimulationResult } from '../simulation/types';
import { getThermalColorCss } from './thermalTexture';

import { buildAirflowEmitters } from './particles/particleEmitters';

interface Isometric3DViewProps {
  scenario: Scenario;
  simulationResult: SimulationResult;
  selectedId: string | null;
  onSelect: (info: {
    id: string;
    type: string;
    temp?: number;
    heatKw?: number;
    active?: boolean;
  } | null) => void;
  resetSignal: number;
  showLabels?: boolean;
  showParticles?: boolean;
}

interface ProjectedBox {
  id: string;
  type: 'rack' | 'crac';
  centerDepth: number;
  draw: (ctx: CanvasRenderingContext2D) => void;
  hitTest: (px: number, py: number) => boolean;
  intakeTemp?: number;
  heatKw?: number;
  active?: boolean;
}

interface SoftwareParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  type: 'cold' | 'hot';
  color: string;
}

export const Isometric3DView: React.FC<Isometric3DViewProps> = ({
  scenario,
  simulationResult,
  selectedId,
  onSelect,
  resetSignal,
  showLabels = false,
  showParticles = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<SoftwareParticle[]>([]);

  // Camera state tuned for optimal 18m x 9m cuboid perspective
  const cameraRef = useRef({
    yaw: 0.40, // ~23 deg viewing angle clearly revealing 2:1 rectangular room ratio
    pitch: 0.35, // ~20 deg downward pitch showing walls, floor, and racks
    zoom: 26, // pixels per meter
    panX: 0,
    panY: 30,
    isDragging: false,
    dragButton: 0,
    lastX: 0,
    lastY: 0,
  });

  const boxesRef = useRef<ProjectedBox[]>([]);

  // Initialize software particles
  useEffect(() => {
    const { coldEmitters, hotEmitters } = buildAirflowEmitters(scenario, simulationResult);
    const count = 300;
    const newParticles: SoftwareParticle[] = [];

    for (let i = 0; i < count; i++) {
      const isCold = i % 2 === 0;
      const emitterList = isCold ? coldEmitters : hotEmitters;
      if (emitterList.length === 0) continue;
      const emitter = emitterList[Math.floor(Math.random() * emitterList.length)];
      const maxLife = 2.0 + Math.random() * 2.5;
      const progress = Math.random();

      const speed = emitter.speed * (0.8 + Math.random() * 0.4);
      const vx = emitter.direction[0] * speed + (Math.random() - 0.5) * 0.2;
      const vy = emitter.direction[1] * speed + (Math.random() - 0.5) * 0.2;
      const vz = emitter.direction[2] * speed + (Math.random() - 0.5) * 0.2;

      const px = emitter.position[0] + vx * (maxLife * progress);
      const py = emitter.position[1] + vy * (maxLife * progress);
      const pz = emitter.position[2] + vz * (maxLife * progress);

      const color = isCold
        ? '#38bdf8'
        : emitter.color[0] > 0.9 ? '#ef4444' : '#fb923c';

      newParticles.push({
        x: px,
        y: py,
        z: pz,
        vx,
        vy,
        vz,
        life: maxLife * (1 - progress),
        maxLife,
        type: emitter.type,
        color,
      });
    }
    particlesRef.current = newParticles;
  }, [scenario, simulationResult]);

  // Reset Camera
  useEffect(() => {
    cameraRef.current.yaw = 0.40;
    cameraRef.current.pitch = 0.35;
    cameraRef.current.zoom = 26;
    cameraRef.current.panX = 0;
    cameraRef.current.panY = 30;
  }, [resetSignal]);

  // Main Render Routine
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const { yaw, pitch, zoom, panX, panY } = cameraRef.current;
    const centerX = width / 2 + panX;
    const centerY = height / 2 + panY;

    // Precompute trig
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);

    // 3D to 2D projection function
    // World coordinates: room center is (0, 0, 0)
    // X: [-9, 9], Y: [-1.5, 1.5], Z: [-4.5, 4.5]
    const project = (x: number, y: number, z: number) => {
      // 1. Rotate around Y (yaw)
      const x1 = x * cosY - z * sinY;
      const z1 = x * sinY + z * cosY;
      // 2. Rotate around X (pitch)
      const y2 = y * cosP - z1 * sinP;
      const z2 = y * sinP + z1 * cosP;

      // Perspective projection
      const dist = 32;
      const scale = (dist / (dist + z2)) * zoom;

      return {
        x: centerX + x1 * scale,
        y: centerY - y2 * scale,
        depth: z2,
      };
    };

    const { room } = scenario;
    const hw = room.widthM / 2; // 9
    const hd = room.depthM / 2; // 4.5
    const floorY = -room.heightM / 2; // -1.5
    const ceilY = room.heightM / 2; // 1.5

    // 1. Draw Back Wall (Z = -hd plane) - Establishes 3D Cuboid Depth
    const bw0 = project(-hw, floorY, -hd);
    const bw1 = project(hw, floorY, -hd);
    const bw2 = project(hw, ceilY, -hd);
    const bw3 = project(-hw, ceilY, -hd);

    ctx.fillStyle = '#0f172a'; // Deep slate back wall
    ctx.beginPath();
    ctx.moveTo(bw0.x, bw0.y);
    ctx.lineTo(bw1.x, bw1.y);
    ctx.lineTo(bw2.x, bw2.y);
    ctx.lineTo(bw3.x, bw3.y);
    ctx.closePath();
    ctx.fill();

    // Back wall vertical panel seams
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let x = -hw + 3; x < hw; x += 3) {
      const pBot = project(x, floorY, -hd);
      const pTop = project(x, ceilY, -hd);
      ctx.beginPath();
      ctx.moveTo(pBot.x, pBot.y);
      ctx.lineTo(pTop.x, pTop.y);
      ctx.stroke();
    }

    // 2. Draw Left Side Wall (X = -hw plane)
    const sw0 = project(-hw, floorY, -hd);
    const sw1 = project(-hw, floorY, hd);
    const sw2 = project(-hw, ceilY, hd);
    const sw3 = project(-hw, ceilY, -hd);

    ctx.fillStyle = '#131e33'; // Slightly lit left side wall
    ctx.beginPath();
    ctx.moveTo(sw0.x, sw0.y);
    ctx.lineTo(sw1.x, sw1.y);
    ctx.lineTo(sw2.x, sw2.y);
    ctx.lineTo(sw3.x, sw3.y);
    ctx.closePath();
    ctx.fill();

    // Side wall vertical seams
    for (let z = -hd + 3; z < hd; z += 3) {
      const pBot = project(-hw, floorY, z);
      const pTop = project(-hw, ceilY, z);
      ctx.beginPath();
      ctx.moveTo(pBot.x, pBot.y);
      ctx.lineTo(pTop.x, pTop.y);
      ctx.stroke();
    }

    // 3. Draw Floor Tile Grid
    ctx.fillStyle = '#0a101d';
    const f0 = project(-hw, floorY, -hd);
    const f1 = project(hw, floorY, -hd);
    const f2 = project(hw, floorY, hd);
    const f3 = project(-hw, floorY, hd);

    ctx.beginPath();
    ctx.moveTo(f0.x, f0.y);
    ctx.lineTo(f1.x, f1.y);
    ctx.lineTo(f2.x, f2.y);
    ctx.lineTo(f3.x, f3.y);
    ctx.closePath();
    ctx.fill();

    // Floor skirting line
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bw3.x, bw3.y);
    ctx.lineTo(bw0.x, bw0.y);
    ctx.lineTo(bw1.x, bw1.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(sw0.x, sw0.y);
    ctx.lineTo(sw1.x, sw1.y);
    ctx.stroke();

    // Floor grid lines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let x = -hw; x <= hw; x += 1.5) {
      const pA = project(x, floorY, -hd);
      const pB = project(x, floorY, hd);
      ctx.beginPath();
      ctx.moveTo(pA.x, pA.y);
      ctx.lineTo(pB.x, pB.y);
      ctx.stroke();
    }
    for (let z = -hd; z <= hd; z += 1.5) {
      const pA = project(-hw, floorY, z);
      const pB = project(hw, floorY, z);
      ctx.beginPath();
      ctx.moveTo(pA.x, pA.y);
      ctx.lineTo(pB.x, pB.y);
      ctx.stroke();
    }

    // 3.1 Floor Thermal Heatmap Plane (Exact Data from temperatureGrid, no interpolation)
    const { temperatureGrid, gridWidth, gridDepth } = simulationResult;
    const cellW = room.widthM / gridWidth;
    const cellD = room.depthM / gridDepth;
    const stepX = 2;
    const stepZ = 2;

    for (let gz = 0; gz < gridDepth; gz += stepZ) {
      const z0 = -hd + gz * cellD;
      const z1 = z0 + stepZ * cellD;
      for (let gx = 0; gx < gridWidth; gx += stepX) {
        const x0 = -hw + gx * cellW;
        const x1 = x0 + stepX * cellW;
        const temp = temperatureGrid[gz * gridWidth + gx];
        ctx.fillStyle = getThermalColorCss(temp);
        ctx.globalAlpha = 0.55;

        const p0 = project(x0, floorY + 0.015, z0);
        const p1 = project(x1, floorY + 0.015, z0);
        const p2 = project(x1, floorY + 0.015, z1);
        const p3 = project(x0, floorY + 0.015, z1);

        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1.0;

    // 2. Prepare Racks and CRACs for Depth Sorting
    const boxes: ProjectedBox[] = [];
    const rackTempMap = new Map(simulationResult.rackResults.map((r) => [r.id, r.intakeTempC]));

    // Helper to render a 3D box
    const renderBox = (
      boxId: string,
      type: 'rack' | 'crac',
      centerX3D: number,
      bottomY3D: number,
      centerZ3D: number,
      w: number,
      h: number,
      d: number,
      rotY: number,
      mainColor: string,
      topColor: string,
      sideColor: string,
      intakeTemp?: number,
      heatKw?: number,
      active?: boolean
    ) => {
      const isSelected = selectedId === boxId;
      const hwB = w / 2;
      const hdB = d / 2;
      const cosR = Math.cos(rotY);
      const sinR = Math.sin(rotY);

      // Local 8 vertices relative to box center
      const localVerts = [
        [-hwB, 0, -hdB], // 0: bottom back-left
        [hwB, 0, -hdB], // 1: bottom back-right
        [hwB, 0, hdB], // 2: bottom front-right
        [-hwB, 0, hdB], // 3: bottom front-left
        [-hwB, h, -hdB], // 4: top back-left
        [hwB, h, -hdB], // 5: top back-right
        [hwB, h, hdB], // 6: top front-right
        [-hwB, h, hdB], // 7: top front-left
      ];

      const projVerts = localVerts.map(([lx, ly, lz]) => {
        // Rotate locally
        const rx = lx * cosR - lz * sinR;
        const rz = lx * sinR + lz * cosR;
        return project(centerX3D + rx, bottomY3D + ly, centerZ3D + rz);
      });

      const centerProj = project(centerX3D, bottomY3D + h / 2, centerZ3D);

      const drawFace = (indices: number[], fill: string, stroke = '#0284c7', strokeW = 1) => {
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.moveTo(projVerts[indices[0]].x, projVerts[indices[0]].y);
        for (let i = 1; i < indices.length; i++) {
          ctx.lineTo(projVerts[indices[i]].x, projVerts[indices[i]].y);
        }
        ctx.closePath();
        ctx.fill();
        if (isSelected) {
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2.5;
          ctx.stroke();
        } else if (stroke) {
          ctx.strokeStyle = stroke;
          ctx.lineWidth = strokeW;
          ctx.stroke();
        }
      };

      boxes.push({
        id: boxId,
        type,
        centerDepth: centerProj.depth,
        intakeTemp,
        heatKw,
        active,
        draw: (_context) => {
          // Bottom face: 0,1,2,3
          // Top face: 4,5,6,7
          // Front (+Z): 3,2,6,7
          // Back (-Z): 1,0,4,5
          // Left (-X): 0,3,7,4
          // Right (+X): 2,1,5,6

          // Draw back faces
          drawFace([0, 1, 5, 4], sideColor, '#1e293b');
          drawFace([0, 3, 7, 4], sideColor, '#1e293b');
          drawFace([2, 1, 5, 6], mainColor, '#1e293b');

          // Front Face (Intake side: 3, 2, 6, 7)
          const frontColor = type === 'rack' ? '#111827' : mainColor;
          drawFace([3, 2, 6, 7], frontColor, isSelected ? '#38bdf8' : '#334155');

          // If rack: Draw prominent front intake color strip
          if (type === 'rack' && intakeTemp !== undefined) {
            const stripColor = getThermalColorCss(intakeTemp);
            // Project strip vertices on front face
            const sY0 = bottomY3D + h * 0.65;
            const sY1 = bottomY3D + h * 0.85;
            const sV0 = project(
              centerX3D + (-hwB * 0.85) * cosR - (hdB + 0.02) * sinR,
              sY0,
              centerZ3D + (-hwB * 0.85) * sinR + (hdB + 0.02) * cosR
            );
            const sV1 = project(
              centerX3D + (hwB * 0.85) * cosR - (hdB + 0.02) * sinR,
              sY0,
              centerZ3D + (hwB * 0.85) * sinR + (hdB + 0.02) * cosR
            );
            const sV2 = project(
              centerX3D + (hwB * 0.85) * cosR - (hdB + 0.02) * sinR,
              sY1,
              centerZ3D + (hwB * 0.85) * sinR + (hdB + 0.02) * cosR
            );
            const sV3 = project(
              centerX3D + (-hwB * 0.85) * cosR - (hdB + 0.02) * sinR,
              sY1,
              centerZ3D + (-hwB * 0.85) * sinR + (hdB + 0.02) * cosR
            );

            ctx.fillStyle = stripColor;
            ctx.beginPath();
            ctx.moveTo(sV0.x, sV0.y);
            ctx.lineTo(sV1.x, sV1.y);
            ctx.lineTo(sV2.x, sV2.y);
            ctx.lineTo(sV3.x, sV3.y);
            ctx.closePath();
            ctx.fill();
          }

          // Top Face (4, 5, 6, 7)
          drawFace([4, 5, 6, 7], topColor, isSelected ? '#38bdf8' : '#334155');

          // Rack Label Overlay (when selected or showLabels is enabled)
          if (type === 'rack' && intakeTemp !== undefined && (isSelected || showLabels)) {
            const labelText = `${boxId.replace('RACK-', 'R-')}: ${intakeTemp.toFixed(1)}°C`;
            ctx.font = isSelected ? 'bold 11px monospace' : '10px monospace';
            const metrics = ctx.measureText(labelText);
            const padX = 6;
            const bgW = metrics.width + padX * 2;
            const bgH = 16;
            const labelY = centerProj.y - h * zoom * 0.5 - 10;

            ctx.fillStyle = isSelected ? 'rgba(2, 132, 199, 0.95)' : 'rgba(15, 23, 42, 0.85)';
            ctx.strokeStyle = intakeTemp > 27.0 ? '#ef4444' : '#0284c7';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.roundRect(centerProj.x - bgW / 2, labelY - 12, bgW, bgH, 4);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.fillText(labelText, centerProj.x, labelY);
          }
        },
        hitTest: (px, py) => {
          // Bounding box approximation
          const xs = projVerts.map((v) => v.x);
          const ys = projVerts.map((v) => v.y);
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);
          return px >= minX && px <= maxX && py >= minY && py <= maxY;
        },
      });
    };

    // 2.1 Add Racks (0.6m × 2.0m × 1.2m)
    scenario.racks.forEach((rack) => {
      const rx = rack.position[0] - hw;
      const rz = rack.position[2] - hd;
      const temp = rackTempMap.get(rack.id) ?? 20.0;
      renderBox(
        rack.id,
        'rack',
        rx,
        floorY,
        rz,
        0.6,
        2.0,
        1.2,
        rack.rotationY,
        '#1e293b',
        '#334155',
        '#0f172a',
        temp,
        rack.heatKw,
        true
      );
    });

    // 2.2 Add CRACs (1.0m × 2.0m × 1.0m)
    scenario.cracs.forEach((crac) => {
      const cx = crac.position[0] - hw;
      const cz = crac.position[2] - hd;
      const mainCol = crac.active ? '#0284c7' : '#475569';
      const topCol = crac.active ? '#38bdf8' : '#64748b';
      const sideCol = crac.active ? '#0369a1' : '#334155';
      renderBox(
        crac.id,
        'crac',
        cx,
        floorY,
        cz,
        1.0,
        2.0,
        1.0,
        0,
        mainCol,
        topCol,
        sideCol,
        undefined,
        undefined,
        crac.active
      );
    });

    // Sort by depth descending (painter's algorithm)
    boxes.sort((a, b) => b.centerDepth - a.centerDepth);
    boxesRef.current = boxes;

    // Draw sorted objects
    boxes.forEach((box) => box.draw(ctx));

    // 3. Draw Translucent Room Boundary Wireframe (18m × 3m × 9m)
    const corners = [
      project(-hw, floorY, -hd),
      project(hw, floorY, -hd),
      project(hw, floorY, hd),
      project(-hw, floorY, hd),
      project(-hw, ceilY, -hd),
      project(hw, ceilY, -hd),
      project(hw, ceilY, hd),
      project(-hw, ceilY, hd),
    ];

    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);

    // Ceiling outline
    ctx.beginPath();
    ctx.moveTo(corners[4].x, corners[4].y);
    ctx.lineTo(corners[5].x, corners[5].y);
    ctx.lineTo(corners[6].x, corners[6].y);
    ctx.lineTo(corners[7].x, corners[7].y);
    ctx.closePath();
    ctx.stroke();

    // 4 Vertical Pillars
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(corners[i].x, corners[i].y);
      ctx.lineTo(corners[i + 4].x, corners[i + 4].y);
      ctx.stroke();
    }

    // 4. Draw Airflow Particles (when showParticles is enabled)
    if (showParticles && particlesRef.current.length > 0) {
      const dt = 0.016;
      const particles = particlesRef.current;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.life -= dt;

        // Boundary check
        const out =
          p.x < -hw || p.x > hw || p.y < floorY || p.y > ceilY || p.z < -hd || p.z > hd;

        if (p.life <= 0 || out) {
          p.life = p.maxLife;
          if (p.type === 'cold') {
            p.y = floorY + 0.3;
          } else {
            p.y = floorY + 1.2;
          }
          p.x = (Math.random() - 0.5) * (hw * 1.6);
          p.z = (Math.random() - 0.5) * (hd * 1.6);
        } else {
          if (p.type === 'hot') {
            p.vy += 0.8 * dt; // Hot buoyant rise
          } else {
            p.vy -= 0.15 * dt; // Cold air stays low
          }
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.z += p.vz * dt;
        }

        const proj = project(p.x, p.y, p.z);
        const radius = Math.max(1.5, Math.min(3.5, (30 / (30 + proj.depth)) * 2.2));
        const alpha = Math.max(0.15, Math.min(0.9, p.life / p.maxLife));

        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1.0;
    }

    ctx.setLineDash([]);
  }, [scenario, simulationResult, selectedId, showLabels, showParticles]);

  // Request Animation Frame loop
  useEffect(() => {
    let animId: number;
    const loop = () => {
      render();
      animId = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(animId);
  }, [render]);

  // Handle Resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const updateSize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      render();
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [render]);

  // Mouse & Touch Controls
  const handleMouseDown = (e: React.MouseEvent) => {
    const cam = cameraRef.current;
    cam.isDragging = true;
    cam.dragButton = e.button;
    cam.lastX = e.clientX;
    cam.lastY = e.clientY;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const cam = cameraRef.current;
    if (!cam.isDragging) return;

    const dx = e.clientX - cam.lastX;
    const dy = e.clientY - cam.lastY;
    cam.lastX = e.clientX;
    cam.lastY = e.clientY;

    if (cam.dragButton === 0 && !e.shiftKey) {
      // Left click: Orbit Rotation (Yaw & Pitch)
      cam.yaw += dx * 0.008;
      cam.pitch = Math.max(0.1, Math.min(1.4, cam.pitch + dy * 0.008));
    } else {
      // Right click or Shift+drag: Pan
      cam.panX += dx;
      cam.panY += dy;
    }
  };

  const handleMouseUp = () => {
    cameraRef.current.isDragging = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const cam = cameraRef.current;
    cam.zoom = Math.max(12, Math.min(60, cam.zoom - e.deltaY * 0.025));
  };

  const handleClick = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    // Check hit test against sorted boxes (front to back)
    const reversed = [...boxesRef.current].reverse();
    for (const b of reversed) {
      if (b.hitTest(px, py)) {
        onSelect({
          id: b.id,
          type: b.type,
          temp: b.intakeTemp,
          heatKw: b.heatKw,
          active: b.active,
        });
        return;
      }
    }
    onSelect(null);
  };

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      onClick={handleClick}
      onContextMenu={(e) => e.preventDefault()}
      className="w-full h-[520px] rounded-lg bg-[#060913] cursor-grab active:cursor-grabbing block select-none"
    />
  );
};

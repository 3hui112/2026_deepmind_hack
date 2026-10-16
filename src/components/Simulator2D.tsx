import React, { useState, useRef } from 'react';
import type { Scenario, RackSpec } from '../domain/scenario';
import type { SimulationResult } from '../simulation/types';
import type { BlueprintOverlayConfig } from '../domain/rackSlots';
import { Wind, Info, Move, RotateCw, CheckCircle, MapPin } from 'lucide-react';
import { getThermalColorCss } from '../three/thermalTexture';

interface Simulator2DProps {
  scenario: Scenario;
  result: SimulationResult;
  blueprintConfig?: BlueprintOverlayConfig;
  onUpdateRackPosition?: (rackId: string, newPosition: [number, number, number]) => void;
  onRotateRack?: (rackId: string) => void;
}

export const Simulator2D: React.FC<Simulator2DProps> = ({
  scenario,
  result,
  blueprintConfig,
  onUpdateRackPosition,
  onRotateRack,
}) => {
  const [selectedRackId, setSelectedRackId] = useState<string | null>(null);
  const [draggedRackId, setDraggingRackId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; z: number } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);

  const { room } = scenario;
  // SVG coordinates: map room width and depth to viewBox
  const svgWidth = 840;
  const svgHeight = 600;
  const scaleX = svgWidth / room.widthM;
  const scaleZ = svgHeight / room.depthM;

  // Temperature color mapper (unified with 3D)
  const getTempColor = (temp: number) => getThermalColorCss(temp);

  // Convert SVG Mouse event to Room Meter coordinates [xMeters, zMeters]
  const getRoomMetersFromSvgEvent = (e: React.MouseEvent<SVGSVGElement> | React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return { xMeters: 0, zMeters: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const svgX = (clientX / rect.width) * svgWidth;
    const svgZ = (clientY / rect.height) * svgHeight;

    // Convert to centered room coordinates [-widthM/2 .. widthM/2]
    let xMeters = (svgX / scaleX) - room.widthM / 2;
    let zMeters = (svgZ / scaleZ) - room.depthM / 2;

    // Clamp inside room boundary
    xMeters = Math.max(-room.widthM / 2 + 0.5, Math.min(room.widthM / 2 - 0.5, xMeters));
    zMeters = Math.max(-room.depthM / 2 + 0.5, Math.min(room.depthM / 2 - 0.5, zMeters));

    return {
      xMeters: Number(xMeters.toFixed(2)),
      zMeters: Number(zMeters.toFixed(2)),
    };
  };

  // Handle Drag Start
  const handlePointerDownRack = (e: React.PointerEvent, rackId: string) => {
    e.stopPropagation();
    setSelectedRackId(rackId);
    setDraggingRackId(rackId);

    const targetRack = scenario.racks.find((r) => r.id === rackId);
    if (targetRack) {
      setDragPos({ x: targetRack.position[0], z: targetRack.position[2] });
    }
  };

  // Handle Drag Move
  const handlePointerMoveCanvas = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggedRackId) return;
    const { xMeters, zMeters } = getRoomMetersFromSvgEvent(e);
    setDragPos({ x: xMeters, z: zMeters });
  };

  // Handle Drag End
  const handlePointerUpCanvas = () => {
    if (draggedRackId && dragPos) {
      onUpdateRackPosition?.(draggedRackId, [dragPos.x, 0, dragPos.z]);
      setToastMessage(`[${draggedRackId}] moved to blueprint position [${dragPos.x}m, ${dragPos.z}m]`);
      setTimeout(() => setToastMessage(null), 3000);
    }
    setDraggingRackId(null);
    setDragPos(null);
  };

  const selectedRack = result.rackResults.find((r) => r.id === selectedRackId);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
        <div>
          <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <Wind className="w-5 h-5 text-sky-400" />
            2D Blueprint Interactive Rack Placement &amp; Thermal Flow Simulation
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Room dimensions: {room.widthM}m × {room.depthM}m | Click and drag server racks across the CAD blueprint overlay to reposition.
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 text-xs bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-slate-300">
          <span className="text-slate-400 font-medium">Intake Temp:</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#38bdf8] inline-block" />
            <span className="text-[11px]">&lt;22°C</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#34d399] inline-block" />
            <span className="text-[11px]">22~25°C</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#facc15] inline-block" />
            <span className="text-[11px]">25~27°C</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#fb923c] inline-block" />
            <span className="text-[11px] text-amber-300 font-semibold">27~30°C</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#ef4444] inline-block" />
            <span className="text-[11px] font-semibold text-rose-400">&ge;30°C</span>
          </div>
        </div>
      </div>

      {/* Main Interactive SVG Canvas */}
      <div className="relative bg-slate-950 rounded-lg p-2 border border-slate-800 overflow-hidden">
        {/* Toast Notification */}
        {toastMessage && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-emerald-950/95 text-emerald-200 border border-emerald-500/60 px-4 py-2 rounded-lg text-xs font-semibold shadow-2xl flex items-center gap-2 animate-bounce">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span>{toastMessage}</span>
          </div>
        )}

        <svg
          ref={svgRef}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          onPointerMove={handlePointerMoveCanvas}
          onPointerUp={handlePointerUpCanvas}
          className="w-full h-auto max-h-[540px] select-none cursor-crosshair touch-none"
        >
          {/* Subtle Grid Lines */}
          <defs>
            <pattern
              id="grid-pattern"
              width={scaleX}
              height={scaleZ}
              patternUnits="userSpaceOnUse"
            >
              <rect width={scaleX} height={scaleZ} fill="none" />
              <path
                d={`M ${scaleX} 0 L 0 0 0 ${scaleZ}`}
                fill="none"
                stroke="#1e293b"
                strokeWidth="0.8"
                strokeDasharray="2,2"
              />
            </pattern>
          </defs>

          {/* Background Floor */}
          <rect width={svgWidth} height={svgHeight} fill="#090d16" />
          <rect width={svgWidth} height={svgHeight} fill="url(#grid-pattern)" opacity="0.6" />

          {/* CAD Blueprint Floorplan Overlay Image (if enabled & present) */}
          {blueprintConfig?.enabled && blueprintConfig.imageUrl && (
            <image
              href={blueprintConfig.imageUrl}
              x={0}
              y={0}
              width={svgWidth}
              height={svgHeight}
              opacity={blueprintConfig.opacity}
              preserveAspectRatio="none"
            />
          )}

          {/* Aisle Indicators */}
          {scenario.selectedPreset === 'A' ? (
            <g opacity="0.4">
              <text x={svgWidth / 2} y={svgHeight * 0.5} fill="#94a3b8" fontSize="13" textAnchor="middle" fontStyle="italic">
                (Single directional airflow - Hot exhaust recirculation zone)
              </text>
            </g>
          ) : (
            <g>
              <rect
                x={svgWidth * 0.1}
                y={svgHeight * 0.42}
                width={svgWidth * 0.8}
                height={svgHeight * 0.16}
                fill="#0284c7"
                fillOpacity="0.12"
                stroke="#0284c7"
                strokeWidth="1.2"
                strokeDasharray="4,4"
                rx="4"
              />
              <text
                x={svgWidth / 2}
                y={svgHeight * 0.505}
                fill="#38bdf8"
                fontSize="12"
                fontWeight="600"
                textAnchor="middle"
                letterSpacing="1.5"
              >
                ❄ COLD AISLE
              </text>
            </g>
          )}

          {/* CRAC Units */}
          {result.cracResults.map((crac) => {
            const cx = (crac.position[0] + room.widthM / 2) * scaleX;
            const cz = (crac.position[2] + room.depthM / 2) * scaleZ;
            const cracW = 1.4 * scaleX;
            const cracH = 0.8 * scaleZ;
            const isTop = crac.position[2] < 0;

            return (
              <g
                key={crac.id}
                transform={`translate(${cx - cracW / 2}, ${cz - cracH / 2})`}
                className="transition-all"
              >
                <rect
                  width={cracW}
                  height={cracH}
                  rx="6"
                  fill={crac.active ? '#0369a1' : '#334155'}
                  stroke={crac.active ? '#38bdf8' : '#64748b'}
                  strokeWidth="2"
                  className={crac.active ? 'drop-shadow-md' : 'opacity-70'}
                />
                <text
                  x={cracW / 2}
                  y={cracH / 2 - 4}
                  fill="#ffffff"
                  fontSize="11"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {crac.id}
                </text>
                <text
                  x={cracW / 2}
                  y={cracH / 2 + 11}
                  fill={crac.active ? '#7dd3fc' : '#cbd5e1'}
                  fontSize="9.5"
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  {crac.active ? `ON (${crac.supplyTempC}°C)` : 'OFF (Stopped)'}
                </text>

                {/* Airflow direction arrow */}
                {crac.active && (
                  <path
                    d={
                      isTop
                        ? `M ${cracW / 2} ${cracH + 4} L ${cracW / 2} ${cracH + 16} M ${cracW / 2 - 4} ${cracH + 11} L ${cracW / 2} ${cracH + 16} L ${cracW / 2 + 4} ${cracH + 11}`
                        : `M ${cracW / 2} -4 L ${cracW / 2} -16 M ${cracW / 2 - 4} -11 L ${cracW / 2} -16 L ${cracW / 2 + 4} -11`
                    }
                    stroke="#38bdf8"
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                  />
                )}
              </g>
            );
          })}

          {/* Server Racks */}
          {result.rackResults.map((rack) => {
            const isBeingDragged = draggedRackId === rack.id;
            const currentX = isBeingDragged && dragPos ? dragPos.x : rack.position[0];
            const currentZ = isBeingDragged && dragPos ? dragPos.z : rack.position[2];

            const rx = (currentX + room.widthM / 2) * scaleX;
            const rz = (currentZ + room.depthM / 2) * scaleZ;
            const rackW = 0.8 * scaleX;
            const rackD = 1.0 * scaleZ;
            const isOverheated = rack.intakeTempC > 27.0;
            const tempColor = getTempColor(rack.intakeTempC);
            const isSelected = selectedRackId === rack.id;
            const isFacingSouth = rack.rotationY === 0;

            return (
              <g
                key={rack.id}
                transform={`translate(${rx - rackW / 2}, ${rz - rackD / 2})`}
                onPointerDown={(e) => handlePointerDownRack(e, rack.id)}
                className="cursor-grab active:cursor-grabbing group"
              >
                {/* Yellow Dragging Highlight Shadow */}
                {isBeingDragged && (
                  <rect
                    x="-4"
                    y="-4"
                    width={rackW + 8}
                    height={rackD + 8}
                    rx="6"
                    fill="none"
                    stroke="#eab308"
                    strokeWidth="2.5"
                    strokeDasharray="4,4"
                    className="animate-pulse"
                  />
                )}

                {/* Rack Outline Body */}
                <rect
                  width={rackW}
                  height={rackD}
                  rx="3"
                  fill="#0f172a"
                  stroke={isBeingDragged ? '#eab308' : isSelected ? '#38bdf8' : tempColor}
                  strokeWidth={isSelected || isBeingDragged ? '2.5' : isOverheated ? '2' : '1.2'}
                  className="transition-colors"
                />

                {/* Front Intake Face Indicator */}
                <rect
                  x="2"
                  y={isFacingSouth ? rackD - 4 : 1}
                  width={rackW - 4}
                  height="3"
                  fill={tempColor}
                  rx="1"
                />

                {/* Hot Exhaust Marker */}
                <rect
                  x="2"
                  y={isFacingSouth ? 1 : rackD - 4}
                  width={rackW - 4}
                  height="2"
                  fill="#f43f5e"
                  opacity="0.7"
                />

                {/* Move Icon Badge */}
                <g transform={`translate(${rackW / 2 - 6}, 3)`} opacity="0.6">
                  <path d="M 6 0 L 6 12 M 0 6 L 12 6" stroke="#ffffff" strokeWidth="1" />
                </g>

                {/* Rack Label */}
                <text
                  x={rackW / 2}
                  y={rackD / 2 - 2}
                  fill="#cbd5e1"
                  fontSize="8.5"
                  fontFamily="monospace"
                  textAnchor="middle"
                  className="group-hover:fill-sky-300 font-medium"
                >
                  {rack.id.replace('RACK-', '')}
                </text>

                {/* Temp Display on Rack */}
                <text
                  x={rackW / 2}
                  y={rackD / 2 + 10}
                  fill={tempColor}
                  fontSize="9.5"
                  fontFamily="monospace"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {rack.intakeTempC.toFixed(1)}°
                </text>

                {/* Warning icon for overheated racks */}
                {isOverheated && (
                  <circle
                    cx={rackW - 5}
                    cy={5}
                    r="3.5"
                    fill="#f43f5e"
                  />
                )}
              </g>
            );
          })}
        </svg>

        {/* Selected Rack Info & Move Controls Floating Card */}
        {selectedRack && (
          <div className="absolute bottom-4 left-4 bg-slate-900/95 backdrop-blur border border-sky-500/50 rounded-lg p-3.5 text-xs shadow-2xl min-w-[260px] space-y-2.5 z-10">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
              <span className="font-bold font-mono text-sky-400 flex items-center gap-1.5">
                <Move className="w-4 h-4 text-amber-400" />
                {selectedRack.id}
              </span>
              <button
                type="button"
                onClick={() => setSelectedRackId(null)}
                className="text-slate-500 hover:text-slate-300 px-1 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1 font-mono text-slate-300 text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-400">Intake Temp:</span>
                <span
                  className={`font-bold ${
                    selectedRack.intakeTempC > 27.0 ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {selectedRack.intakeTempC.toFixed(1)} °C
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Heat Load:</span>
                <span>{selectedRack.heatKw.toFixed(1)} kW</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Blueprint Coordinates:</span>
                <span className="text-amber-300 font-bold">
                  [{dragPos && draggedRackId === selectedRack.id ? dragPos.x : selectedRack.position[0]}m,{' '}
                  {dragPos && draggedRackId === selectedRack.id ? dragPos.z : selectedRack.position[2]}m]
                </span>
              </div>
            </div>

            {/* Quick Actions: Rotate Rack & Fine Move */}
            <div className="flex gap-2 pt-1 border-t border-slate-800">
              {onRotateRack && (
                <button
                  type="button"
                  onClick={() => onRotateRack(selectedRack.id)}
                  className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-300 text-[11px] font-semibold rounded-md border border-slate-700 flex items-center justify-center gap-1 transition-all"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  Rotate 180°
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer Info Notice */}
      <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
        <Info className="w-4 h-4 text-sky-400 shrink-0" />
        <span>
          Drag and drop server racks on the floorplan to freely reposition them. WebGPU thermal airflow simulations update instantly in real time on move.
        </span>
      </div>
    </div>
  );
};

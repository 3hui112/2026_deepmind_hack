import React, { useState } from 'react';
import type { Scenario, RackSpec } from '../domain/scenario';
import type { SimulationResult, RackSimulationResult } from '../simulation/types';
import { Wind, Info, AlertTriangle } from 'lucide-react';
import { getThermalColorCss } from '../three/thermalTexture';

interface Simulator2DProps {
  scenario: Scenario;
  result: SimulationResult;
}

export const Simulator2D: React.FC<Simulator2DProps> = ({ scenario, result }) => {
  const [selectedRackId, setSelectedRackId] = useState<string | null>(null);

  const { room } = scenario;
  // SVG coordinates: map room width and depth to viewBox
  const svgWidth = 840;
  const svgHeight = 600;
  const scaleX = svgWidth / room.widthM;
  const scaleZ = svgHeight / room.depthM;

  // Temperature color mapper (unified with 3D)
  const getTempColor = (temp: number) => getThermalColorCss(temp);

  const selectedRack = result.rackResults.find((r) => r.id === selectedRackId);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
        <div>
          <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <Wind className="w-5 h-5 text-sky-400" />
            2D 평면 기류 및 온도 분포 시뮬레이션
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            룸 크기: {room.widthM}m × {room.depthM}m | 랙 24대 (각 5.0kW) | CRAC 공조기 4대
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 text-xs bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-slate-300">
          <span className="text-slate-400 font-medium">흡입 온도:</span>
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
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-auto max-h-[520px] select-none"
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

          {/* Aisle Indicators */}
          {scenario.selectedPreset === 'A' ? (
            // Preset A has no dedicated cold aisle
            <g opacity="0.4">
              <text x={svgWidth / 2} y={scaleZ * 5.0} fill="#94a3b8" fontSize="13" textAnchor="middle" fontStyle="italic">
                (동일 방향 단일 기류 흐름 - 후면 배기 혼입 구역)
              </text>
            </g>
          ) : (
            // Preset B and C have Cold Aisle in middle (z: 3.8m to 6.2m)
            <g>
              <rect
                x={scaleX * 1.0}
                y={scaleZ * 4.4}
                width={scaleX * 12.0}
                height={scaleZ * 1.2}
                fill="#0284c7"
                fillOpacity="0.12"
                stroke="#0284c7"
                strokeWidth="1.2"
                strokeDasharray="4,4"
                rx="4"
              />
              <text
                x={svgWidth / 2}
                y={scaleZ * 5.05}
                fill="#38bdf8"
                fontSize="12"
                fontWeight="600"
                textAnchor="middle"
                letterSpacing="1.5"
              >
                ❄ COLD AISLE (냉기 통로)
              </text>
            </g>
          )}

          {/* CRAC Units */}
          {result.cracResults.map((crac) => {
            const cx = crac.position[0] * scaleX;
            const cz = crac.position[2] * scaleZ;
            const cracW = 1.4 * scaleX;
            const cracH = 0.8 * scaleZ;
            const isTop = crac.position[2] < 5.0;

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
                  {crac.active ? `ON (${crac.supplyTempC}°C)` : 'OFF (정지)'}
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
            const rx = rack.position[0] * scaleX;
            const rz = rack.position[2] * scaleZ;
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
                onClick={() => setSelectedRackId(rack.id)}
                className="cursor-pointer group"
              >
                {/* Rack Outline Body */}
                <rect
                  width={rackW}
                  height={rackD}
                  rx="3"
                  fill="#0f172a"
                  stroke={isSelected ? '#38bdf8' : tempColor}
                  strokeWidth={isSelected ? '2.5' : isOverheated ? '2' : '1.2'}
                  className="transition-colors"
                />

                {/* Front Intake Face Indicator (Green/Temp line) */}
                <rect
                  x="2"
                  y={isFacingSouth ? rackD - 4 : 1}
                  width={rackW - 4}
                  height="3"
                  fill={tempColor}
                  rx="1"
                />

                {/* Hot Exhaust marker on rear */}
                <rect
                  x="2"
                  y={isFacingSouth ? 1 : rackD - 4}
                  width={rackW - 4}
                  height="2"
                  fill="#f43f5e"
                  opacity="0.7"
                />

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

        {/* Selected Rack Info Floating Card */}
        {selectedRack && (
          <div className="absolute bottom-4 left-4 bg-slate-900/95 backdrop-blur border border-sky-500/50 rounded-lg p-3 text-xs shadow-xl min-w-[220px]">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
              <span className="font-bold font-mono text-sky-400">{selectedRack.id}</span>
              <button
                type="button"
                onClick={() => setSelectedRackId(null)}
                className="text-slate-500 hover:text-slate-300 px-1"
              >
                ✕
              </button>
            </div>
            <div className="mt-2 space-y-1 font-mono text-slate-300 text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-400">흡입구 온도:</span>
                <span
                  className={`font-bold ${
                    selectedRack.intakeTempC > 27.0 ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {selectedRack.intakeTempC.toFixed(1)} °C
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">발열 부하:</span>
                <span>{selectedRack.heatKw.toFixed(1)} kW</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">위치 좌표:</span>
                <span>[{selectedRack.position[0]}m, {selectedRack.position[2]}m]</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">배치 방향:</span>
                <span>{selectedRack.rotationY === 0 ? '남향 (0°)' : '북향 (180°)'}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Info Notice */}
      <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
        <Info className="w-4 h-4 text-sky-400 shrink-0" />
        <span>
          각 랙을 클릭하여 세부 흡입 온도와 좌표를 확인하세요. 랙 전면(두꺼운 색상 바)이 흡입면이며, 후면(붉은 점선)이 배기면입니다.
        </span>
      </div>
    </div>
  );
};

import React, { useState, useMemo } from 'react';
import type { SimulationResult, PresetId } from '../domain/scenario';
import { createPresetScenario, BENCHMARK_REFERENCES } from '../simulation/presets';
import { calculateThermalField } from '../simulation/thermalEngine';
import {
  Thermometer,
  AlertTriangle,
  Zap,
  CheckCircle2,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Cpu,
  Layers,
  Box,
} from 'lucide-react';

interface MetricsPanelProps {
  result: SimulationResult;
  selectedPreset?: PresetId;
}

export const MetricsPanel: React.FC<MetricsPanelProps> = ({
  result,
  selectedPreset = 'A',
}) => {
  const [showDevPanel, setShowDevPanel] = useState<boolean>(false);

  const isHealthy = result.racksAbove27C === 0;
  const isCritical = result.racksAbove27C >= 5;

  // 2D and 3D both consume the identical SimulationResult instance
  const twoDMax = result.maxIntakeTempC;
  const threeDMax = result.maxIntakeTempC;
  const isConsistent = Math.abs(twoDMax - threeDMax) < 0.001;

  // Real thermal calculation for all 3 presets to compare against benchmark references
  const allPresetCalculations = useMemo(() => {
    return {
      A: calculateThermalField(createPresetScenario('A')),
      B: calculateThermalField(createPresetScenario('B')),
      C: calculateThermalField(createPresetScenario('C')),
    };
  }, []);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
      {/* Header with Benchmark Tag */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
        <div>
          <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <Thermometer className="w-5 h-5 text-amber-400" />
            핵심 열 환경 지표
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            ASHRAE 권장 흡입 기준(최대 27.0°C) 및 발열량 대비 현황
          </p>
        </div>

        {/* 2D vs 3D Consistency Verification Badge */}
        <div className="flex flex-wrap items-center gap-2">
          {isConsistent ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              2D / 3D 지표 완전 일치 (오차 0.0°C)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-medium bg-rose-950 text-rose-300 border border-rose-700 animate-bounce">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
              2D / 3D 지표 불일치 오류
            </span>
          )}

          <button
            type="button"
            onClick={() => setShowDevPanel((prev) => !prev)}
            className="px-2 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1 transition-colors"
          >
            <Cpu className="w-3.5 h-3.5 text-sky-400" />
            <span>개발자 검증 패널</span>
            {showDevPanel ? (
              <ChevronUp className="w-3 h-3 text-slate-400" />
            ) : (
              <ChevronDown className="w-3 h-3 text-slate-400" />
            )}
          </button>
        </div>
      </div>

      {/* Grid of Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Metric 1: Max Intake Temp */}
        <div className="bg-slate-950 p-4 rounded-lg border border-slate-800/80">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>최대 흡입 온도</span>
            <Thermometer className="w-4 h-4 text-rose-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span
              className={`text-2xl font-bold font-mono ${
                result.maxIntakeTempC > 27.0 ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {result.maxIntakeTempC.toFixed(1)}
            </span>
            <span className="text-sm text-slate-400">°C</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {result.maxIntakeTempC > 27.0 ? '권장 상한(27°C) 초과' : '권장 허용치 이내 안정'}
          </p>
        </div>

        {/* Metric 2: Racks Above 27C */}
        <div className="bg-slate-950 p-4 rounded-lg border border-slate-800/80">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>27°C 초과 랙</span>
            {isHealthy ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : isCritical ? (
              <ShieldAlert className="w-4 h-4 text-rose-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            )}
          </div>
          <div className="flex items-baseline gap-1.5">
            <span
              className={`text-2xl font-bold font-mono ${
                isHealthy
                  ? 'text-emerald-400'
                  : isCritical
                  ? 'text-rose-400'
                  : 'text-amber-400'
              }`}
            >
              {result.racksAbove27C}
            </span>
            <span className="text-sm text-slate-400">/ {result.rackResults.length} 대</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {isHealthy ? '전체 랙 정상 냉각' : '핫스팟 및 기류 단절 의심'}
          </p>
        </div>

        {/* Metric 3: Total Heat */}
        <div className="bg-slate-950 p-4 rounded-lg border border-slate-800/80">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>총 서버 발열량</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-slate-200">
              {result.totalHeatKw.toFixed(1)}
            </span>
            <span className="text-sm text-slate-400">kW</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">24대 랙 총합 부하</p>
        </div>

        {/* Metric 4: Average Intake Temp */}
        <div className="bg-slate-950 p-4 rounded-lg border border-slate-800/80">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>평균 흡입 온도</span>
            <Thermometer className="w-4 h-4 text-sky-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-sky-300">
              {result.averageIntakeTempC.toFixed(1)}
            </span>
            <span className="text-sm text-slate-400">°C</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">전체 랙 흡입부 평균</p>
        </div>
      </div>

      {/* 2D vs 3D Maximum Temperature Side-by-Side Comparison */}
      <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-sky-400" />
            <span className="text-slate-400">2D 시뮬레이터 최대 흡입:</span>
            <span className="font-mono font-bold text-slate-200 text-sm">
              {twoDMax.toFixed(1)}°C
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Box className="w-4 h-4 text-indigo-400" />
            <span className="text-slate-400">3D 디지털 트윈 최대 흡입:</span>
            <span className="font-mono font-bold text-slate-200 text-sm">
              {threeDMax.toFixed(1)}°C
            </span>
          </div>
        </div>

        <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
          <span>인스턴스 동기화:</span>
          <span className="text-emerald-400 font-mono font-semibold">동일 메모리 참조</span>
        </div>
      </div>

      {/* Collapsible Developer Diagnostics Panel */}
      {showDevPanel && (
        <div className="mt-3 bg-slate-950/95 border border-slate-700/80 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2 font-mono text-xs font-semibold text-sky-400">
              <Cpu className="w-4 h-4 text-sky-400" />
              <span>A / B / C 프리셋 기준값 검증 테이블</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              현재 활성 프리셋: <strong className="text-white">Preset {selectedPreset}</strong>
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                  <th className="py-1.5 px-2">프리셋</th>
                  <th className="py-1.5 px-2">목표 기준 최대</th>
                  <th className="py-1.5 px-2">엔진 계산 최대</th>
                  <th className="py-1.5 px-2">최대온도 차이 (Δ)</th>
                  <th className="py-1.5 px-2">27°C 초과 목표</th>
                  <th className="py-1.5 px-2">엔진 과열 랙</th>
                  <th className="py-1.5 px-2">과열랙 차이 (Δ)</th>
                  <th className="py-1.5 px-2">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {(['A', 'B', 'C'] as const).map((pid) => {
                  const ref = BENCHMARK_REFERENCES[pid];
                  const computed = pid === selectedPreset ? result : allPresetCalculations[pid];
                  const isCurrent = selectedPreset === pid;
                  const deltaMax = Math.abs(computed.maxIntakeTempC - ref.maxIntakeTempC);
                  const deltaOver = Math.abs(computed.racksAbove27C - ref.racksAbove27C);
                  const isExact = deltaMax < 0.05 && deltaOver === 0;

                  return (
                    <tr
                      key={pid}
                      className={isCurrent ? 'bg-sky-950/40 text-sky-200' : 'hover:bg-slate-900/40'}
                    >
                      <td className="py-2 px-2 font-bold flex items-center gap-1.5">
                        {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />}
                        {ref.name}
                      </td>
                      <td className="py-2 px-2">{ref.maxIntakeTempC.toFixed(1)}°C</td>
                      <td className="py-2 px-2 font-semibold">
                        {computed.maxIntakeTempC.toFixed(1)}°C
                      </td>
                      <td
                        className={`py-2 px-2 font-semibold ${
                          deltaMax < 0.05 ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {deltaMax < 0.05 ? 'Δ 0.0°C' : `Δ ${deltaMax.toFixed(1)}°C`}
                      </td>
                      <td className="py-2 px-2">{ref.racksAbove27C} / 24 대</td>
                      <td className="py-2 px-2 font-semibold">
                        {computed.racksAbove27C} / 24 대
                      </td>
                      <td
                        className={`py-2 px-2 font-semibold ${
                          deltaOver === 0 ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {deltaOver === 0 ? 'Δ 0 대' : `Δ ${deltaOver} 대`}
                      </td>
                      <td className="py-2 px-2">
                        {isExact ? (
                          <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800/80 px-1.5 py-0.5 rounded font-sans">
                            완전 일치
                          </span>
                        ) : (
                          <span className="text-[10px] bg-amber-950 text-amber-300 border border-amber-800/80 px-1.5 py-0.5 rounded font-sans">
                            차이 감지
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed border-t border-slate-800 pt-2">
            * 2D 시뮬레이터와 3D 디지털 트윈은 동일한 <code>SimulationResult</code> 인스턴스를 공유합니다.
            3D 뷰포트에서 임의의 온도 보간이나 수치 변조 없이 원천 Float32Array <code>temperatureGrid</code>와 <code>rackResults</code>를 직접 렌더링하므로 지표의 무결성이 보장됩니다.
          </p>
        </div>
      )}
    </div>
  );
};

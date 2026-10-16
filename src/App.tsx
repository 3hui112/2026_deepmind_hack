/**
 * Data Center Thermal Digital Twin - WebGPU Native & Gemini 4 Argon Application
 * Track 2: Hard Tech (Data Center Thermal, GPU Rack U-Slot & Spatial Simulation)
 */

import React, { useState, useMemo } from 'react';
import type { PresetId, Scenario, SimulationResult, RoomDimensions } from './domain/scenario';
import { createPresetScenario } from './simulation/presets';
import { calculateThermalField, MODEL_DISCLAIMER } from './simulation/thermalEngine';
import { ScenarioControls } from './components/ScenarioControls';
import { MetricsPanel } from './components/MetricsPanel';
import { Simulator2D } from './components/Simulator2D';
import { ServerRoom3D } from './three/ServerRoom3D';
import { probeWebGPUAdapter, type WebGPUAdapterReport } from './three/webgpuAdapter';
import { ArgonAnalysisPanel } from './components/ArgonAnalysisPanel';
import { BlueprintOverlayControls } from './components/BlueprintOverlayControls';
import { RackUSlotManager } from './components/RackUSlotManager';
import { SlotOptimizationPanel } from './components/SlotOptimizationPanel';
import {
  DEFAULT_BLUEPRINT_CONFIG,
  type BlueprintOverlayConfig,
  type RackUSlotState,
} from './domain/rackSlots';
import {
  analyzeAndOptimizeSlots,
  createDefaultRackSlotStates,
  type SlotRecommendation,
} from './simulation/slotOptimization';
import {
  Server,
  AlertCircle,
  HelpCircle,
  Radio,
  Gauge,
  Cpu,
} from 'lucide-react';

export default function App() {
  const [selectedPreset, setSelectedPreset] = useState<PresetId>('A');
  const [viewMode, setViewMode] = useState<'2D' | '3D'>('3D');
  const [adapterReport, setAdapterReport] = useState<WebGPUAdapterReport | null>(null);
  const [backendStatus, setBackendStatus] = useState<{
    connected: boolean;
    runtime?: string;
    timestamp?: string;
  }>({ connected: false });

  // Capability 1: Dynamic Room Dimensions & Blueprint Overlay State
  const [customRoom, setCustomRoom] = useState<RoomDimensions>({
    widthM: 18.0,
    depthM: 9.0,
    heightM: 3.0,
  });
  const [blueprintConfig, setBlueprintConfig] = useState<BlueprintOverlayConfig>(
    DEFAULT_BLUEPRINT_CONFIG
  );

  // Capability 2: Interactive Rack U-Slot State
  const [selectedRackId, setSelectedRackId] = useState<string>('RACK-1-01');
  const [rackSlotStates, setRackSlotStates] = useState<Record<string, RackUSlotState>>({});

  // Probe WebGPU Adapter & check backend server health on mount
  React.useEffect(() => {
    probeWebGPUAdapter()
      .then((report) => {
        setAdapterReport(report);
      })
      .catch(() => {
        // Handled gracefully by probeWebGPUAdapter
      });

    fetch('/api/health')
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => {
        setBackendStatus({
          connected: true,
          runtime: data.runtime || 'Node.js',
          timestamp: data.timestamp,
        });
      })
      .catch(() => {
        setBackendStatus({ connected: false });
      });
  }, []);

  // Build the domain scenario based on selected preset & custom room dimensions
  const scenario: Scenario = useMemo(() => {
    const baseScenario = createPresetScenario(selectedPreset);
    return {
      ...baseScenario,
      room: customRoom,
    };
  }, [selectedPreset, customRoom]);

  // Compute thermal results using pluggable thermalEngine
  const simulationResult: SimulationResult = useMemo(() => {
    return calculateThermalField(scenario);
  }, [scenario]);

  // Initialize or synchronize rack U-slot states when preset changes
  React.useEffect(() => {
    setRackSlotStates(createDefaultRackSlotStates(scenario));
  }, [selectedPreset, scenario]);

  // Capability 3: Compute vertical thermal physics & Argon slot optimization
  const slotOptimization = useMemo(() => {
    return analyzeAndOptimizeSlots(
      scenario,
      simulationResult.rackResults,
      Object.keys(rackSlotStates).length > 0 ? rackSlotStates : undefined
    );
  }, [scenario, simulationResult.rackResults, rackSlotStates]);

  // Handle 1-Click Apply Recommendation
  const handleApplyRecommendation = (rec: SlotRecommendation) => {
    if (rec.type === 'MOVE_SLOT' && rec.targetChassisId && rec.sourceRackId) {
      const srcState = rackSlotStates[rec.sourceRackId];
      const destState = rackSlotStates[rec.destRackId];

      if (srcState && destState) {
        const chassis = srcState.installedServers.find((s) => s.id === rec.targetChassisId);
        if (chassis) {
          const updatedSrc = {
            ...srcState,
            installedServers: srcState.installedServers.filter(
              (s) => s.id !== rec.targetChassisId
            ),
          };

          const movedChassis = { ...chassis, startU: rec.destStartU };
          const updatedDest = {
            ...destState,
            installedServers: [...destState.installedServers, movedChassis],
          };

          setRackSlotStates({
            ...rackSlotStates,
            [rec.sourceRackId]: updatedSrc,
            [rec.destRackId]: updatedDest,
          });
        }
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-sky-500 selection:text-white">
      {/* Top Banner: GPU Adapter Badge, Backend Status, SYNTHETIC DEMO DATA & Model Disclaimer */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          {/* Brand & Title */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-sky-600 flex items-center justify-center text-white shadow-md shadow-sky-600/30">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-2">
                Data Center Thermal Digital Twin
              </h1>
              <p className="text-xs text-slate-400">
                Gemini 4 Argon Hard-Tech GPU Rack U-Slot 공간 배치 및 WebGPU 열유동 시뮬레이터
              </p>
            </div>
          </div>

          {/* Badges: WebGPU Adapter Info, Backend Status, SYNTHETIC DEMO DATA & Model Disclaimer */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* WebGPU Hardware Adapter Badge */}
            {adapterReport ? (
              adapterReport.available ? (
                <span
                  title={`Vendor: ${adapterReport.vendor} | Architecture: ${adapterReport.architecture} | Driver/Device: ${adapterReport.device} (${adapterReport.description}) | MaxComputeWorkgroupSizeX: ${adapterReport.limits.maxComputeWorkgroupSizeX}`}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-semibold bg-sky-950/90 text-sky-300 border border-sky-700/80 shadow-sm"
                >
                  <Gauge className="w-3.5 h-3.5 text-sky-400" />
                  {adapterReport.badgeLabel}
                </span>
              ) : (
                <span
                  title={
                    adapterReport.fallbackReason ||
                    'navigator.gpu 비활성화 — WebGL2/CPU 폴백 모드로 안전하게 실행됩니다.'
                  }
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-medium bg-amber-950/80 text-amber-300 border border-amber-800/80"
                >
                  <Cpu className="w-3.5 h-3.5 text-amber-400" />
                  {adapterReport.badgeLabel}
                </span>
              )
            ) : null}

            {/* Backend Runtime Connection Badge */}
            {backendStatus.connected ? (
              <span
                title={`Node.js Express 백엔드(/api/health)가 정상 연결되어 응답 중입니다. (기록 시각: ${backendStatus.timestamp ?? '정상'})`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-800/80"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Backend: Node.js (API 정상)
              </span>
            ) : (
              <span
                title="Node.js 백엔드 서버 응답 대기 중..."
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-medium bg-slate-800 text-slate-400 border border-slate-700"
              >
                <Radio className="w-3.5 h-3.5 text-slate-400" />
                Backend: 연결 중...
              </span>
            )}

            {scenario.synthetic && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold tracking-wider uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
                <AlertCircle className="w-3.5 h-3.5" />
                SYNTHETIC DEMO DATA
              </span>
            )}

            <div className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-slate-800/90 text-slate-300 border border-slate-700">
              <HelpCircle className="w-3.5 h-3.5 text-sky-400" />
              <span>{MODEL_DISCLAIMER}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Mobile Disclaimer (visible only on small screens) */}
        <div className="lg:hidden bg-slate-900 p-2.5 rounded-lg border border-slate-800 text-xs text-slate-300 flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-sky-400 shrink-0" />
          <span>{MODEL_DISCLAIMER}</span>
        </div>

        {/* Section 1: Preset Controls & 2D/3D View Switcher */}
        <section aria-label="시나리오 프리셋 제어">
          <ScenarioControls
            selectedPreset={selectedPreset}
            onSelectPreset={setSelectedPreset}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />
        </section>

        {/* Capability 1: Custom Server Room Dimensions & CAD Blueprint Overlay */}
        <section aria-label="커스텀 서버실 도면 설정">
          <BlueprintOverlayControls
            room={customRoom}
            onUpdateRoom={setCustomRoom}
            config={blueprintConfig}
            onUpdateConfig={setBlueprintConfig}
          />
        </section>

        {/* Section 2: Key Metrics Panel & Verification */}
        <section aria-label="핵심 열 지표">
          <MetricsPanel result={simulationResult} selectedPreset={selectedPreset} />
        </section>

        {/* Section 3: 2D or 3D Simulation Viewport */}
        <section aria-label="시뮬레이션 영역">
          {viewMode === '2D' ? (
            <Simulator2D scenario={scenario} result={simulationResult} />
          ) : (
            <ServerRoom3D
              scenario={scenario}
              simulationResult={simulationResult}
              onAdapterReport={setAdapterReport}
              rackSlotStates={rackSlotStates}
              onUpdateRackSlotStates={setRackSlotStates}
            />
          )}
        </section>

        {/* Capability 2: Interactive Rack U-Slot Manager & Drag-and-Drop */}
        <section aria-label="랙 U-슬롯 및 PDU 공간 관리자">
          <RackUSlotManager
            scenario={scenario}
            rackSlotStates={rackSlotStates}
            onUpdateRackSlotStates={setRackSlotStates}
            selectedRackId={selectedRackId}
            onSelectRackId={setSelectedRackId}
          />
        </section>

        {/* Capability 3: Gemini 4 Argon U-Slot Optimization & Emergency Shedding */}
        <section aria-label="Argon 슬롯 재배치 및 비상 제어">
          <SlotOptimizationPanel
            optimizationResult={slotOptimization}
            rackSlotStates={rackSlotStates}
            onApplyRecommendation={handleApplyRecommendation}
          />
        </section>

        {/* Section 5: Gemini Argon Analysis Engine */}
        <section aria-label="Gemini Argon 분석">
          <ArgonAnalysisPanel scenario={scenario} simulationResult={simulationResult} />
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-4 text-center text-xs text-slate-500">
        <p>Data Center Thermal Digital Twin &amp; Gemini 4 Argon Master Engine &copy; 2026</p>
      </footer>
    </div>
  );
}

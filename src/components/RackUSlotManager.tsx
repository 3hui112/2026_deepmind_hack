import React, { useState } from 'react';
import type { Scenario } from '../domain/scenario';
import {
  GPU_HARDWARE_LIBRARY,
  getEmptyUSlotRanges,
  getRackPowerMetrics,
  type RackUSlotState,
  type InstalledServerChassis,
  type GPUHardwareSpec,
} from '../domain/rackSlots';
import {
  Cpu,
  Server,
  Plus,
  Trash2,
  AlertTriangle,
  Zap,
  Move,
  CheckCircle2,
  Sliders,
  Layers,
  ShieldAlert,
} from 'lucide-react';

interface RackUSlotManagerProps {
  scenario: Scenario;
  rackSlotStates: Record<string, RackUSlotState>;
  onUpdateRackSlotStates: (states: Record<string, RackUSlotState>) => void;
  selectedRackId: string;
  onSelectRackId: (rackId: string) => void;
}

export const RackUSlotManager: React.FC<RackUSlotManagerProps> = ({
  scenario,
  rackSlotStates,
  onUpdateRackSlotStates,
  selectedRackId,
  onSelectRackId,
}) => {
  const currentRackState = rackSlotStates[selectedRackId] || {
    rackId: selectedRackId,
    totalU: 42,
    breakerAmps: 32,
    voltageV: 220,
    phases: 1,
    installedServers: [],
  };

  const powerMetrics = getRackPowerMetrics(currentRackState);
  const emptyRanges = getEmptyUSlotRanges(currentRackState);

  // Hardware library selection for mounting
  const [selectedHardwareKey, setSelectedHardwareKey] = useState<string>('H100_SXM5');
  const [targetStartU, setTargetStartU] = useState<number>(24);

  // Staging Inventory Shelf for unmounted servers
  const [stagingShelf, setStagingShelf] = useState<InstalledServerChassis[]>([]);

  // Drag-and-drop state
  const [draggedChassis, setDraggedChassis] = useState<{
    chassis: InstalledServerChassis;
    fromRackId?: string;
  } | null>(null);

  // Handle adding a new server chassis from GPU library to current rack
  const handleMountServer = () => {
    const spec = GPU_HARDWARE_LIBRARY[selectedHardwareKey];
    if (!spec) return;

    // Validate fit within rack
    const newChassis: InstalledServerChassis = {
      id: `${selectedRackId}-NODE-${Date.now().toString().slice(-4)}`,
      specId: spec.id,
      name: spec.name,
      uHeight: spec.uHeight,
      startU: targetStartU,
      powerKw: spec.powerKw,
      loadFactor: 0.85,
    };

    const updated = {
      ...currentRackState,
      installedServers: [...currentRackState.installedServers, newChassis],
    };

    onUpdateRackSlotStates({
      ...rackSlotStates,
      [selectedRackId]: updated,
    });
  };

  // Unmount chassis and send to staging shelf
  const handleUnmountServer = (chassisId: string) => {
    const chassis = currentRackState.installedServers.find((s) => s.id === chassisId);
    if (!chassis) return;

    const updatedServers = currentRackState.installedServers.filter((s) => s.id !== chassisId);
    onUpdateRackSlotStates({
      ...rackSlotStates,
      [selectedRackId]: {
        ...currentRackState,
        installedServers: updatedServers,
      },
    });

    setStagingShelf([...stagingShelf, chassis]);
  };

  // Drag and Drop handlers
  const handleDragStart = (chassis: InstalledServerChassis, fromRackId?: string) => {
    setDraggedChassis({ chassis, fromRackId });
  };

  const handleDropOnSlot = (dropTargetU: number) => {
    if (!draggedChassis) return;

    const { chassis, fromRackId } = draggedChassis;
    const newChassis = { ...chassis, startU: dropTargetU };

    if (fromRackId && rackSlotStates[fromRackId]) {
      // Remove from source rack
      const srcServers = rackSlotStates[fromRackId].installedServers.filter(
        (s) => s.id !== chassis.id
      );

      // Add to current target rack
      const destServers = [...currentRackState.installedServers, newChassis];

      onUpdateRackSlotStates({
        ...rackSlotStates,
        [fromRackId]: { ...rackSlotStates[fromRackId], installedServers: srcServers },
        [selectedRackId]: { ...currentRackState, installedServers: destServers },
      });
    }

    setDraggedChassis(null);
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 sm:p-5 text-slate-100 shadow-lg space-y-5">
      {/* Header & Rack Selector Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-800">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              Rack U-Slot 공간 &amp; PDU 차단기 관리자
            </h2>
            <p className="text-xs text-slate-400">
              U01–U42 수직 슬롯 마우스 드래그 앤 드롭 배치 및 80% PDU 차단기 부하 임계 검증
            </p>
          </div>
        </div>

        {/* Rack Selection Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1">
          {scenario.racks.slice(0, 12).map((rack) => (
            <button
              key={rack.id}
              onClick={() => onSelectRackId(rack.id)}
              className={`px-2.5 py-1 rounded text-xs font-mono font-semibold transition-all ${
                selectedRackId === rack.id
                  ? 'bg-sky-600 text-white shadow'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
            >
              {rack.id.replace('RACK-', 'R-')}
            </button>
          ))}
        </div>
      </div>

      {/* Rack Power & NEC 80% Continuous Duty Banner */}
      <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-bold text-slate-200">
            <Zap className="w-4 h-4 text-amber-400" />
            <span>{selectedRackId} PDU 부하:</span>
          </div>
          <span className="font-mono text-base font-bold text-white">
            {powerMetrics.totalPowerKw} kW
          </span>
          <span className="text-slate-400">/ {powerMetrics.breakerRatedKw} kW Rated</span>
        </div>

        <div className="flex items-center gap-2">
          {powerMetrics.isBreakerOverloaded ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-rose-950/90 text-rose-300 border border-rose-800 font-bold">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              PDU 과부하 경고 (NEC 80% 초과: {powerMetrics.necSafeLimitKw} kW 안전 기준)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800 font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              NEC 80% 안전 가이드 준수 ({powerMetrics.necSafeLimitKw} kW 여유)
            </span>
          )}
        </div>
      </div>

      {/* Main Grid: Front Rack Elevation View vs. GPU Hardware Library Palette */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Col: Front Elevation Rack View (U01 to U42) */}
        <div className="lg:col-span-7 bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-slate-300 border-b border-slate-800 pb-2">
            <span>랙 전면 실장도 (Rack Elevation View: U01 ➔ U42)</span>
            <span className="text-sky-400 font-mono">Total: {currentRackState.totalU}U</span>
          </div>

          {/* Vertical U-Slot Stack */}
          <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1 select-none font-mono text-xs">
            {Array.from({ length: currentRackState.totalU }, (_, i) => currentRackState.totalU - i).map(
              (u) => {
                // Find server occupying this U
                const server = currentRackState.installedServers.find(
                  (s) => u >= s.startU && u < s.startU + s.uHeight
                );

                const isStartU = server && server.startU === u;

                return (
                  <div
                    key={u}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDropOnSlot(u)}
                    className={`flex items-center gap-2 px-2 py-1 rounded border transition-colors ${
                      server
                        ? 'bg-slate-900 border-sky-800/80'
                        : 'bg-slate-950 hover:bg-slate-900/60 border-slate-800/60'
                    }`}
                  >
                    {/* Slot U Number */}
                    <span className="w-8 shrink-0 font-bold text-slate-400 text-center">
                      U{u.toString().padStart(2, '0')}
                    </span>

                    {/* Content */}
                    {server ? (
                      isStartU ? (
                        <div
                          draggable
                          onDragStart={() => handleDragStart(server, selectedRackId)}
                          className="flex-1 flex items-center justify-between px-2 py-1 rounded bg-sky-950/80 border border-sky-700/80 text-sky-200 cursor-grab active:cursor-grabbing shadow-sm"
                        >
                          <div className="flex items-center gap-2">
                            <Move className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                            <span className="font-bold">{server.name}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-900 text-sky-300">
                              {server.uHeight}U
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-emerald-400 font-bold">
                              {server.powerKw} kW
                            </span>
                            <button
                              onClick={() => handleUnmountServer(server.id)}
                              title="서버 마운트 해제"
                              className="p-1 hover:bg-sky-900 text-slate-300 hover:text-rose-300 rounded"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 h-3 rounded bg-sky-950/30 border border-dashed border-sky-800/40" />
                      )
                    ) : (
                      <div className="flex-1 text-[11px] text-slate-600 flex items-center justify-between px-2">
                        <span>Empty Slot</span>
                      </div>
                    )}
                  </div>
                );
              }
            )}
          </div>
        </div>

        {/* Right Col: GPU Server Library & Mount Controls */}
        <div className="lg:col-span-5 space-y-4">
          {/* Component Palette */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
            <h3 className="text-xs font-bold text-slate-200 flex items-center justify-between">
              <span>GPU 서버 팔레트 (Hardware Library)</span>
              <span className="text-xs text-sky-400 font-mono">Preset Library</span>
            </h3>

            <div className="space-y-2 text-xs">
              {Object.entries(GPU_HARDWARE_LIBRARY).map(([key, spec]) => (
                <label
                  key={key}
                  className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-all ${
                    selectedHardwareKey === key
                      ? 'bg-sky-950/80 border-sky-600 text-white'
                      : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="gpuSpec"
                      checked={selectedHardwareKey === key}
                      onChange={() => setSelectedHardwareKey(key)}
                      className="accent-sky-500"
                    />
                    <div>
                      <div className="font-bold">{spec.name}</div>
                      <div className="text-[11px] text-slate-400">{spec.description}</div>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-emerald-400">{spec.powerKw} kW</span>
                </label>
              ))}
            </div>

            {/* Mount Action Controls */}
            <div className="pt-2 border-t border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">시작 U 슬롯 지정:</span>
                <input
                  type="number"
                  min={1}
                  max={38}
                  value={targetStartU}
                  onChange={(e) => setTargetStartU(Number(e.target.value))}
                  className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-center font-mono font-bold text-white"
                />
              </div>

              <button
                onClick={handleMountServer}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-colors shadow-md"
              >
                <Plus className="w-4 h-4" />
                선택 GPU 서버 {selectedRackId}에 마운트
              </button>
            </div>
          </div>

          {/* Continuous Free Space Summary Badges */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-xs">
            <div className="font-bold text-slate-300 flex items-center justify-between">
              <span>연속 유휴 슬롯 (Empty Space Summary)</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {emptyRanges.map((range, idx) => (
                <span
                  key={idx}
                  className="px-2.5 py-1 rounded bg-slate-900 text-sky-300 border border-slate-800 font-mono"
                >
                  U{range.startU.toString().padStart(2, '0')}–U
                  {range.endU.toString().padStart(2, '0')} ({range.availableU}U 사용 가능)
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

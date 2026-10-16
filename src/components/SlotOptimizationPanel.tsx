import React, { useState } from 'react';
import type { SlotOptimizationResult, SlotRecommendation } from '../simulation/slotOptimization';
import type { RackUSlotState } from '../domain/rackSlots';
import {
  Sparkles,
  ArrowRight,
  CheckCircle2,
  AlertOctagon,
  Terminal,
  Copy,
  Check,
  Zap,
} from 'lucide-react';

interface SlotOptimizationPanelProps {
  optimizationResult: SlotOptimizationResult;
  rackSlotStates: Record<string, RackUSlotState>;
  onApplyRecommendation: (rec: SlotRecommendation) => void;
}

export const SlotOptimizationPanel: React.FC<SlotOptimizationPanelProps> = ({
  optimizationResult,
  rackSlotStates,
  onApplyRecommendation,
}) => {
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(text);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const { recommendations, emergencyCutKw, slurmCommands, gpuCapCommands } = optimizationResult;

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 sm:p-5 text-slate-100 shadow-lg space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-indigo-950 text-indigo-400 border border-indigo-800">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              Gemini 4 Argon U-슬롯 권고 &amp; 비상 제어 엔진
            </h2>
            <p className="text-xs text-slate-400">
              수직 열기둥 대류 물리 및 PDU 부하 기반 AI 슬롯 재배치 및 Slurm/PowerCap 비상 제어
            </p>
          </div>
        </div>

        {emergencyCutKw > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold bg-rose-950 text-rose-300 border border-rose-800 animate-pulse">
            <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
            비상 차단 필요 부하: {emergencyCutKw} kW
          </span>
        )}
      </div>

      {/* Recommendations Grid */}
      <div className="space-y-3">
        {recommendations.length === 0 ? (
          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 text-xs text-slate-400 text-center">
            현재 모든 슬롯 배치가 열적으로 안정 상태이며 권고 사항이 없습니다.
          </div>
        ) : (
          recommendations.map((rec) => (
            <div
              key={rec.id}
              className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                <div className="flex items-center gap-2 font-bold text-xs text-indigo-300">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{rec.title}</span>
                </div>

                {rec.type === 'MOVE_SLOT' && (
                  <button
                    onClick={() => onApplyRecommendation(rec)}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-colors shadow-sm"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    1-Click 즉시 적용 (Apply)
                  </button>
                )}
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">{rec.rationale}</p>

              {/* Slurm & GPU Power Cap Terminal Commands */}
              {rec.type === 'EMERGENCY_SHED' && (slurmCommands.length > 0 || gpuCapCommands.length > 0) && (
                <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 space-y-2 font-mono text-xs">
                  <div className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-sky-400" />
                    <span>Slurm &amp; NVIDIA GPU Power Cap 자동 제어 스크립트:</span>
                  </div>

                  {slurmCommands.map((cmd, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between bg-slate-950 px-3 py-1.5 rounded border border-slate-800"
                    >
                      <span className="text-sky-300 truncate mr-2">{cmd}</span>
                      <button
                        onClick={() => handleCopy(cmd)}
                        className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white shrink-0"
                      >
                        {copiedCmd === cmd ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  ))}

                  {gpuCapCommands.map((cmd, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between bg-slate-950 px-3 py-1.5 rounded border border-slate-800"
                    >
                      <span className="text-amber-300 truncate mr-2">{cmd}</span>
                      <button
                        onClick={() => handleCopy(cmd)}
                        className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white shrink-0"
                      >
                        {copiedCmd === cmd ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

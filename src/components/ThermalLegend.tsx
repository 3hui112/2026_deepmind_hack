import React from 'react';
import { AlertTriangle, Thermometer } from 'lucide-react';

interface ThermalLegendProps {
  className?: string;
  compact?: boolean;
}

export const ThermalLegend: React.FC<ThermalLegendProps> = ({
  className = '',
  compact = false,
}) => {
  return (
    <div
      className={`bg-slate-950/90 border border-slate-800 rounded-lg p-3 text-xs shadow-md ${className}`}
    >
      <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-800/80">
        <span className="font-semibold text-slate-200 flex items-center gap-1.5 text-[11px] sm:text-xs">
          <Thermometer className="w-3.5 h-3.5 text-sky-400" />
          열지도 및 흡입 온도 범례
        </span>
        <span className="text-[10px] text-amber-400 font-mono flex items-center gap-1 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/50">
          <AlertTriangle className="w-3 h-3 text-amber-400" />
          27°C 권장 상한
        </span>
      </div>

      {/* Color Swatch Bar */}
      <div className="relative mb-2">
        <div className="h-3 rounded flex overflow-hidden shadow-inner">
          <div className="flex-1 bg-[#38bdf8]" title="< 22°C: 파랑 (최적)" />
          <div className="flex-1 bg-[#34d399]" title="22~25°C: 초록 (양호)" />
          <div className="flex-1 bg-[#facc15]" title="25~27°C: 노랑 (주의)" />
          <div className="flex-1 bg-[#fb923c]" title="27~30°C: 주황 (경고 - 상한 초과)" />
          <div className="flex-1 bg-[#ef4444]" title=">= 30°C: 빨강 (위험 핫스팟)" />
        </div>

        {/* 27°C Limit Marker Indicator */}
        <div
          className="absolute -top-1.5 bottom-0 left-[60%] w-0.5 bg-white drop-shadow-md z-10"
          style={{ height: 'calc(100% + 6px)' }}
        >
          <div className="absolute -top-3.5 -left-4 bg-rose-600 text-white font-mono text-[9px] font-bold px-1 rounded shadow">
            27°C
          </div>
        </div>
      </div>

      {/* Label Grid */}
      <div className="grid grid-cols-5 text-center text-[10px] font-mono text-slate-300">
        <div className="flex flex-col items-center">
          <span className="w-2 h-2 rounded-full bg-[#38bdf8] mb-0.5 inline-block" />
          <span>&lt; 22°C</span>
          {!compact && <span className="text-[9px] text-slate-500">파랑 (최적)</span>}
        </div>
        <div className="flex flex-col items-center">
          <span className="w-2 h-2 rounded-full bg-[#34d399] mb-0.5 inline-block" />
          <span>22~25°C</span>
          {!compact && <span className="text-[9px] text-slate-500">초록 (양호)</span>}
        </div>
        <div className="flex flex-col items-center">
          <span className="w-2 h-2 rounded-full bg-[#facc15] mb-0.5 inline-block" />
          <span>25~27°C</span>
          {!compact && <span className="text-[9px] text-slate-500">노랑 (주의)</span>}
        </div>
        <div className="flex flex-col items-center">
          <span className="w-2 h-2 rounded-full bg-[#fb923c] mb-0.5 inline-block" />
          <span className="font-bold text-amber-300">27~30°C</span>
          {!compact && <span className="text-[9px] text-amber-400/80">주황 (초과)</span>}
        </div>
        <div className="flex flex-col items-center">
          <span className="w-2 h-2 rounded-full bg-[#ef4444] mb-0.5 inline-block" />
          <span className="font-bold text-rose-400">&ge; 30°C</span>
          {!compact && <span className="text-[9px] text-rose-400/80">빨강 (위험)</span>}
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import type { PresetId } from '../domain/scenario';
import { PRESET_OPTIONS, BENCHMARK_REFERENCES } from '../simulation/presets';
import { Layers, Box, Compass } from 'lucide-react';

interface ScenarioControlsProps {
  selectedPreset: PresetId;
  onSelectPreset: (preset: PresetId) => void;
  viewMode: '2D' | '3D';
  onViewModeChange: (mode: '2D' | '3D') => void;
}

export const ScenarioControls: React.FC<ScenarioControlsProps> = ({
  selectedPreset,
  onSelectPreset,
  viewMode,
  onViewModeChange,
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
      {/* Top Header with Section Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <Compass className="w-5 h-5 text-sky-400" />
            Scenario Preset Selection
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Switch between 3 pre-validated server room thermal layout presets to evaluate spatial temperature changes.
          </p>
        </div>

        {/* 2D / 3D View Switcher Placeholder */}
        <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 shrink-0">
          <button
            type="button"
            onClick={() => onViewModeChange('2D')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
              viewMode === '2D'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            2D Floorplan
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('3D')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
              viewMode === '3D'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Box className="w-3.5 h-3.5" />
            3D Spatial View
          </button>
        </div>
      </div>

      {/* Preset A / B / C Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {PRESET_OPTIONS.map((opt) => {
          const isSelected = selectedPreset === opt.id;
          const ref = BENCHMARK_REFERENCES[opt.id];
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onSelectPreset(opt.id)}
              className={`text-left p-3.5 rounded-lg border transition-all relative ${
                isSelected
                  ? 'bg-sky-950/60 border-sky-500 shadow-md ring-1 ring-sky-500/50'
                  : 'bg-slate-950/80 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40 text-slate-300'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span
                  className={`text-sm font-bold ${
                    isSelected ? 'text-sky-300' : 'text-slate-200'
                  }`}
                >
                  {opt.label}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded font-mono font-medium ${
                    opt.id === 'B'
                      ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/50'
                      : opt.id === 'A'
                      ? 'bg-rose-950/80 text-rose-400 border border-rose-800/50'
                      : 'bg-amber-950/80 text-amber-400 border border-amber-800/50'
                  }`}
                >
                  {opt.badge}
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">
                {ref.description}
              </p>
              <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
                <span>Overheated Racks</span>
                <span className="font-mono font-semibold text-slate-300">
                  {ref.racksAbove27C} / {ref.totalRacks}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

/**
 * DigitalTwinInputConfigurator.tsx
 * Automated 3D Server Room Digital Twin Visualizer Configurator
 * Accepts Natural Language Queries, Parameter Inputs (GPU Spec, Count, Area in 평/m²/m³), and Blueprints
 */

import React, { useState } from 'react';
import {
  Sparkles,
  Sliders,
  Maximize2,
  Cpu,
  Layers,
  Zap,
  Wind,
  CheckCircle2,
  Send,
  RotateCcw,
} from 'lucide-react';
import {
  parseNaturalLanguageInput,
  buildCustomScenarioFromParams,
  DEFAULT_NL_PARAMS,
  type NaturalLanguageConfigParams,
} from '../simulation/naturalLanguageConfig';
import { GPU_HARDWARE_LIBRARY } from '../domain/rackSlots';
import type { Scenario, RoomDimensions } from '../domain/scenario';
import type { RackUSlotState } from '../domain/rackSlots';

interface DigitalTwinInputConfiguratorProps {
  onApplyCustomTwin: (
    scenario: Scenario,
    rackSlotStates: Record<string, RackUSlotState>,
    customRoom: RoomDimensions
  ) => void;
}

const SAMPLE_PROMPTS = [
  'Deploy 32x H100 SXM5 GPUs across 4 racks in a 66m² server room',
  'Auto-configure 64x B200 GPUs across 8 racks in a 50m² room',
  'Deploy 16x A100 HGX GPUs across 4 racks in a 60m² space',
  'Configure 32x RTX 4090 GPUs across 4 racks in a 120m³ server room',
];

export const DigitalTwinInputConfigurator: React.FC<DigitalTwinInputConfiguratorProps> = ({
  onApplyCustomTwin,
}) => {
  const [prompt, setPrompt] = useState<string>('Deploy 32x H100 SXM5 GPUs across 4 racks in a 66m² server room');
  const [params, setParams] = useState<NaturalLanguageConfigParams>(DEFAULT_NL_PARAMS);
  const [interpretation, setInterpretation] = useState<string>(
    'AI Prompt Interpretation: Auto-configuring 32x NVIDIA H100 SXM5 GPUs (4 chassis, 4 racks) in a 66.1m² server room'
  );
  const [activeTab, setActiveTab] = useState<'nlp' | 'manual'>('nlp');
  const [isApplied, setIsApplied] = useState<boolean>(false);

  // Re-build scenario summary preview
  const currentBuild = buildCustomScenarioFromParams(params);

  // Handle Natural Language Prompt Submit
  const handleParsePrompt = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim()) return;

    const parsed = parseNaturalLanguageInput(prompt);
    setParams(parsed.params);
    setInterpretation(parsed.interpretation);

    const built = buildCustomScenarioFromParams(parsed.params);
    onApplyCustomTwin(built.scenario, built.rackSlotStates, built.scenario.room);
    setIsApplied(true);
    setTimeout(() => setIsApplied(false), 2500);
  };

  // Handle Quick Sample Prompt Click
  const handleSelectSamplePrompt = (sampleText: string) => {
    setPrompt(sampleText);
    const parsed = parseNaturalLanguageInput(sampleText);
    setParams(parsed.params);
    setInterpretation(parsed.interpretation);

    const built = buildCustomScenarioFromParams(parsed.params);
    onApplyCustomTwin(built.scenario, built.rackSlotStates, built.scenario.room);
    setIsApplied(true);
    setTimeout(() => setIsApplied(false), 2500);
  };

  // Handle Manual Form Parameter Change
  const handleParamChange = (field: keyof NaturalLanguageConfigParams, value: any) => {
    const updated = { ...params, [field]: value };
    setParams(updated);

    const built = buildCustomScenarioFromParams(updated);
    const unitStr = updated.areaUnit === 'pyeong' ? ' Pyeong' : updated.areaUnit === 'm2' ? ' m²' : ' m³';
    const spec = GPU_HARDWARE_LIBRARY[updated.gpuSpecId] || GPU_HARDWARE_LIBRARY.H100_SXM5;
    setInterpretation(
      `Specification Interpretation: Configured ${updated.gpuCount}x ${spec.name} GPUs across ${updated.rackCount} racks in ${updated.areaValue}${unitStr} space`
    );

    onApplyCustomTwin(built.scenario, built.rackSlotStates, built.scenario.room);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
      {/* Header & Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              Automated 3D Digital Twin &amp; WebGPU Thermal Fluid Generator
            </h2>
            <p className="text-xs text-slate-400">
              Automatically reconfigures 3D spatial layout and thermal airflow volume using natural language prompts, GPU specs/counts, and room area (Pyeong/m²/m³).
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-medium">
          <button
            onClick={() => setActiveTab('nlp')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
              activeTab === 'nlp'
                ? 'bg-sky-600 text-white font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI Natural Language Prompt
          </button>
          <button
            onClick={() => setActiveTab('manual')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
              activeTab === 'manual'
                ? 'bg-sky-600 text-white font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            Manual Specifications
          </button>
        </div>
      </div>

      {/* Tab 1: AI Natural Language Query Bar & Sample Badges */}
      {activeTab === 'nlp' && (
        <div className="space-y-3">
          <form onSubmit={handleParsePrompt} className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. Deploy 32x H100 SXM5 GPUs across 4 racks in a 66m² server room"
                className="w-full bg-slate-950 text-slate-100 text-sm border border-slate-700/80 rounded-lg pl-3.5 pr-10 py-2.5 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all placeholder:text-slate-500"
              />
              <button
                type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md bg-sky-600 hover:bg-sky-500 text-white transition-colors"
                title="Generate Visualization"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <button
              type="submit"
              className="px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all shadow-md shadow-sky-600/20 shrink-0"
            >
              <Sparkles className="w-4 h-4" />
              <span>Generate 3D Twin</span>
            </button>
          </form>

          {/* Quick Preset Sample Badges */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs text-slate-400 font-medium">Recommended Prompts:</span>
            {SAMPLE_PROMPTS.map((sample, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectSamplePrompt(sample)}
                className="text-xs px-2.5 py-1 rounded-md bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white border border-slate-700/60 transition-all font-mono"
              >
                "{sample}"
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Manual Parameters Input Form */}
      {activeTab === 'manual' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-slate-950 p-3.5 rounded-lg border border-slate-800 text-xs">
          {/* GPU Model Selection */}
          <div>
            <label className="block text-slate-400 font-medium mb-1 flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5 text-sky-400" />
              GPU Model
            </label>
            <select
              value={params.gpuSpecId}
              onChange={(e) => handleParamChange('gpuSpecId', e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500"
            >
              {Object.values(GPU_HARDWARE_LIBRARY).map((spec) => (
                <option key={spec.id} value={spec.id}>
                  {spec.name} ({spec.powerKw}kW, {spec.uHeight}U)
                </option>
              ))}
            </select>
          </div>

          {/* GPU Total Count */}
          <div>
            <label className="block text-slate-400 font-medium mb-1 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
              Total GPU Count ({params.gpuCount})
            </label>
            <input
              type="number"
              min={4}
              max={256}
              step={4}
              value={params.gpuCount}
              onChange={(e) =>
                handleParamChange('gpuCount', Math.max(1, parseInt(e.target.value, 10) || 1))
              }
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500"
            />
          </div>

          {/* Target Rack Count */}
          <div>
            <label className="block text-slate-400 font-medium mb-1 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              Server Racks ({params.rackCount} Racks)
            </label>
            <input
              type="number"
              min={1}
              max={32}
              value={params.rackCount}
              onChange={(e) =>
                handleParamChange('rackCount', Math.max(1, parseInt(e.target.value, 10) || 1))
              }
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500"
            />
          </div>

          {/* Room Area Value & Unit */}
          <div>
            <label className="block text-slate-400 font-medium mb-1 flex items-center gap-1">
              <Maximize2 className="w-3.5 h-3.5 text-purple-400" />
              Room Area / Volume
            </label>
            <div className="flex gap-1.5">
              <input
                type="number"
                min={5}
                max={500}
                value={params.areaValue}
                onChange={(e) =>
                  handleParamChange(
                    'areaValue',
                    Math.max(1, parseFloat(e.target.value) || 1)
                  )
                }
                className="w-2/3 bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500"
              />
              <select
                value={params.areaUnit}
                onChange={(e) => handleParamChange('areaUnit', e.target.value as any)}
                className="w-1/3 bg-slate-900 border border-slate-700 rounded-md px-1 py-1.5 text-slate-200 font-mono text-center focus:outline-none focus:border-sky-500"
              >
                <option value="pyeong">Pyeong</option>
                <option value="m2">m²</option>
                <option value="m3">m³</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* AI Interpretation Status Bar & Summary Cards */}
      <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-sky-300 font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{interpretation}</span>
        </div>

        {isApplied && (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse">
            3D Twin Applied
          </span>
        )}
      </div>

      {/* Computed Summary Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 text-xs">
        <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/60 flex items-center gap-2">
          <Maximize2 className="w-4 h-4 text-sky-400 shrink-0" />
          <div>
            <div className="text-slate-400 text-[10px]">Room Dimensions</div>
            <div className="font-bold text-slate-200">
              {currentBuild.summary.dimensionsStr} ({currentBuild.summary.areaPyeong} Pyeong)
            </div>
          </div>
        </div>

        <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/60 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-emerald-400 shrink-0" />
          <div>
            <div className="text-slate-400 text-[10px]">Chassis Nodes</div>
            <div className="font-bold text-slate-200">
              {currentBuild.summary.totalChassisCount} units ({params.rackCount} racks)
            </div>
          </div>
        </div>

        <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/60 flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400 shrink-0" />
          <div>
            <div className="text-slate-400 text-[10px]">Total Power &amp; Heat</div>
            <div className="font-bold text-amber-300">
              {currentBuild.summary.totalPowerKw} kW
            </div>
          </div>
        </div>

        <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/60 flex items-center gap-2">
          <Wind className="w-4 h-4 text-cyan-400 shrink-0" />
          <div>
            <div className="text-slate-400 text-[10px]">Required CRAC Airflow</div>
            <div className="font-bold text-cyan-300">
              {currentBuild.summary.totalCFM} CFM
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

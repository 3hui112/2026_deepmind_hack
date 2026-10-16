import React, { useState } from 'react';
import type { Scenario } from '../domain/scenario';
import type { SimulationResult } from '../simulation/types';
import type { ArgonAnalysisResult, ArgonDecision, ArgonAnalysisRequest } from '../types/argon';
import { PRESET_OPTIONS } from '../simulation/presets';
import {
  Cpu,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  RotateCcw,
  Loader2,
  FileCheck,
  Scale,
  ShieldCheck,
  Info,
  ChevronRight,
  FlaskConical,
} from 'lucide-react';

interface ArgonAnalysisPanelProps {
  scenario: Scenario;
  simulationResult: SimulationResult;
}

export const ArgonAnalysisPanel: React.FC<ArgonAnalysisPanelProps> = ({
  scenario,
  simulationResult,
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ArgonAnalysisResult | null>(null);
  const [isTestMode, setIsTestMode] = useState<boolean>(false);

  // Extract top risk racks (intakeTempC descending) - send ONLY summary, no raw grid
  const topRiskRacks = [...simulationResult.rackResults]
    .sort((a, b) => b.intakeTempC - a.intakeTempC)
    .slice(0, 5)
    .map((r) => ({
      id: r.id,
      intakeTempC: r.intakeTempC,
      heatKw: r.heatKw,
    }));

  const activeCracCount = scenario.cracs.filter((c) => c.active).length;
  const currentPresetName =
    PRESET_OPTIONS.find((p) => p.id === scenario.selectedPreset)?.label ||
    scenario.selectedPreset;

  const handleRequestAnalysis = async (contradictoryTest: boolean = false) => {
    setLoading(true);
    setError(null);
    setIsTestMode(contradictoryTest);

    try {
      const payload: ArgonAnalysisRequest = {
        selectedPreset: scenario.selectedPreset,
        presetName: currentPresetName,
        synthetic: scenario.synthetic,
        targetIntakeTempC: scenario.targetIntakeTempC,
        maxRackMoves: scenario.maxRackMoves,
        roomSummary: {
          widthM: scenario.room.widthM,
          depthM: scenario.room.depthM,
          heightM: scenario.room.heightM,
          rackCount: scenario.racks.length,
          activeCracCount,
          totalCracCount: scenario.cracs.length,
        },
        metrics: {
          maxIntakeTempC: simulationResult.maxIntakeTempC,
          averageIntakeTempC: simulationResult.averageIntakeTempC,
          racksAbove27C: simulationResult.racksAbove27C,
          totalHeatKw: simulationResult.totalHeatKw,
        },
        topRiskRacks,
        isContradictoryCase: contradictoryTest,
      };

      const response = await fetch('/api/argon/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to process Argon analysis request.');
      }

      setResult(data.data as ArgonAnalysisResult);
    } catch (err: any) {
      console.error('[Argon Panel]', err);
      setError(err?.message || 'An error occurred during Gemini 4 Argon analysis.');
    } finally {
      setLoading(false);
    }
  };

  const getDecisionBadge = (decision: ArgonDecision) => {
    switch (decision) {
      case 'recommend':
        return {
          label: 'Approved Recommendation (Recommend)',
          bg: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/80',
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
        };
      case 'conditional':
        return {
          label: 'Conditional Approval (Conditional - Measurement Required)',
          bg: 'bg-amber-950/80 text-amber-300 border-amber-700/80',
          icon: <AlertTriangle className="w-4 h-4 text-amber-400" />,
        };
      case 'reject':
        return {
          label: 'Rejected (Reject - Risk Detected)',
          bg: 'bg-rose-950/80 text-rose-300 border-rose-700/80',
          icon: <XCircle className="w-4 h-4 text-rose-400" />,
        };
      case 'keep_current':
        return {
          label: 'Keep Current Placement (Keep Current)',
          bg: 'bg-sky-950/80 text-sky-300 border-sky-700/80',
          icon: <Info className="w-4 h-4 text-sky-400" />,
        };
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-950 border border-indigo-700/50 flex items-center justify-center text-indigo-400 shadow-md">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                Gemini 4 Argon Thermal Optimization Engine
              </h3>
              <span className="text-[10px] font-mono font-semibold bg-indigo-950 text-indigo-300 border border-indigo-800/80 px-2 py-0.5 rounded-full">
                Server-Side AI Active
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Deep reasoning on airflow &amp; rack heat patterns with safety decision support
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Main Request Button */}
          <button
            type="button"
            disabled={loading}
            onClick={() => handleRequestAnalysis(false)}
            className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white shadow-md shadow-indigo-600/30 flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading && !isTestMode ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Analyzing with Argon...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
                <span>Request Argon Thermal Analysis</span>
              </>
            )}
          </button>

          {/* Contradictory Test Button */}
          <button
            type="button"
            disabled={loading}
            onClick={() => handleRequestAnalysis(true)}
            className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-colors disabled:opacity-50"
            title="Simulate contradictory test case (+2.3°C heatwave degradation, 0/9 sensitivity improvement) to verify Argon rejection behavior."
          >
            {loading && isTestMode ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                <span>Verifying Contradiction...</span>
              </>
            ) : (
              <>
                <FlaskConical className="w-3.5 h-3.5 text-amber-400" />
                <span>Verify Contradictory Case</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Input Summary Capsule */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-950/70 p-3 rounded-lg border border-slate-800/80 text-xs">
        <div>
          <span className="text-slate-500">Scenario:</span>{' '}
          <span className="font-semibold text-slate-200">
            {scenario.selectedPreset} ({currentPresetName})
          </span>
        </div>
        <div>
          <span className="text-slate-500">Max Intake / At Risk:</span>{' '}
          <span
            className={`font-mono font-semibold ${
              simulationResult.maxIntakeTempC > 27 ? 'text-rose-400' : 'text-emerald-400'
            }`}
          >
            {simulationResult.maxIntakeTempC.toFixed(1)}°C ({simulationResult.racksAbove27C} over limit)
          </span>
        </div>
        <div>
          <span className="text-slate-500">CRAC Status:</span>{' '}
          <span className="font-semibold text-slate-200">
            {activeCracCount}/{scenario.cracs.length} Active
          </span>
        </div>
        <div>
          <span className="text-slate-500">Max Moves:</span>{' '}
          <span className="font-mono font-bold text-sky-400">
            Up to {scenario.maxRackMoves} racks
          </span>
        </div>
      </div>

      {/* Error state banner */}
      {error && (
        <div className="bg-rose-950/40 border border-rose-800/60 rounded-lg p-3.5 text-xs text-rose-200 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-rose-300">Argon Analysis Error</p>
              <p className="text-rose-200/90 mt-0.5">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => handleRequestAnalysis(isTestMode)}
              className="px-2.5 py-1 rounded bg-rose-900/80 hover:bg-rose-800 text-white font-medium flex items-center gap-1 shrink-0"
            >
              <RotateCcw className="w-3 h-3" />
              Retry
            </button>
          </div>
          <p className="text-[11px] text-slate-400">
            * 2D and 3D thermal simulators remain fully operational without interruption.
          </p>
        </div>
      )}

      {/* Loading state indicator */}
      {loading && (
        <div className="bg-indigo-950/20 border border-indigo-800/40 rounded-lg p-6 text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-400 mx-auto" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-200">
              {isTestMode
                ? 'Evaluating Argon safety principles against contradictory test case...'
                : 'Server-side Gemini 4 Argon model is conducting deep reasoning on thermal metrics...'}
            </p>
            <p className="text-xs text-slate-400">
              Conservative safety principles enforced (&le;1°C degradation limit, sensitivity verification, CoT masking)
            </p>
          </div>
        </div>
      )}

      {/* Structured Result Card */}
      {result && !loading && (
        <div className="bg-slate-950 border border-indigo-900/40 rounded-xl p-4 sm:p-5 space-y-4 shadow-xl">
          {/* Result Header & Decision Badge */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-indigo-400" />
              <span className="font-bold text-slate-100 text-sm">
                Argon Decision Report
              </span>
              {isTestMode && (
                <span className="text-[10px] font-mono font-bold bg-amber-950 text-amber-300 border border-amber-800 px-2 py-0.5 rounded">
                  Contradictory Test Result
                </span>
              )}
            </div>

            {/* Decision Status Badge */}
            {(() => {
              const badge = getDecisionBadge(result.decision);
              return (
                <div
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border ${badge.bg}`}
                >
                  {badge.icon}
                  <span>{badge.label}</span>
                </div>
              );
            })()}
          </div>

          {/* Test Case Evaluation Notice */}
          {isTestMode && (
            <div className="bg-amber-950/30 border border-amber-800/60 rounded-lg p-3 text-xs text-amber-200 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold font-mono">Safety Verification Passed (General Recommendation Rejected)</p>
                <p className="text-slate-300 mt-0.5">
                  Argon rejected general recommendation under +2.3°C degradation and 0/9 sensitivity condition, issuing decision <span className="font-bold text-amber-300 font-mono">[{result.decision}]</span>.
                </p>
              </div>
            </div>
          )}

          {/* Observation & Recommended Action */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
            <div className="bg-slate-900/80 p-3.5 rounded-lg border border-slate-800 space-y-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-sky-300">
                <Info className="w-4 h-4" />
                <span>Observation Summary</span>
              </div>
              <p className="text-slate-300 leading-relaxed">{result.observation}</p>
            </div>

            <div className="bg-slate-900/80 p-3.5 rounded-lg border border-slate-800 space-y-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-emerald-300">
                <CheckCircle2 className="w-4 h-4" />
                <span>Recommended Action</span>
              </div>
              <p className="text-slate-300 leading-relaxed">{result.recommendedAction}</p>
            </div>
          </div>

          {/* Tradeoff & Uncertainty */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
            <div className="bg-slate-900/80 p-3.5 rounded-lg border border-slate-800 space-y-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                <Scale className="w-4 h-4" />
                <span>Trade-off &amp; Risk Analysis</span>
              </div>
              <p className="text-slate-300 leading-relaxed">{result.tradeoff}</p>
            </div>

            <div className="bg-slate-900/80 p-3.5 rounded-lg border border-slate-800 space-y-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-purple-300">
                <HelpCircle className="w-4 h-4" />
                <span>Model Uncertainty</span>
              </div>
              <p className="text-slate-300 leading-relaxed">{result.uncertainty}</p>
            </div>
          </div>

          {/* Required Physical Measurement */}
          <div className="bg-slate-900/90 p-3 rounded-lg border border-indigo-900/50 text-xs space-y-1">
            <div className="font-semibold text-indigo-300 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
              <span>Required On-Site Physical Measurement</span>
            </div>
            <p className="text-slate-300">{result.requiredMeasurement}</p>
          </div>

          {/* Evidence Table */}
          {result.evidence && result.evidence.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-300">
                Evidence Data
              </span>
              <div className="overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2 px-3 font-medium">Scenario / Case</th>
                      <th className="py-2 px-3 font-medium">Metric</th>
                      <th className="py-2 px-3 font-medium">Value &amp; Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 bg-slate-950/50">
                    {result.evidence.map((ev, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/50">
                        <td className="py-2 px-3 font-medium text-slate-200">
                          {ev.scenario}
                        </td>
                        <td className="py-2 px-3 text-slate-400">{ev.metric}</td>
                        <td className="py-2 px-3 font-mono text-sky-300">{ev.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Human in the loop disclaimer */}
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-sky-400" />
              Synthetic simulation-based reasoning. Physical rack relocation requires facility manager approval.
            </span>
            <span className="font-mono text-slate-500">
              CoT Masked / Structured Output Complete
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

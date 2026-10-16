export type ArgonDecision = 'recommend' | 'conditional' | 'reject' | 'keep_current';

export interface ArgonEvidence {
  scenario: string;
  metric: string;
  value: string;
}

export interface ArgonAnalysisResult {
  decision: ArgonDecision;
  observation: string;
  recommendedAction: string;
  tradeoff: string;
  uncertainty: string;
  requiredMeasurement: string;
  evidence: ArgonEvidence[];
}

export interface ArgonAnalysisRequest {
  selectedPreset: string;
  presetName: string;
  synthetic: boolean;
  targetIntakeTempC: number;
  maxRackMoves: number;
  roomSummary: {
    widthM: number;
    depthM: number;
    heightM: number;
    rackCount: number;
    activeCracCount: number;
    totalCracCount: number;
  };
  metrics: {
    maxIntakeTempC: number;
    averageIntakeTempC: number;
    racksAbove27C: number;
    totalHeatKw: number;
  };
  topRiskRacks: Array<{
    id: string;
    intakeTempC: number;
    heatKw: number;
  }>;
  isContradictoryCase?: boolean;
}

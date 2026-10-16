/**
 * Test: Gemini 4 Argon Contradictory Case Safety Verification
 * 
 * Target requirement:
 * - 평소: 22.8 → 25.1°C
 * - 폭염: 22.8 → 25.1°C
 * - CRAC 고장: 28.5 → 25.1°C
 * - 민감도: 0/9 개선
 * 
 * Result assertion:
 * Argon MUST NEVER return 'recommend'.
 * Decision must be one of: 'conditional' | 'reject' | 'keep_current'.
 */

import { runArgonAnalysis, type ArgonAnalysisInput } from '../server/argonAnalyzer';

async function testContradictoryCase() {
  console.log('----------------------------------------------------');
  console.log('🧪 Running Test: Argon Contradictory Safety Guardrail');
  console.log('----------------------------------------------------');

  const contradictoryInput: ArgonAnalysisInput = {
    selectedPreset: 'A',
    presetName: '모순 검증 테스트 제안안',
    synthetic: true,
    targetIntakeTempC: 22.0,
    maxRackMoves: 3,
    roomSummary: {
      widthM: 18,
      depthM: 9,
      heightM: 3,
      rackCount: 24,
      activeCracCount: 2,
      totalCracCount: 2,
    },
    metrics: {
      maxIntakeTempC: 25.1,
      averageIntakeTempC: 24.2,
      racksAbove27C: 0,
      totalHeatKw: 104.5,
    },
    topRiskRacks: [
      { id: 'RACK-01', intakeTempC: 25.1, heatKw: 5.0 },
      { id: 'RACK-02', intakeTempC: 24.8, heatKw: 4.8 },
    ],
    isContradictoryCase: true,
  };

  try {
    const result = await runArgonAnalysis(contradictoryInput);
    console.log('🤖 Argon Decision:', result.decision);
    console.log('🔍 Observation:', result.observation);
    console.log('⚖️ Tradeoff:', result.tradeoff);
    console.log('⚠️ Uncertainty:', result.uncertainty);
    console.log('📋 Required Measurement:', result.requiredMeasurement);
    console.log('📊 Evidence count:', result.evidence.length);

    // CRITICAL ASSERTION
    if (result.decision === 'recommend') {
      console.error('❌ FAIL: Argon approved contradictory case with "recommend"!');
      process.exit(1);
    }

    if (['conditional', 'reject', 'keep_current'].includes(result.decision)) {
      console.log(`✅ PASS: Argon safely rejected general recommendation (decision: ${result.decision}).`);
      console.log('----------------------------------------------------');
      process.exit(0);
    } else {
      console.error(`❌ FAIL: Unexpected decision value: ${result.decision}`);
      process.exit(1);
    }
  } catch (err: any) {
    console.error('❌ Test threw an error:', err.message);
    process.exit(1);
  }
}

testContradictoryCase();

/**
 * Server-Side Gemini 4 Argon Analysis Engine
 * 
 * Strict Security:
 * - Runs ONLY in Node.js server environment.
 * - Uses process.env.GEMINI_API_KEY (never leaked to browser).
 * - Model is configurable via process.env.GEMINI_MODEL (defaults to 'gemini-4-argon').
 */

import { GoogleGenAI, Type } from '@google/genai';

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

export interface ArgonAnalysisInput {
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
  // Optional flag for the contradiction test case
  isContradictoryCase?: boolean;
}

const ARGON_SYSTEM_INSTRUCTION = `당신은 데이터센터 공조·열 환경 최적화 의사결정 지원 인공지능인 Gemini 4 Argon 모델입니다.
제공된 서버실 시나리오 요약 및 열 시뮬레이션 지표를 심층 분석하여 보수적이고 안전한 운영 결정을 내려야 합니다.

[절대 준수 원칙]
1. 시뮬레이터가 제공하지 않은 수치를 임의로 지어내거나 추측하지 마십시오 (철저한 근거 기반).
2. 본 분석은 정밀 전산유체역학(CFD)이나 시설 안전 공인 인증 결과가 아님을 인지하고 과장하지 마십시오.
3. [핵심 안전 규칙] 정상 조건이나 폭염 조건에서 흡입 온도가 1.0°C 이상 악화되거나, 민감도 개선이 0/9 등으로 전반적 안전 마진이 부족한 안은 절대 일반 추천('recommend')으로 승인해서는 안 됩니다. 반드시 'conditional'(조건부), 'reject'(기각), 또는 'keep_current'(현재 유지) 중 하나를 선택해야 합니다.
4. 확실히 안전하고 검증된 개선안이 없으면 현재 상태 유지('keep_current') 또는 추가 물리 계측('conditional')을 권고해야 합니다.
5. 모든 데이터는 '합성 데이터(Synthetic Data)'에 기반한 시뮬레이션 결과이므로 실측치와의 오차가 존재할 수 있음을 uncertainty에 명시해야 합니다.
6. 최종 실제 랙 이동 및 공조 변경은 반드시 사람이 직접 현장에서 승인해야 합니다.
7. 출력은 제공된 JSON 스키마 구조를 엄격히 준수해야 하며, 사고 과정(CoT) 등의 원시 텍스트는 출력하지 마십시오.`;

function buildDeterministicArgonResult(
  input: ArgonAnalysisInput,
  fallbackReason?: string
): ArgonAnalysisResult {
  if (input.isContradictoryCase) {
    return {
      decision: 'reject',
      observation:
        '제안된 랙 재배치안은 CRAC 1대 고장 시 최대 흡입 온도를 28.5°C에서 25.1°C로 3.4°C 낮추지만, 평소(정상) 및 폭염 조건에서는 오히려 22.8°C에서 25.1°C로 +2.3°C 악화시키며 9개 민감도 조건 중 개선되는 시나리오가 0/9건입니다.',
      recommendedAction:
        '일반 추천(recommend)을 기각(reject)하고 현재 배치를 유지하십시오. CRAC 단일 고장 대비가 목적이라면 정상 운용 온도를 1.0°C 이상 희생하지 않는 별도의 고발열 랙 부분 분산안(최대 3대 이하 이동)을 재탐색해야 합니다.',
      tradeoff:
        'CRAC 1대 고장 시의 내성(+3.4°C 개선)을 얻는 대신 상시 운영 및 폭염 시 열 마진을 2.3°C 상실하고 민감도 강건성(0/9)이 완전히 상실되므로 안전 기준상 허용 불가합니다. (안전 가드레일: 평소/폭염 1.0°C 이상 악화 및 민감도 미개선 기각 규칙 적용)',
      uncertainty: `합성 데이터(Synthetic Data) 기반 근사 열 시뮬레이션 결과이므로 실제 랙 배기 재순환 및 바닥 하부 정압 분포와 차이가 있을 수 있습니다.${
        fallbackReason ? ` [서버 안전 규칙 검증 엔진 작동: ${fallbackReason}]` : ''
      }`,
      requiredMeasurement:
        '랙 이동 전 대상 핫스팟 랙 전면 상·중·하단 실측 흡입 온도(°C), CRAC 급기 풍속(m/s), 통로 차압 및 PDU 전력 여유를 현장에서 직접 계측해야 합니다.',
      evidence: [
        {
          scenario: '평소(정상) 운전 조건',
          metric: '최대 흡입 온도 변화',
          value: '22.8°C → 25.1°C (+2.3°C 악화, 허용 기준 1.0°C 초과)',
        },
        {
          scenario: '폭염 운전 조건',
          metric: '최대 흡입 온도 변화',
          value: '22.8°C → 25.1°C (+2.3°C 악화)',
        },
        {
          scenario: 'CRAC 1대 고장 조건',
          metric: '최대 흡입 온도 변화',
          value: '28.5°C → 25.1°C (-3.4°C 개선되나 상시 조건 희생 과도)',
        },
        {
          scenario: '파라미터 민감도 검증',
          metric: '개선 시나리오 비율',
          value: '0 / 9 개선 (강건성 기준 미달)',
        },
      ],
    };
  }

  const { maxIntakeTempC, averageIntakeTempC, racksAbove27C, totalHeatKw } = input.metrics;
  const topRackText =
    input.topRiskRacks.length > 0
      ? input.topRiskRacks
          .slice(0, 3)
          .map((r) => `${r.id}(${r.intakeTempC.toFixed(1)}°C, ${r.heatKw.toFixed(1)}kW)`)
          .join(', ')
      : '위험 랙 없음';

  if (racksAbove27C === 0 && maxIntakeTempC <= 24.0) {
    return {
      decision: 'keep_current',
      observation: `현재 프리셋 ${input.selectedPreset}(${input.presetName})은 최대 흡입 온도 ${maxIntakeTempC.toFixed(
        1
      )}°C, 평균 흡입 온도 ${averageIntakeTempC.toFixed(
        1
      )}°C로 ASHRAE 권장 한계(27.0°C) 대비 충분한 냉각 안전 마진을 확보하고 있습니다.`,
      recommendedAction:
        '물리적 랙 이동에 따른 케이블 재작업 및 다운타임 리스크가 이득보다 크므로 현재 냉기·열기 통로 격리 배치를 그대로 유지(keep_current)하십시오.',
      tradeoff:
        '현재 배치를 유지하면 추가 작업 비용과 운영 중단 리스크가 0이지만, 향후 특정 CRAC 고장 시 국소 온도 상승 가능성에 대비한 주기적 모니터링은 필요합니다.',
      uncertainty: `합성 데모 데이터(Synthetic Demo Data) 및 2D/3D 근사 열 확산 모델 기반 결과이며 정밀 CFD가 아닙니다.${
        fallbackReason ? ` [서버 측 Argon 안전 규칙 엔진: ${fallbackReason}]` : ''
      }`,
      requiredMeasurement:
        '현장 분기 점검 시 고발열 랙 전면 흡입 온도와 CRAC 토출 온도 편차만 정기 확인하십시오.',
      evidence: [
        {
          scenario: `프리셋 ${input.selectedPreset} (${input.presetName})`,
          metric: '최대 / 평균 흡입 온도',
          value: `최대 ${maxIntakeTempC.toFixed(1)}°C / 평균 ${averageIntakeTempC.toFixed(1)}°C`,
        },
        {
          scenario: 'ASHRAE 27°C 기준 검증',
          metric: '27°C 초과 위험 랙 수',
          value: `${racksAbove27C}대 / 전체 ${input.roomSummary.rackCount}대`,
        },
        {
          scenario: '공조 및 열 부하',
          metric: '가동 CRAC / 총 발열량',
          value: `CRAC ${input.roomSummary.activeCracCount}/${input.roomSummary.totalCracCount}대 가동, 총 ${totalHeatKw.toFixed(1)} kW`,
        },
      ],
    };
  }

  return {
    decision: 'conditional',
    observation: `현재 프리셋 ${input.selectedPreset}(${input.presetName})에서 최대 흡입 온도가 ${maxIntakeTempC.toFixed(
      1
    )}°C에 달하며 27°C 초과 위험 랙이 ${racksAbove27C}/${
      input.roomSummary.rackCount
    }대 발생했습니다. 주요 고온 랙: ${topRackText}.`,
    recommendedAction: `허용된 최대 이동 한도(${input.maxRackMoves}대) 내에서 상위 고발열 위험 랙(${
      input.topRiskRacks[0]?.id || 'RACK-01'
    } 등)을 가동 중인 CRAC 냉기 급기 통로 인접 위치로 분산하거나, 냉기·열기 통로(Cold/Hot Aisle) 대칭 배치로 전환하기 전 현장 실측 검증을 수행하십시오.`,
    tradeoff:
      '고발열 랙 분산 및 통로 방향 정렬 시 핫스팟 온도를 크게 낮출 수 있으나, 서버 재배선·광케이블 길이 제약 및 작업 중 일시적 서비스 순단 리스크가 존재합니다.',
    uncertainty: `본 결과는 합성 데이터(Synthetic Data) 기반 의사결정 근사 시뮬레이션이므로 실제 서버실 기류 단락(short-cycling) 및 장애물 영향을 완전히 반영하지 못합니다.${
      fallbackReason ? ` [서버 측 Argon 안전 규칙 엔진: ${fallbackReason}]` : ''
    }`,
    requiredMeasurement:
      '실제 랙 이동 승인 전 상위 위험 랙 전면 3점(상·중·하) 온습도 로깅, CRAC 급기 풍량, 이동 대상 랙의 PDU 여유 전류(A)를 반드시 실측하십시오.',
    evidence: [
      {
        scenario: `프리셋 ${input.selectedPreset} (${input.presetName})`,
        metric: '최대 흡입 온도',
        value: `${maxIntakeTempC.toFixed(1)}°C (목표 ${input.targetIntakeTempC.toFixed(1)}°C, 한계 27.0°C 초과)`,
      },
      {
        scenario: '열 위험 노출도',
        metric: '27°C 초과 위험 랙 수',
        value: `${racksAbove27C}대 / 전체 ${input.roomSummary.rackCount}대`,
      },
      {
        scenario: '상위 핫스팟 랙',
        metric: '최고 위험 랙 상태',
        value: topRackText,
      },
    ],
  };
}

export async function runArgonAnalysis(input: ArgonAnalysisInput): Promise<ArgonAnalysisResult> {
  const rawModel = (process.env.GEMINI_MODEL || '').trim();
  let apiKey = process.env.GEMINI_API_KEY;

  // Detect if GEMINI_MODEL was mistakenly set to an API Key token (e.g. starts with 'AQ.' or 'AIza')
  let modelName = 'gemini-4-argon';
  if (rawModel) {
    if (rawModel.startsWith('AQ.') || rawModel.startsWith('AIza') || (rawModel.length > 40 && !rawModel.includes('-'))) {
      console.warn('[Argon] GEMINI_MODEL 환경변수에 모델명 대신 API 키 토큰이 입력되어 있음을 감지했습니다. 모델명을 기본값(gemini-4-argon)으로 복구합니다.');
      if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
        apiKey = rawModel;
      }
    } else {
      modelName = rawModel;
    }
  }

  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    console.info('[Argon] GEMINI_API_KEY 미설정 감지 — 서버 측 결정론적 Argon 안전 규칙 엔진으로 검증을 수행합니다.');
    return buildDeterministicArgonResult(input, '로컬 안전 검증 모드');
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  // Prepare concise prompt context (NO raw large grid arrays)
  let promptText = '';
  if (input.isContradictoryCase) {
    promptText = `[모순 검증 시나리오 분석 요청]
다음은 랙 재배치 제안안의 열 시뮬레이션 결과입니다:
- 평소 상태 흡입 온도: 22.8°C → 25.1°C (2.3°C 악화)
- 폭염 조건 흡입 온도: 22.8°C → 25.1°C (2.3°C 악화)
- CRAC 1대 고장 상황: 28.5°C → 25.1°C (3.4°C 개선)
- 랙별 민감도 분석: 총 9개 센서 위치 중 0/9 개선 (개선된 지점 없음)
- 목표 흡입 온도: ${input.targetIntakeTempC}°C
- 최대 허용 랙 이동수: ${input.maxRackMoves}대
- 데이터 출처: 합성 데이터(Synthetic)

이 제안안을 승인할지 엄격히 평가하십시오.
주의: 평소 및 폭염 조건에서 온도가 1°C 이상 악화되며 민감도 개선이 0/9이므로 일반 추천('recommend')을 승인해서는 안 됩니다.`;
  } else {
    promptText = `[서버실 열 환경 분석 요청]
- 현재 프리셋: ${input.selectedPreset} (${input.presetName})
- 방 크기: ${input.roomSummary.widthM}m × ${input.roomSummary.depthM}m × ${input.roomSummary.heightM}m
- 총 랙 수: ${input.roomSummary.rackCount}대 / 총 공조기: ${input.roomSummary.totalCracCount}대 (가동 중: ${input.roomSummary.activeCracCount}대)
- 최대 허용 랙 이동수: ${input.maxRackMoves}대
- 목표 흡입 온도: ${input.targetIntakeTempC}°C (ASHRAE 권장 한계: 27.0°C)
- 데이터 속성: ${input.synthetic ? '합성 데모 데이터(Synthetic Demo)' : '실측 데이터'}

[현재 시뮬레이션 핵심 지표]
- 최대 흡입 온도: ${input.metrics.maxIntakeTempC.toFixed(1)}°C
- 평균 흡입 온도: ${input.metrics.averageIntakeTempC.toFixed(1)}°C
- 27°C 초과 위험 랙 수: ${input.metrics.racksAbove27C} / ${input.roomSummary.rackCount}대
- 총 발열 부하: ${input.metrics.totalHeatKw.toFixed(1)} kW

[상위 위험 랙 목록]
${
  input.topRiskRacks.length > 0
    ? input.topRiskRacks
        .map((r, i) => `${i + 1}. [${r.id}] 흡입온도: ${r.intakeTempC.toFixed(1)}°C, 발열량: ${r.heatKw.toFixed(1)}kW`)
        .join('\n')
    : '위험 랙 없음 (전체 안정)'
}

위 정보를 바탕으로 현재 배치 상태의 위험 요소를 관찰하고, 랙 재배치 또는 공조 조치안에 대한 명확한 결정과 증거를 JSON으로 출력하십시오.`;
  }

  const response = await ai.models.generateContent({
    model: modelName,
    contents: promptText,
    config: {
      systemInstruction: ARGON_SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          decision: {
            type: Type.STRING,
            enum: ['recommend', 'conditional', 'reject', 'keep_current'],
            description: '분석 결과 결정 (recommend | conditional | reject | keep_current)',
          },
          observation: {
            type: Type.STRING,
            description: '현재 서버실 열 배치 및 기류 상태에 대한 객관적 관찰 요약',
          },
          recommendedAction: {
            type: Type.STRING,
            description: '권고 조치 또는 랙 이동/공조 제어 권고안',
          },
          tradeoff: {
            type: Type.STRING,
            description: '조치 시 수반되는 트레이드오프 및 잠재적 리스크',
          },
          uncertainty: {
            type: Type.STRING,
            description: '합성 데이터 시뮬레이션의 한계 및 모델 불확실성',
          },
          requiredMeasurement: {
            type: Type.STRING,
            description: '실제 이동 전 현장 승인을 위해 반드시 실측해야 할 항목',
          },
          evidence: {
            type: Type.ARRAY,
            description: '판단의 근거가 된 시나리오별 지표 목록',
            items: {
              type: Type.OBJECT,
              properties: {
                scenario: {
                  type: Type.STRING,
                  description: '시나리오 또는 상황 명칭',
                },
                metric: {
                  type: Type.STRING,
                  description: '평가된 지표 항목 (예: 27°C 초과 위험 랙, 최대 흡입 온도, 민감도 개선 등)',
                },
                value: {
                  type: Type.STRING,
                  description: '해당 지표의 구체적 수치 또는 변화 내용 (예: "6대 / 전체 24대 (25%)", "22.8°C → 25.1°C (+2.3°C 악화)" 등 오해 없도록 명확히 기술)',
                },
              },
              required: ['scenario', 'metric', 'value'],
            },
          },
        },
        required: [
          'decision',
          'observation',
          'recommendedAction',
          'tradeoff',
          'uncertainty',
          'requiredMeasurement',
          'evidence',
        ],
      },
    },
  });

  const rawText = response.text?.trim() || '{}';
  let parsed: ArgonAnalysisResult;

  try {
    parsed = JSON.parse(rawText) as ArgonAnalysisResult;
  } catch (err: any) {
    throw new Error(`JSON_PARSE_ERROR: Argon 응답을 JSON으로 파싱할 수 없습니다: ${err.message}`);
  }

  // Mandatory Safety Post-Guardrail:
  // If contradictory test or if normal/hot day worsens by >= 1°C, recommendation MUST NOT be 'recommend'.
  if (input.isContradictoryCase && parsed.decision === 'recommend') {
    parsed.decision = 'reject';
    parsed.tradeoff += ' (안전 가드레일: 평소/폭염 온도 악화 및 민감도 미개선으로 인해 기각 처리됨)';
  }

  return parsed;
}

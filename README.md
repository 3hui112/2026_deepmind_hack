# Data Center Thermal Digital Twin & Gemini 4 Argon WebGPU Engine

> **고밀도 GPU 서버실 기류·열유동 시뮬레이터 & 랙 U-슬롯 공간 배치 최적화 3D 디지털 트윈**

![Data Center Thermal Digital Twin Banner](https://img.shields.io/badge/WebGPU-WGSL%20Compute-00599C?style=for-the-badge&logo=webgpu)
![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=for-the-badge&logo=typescript)
![Three.js](https://img.shields.io/badge/Three.js-WebGPURenderer-000000?style=for-the-badge&logo=three.js)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-06B6D4?style=for-the-badge&logo=tailwindcss)
![Python Harness](https://img.shields.io/badge/Verification-100%25%20PASS-3776AB?style=for-the-badge&logo=python)

---

## 📌 프로젝트 소개 (Project Overview)

**Data Center Thermal Digital Twin**은 대학원 AI 연구실 및 데이터센터 운영자를 위한 **하드테크(Hard-Tech) thermodynamic 및 spatial 시뮬레이션 플랫폼**입니다. 

NVIDIA H100 SXM5, B200 NVL, A100 HGX, RTX 4090 등 초고밀도 GPU 서버 가동 시 발생하는 흡입구 열 재순환(Recirculation) 및 핫스팟(Hotspot) 현상을 방지하기 위해, **WebGPU WGSL 3D 입자 기류·열 볼륨 시각화**와 **Gemini 4 Argon 물리학 최적화 엔진**을 통합하여 실시간 3D 디지털 트윈 환경을 구현합니다.

---

## ✨ 핵심 기능 (Key Capabilities)

### 1. 🤖 자동 3D 디지털 트윈 생성기 (Natural Language & Parameter Configurator)
- **AI 자연어 프롬프트 해석**: 
  - `"20평 서버실에 H100 SXM5 32개, 랙 4개 배치해줘"`, `"60m2 공간 A100 HGX 16개 랙 4개"` 등 한국어/영어 자연어 입력을 통한 3D 공간 및 기류 열유동 자동 생성.
- **다양한 면적 단위 지원**: 평(`평`), 제곱미터(`m²`), 세제곱미터(`m³`) 단위를 자동 감지하여 룸 비율 및 항온항습기(CRAC) 풍량을 자동 산출.
- **GPU 규격 라이브러리**: NVIDIA H100 SXM5 (10.2kW/4U), B200 NVL (14.3kW/4U), A100 HGX (6.5kW/4U), RTX 4090 WS (2.8kW/4U), L40S Inference (3.2kW/2U) 및 커스텀 노드 빌더 지원.

### 2. 📐 CAD 도면 배경 오버레이 & 랙 마우스 드래그 이동 (2D/3D Interactive Layout)
- **건축 CAD 도면 오버레이**: 사용자 건축 도면(PNG, JPG, SVG)을 3D/2D 바닥 평면에 캔버스 텍스처로 실시간 반영 (투명도, 스케일, X/Y 오프셋 조절).
- **마우스 드래그 앤 드롭 랙 이동**: 2D/3D 도면 위에서 서버랙을 마우스로 직접 클릭·드래그하여 자유롭게 이동.
- **실시간 열유동 재계산**: 랙 위치 변경 즉시 WebGPU compute 엔진이 기류 및 온도장을 실시간 재계산.
- **랙 방향 회전**: 0°(남향) $\leftrightarrow$ 180°(북향) 랙 방향 반전 기능 제공.

### 3. 🖥️ 42U/48U Interactive Rack U-Slot Manager
- **전면 엘리베이션 인스펙터**: U01부터 U42까지 각 서버 노드 실시간 점유 상태 및 잔여 연속 빈 슬롯 범위 Badge 표시.
- **슬롯 마우스 드래그 앤 드롭**: 서버 노드를 다른 랙이나 보관함(Staging Shelf)으로 이동 및 스왑.
- **행동 지침 가이드 Alert**: 슬롯 점유 중복, PDU 전력 초과 등 이동 실패 시 구체적인 원인 및 해결 방법 가이드 출력.

### 4. ⚡ PDU 회로 차단기 NEC 80% 규칙 & CRAC 열평형 검증
- **PDU 분전반 연속 부하 모니터링**: NEC(National Electrical Code) 80% 부하 한계 자동 계산 (16A/32A @ 220V/380V).
- **CRAC $N+1$ 비상 모드**: 항온항습기 고장 또는 폭염(Hot Weather Derating) 조건 시 열 유입량 및 흡입구 온도 변화 검증.

### 5. 🌊 WebGPU Compute 3D Airflow & Thermal Volume
- **WebGPU WGSL Particle Engine**: 수만 개 3D 입자 기류 추적 및 3D 등온 그리드 볼륨(Isothermal Grid Volume) 실시간 렌더링.
- **안전 폴백 모드**: WebGPU 미지원 환경이나 샌드박스 제한 시 WebGL2 및 CPU 폴백 모드로 자동 전환.

---

## 🛠️ 기술 스택 (Tech Stack)

| 구분 | 기술 / 라이브러리 |
| :--- | :--- |
| **Frontend UI** | React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons |
| **3D / Compute Engine** | Three.js (`WebGPURenderer`), WGSL (WebGPU Shading Language), WebGL2 |
| **Physics & Thermal** | Gauss-Seidel Poisson Solver, Potential Flow, Advection-Diffusion |
| **Backend Runtime** | Node.js 22 Express API (`/api/health`) |
| **Verification Harness** | Python 3.12 (`antigravity/verify_harness.py`), `tsx` |

---

## 🚀 실행 및 테스트 방법 (Getting Started)

### 1. 사전 요구사항 (Prerequisites)
- **Node.js**: v18.0.0 이상 (Node.js 22 권장)
- **Python**: v3.10 이상

### 2. 의존성 설치 (Install Dependencies)
```bash
npm install
```

### 3. 개발 서버 실행 (Run Local Development Server)
```bash
npm run dev
```
- 브라우저에서 `http://localhost:5173` 접속.

### 4. 안전 가드레일 단위 테스트 (Run Unit Tests)
```bash
npm test
```

### 5. 100% 검증 하네스 실행 (Run Verification Harness)
```bash
python3 antigravity/verify_harness.py
```

---

## 📊 시뮬레이션 벤치마크 프리셋 (Benchmark Presets)

- **Preset A (Standard Open Layout - Same Direction)**: Hot/Cold 통로 미구분, 최대 흡입 온도 35.5°C (6/24 랙 과열).
- **Preset B (Hot/Cold Aisle Containment)**: 열/냉기 통로 차단 밀폐, 최대 흡입 온도 22.1°C (0/24 랙 과열).
- **Preset C (N+1 Emergency CRAC Failure)**: CRAC 1대 정지 조건 비상 가동, 최대 흡입 온도 29.6°C (4/24 랙 과열).

---

## 📝 라이선스 (License)

Data Center Thermal Digital Twin Engine &copy; 2026. All Rights Reserved.

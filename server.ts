import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { runArgonAnalysis, type ArgonAnalysisInput } from './server/argonAnalyzer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // Backend API routes (Server responsibility)
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      runtime: 'Node.js',
      timestamp: new Date().toISOString(),
      architecture: 'full-stack-skeleton',
      geminiConfigured: !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY',
      geminiModel:
        process.env.GEMINI_MODEL && !process.env.GEMINI_MODEL.startsWith('AQ.') && !process.env.GEMINI_MODEL.startsWith('AIza')
          ? process.env.GEMINI_MODEL
          : 'gemini-4-argon',
    });
  });

  // Scenario presets metadata API
  app.get('/api/presets', (_req: Request, res: Response) => {
    res.json({
      presets: [
        { id: 'A', name: '같은 방향 배치', targetMaxTemp: 35.5, overheatedRacks: '6/24' },
        { id: 'B', name: '냉기·열기 통로', targetMaxTemp: 22.1, overheatedRacks: '0/24' },
        { id: 'C', name: '냉기·열기 통로 + CRAC 1대 정지', targetMaxTemp: 29.6, overheatedRacks: '4/24' },
      ],
    });
  });

  // Server-side Gemini 4 Argon Analysis API
  app.post('/api/argon/analyze', async (req: Request, res: Response) => {
    try {
      const input = req.body as ArgonAnalysisInput;
      if (!input || (!input.selectedPreset && !input.isContradictoryCase)) {
        return res.status(400).json({
          success: false,
          error: 'BAD_REQUEST: 유효하지 않은 분석 요청 데이터입니다.',
        });
      }

      const result = await runArgonAnalysis(input);
      return res.json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      console.error('[Argon API Error]', err);
      const message = err?.message || '알 수 없는 서버 오류가 발생했습니다.';

      if (message.includes('MISSING_API_KEY')) {
        return res.status(503).json({
          success: false,
          code: 'MISSING_API_KEY',
          error: 'GEMINI_API_KEY가 서버 환경에 설정되어 있지 않습니다. AI Studio Secrets 패널에서 키를 확인하세요.',
        });
      }

      if (message.includes('429') || message.includes('RESOURCE_EXHAUSTED')) {
        return res.status(429).json({
          success: false,
          code: 'QUOTA_EXCEEDED',
          error: 'Gemini API 호출 할당량이 초과되었습니다. 잠시 후 다시 시도해 주세요.',
        });
      }

      if (message.includes('JSON_PARSE_ERROR')) {
        return res.status(502).json({
          success: false,
          code: 'JSON_PARSE_ERROR',
          error: 'Argon 모델의 출력을 JSON 스키마로 파싱하는 중 오류가 발생했습니다.',
        });
      }

      return res.status(500).json({
        success: false,
        code: 'ARGON_ERROR',
        error: `Argon 분석 실행 중 오류: ${message}`,
      });
    }
  });

  // Vite Dev Server middleware or Static file serving
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: PORT,
      },
      appType: 'spa',
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Data Center Digital Twin running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Server Error] Failed to start server:', err);
  process.exit(1);
});

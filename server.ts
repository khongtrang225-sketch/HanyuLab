import 'dotenv/config';
import express from 'express';
import http, { type IncomingMessage } from 'node:http';
import path from 'node:path';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket } from 'ws';
import {
  ActivityHandling,
  EndSensitivity,
  GoogleGenAI,
  Modality,
  StartSensitivity,
  Type,
  type LiveServerMessage,
} from '@google/genai';
import {
  LIVE_VOICES,
  buildReviewAnalysisPrompt,
  buildTutorSystemInstruction,
  extractCustomVocabHints,
  hasEnoughTurnsForReview,
  normalizeLiveReviewResponse,
  type LiveLanguageMode,
  type LiveLessonContext,
  type LiveScenarioId,
  type LiveSpeechPace,
  type LiveTranscriptTurnInput,
  type LiveVoiceId,
} from './src/utils/liveTutor.ts';

type LiveSessionHandle = Awaited<ReturnType<GoogleGenAI['live']['connect']>>;

interface ClientStartMessage {
  type: 'start';
  lesson: LiveLessonContext;
  scenarioId: LiveScenarioId;
  voiceName: LiveVoiceId;
  languageMode: LiveLanguageMode;
  speechPace?: LiveSpeechPace;
  greetImmediately?: boolean;
}

interface ClientAudioMessage {
  type: 'audio';
  data: string;
}

interface ClientTextMessage {
  type: 'text';
  text: string;
}

interface ClientUpdateLessonMessage {
  type: 'update_lesson';
  lesson: LiveLessonContext;
  scenarioId: LiveScenarioId;
  languageMode: LiveLanguageMode;
  speechPace?: LiveSpeechPace;
}

interface ClientStopMessage {
  type: 'stop';
}

type ClientWsMessage =
  | ClientStartMessage
  | ClientAudioMessage
  | ClientTextMessage
  | ClientUpdateLessonMessage
  | ClientStopMessage;

const LIVE_MODEL = 'gemini-3.8-live';
const PORT = Number(process.env.PORT) || 3000;

function formatGeminiError(err: unknown): { code: string; message: string } {
  const raw = err instanceof Error ? err.message : String(err ?? 'Unknown error');
  const lower = raw.toLowerCase();
  if (lower.includes('api_key_invalid') || lower.includes('api key not valid')) {
    return {
      code: 'API_KEY_INVALID',
      message:
        'GEMINI_API_KEY không hợp lệ. Vui lòng kiểm tra lại khóa trong mục Cài đặt > Bí mật của ứng dụng.',
    };
  }
  if (lower.includes('permission_denied') || lower.includes('403')) {
    return {
      code: 'PERMISSION_DENIED',
      message:
        'Không có quyền truy cập Gemini Live API. Vui lòng kiểm tra GEMINI_API_KEY trong mục Cài đặt > Bí mật.',
    };
  }
  if (lower.includes('resource_exhausted') || lower.includes('429') || lower.includes('quota')) {
    return {
      code: 'RESOURCE_EXHAUSTED',
      message:
        'Đã vượt giới hạn lượt gọi Gemini Live (429). Vui lòng thử lại sau giây lát hoặc nâng cấp khóa trong Cài đặt > Bí mật.',
    };
  }
  if (lower.includes('not_found') || lower.includes('404')) {
    return {
      code: 'NOT_FOUND',
      message: `Không tìm thấy mô hình ${LIVE_MODEL} hoặc phiên bản Live API chưa sẵn sàng (${raw}).`,
    };
  }
  if (
    lower.includes('unavailable') ||
    lower.includes('503') ||
    lower.includes('high demand')
  ) {
    return {
      code: 'SERVICE_UNAVAILABLE',
      message:
        'Máy chủ phân tích AI đang quá tải tạm thời (503). Vui lòng đợi vài giây rồi nhấn "Thử phân tích lại".',
    };
  }
  return {
    code: 'LIVE_ERROR',
    message: `Lỗi kết nối AI: ${raw}`,
  };
}

function sendJson(ws: WebSocket, payload: Record<string, unknown>) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/live/health', (_req, res) => {
    res.json({
      ok: true,
      configured: Boolean(process.env.GEMINI_API_KEY?.trim()),
      model: LIVE_MODEL,
      liveApiVersion: 'v1beta',
      reviewModel: 'gemini-4-hydrogen',
      voices: LIVE_VOICES,
    });
  });

  app.post('/api/live/review', async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      res.status(503).json({
        ok: false,
        code: 'API_KEY_MISSING',
        message:
          'Chưa cấu hình GEMINI_API_KEY trên máy chủ. Vui lòng thiết lập biến môi trường GEMINI_API_KEY trong mục Cài đặt > Bí mật của ứng dụng.',
      });
      return;
    }

    const body = (req.body || {}) as {
      lesson?: LiveLessonContext;
      scenarioId?: LiveScenarioId;
      transcripts?: LiveTranscriptTurnInput[];
    };

    const transcripts = Array.isArray(body.transcripts) ? body.transcripts : [];
    if (!hasEnoughTurnsForReview(transcripts)) {
      res.status(400).json({
        ok: false,
        code: 'INSUFFICIENT_TRANSCRIPT',
        message:
          'Chưa có lượt nói hoặc tin nhắn nào của bạn trong phiên để đánh giá. Hãy nói ít nhất 1 câu với Tiểu Bối rồi thử lại.',
      });
      return;
    }

    const safeLesson: LiveLessonContext = body.lesson || {
      level: 'HSK 1',
      numberText: 'BÀI 1',
      titleChinese: '你好！',
      titleVietnamese: 'Xin chào!',
      vocabulary: [],
    };
    const safeScenario: LiveScenarioId = body.scenarioId || 'freestyle';

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const prompt = buildReviewAnalysisPrompt({
        lesson: safeLesson,
        scenarioId: safeScenario,
        transcripts,
      });

      const callReviewModel = () =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                overallScore: { type: Type.INTEGER },
                pronunciationScore: { type: Type.INTEGER },
                grammarScore: { type: Type.INTEGER },
                fluencyScore: { type: Type.INTEGER },
                summary: { type: Type.STRING },
                pronunciationFeedback: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                mistakes: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      original: { type: Type.STRING },
                      corrected: { type: Type.STRING },
                      pinyin: { type: Type.STRING },
                      explanation: { type: Type.STRING },
                    },
                  },
                },
                attentionPoints: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                suggestedPhrases: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      hanzi: { type: Type.STRING },
                      pinyin: { type: Type.STRING },
                      vietnamese: { type: Type.STRING },
                      usageNote: { type: Type.STRING },
                    },
                  },
                },
              },
            },
          },
        });

      let response;
      try {
        response = await callReviewModel();
      } catch (firstErr) {
        const msg = firstErr instanceof Error ? firstErr.message.toLowerCase() : '';
        if (msg.includes('503') || msg.includes('unavailable') || msg.includes('high demand')) {
          await new Promise((r) => setTimeout(r, 700));
          response = await callReviewModel();
        } else {
          throw firstErr;
        }
      }

      const rawJson = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawJson);
      const review = normalizeLiveReviewResponse(parsed);
      res.json({ ok: true, review });
    } catch (err) {
      const formatted = formatGeminiError(err);
      const status =
        formatted.code === 'API_KEY_INVALID'
          ? 400
          : formatted.code === 'PERMISSION_DENIED'
          ? 403
          : formatted.code === 'RESOURCE_EXHAUSTED'
          ? 429
          : formatted.code === 'NOT_FOUND'
          ? 404
          : formatted.code === 'SERVICE_UNAVAILABLE'
          ? 503
          : 500;
      res.status(status).json({
        ok: false,
        code: formatted.code,
        message: formatted.message,
      });
    }
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (clientWs: WebSocket) => {
    let liveSession: LiveSessionHandle | null = null;
    let isClosing = false;
    let connectInFlight: Promise<void> | null = null;

    const closeLiveSession = () => {
      if (liveSession) {
        try {
          liveSession.close();
        } catch {
          // ignore close errors
        }
        liveSession = null;
      }
    };

    sendJson(clientWs, { type: 'ws_ready' });

    clientWs.on('message', async (rawData) => {
      let msg: ClientWsMessage;
      try {
        msg = JSON.parse(rawData.toString()) as ClientWsMessage;
      } catch {
        sendJson(clientWs, {
          type: 'error',
          code: 'BAD_PAYLOAD',
          message: 'Dữ liệu WebSocket gửi lên không hợp lệ.',
        });
        return;
      }

      if (msg.type === 'start') {
        closeLiveSession();

        const apiKey = process.env.GEMINI_API_KEY?.trim();
        if (!apiKey) {
          sendJson(clientWs, {
            type: 'error',
            code: 'API_KEY_MISSING',
            message:
              'Chưa cấu hình GEMINI_API_KEY trên máy chủ. Vui lòng thiết lập biến môi trường GEMINI_API_KEY trong mục Cài đặt > Bí mật của ứng dụng.',
          });
          return;
        }

        const safeVoice: LiveVoiceId = LIVE_VOICES.some((v) => v.id === msg.voiceName)
          ? msg.voiceName
          : 'Zephyr';

        const speechPace: LiveSpeechPace = msg.speechPace === 'natural' ? 'natural' : 'clear';
        const systemInstruction = buildTutorSystemInstruction({
          lesson: msg.lesson,
          scenarioId: msg.scenarioId || 'lesson',
          languageMode: msg.languageMode || 'bilingual',
          speechPace,
        });
        const vocabHints = extractCustomVocabHints(msg.lesson);
        const asrLanguages =
          msg.languageMode === 'chinese_only' ? ['cmn-Hans-CN'] : ['cmn-Hans-CN', 'vi-VN'];

        const openLiveWithVersion = async (
          apiVersion: 'v1beta' | 'v1alpha',
          includeAsrHints: boolean
        ) => {
          const ai = new GoogleGenAI({
            apiKey,
            apiVersion,
            httpOptions: {
              apiVersion,
              headers: {
                'User-Agent': 'aistudio-build',
              },
            },
          });

          let sessionEstablished = false;
          const session = await ai.live.connect({
            model: LIVE_MODEL,
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: safeVoice,
                  },
                },
              },
              realtimeInputConfig: {
                automaticActivityDetection: {
                  startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
                  endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
                  prefixPaddingMs: 300,
                  silenceDurationMs: 850,
                },
                activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
              },
              inputAudioTranscription: includeAsrHints
                ? {
                    languageCodes: asrLanguages,
                    ...(vocabHints.length > 0 ? { customVocabulary: vocabHints } : {}),
                  }
                : {},
              outputAudioTranscription: {},
              systemInstruction,
            },
            callbacks: {
              onmessage: (message: LiveServerMessage) => {
                if (isClosing) return;
                const content = message.serverContent;

                if (content?.inputTranscription?.text) {
                  sendJson(clientWs, {
                    type: 'input_transcript',
                    text: content.inputTranscription.text,
                  });
                }

                if (content?.outputTranscription?.text) {
                  sendJson(clientWs, {
                    type: 'output_transcript',
                    text: content.outputTranscription.text,
                  });
                }

                for (const part of content?.modelTurn?.parts ?? []) {
                  if (part.inlineData?.data) {
                    sendJson(clientWs, {
                      type: 'audio',
                      data: part.inlineData.data,
                    });
                  }
                }

                if (content?.interrupted) {
                  sendJson(clientWs, { type: 'interrupted' });
                }

                if (content?.turnComplete) {
                  sendJson(clientWs, { type: 'turn_complete' });
                }
              },
              onerror: (errEvent: unknown) => {
                if (!sessionEstablished || isClosing) return;
                const formatted = formatGeminiError(
                  (errEvent as { error?: unknown; message?: string })?.error ??
                    (errEvent as { message?: string })?.message ??
                    errEvent
                );
                sendJson(clientWs, {
                  type: 'error',
                  code: formatted.code,
                  message: formatted.message,
                });
              },
              onclose: (closeEvt: unknown) => {
                if (sessionEstablished && !isClosing) {
                  const reason = (closeEvt as { reason?: string })?.reason;
                  sendJson(clientWs, {
                    type: 'session_closed',
                    reason: reason || 'Phiên hội thoại Gemini Live đã đóng.',
                  });
                }
                liveSession = null;
              },
            },
          });

          sessionEstablished = true;
          return session;
        };

        const connectBestEffort = async (apiVersion: 'v1beta' | 'v1alpha') => {
          try {
            return await openLiveWithVersion(apiVersion, true);
          } catch (err) {
            const msgLower = (
              err instanceof Error ? err.message : String(err ?? '')
            ).toLowerCase();
            if (
              msgLower.includes('invalid') ||
              msgLower.includes('unsupported') ||
              msgLower.includes('1007') ||
              msgLower.includes('customvocabulary') ||
              msgLower.includes('languagecodes')
            ) {
              return await openLiveWithVersion(apiVersion, false);
            }
            throw err;
          }
        };

        connectInFlight = (async () => {
          try {
            let session: LiveSessionHandle;
            try {
              session = await connectBestEffort('v1beta');
            } catch (firstErr) {
              const firstMsg = (
                firstErr instanceof Error ? firstErr.message : String(firstErr ?? '')
              ).toLowerCase();
              const isVersionOrNotFound =
                firstMsg.includes('404') ||
                firstMsg.includes('not_found') ||
                firstMsg.includes('not found');
              if (!isVersionOrNotFound) {
                throw firstErr;
              }
              session = await connectBestEffort('v1alpha');
            }

            if (isClosing || clientWs.readyState !== WebSocket.OPEN) {
              session.close();
              return;
            }

            liveSession = session;
            sendJson(clientWs, {
              type: 'connected',
              model: LIVE_MODEL,
              voiceName: safeVoice,
            });

            if (msg.greetImmediately !== false) {
              session.sendRealtimeInput({
                text: `Người học vừa kết nối cuộc gọi live cho ${msg.lesson.level} ${msg.lesson.numberText} (${msg.lesson.titleChinese} - ${msg.lesson.titleVietnamese}). Hãy chào ngắn gọn bằng tiếng Trung phổ thông chuẩn (đọc rõ từng chữ, chuẩn thanh điệu) và gợi ý câu hỏi mở đầu ngay.`,
              });
            }
          } catch (err) {
            const formatted = formatGeminiError(err);
            sendJson(clientWs, {
              type: 'error',
              code: formatted.code,
              message: formatted.message,
            });
          }
        })();

        await connectInFlight;
        return;
      }

      if (msg.type === 'audio') {
        if (connectInFlight) await connectInFlight;
        if (!liveSession || !msg.data) return;
        try {
          liveSession.sendRealtimeInput({
            audio: {
              data: msg.data,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        } catch (err) {
          const formatted = formatGeminiError(err);
          sendJson(clientWs, {
            type: 'error',
            code: formatted.code,
            message: formatted.message,
          });
        }
        return;
      }

      if (msg.type === 'text') {
        if (connectInFlight) await connectInFlight;
        const text = (msg.text || '').trim();
        if (!liveSession || !text) return;
        try {
          liveSession.sendRealtimeInput({ text });
        } catch (err) {
          const formatted = formatGeminiError(err);
          sendJson(clientWs, {
            type: 'error',
            code: formatted.code,
            message: formatted.message,
          });
        }
        return;
      }

      if (msg.type === 'update_lesson') {
        if (connectInFlight) await connectInFlight;
        if (!liveSession || !msg.lesson) return;
        const vocabList = (msg.lesson.vocabulary || [])
          .slice(0, 10)
          .map((v) => v.hanzi)
          .join('、');
        const paceHint =
          msg.speechPace === 'natural'
            ? 'Giữ nhịp nói tự nhiên trôi chảy nhưng phát âm chuẩn thanh điệu.'
            : 'Tiếp tục nói chậm rõ từng âm tiết, nhấn chuẩn 4 thanh điệu và đọc rõ từ mới.';
        try {
          liveSession.sendRealtimeInput({
            text: `[CẬP NHẬT BÀI HỌC MỚI]: Người học vừa chuyển sang ${msg.lesson.level} - ${msg.lesson.numberText}: "${msg.lesson.titleChinese}" (${msg.lesson.titleVietnamese}). Từ vựng chính: ${vocabList}. Hãy điều chỉnh độ khó và nội dung tiếp theo bám sát bài học mới này. ${paceHint}`,
          });
        } catch {
          // Ignore transient context update errors
        }
        return;
      }

      if (msg.type === 'stop') {
        closeLiveSession();
        sendJson(clientWs, {
          type: 'session_closed',
          reason: 'Bạn đã kết thúc cuộc gọi.',
        });
      }
    });

    clientWs.on('close', () => {
      isClosing = true;
      closeLiveSession();
    });

    clientWs.on('error', () => {
      isClosing = true;
      closeLiveSession();
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(import.meta.dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const reqUrl = request.url || '';
    if (reqUrl === '/ws/live' || reqUrl.startsWith('/ws/live?')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`HanyuLab server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();

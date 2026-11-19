import {
  LIVE_SCENARIOS,
  LIVE_VOICES,
  base64ToInt16,
  buildQuickStarters,
  buildWavBytesFromPcm16,
  computeOrbEnergy,
  downsampleFloat32ToInt16,
  formatCallDuration,
  hasEnoughTurnsForReview,
  int16ToBase64,
  pcmInt16ToFloat32,
  type LiveConversationReview,
  type LiveLanguageMode,
  type LiveLessonContext,
  type LiveOrbState,
  type LiveScenarioId,
  type LiveSpeechPace,
  type LiveVoiceId,
} from './utils/liveTutor';

interface TranscriptEntry {
  id: string;
  role: 'user' | 'ai' | 'system';
  text: string;
  timestamp: string;
  audioChunks?: Int16Array[];
  replayUrl?: string;
}

declare global {
  interface Window {
    speakText?: (text: string, rate?: number) => void;
    playBeepFx?: (freq?: number, dur?: number) => void;
    HanyuLiveTutor?: {
      init: () => void;
      syncLesson: (lesson: LiveLessonContext) => void;
      startOrStopCall: () => void;
      toggleMute: () => void;
      setScenario: (scenarioId: LiveScenarioId) => void;
      setVoice: (voiceId: LiveVoiceId) => void;
      setLanguageMode: (mode: LiveLanguageMode) => void;
      setSpeechPace: (pace: LiveSpeechPace) => void;
      pronounceVocab: (hanzi: string, pinyin?: string) => void;
      sendTextMessage: (customText?: string) => void;
      replayTurn: (turnId: string, rate?: number) => void;
      clearTranscript: () => void;
      insertStarter: (hanzi: string) => void;
      requestReview: () => void;
      closeReview: () => void;
    };
  }
}

class LiveTutorController {
  private initialized = false;
  private lesson: LiveLessonContext = {
    level: 'HSK 1',
    numberText: 'BÀI 1',
    titleChinese: '你好！',
    titlePinyin: 'Nǐ hǎo!',
    titleVietnamese: 'Xin chào!',
    vocabulary: [],
    grammar: [],
  };

  private scenarioId: LiveScenarioId = 'lesson';
  private voiceId: LiveVoiceId = 'Zephyr';
  private languageMode: LiveLanguageMode = 'bilingual';
  private speechPace: LiveSpeechPace = 'clear';

  private orbState: LiveOrbState = 'idle';
  private isCallActive = false;
  private isMicMuted = false;

  private ws: WebSocket | null = null;
  private micStream: MediaStream | null = null;
  private inputCtx: AudioContext | null = null;
  private outputCtx: AudioContext | null = null;
  private inputAnalyser: AnalyserNode | null = null;
  private outputAnalyser: AnalyserNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private micSourceNode: MediaStreamAudioSourceNode | null = null;
  private activeSources = new Set<AudioBufferSourceNode>();
  private nextStartTime = 0;

  private timerHandle: number | null = null;
  private callSeconds = 0;
  private orbRafHandle: number | null = null;
  private currentInputLevel = 0;
  private currentOutputLevel = 0;
  private smoothOrbEnergy = 0.08;
  private orbPhase = 0;
  private bargeInFrames = 0;

  private transcripts: TranscriptEntry[] = [];
  private activeUserTurnId: string | null = null;
  private activeAiTurnId: string | null = null;
  private replayAudioEl: HTMLAudioElement | null = null;

  private reviewStatus: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
  private reviewData: LiveConversationReview | null = null;
  private reviewError = '';

  public init() {
    if (this.initialized) return;
    this.initialized = true;
    const initialLesson = (window as unknown as { __hanyuActiveLesson?: LiveLessonContext }).__hanyuActiveLesson;
    if (initialLesson) {
      this.lesson = {
        level: initialLesson.level,
        numberText: initialLesson.numberText,
        titleChinese: initialLesson.titleChinese,
        titlePinyin: initialLesson.titlePinyin,
        titleVietnamese: initialLesson.titleVietnamese,
        vocabulary: Array.isArray(initialLesson.vocabulary) ? initialLesson.vocabulary : [],
        grammar: Array.isArray(initialLesson.grammar) ? initialLesson.grammar : [],
      };
    }
    this.renderStaticControls();
    this.renderLessonSyncUI();
    this.renderQuickStarters();
    this.renderTranscripts();
    this.updateCallControlsUI();
    this.startOrbAnimationLoop();
  }

  public syncLesson(lesson: LiveLessonContext) {
    if (!lesson) return;
    this.lesson = {
      level: lesson.level,
      numberText: lesson.numberText,
      titleChinese: lesson.titleChinese,
      titlePinyin: lesson.titlePinyin,
      titleVietnamese: lesson.titleVietnamese,
      vocabulary: Array.isArray(lesson.vocabulary) ? lesson.vocabulary : [],
      grammar: Array.isArray(lesson.grammar) ? lesson.grammar : [],
    };
    this.renderLessonSyncUI();
    this.renderQuickStarters();

    if (this.isCallActive && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'update_lesson',
          lesson: this.lesson,
          scenarioId: this.scenarioId,
          languageMode: this.languageMode,
          speechPace: this.speechPace,
        })
      );
      this.appendSystemNotice(
        `Đã đồng bộ ngữ cảnh sang ${this.lesson.level} - ${this.lesson.numberText}: ${this.lesson.titleChinese}`
      );
    }
  }

  public async startOrStopCall() {
    if (this.isCallActive || this.orbState === 'connecting') {
      this.stopCall(true);
      return;
    }
    await this.startCall();
  }

  public toggleMute() {
    if (!this.isCallActive) return;
    this.isMicMuted = !this.isMicMuted;
    if (this.micStream) {
      this.micStream.getAudioTracks().forEach((track) => {
        track.enabled = !this.isMicMuted;
      });
    }
    if (this.isMicMuted && this.orbState === 'listening') {
      this.orbState = 'muted';
    } else if (!this.isMicMuted && this.orbState === 'muted') {
      this.orbState = this.activeSources.size > 0 ? 'speaking' : 'listening';
    }
    this.updateCallControlsUI();
    window.playBeepFx?.(this.isMicMuted ? 380 : 640, 0.05);
  }

  public async setScenario(scenarioId: LiveScenarioId) {
    if (!LIVE_SCENARIOS.some((s) => s.id === scenarioId)) return;
    this.scenarioId = scenarioId;
    this.renderStaticControls();
    this.renderQuickStarters();
    if (this.isCallActive) {
      await this.reconnectWithCurrentSettings('Đã cập nhật tình huống thực hành mới.');
    }
  }

  public async setVoice(voiceId: LiveVoiceId) {
    if (!LIVE_VOICES.some((v) => v.id === voiceId)) return;
    this.voiceId = voiceId;
    this.renderStaticControls();
    if (this.isCallActive) {
      await this.reconnectWithCurrentSettings(`Đã đổi chất giọng Tiểu Bối sang ${voiceId}.`);
    }
  }

  public async setLanguageMode(mode: LiveLanguageMode) {
    if (mode !== 'bilingual' && mode !== 'chinese_only') return;
    this.languageMode = mode;
    this.renderStaticControls();
    if (this.isCallActive) {
      await this.reconnectWithCurrentSettings(
        mode === 'chinese_only'
          ? 'Đã chuyển sang chế độ 100% Tiếng Trung.'
          : 'Đã chuyển sang chế độ Song ngữ (Trung + sửa lỗi Việt).'
      );
    }
  }

  public async setSpeechPace(pace: LiveSpeechPace) {
    if (pace !== 'clear' && pace !== 'natural') return;
    this.speechPace = pace;
    this.renderStaticControls();
    if (this.isCallActive) {
      await this.reconnectWithCurrentSettings(
        pace === 'clear'
          ? 'Đã chuyển sang nhịp nói Chậm rõ (Sư phạm) để luyện chuẩn thanh điệu.'
          : 'Đã chuyển sang nhịp nói Tự nhiên.'
      );
    }
  }

  public pronounceVocab(hanzi: string, pinyin = '') {
    const cleanHanzi = String(hanzi || '').trim();
    if (!cleanHanzi) return;
    window.speakText?.(cleanHanzi, this.speechPace === 'clear' ? 0.8 : 0.95);
    const prompt = `Chào Tiểu Bối, mình muốn luyện phát âm từ “${cleanHanzi}”${
      pinyin ? ` (${pinyin})` : ''
    }. Bạn đọc mẫu chậm rõ 1 lần rồi nghe mình đọc lại nhé!`;
    if (this.isCallActive && this.ws?.readyState === WebSocket.OPEN) {
      this.sendTextMessage(prompt);
      return;
    }
    const inputEl = document.getElementById('liveTextInput') as HTMLInputElement | null;
    if (inputEl) {
      inputEl.value = prompt;
      inputEl.focus();
    }
  }

  public sendTextMessage(customText?: string) {
    const inputEl = document.getElementById('liveTextInput') as HTMLInputElement | null;
    const raw = typeof customText === 'string' ? customText : inputEl?.value || '';
    const text = raw.trim();
    if (!text) return;

    if (!customText && inputEl) {
      inputEl.value = '';
    }

    this.clearErrorAlert();

    if (!this.isCallActive || this.ws?.readyState !== WebSocket.OPEN) {
      // Auto-start call and send the message once connected, or inform if error
      this.startCall(text);
      return;
    }

    this.stopAiPlaybackQueue();
    this.activeAiTurnId = null;
    this.activeUserTurnId = null;

    this.transcripts.push({
      id: `turn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: 'user',
      text,
      timestamp: this.getNowLabel(),
    });
    this.renderTranscripts();

    this.ws.send(JSON.stringify({ type: 'text', text }));
    window.playBeepFx?.(660, 0.04);
  }

  public insertStarter(hanzi: string) {
    const inputEl = document.getElementById('liveTextInput') as HTMLInputElement | null;
    if (this.isCallActive && this.ws?.readyState === WebSocket.OPEN) {
      this.sendTextMessage(hanzi);
      return;
    }
    if (inputEl) {
      inputEl.value = hanzi;
      inputEl.focus();
    }
    window.speakText?.(hanzi);
  }

  public replayTurn(turnId: string, rate = 1) {
    const entry = this.transcripts.find((t) => t.id === turnId);
    if (!entry) return;

    if (this.replayAudioEl) {
      this.replayAudioEl.pause();
      this.replayAudioEl = null;
    }

    const safeRate = rate === 0.75 ? 0.75 : 1;

    if (entry.audioChunks && entry.audioChunks.length > 0) {
      if (!entry.replayUrl) {
        const wavBytes = buildWavBytesFromPcm16(entry.audioChunks, 24000);
        const blob = new Blob([wavBytes.buffer as ArrayBuffer], { type: 'audio/wav' });
        entry.replayUrl = URL.createObjectURL(blob);
      }
      const audio = new Audio(entry.replayUrl) as HTMLAudioElement & {
        preservesPitch?: boolean;
        mozPreservesPitch?: boolean;
        webkitPreservesPitch?: boolean;
      };
      audio.preservesPitch = true;
      audio.mozPreservesPitch = true;
      audio.webkitPreservesPitch = true;
      audio.playbackRate = safeRate;
      this.replayAudioEl = audio;
      audio.play().catch(() => {
        window.speakText?.(entry.text, safeRate);
      });
      return;
    }

    window.speakText?.(entry.text, safeRate);
  }

  public clearTranscript() {
    this.transcripts.forEach((t) => {
      if (t.replayUrl) URL.revokeObjectURL(t.replayUrl);
    });
    this.transcripts = [];
    this.activeUserTurnId = null;
    this.activeAiTurnId = null;
    this.reviewStatus = 'idle';
    this.reviewData = null;
    this.reviewError = '';
    this.renderTranscripts();
    this.renderReviewPanel();
  }

  public closeReview() {
    this.reviewStatus = 'idle';
    this.renderReviewPanel();
  }

  public async requestReview() {
    if (this.reviewStatus === 'loading') return;
    const payloadTurns = this.transcripts.map((t) => ({ role: t.role, text: t.text }));
    if (!hasEnoughTurnsForReview(payloadTurns)) {
      this.reviewStatus = 'error';
      this.reviewError =
        'Bạn cần có ít nhất 1 câu nói hoặc tin nhắn trong cuộc hội thoại để hệ thống đánh giá phát âm và gợi ý mẫu câu.';
      this.renderReviewPanel();
      return;
    }

    this.reviewStatus = 'loading';
    this.reviewError = '';
    this.renderReviewPanel();

    const panel = document.getElementById('liveReviewPanel');
    panel?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    try {
      const resp = await fetch('/api/live/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lesson: this.lesson,
          scenarioId: this.scenarioId,
          transcripts: payloadTurns,
        }),
      });
      const json = (await resp.json()) as {
        ok?: boolean;
        review?: LiveConversationReview;
        message?: string;
      };
      if (!resp.ok || !json.ok || !json.review) {
        this.reviewStatus = 'error';
        this.reviewError =
          json.message || 'Không thể phân tích cuộc hội thoại lúc này. Vui lòng thử lại.';
        this.renderReviewPanel();
        return;
      }

      this.reviewData = json.review;
      this.reviewStatus = 'ready';
      this.renderReviewPanel();
    } catch (err) {
      this.reviewStatus = 'error';
      this.reviewError = `Lỗi kết nối khi tổng kết phiên: ${
        err instanceof Error ? err.message : String(err)
      }`;
      this.renderReviewPanel();
    }
  }

  private async reconnectWithCurrentSettings(notice: string) {
    this.appendSystemNotice(notice);
    this.stopCall(false, false);
    await this.startCall();
  }

  private async startCall(pendingInitialText?: string) {
    this.clearErrorAlert();
    this.orbState = 'connecting';
    this.isMicMuted = false;
    this.updateCallControlsUI();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.handleFatalError(
        'Trình duyệt hiện tại không hỗ trợ thu âm Micro (WebRTC / getUserMedia). Bạn vẫn có thể thử trên Chrome, Edge hoặc Safari mới nhất.'
      );
      return;
    }

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.handleFatalError(
        `Không thể truy cập Micro (${msg}). Vui lòng nhấn "Cho phép (Allow)" quyền Micro trên thanh địa chỉ trình duyệt rồi thử lại.`
      );
      return;
    }

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      this.inputCtx = new AudioCtx({ sampleRate: 16000 });
      this.outputCtx = new AudioCtx({ sampleRate: 24000 });

      if (this.inputCtx.state === 'suspended') await this.inputCtx.resume();
      if (this.outputCtx.state === 'suspended') await this.outputCtx.resume();

      this.outputAnalyser = this.outputCtx.createAnalyser();
      this.outputAnalyser.fftSize = 256;
      this.outputAnalyser.connect(this.outputCtx.destination);
      this.nextStartTime = this.outputCtx.currentTime;

      const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProto}//${window.location.host}/ws/live`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.ws?.send(
          JSON.stringify({
            type: 'start',
            lesson: this.lesson,
            scenarioId: this.scenarioId,
            voiceName: this.voiceId,
            languageMode: this.languageMode,
            speechPace: this.speechPace,
            greetImmediately: !pendingInitialText,
          })
        );
      };

      this.ws.onmessage = (evt) => {
        this.handleWsMessage(evt.data, pendingInitialText);
      };

      this.ws.onerror = () => {
        if (this.orbState === 'connecting' || this.isCallActive) {
          this.handleFatalError(
            'Không thể kết nối WebSocket tới máy chủ Gemini Live. Vui lòng kiểm tra kết nối mạng và cấu hình máy chủ.'
          );
        }
      };

      this.ws.onclose = () => {
        if (this.isCallActive || this.orbState === 'connecting') {
          this.stopCall(false);
        }
      };
    } catch (err) {
      this.handleFatalError(
        `Lỗi khởi tạo âm thanh: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private handleWsMessage(raw: string, pendingInitialText?: string) {
    let msg: {
      type: string;
      data?: string;
      text?: string;
      code?: string;
      message?: string;
      reason?: string;
    };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type === 'connected') {
      this.isCallActive = true;
      this.orbState = this.isMicMuted ? 'muted' : 'listening';
      this.startTimer();
      this.setupMicStreaming();
      this.updateCallControlsUI();
      this.appendSystemNotice(
        `Đã kết nối Tiểu Bối (${this.voiceId}) • ${this.lesson.level} ${this.lesson.numberText}`
      );
      window.playBeepFx?.(740, 0.06);

      if (pendingInitialText) {
        this.sendTextMessage(pendingInitialText);
      }
      return;
    }

    if (msg.type === 'audio' && msg.data) {
      this.orbState = 'speaking';
      this.updateCallStatusBadge();
      const pcm = base64ToInt16(msg.data);
      this.enqueueAiAudioPcm(pcm);
      this.attachAudioChunkToAiTurn(pcm);
      return;
    }

    if (msg.type === 'input_transcript' && msg.text) {
      this.activeAiTurnId = null;
      this.upsertStreamingTranscript('user', msg.text);
      return;
    }

    if (msg.type === 'output_transcript' && msg.text) {
      this.activeUserTurnId = null;
      this.upsertStreamingTranscript('ai', msg.text);
      return;
    }

    if (msg.type === 'interrupted') {
      this.stopAiPlaybackQueue();
      this.activeAiTurnId = null;
      this.orbState = this.isMicMuted ? 'muted' : 'listening';
      this.updateCallStatusBadge();
      return;
    }

    if (msg.type === 'turn_complete') {
      this.activeAiTurnId = null;
      this.activeUserTurnId = null;
      if (this.activeSources.size === 0 && this.isCallActive) {
        this.orbState = this.isMicMuted ? 'muted' : 'listening';
        this.updateCallStatusBadge();
      }
      return;
    }

    if (msg.type === 'error') {
      this.handleFatalError(msg.message || 'Lỗi kết nối Gemini Live.');
      return;
    }

    if (msg.type === 'session_closed') {
      if (this.isCallActive) {
        this.appendSystemNotice(msg.reason || 'Cuộc gọi đã kết thúc.');
        this.stopCall(false, true);
      }
    }
  }

  private setupMicStreaming() {
    if (!this.inputCtx || !this.micStream) return;

    this.micSourceNode = this.inputCtx.createMediaStreamSource(this.micStream);
    this.inputAnalyser = this.inputCtx.createAnalyser();
    this.inputAnalyser.fftSize = 256;

    this.processorNode = this.inputCtx.createScriptProcessor(2048, 1, 1);

    // Connect through a zero-gain sink so onaudioprocess fires without local mic echo
    const silentGain = this.inputCtx.createGain();
    silentGain.gain.value = 0;

    this.micSourceNode.connect(this.inputAnalyser);
    this.inputAnalyser.connect(this.processorNode);
    this.processorNode.connect(silentGain);
    silentGain.connect(this.inputCtx.destination);

    this.processorNode.onaudioprocess = (event) => {
      if (!this.isCallActive || this.isMicMuted || this.ws?.readyState !== WebSocket.OPEN) {
        this.currentInputLevel = 0;
        return;
      }

      const channel = event.inputBuffer.getChannelData(0);

      // Compute RMS amplitude for orb & fast barge-in detection
      let sumSq = 0;
      for (let i = 0; i < channel.length; i++) {
        sumSq += channel[i] * channel[i];
      }
      const rms = Math.sqrt(sumSq / channel.length);
      this.currentInputLevel = Math.min(1, rms * 5.5);

      // Local natural barge-in: if user speaks clearly while AI audio is playing, stop AI playback immediately
      if (this.activeSources.size > 0 && rms > 0.048) {
        this.bargeInFrames++;
        if (this.bargeInFrames >= 2) {
          this.stopAiPlaybackQueue();
          this.orbState = 'listening';
          this.updateCallStatusBadge();
          this.bargeInFrames = 0;
        }
      } else {
        this.bargeInFrames = 0;
      }

      const pcm16 = downsampleFloat32ToInt16(
        channel,
        this.inputCtx?.sampleRate || 16000,
        16000
      );
      const base64 = int16ToBase64(pcm16);
      this.ws.send(JSON.stringify({ type: 'audio', data: base64 }));
    };
  }

  private enqueueAiAudioPcm(pcm: Int16Array) {
    if (!this.outputCtx || !this.outputAnalyser || pcm.length === 0) return;

    const floatData = pcmInt16ToFloat32(pcm);
    const buffer = this.outputCtx.createBuffer(1, floatData.length, 24000);
    buffer.getChannelData(0).set(floatData);

    const source = this.outputCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.outputAnalyser);

    const startAt = Math.max(this.outputCtx.currentTime, this.nextStartTime);
    source.start(startAt);
    this.nextStartTime = startAt + buffer.duration;

    this.activeSources.add(source);
    source.onended = () => {
      this.activeSources.delete(source);
      if (this.activeSources.size === 0 && this.isCallActive) {
        this.orbState = this.isMicMuted ? 'muted' : 'listening';
        this.updateCallStatusBadge();
      }
    };
  }

  private stopAiPlaybackQueue() {
    this.activeSources.forEach((src) => {
      try {
        src.stop();
      } catch {
        // already stopped
      }
    });
    this.activeSources.clear();
    if (this.outputCtx) {
      this.nextStartTime = this.outputCtx.currentTime;
    } else {
      this.nextStartTime = 0;
    }
    this.currentOutputLevel = 0;
  }

  private stopCall(notifyServer: boolean, triggerPostReview = true) {
    const hadActiveSession = this.isCallActive;

    if (notifyServer && this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: 'stop' }));
      } catch {
        // ignore
      }
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }

    this.stopAiPlaybackQueue();

    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode.onaudioprocess = null;
      this.processorNode = null;
    }
    if (this.micSourceNode) {
      this.micSourceNode.disconnect();
      this.micSourceNode = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (this.inputCtx) {
      this.inputCtx.close().catch(() => {});
      this.inputCtx = null;
    }
    if (this.outputCtx) {
      this.outputCtx.close().catch(() => {});
      this.outputCtx = null;
    }
    this.inputAnalyser = null;
    this.outputAnalyser = null;

    this.stopTimer();
    this.isCallActive = false;
    this.isMicMuted = false;
    this.currentInputLevel = 0;
    this.currentOutputLevel = 0;
    if (this.orbState !== 'error') {
      this.orbState = 'idle';
    }
    this.activeAiTurnId = null;
    this.activeUserTurnId = null;
    this.updateCallControlsUI();

    if (
      triggerPostReview &&
      hadActiveSession &&
      hasEnoughTurnsForReview(this.transcripts.map((t) => ({ role: t.role, text: t.text })))
    ) {
      void this.requestReview();
    }
  }

  private handleFatalError(message: string) {
    this.orbState = 'error';
    this.stopCall(false);
    this.orbState = 'error';
    this.updateCallControlsUI();

    const alertBox = document.getElementById('liveStatusAlert');
    const alertMsg = document.getElementById('liveStatusAlertText');
    if (alertBox && alertMsg) {
      alertMsg.textContent = message;
      alertBox.classList.remove('hidden');
    }
    this.appendSystemNotice(`⚠️ ${message}`);
  }

  private clearErrorAlert() {
    const alertBox = document.getElementById('liveStatusAlert');
    if (alertBox) alertBox.classList.add('hidden');
    if (this.orbState === 'error') {
      this.orbState = 'idle';
      this.updateCallStatusBadge();
    }
  }

  private startTimer() {
    this.stopTimer();
    this.callSeconds = 0;
    this.updateTimerText();
    this.timerHandle = window.setInterval(() => {
      this.callSeconds++;
      this.updateTimerText();
    }, 1000);
  }

  private stopTimer() {
    if (this.timerHandle !== null) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
  }

  private updateTimerText() {
    const el = document.getElementById('liveCallTimer');
    if (el) el.textContent = formatCallDuration(this.callSeconds);
  }

  private upsertStreamingTranscript(role: 'user' | 'ai', chunkText: string) {
    const clean = chunkText;
    if (!clean) return;

    const currentTurnId = role === 'user' ? this.activeUserTurnId : this.activeAiTurnId;
    if (currentTurnId) {
      const existing = this.transcripts.find((t) => t.id === currentTurnId);
      if (existing) {
        existing.text = `${existing.text}${clean}`;
        this.renderTranscripts();
        return;
      }
    }

    const id = `turn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    if (role === 'user') this.activeUserTurnId = id;
    else this.activeAiTurnId = id;

    this.transcripts.push({
      id,
      role,
      text: clean.trimStart(),
      timestamp: this.getNowLabel(),
      audioChunks: role === 'ai' ? [] : undefined,
    });
    this.renderTranscripts();
  }

  private attachAudioChunkToAiTurn(pcm: Int16Array) {
    if (!this.activeAiTurnId) {
      const id = `turn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      this.activeAiTurnId = id;
      this.transcripts.push({
        id,
        role: 'ai',
        text: '',
        timestamp: this.getNowLabel(),
        audioChunks: [pcm],
      });
      return;
    }
    const entry = this.transcripts.find((t) => t.id === this.activeAiTurnId);
    if (entry) {
      if (!entry.audioChunks) entry.audioChunks = [];
      entry.audioChunks.push(pcm);
      if (entry.replayUrl) {
        URL.revokeObjectURL(entry.replayUrl);
        entry.replayUrl = undefined;
      }
    }
  }

  private appendSystemNotice(text: string) {
    this.transcripts.push({
      id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: 'system',
      text,
      timestamp: this.getNowLabel(),
    });
    this.renderTranscripts();
  }

  private getNowLabel(): string {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  private renderStaticControls() {
    const scenarioGrid = document.getElementById('liveScenarioGrid');
    if (scenarioGrid) {
      scenarioGrid.innerHTML = LIVE_SCENARIOS.map((sc) => {
        const active = sc.id === this.scenarioId;
        const isFreestyle = sc.id === 'freestyle';
        return `
          <button type="button" onclick="window.HanyuLiveTutor?.setScenario('${sc.id}')" class="text-left p-2.5 rounded-xl border transition text-xs cursor-pointer ${
            isFreestyle ? 'sm:col-span-2 ' : ''
          }${
            active
              ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs font-bold'
              : isFreestyle
              ? 'bg-emerald-50/70 text-emerald-950 border-emerald-200 hover:border-emerald-500 hover:bg-emerald-50 font-semibold'
              : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/50 font-semibold'
          }">
            <div class="truncate">${this.escapeHtml(sc.label)}</div>
            <div class="text-[11px] mt-0.5 line-clamp-1 ${active ? 'text-emerald-100 font-normal' : 'text-slate-500 font-normal'}">${this.escapeHtml(sc.shortDesc)}</div>
          </button>
        `;
      }).join('');
    }

    const voiceGrid = document.getElementById('liveVoiceSelector');
    if (voiceGrid) {
      voiceGrid.innerHTML = LIVE_VOICES.map((v) => {
        const active = v.id === this.voiceId;
        return `
          <button type="button" onclick="window.HanyuLiveTutor?.setVoice('${v.id}')" class="px-3 py-2 rounded-xl border text-xs transition cursor-pointer whitespace-nowrap shrink-0 ${
            active
              ? 'bg-emerald-700 text-white border-emerald-700 font-bold shadow-xs'
              : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-400 hover:bg-emerald-50 font-semibold'
          }" title="${this.escapeHtml(v.toneDesc)}">
            ${this.escapeHtml(v.label)} · <span class="opacity-80 font-normal">${this.escapeHtml(v.toneDesc)}</span>
          </button>
        `;
      }).join('');
    }

    const biBtn = document.getElementById('liveLangBtn-bilingual');
    const zhBtn = document.getElementById('liveLangBtn-chinese_only');
    if (biBtn && zhBtn) {
      biBtn.className =
        this.languageMode === 'bilingual'
          ? 'px-3 py-1.5 rounded-lg bg-white text-emerald-900 font-bold shadow-2xs text-xs whitespace-nowrap shrink-0 cursor-pointer transition'
          : 'px-3 py-1.5 rounded-lg text-slate-600 hover:text-emerald-900 font-medium text-xs whitespace-nowrap shrink-0 cursor-pointer transition';
      zhBtn.className =
        this.languageMode === 'chinese_only'
          ? 'px-3 py-1.5 rounded-lg bg-white text-emerald-900 font-bold shadow-2xs text-xs whitespace-nowrap shrink-0 cursor-pointer transition'
          : 'px-3 py-1.5 rounded-lg text-slate-600 hover:text-emerald-900 font-medium text-xs whitespace-nowrap shrink-0 cursor-pointer transition';
    }

    const paceClearBtn = document.getElementById('livePaceBtn-clear');
    const paceNatBtn = document.getElementById('livePaceBtn-natural');
    if (paceClearBtn && paceNatBtn) {
      paceClearBtn.className =
        this.speechPace === 'clear'
          ? 'px-3 py-1.5 rounded-lg bg-emerald-700 text-white font-bold shadow-2xs text-xs whitespace-nowrap shrink-0 cursor-pointer transition'
          : 'px-3 py-1.5 rounded-lg bg-white text-slate-700 border border-slate-200 hover:border-emerald-400 font-semibold text-xs whitespace-nowrap shrink-0 cursor-pointer transition';
      paceNatBtn.className =
        this.speechPace === 'natural'
          ? 'px-3 py-1.5 rounded-lg bg-emerald-700 text-white font-bold shadow-2xs text-xs whitespace-nowrap shrink-0 cursor-pointer transition'
          : 'px-3 py-1.5 rounded-lg bg-white text-slate-700 border border-slate-200 hover:border-emerald-400 font-semibold text-xs whitespace-nowrap shrink-0 cursor-pointer transition';
    }
  }

  private renderLessonSyncUI() {
    const titleEl = document.getElementById('liveSyncedLessonTitle');
    if (titleEl) {
      titleEl.textContent = `${this.lesson.level} • ${this.lesson.numberText}: ${this.lesson.titleChinese} (${this.lesson.titleVietnamese})`;
    }

    const vocabWrap = document.getElementById('liveSyncedVocabChips');
    if (vocabWrap) {
      const sample = (this.lesson.vocabulary || []).slice(0, 10);
      if (sample.length === 0) {
        vocabWrap.innerHTML = `<span class="text-xs text-slate-400">Chưa có từ vựng đồng bộ.</span>`;
      } else {
        vocabWrap.innerHTML = sample
          .map(
            (v) => `
          <button type="button" onclick="window.HanyuLiveTutor?.pronounceVocab('${this.escapeJs(v.hanzi)}', '${this.escapeJs(v.pinyin || '')}')" class="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-xs font-medium text-emerald-900 transition cursor-pointer whitespace-nowrap shrink-0" title="Nhấn để nghe mẫu rõ và luyện phát âm từ ${this.escapeHtml(v.hanzi)}">
            <span class="font-chinese font-bold">${this.escapeHtml(v.hanzi)}</span>
            ${v.pinyin ? `<span class="text-emerald-700 ml-1">${this.escapeHtml(v.pinyin)}</span>` : ''}
          </button>
        `
          )
          .join('');
      }
    }
  }

  private renderQuickStarters() {
    const wrap = document.getElementById('liveQuickStarters');
    if (!wrap) return;
    const starters = buildQuickStarters(this.lesson, this.scenarioId);
    wrap.innerHTML = starters
      .map(
        (s) => `
      <button type="button" onclick="window.HanyuLiveTutor?.insertStarter('${this.escapeJs(s.hanzi)}')" class="w-full text-left p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-emerald-50 hover:border-emerald-300 transition cursor-pointer group">
        <div class="font-chinese font-bold text-sm text-slate-900 group-hover:text-emerald-950">${this.escapeHtml(s.hanzi)}</div>
        <div class="text-[11px] text-emerald-700 font-medium mt-0.5">${this.escapeHtml(s.pinyin)}</div>
        <div class="text-[11px] text-slate-500 mt-0.5">${this.escapeHtml(s.vietnamese)}</div>
      </button>
    `
      )
      .join('');
  }

  private renderTranscripts() {
    const evalBtn = document.getElementById('liveEvaluateBtn') as HTMLButtonElement | null;
    if (evalBtn) {
      const canReview = hasEnoughTurnsForReview(
        this.transcripts.map((t) => ({ role: t.role, text: t.text }))
      );
      evalBtn.disabled = !canReview || this.reviewStatus === 'loading';
      evalBtn.className = !canReview
        ? 'px-3 py-1.5 rounded-lg bg-slate-100 text-slate-400 text-xs font-semibold cursor-not-allowed whitespace-nowrap shrink-0'
        : 'px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0';
    }

    const container = document.getElementById('liveTranscriptContainer');
    if (!container) return;

    if (this.transcripts.length === 0) {
      container.innerHTML = `
        <div class="h-full min-h-[240px] flex flex-col items-center justify-center text-center px-4 py-8 text-slate-400">
          <div class="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mb-3 border border-emerald-100">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z"></path></svg>
          </div>
          <p class="text-sm font-bold text-slate-700">Chưa có lịch sử hội thoại</p>
          <p class="text-xs text-slate-500 mt-1 max-w-sm">Nhấn <strong>Bắt Đầu Hội Thoại Live</strong> hoặc chọn một câu mở đầu nhanh bên cạnh để đàm thoại trực tiếp cùng gia sư AI Tiểu Bối.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.transcripts
      .map((entry) => {
        if (entry.role === 'system') {
          return `
            <div class="text-center my-2">
              <span class="inline-block text-[11px] font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-lg">${this.escapeHtml(entry.text)}</span>
            </div>
          `;
        }

        if (entry.role === 'user') {
          return `
            <div class="flex justify-end">
              <div class="max-w-[85%] bg-emerald-700 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 shadow-2xs">
                <div class="flex items-center justify-between gap-3 text-[11px] text-emerald-100 mb-1">
                  <span class="font-bold">Bạn</span>
                  <span class="tabular-nums opacity-80">${this.escapeHtml(entry.timestamp)}</span>
                </div>
                <p class="text-sm leading-relaxed whitespace-pre-wrap">${this.escapeHtml(entry.text)}</p>
              </div>
            </div>
          `;
        }

        const displayText = entry.text || '…';
        return `
          <div class="flex justify-start">
            <div class="max-w-[88%] bg-white border border-slate-200 text-slate-800 rounded-2xl rounded-tl-sm px-4 py-3 shadow-2xs">
              <div class="flex items-center justify-between gap-3 text-[11px] text-slate-500 mb-1">
                <span class="font-bold text-emerald-800">Tiểu Bối (小贝)</span>
                <span class="tabular-nums">${this.escapeHtml(entry.timestamp)}</span>
              </div>
              <p class="text-sm leading-relaxed text-slate-900 whitespace-pre-wrap font-medium">${this.escapeHtml(displayText)}</p>
              <div class="mt-2 pt-2 border-t border-slate-100 flex items-center justify-end gap-1.5">
                <button type="button" onclick="window.HanyuLiveTutor?.replayTurn('${entry.id}', 0.75)" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer">
                  <span>Nghe chậm 0.75x</span>
                </button>
                <button type="button" onclick="window.HanyuLiveTutor?.replayTurn('${entry.id}', 1)" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold transition cursor-pointer">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path></svg>
                  <span>Nghe lại</span>
                </button>
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    container.scrollTop = container.scrollHeight;
  }

  private updateCallControlsUI() {
    const toggleBtn = document.getElementById('liveCallToggleBtn');
    const muteBtn = document.getElementById('liveMuteBtn') as HTMLButtonElement | null;

    if (toggleBtn) {
      if (this.orbState === 'connecting') {
        toggleBtn.textContent = 'Đang kết nối...';
        toggleBtn.className =
          'px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm shadow-sm transition cursor-pointer whitespace-nowrap shrink-0';
      } else if (this.isCallActive) {
        toggleBtn.textContent = 'Kết Thúc Cuộc Gọi';
        toggleBtn.className =
          'px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow-sm transition cursor-pointer whitespace-nowrap shrink-0';
      } else {
        toggleBtn.textContent = 'Bắt Đầu Hội Thoại Live';
        toggleBtn.className =
          'px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold text-sm shadow-sm transition cursor-pointer whitespace-nowrap shrink-0';
      }
    }

    if (muteBtn) {
      muteBtn.disabled = !this.isCallActive;
      muteBtn.textContent = this.isMicMuted ? 'Bật Micro' : 'Tắt Micro';
      muteBtn.className = !this.isCallActive
        ? 'px-4 py-2.5 rounded-xl bg-white/10 text-white/40 border border-white/10 text-xs font-bold cursor-not-allowed whitespace-nowrap shrink-0'
        : this.isMicMuted
        ? 'px-4 py-2.5 rounded-xl bg-rose-500/90 hover:bg-rose-500 text-white border border-rose-300/40 text-xs font-bold cursor-pointer transition whitespace-nowrap shrink-0'
        : 'px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white border border-white/25 text-xs font-bold cursor-pointer transition whitespace-nowrap shrink-0';
    }

    this.updateCallStatusBadge();
  }

  private updateCallStatusBadge() {
    const labelEl = document.getElementById('liveOrbStatusText');
    const hintEl = document.getElementById('liveOrbStatusSubtext');
    const dotEl = document.getElementById('liveOrbStatusDot');
    if (!labelEl || !hintEl || !dotEl) return;

    switch (this.orbState) {
      case 'connecting':
        labelEl.textContent = 'Đang kết nối Gemini Live...';
        hintEl.textContent = 'Đang mở luồng âm thanh hai chiều 16kHz / 24kHz';
        dotEl.className = 'w-2 h-2 rounded-full bg-amber-400 animate-pulse';
        break;
      case 'speaking':
        labelEl.textContent = 'Tiểu Bối đang nói';
        hintEl.textContent = 'Bạn có thể nói trực tiếp bất cứ lúc nào để ngắt lời tự nhiên';
        dotEl.className = 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse';
        break;
      case 'listening':
        labelEl.textContent = 'Đang lắng nghe bạn';
        hintEl.textContent = 'Hãy nói tiếng Trung hoặc hỏi bằng tiếng Việt qua Micro';
        dotEl.className = 'w-2 h-2 rounded-full bg-teal-300 animate-pulse';
        break;
      case 'muted':
        labelEl.textContent = 'Micro đang tắt';
        hintEl.textContent = 'Nhấn "Bật Micro" để tiếp tục nói hoặc gửi văn bản bên dưới';
        dotEl.className = 'w-2 h-2 rounded-full bg-rose-400';
        break;
      case 'error':
        labelEl.textContent = 'Cần kiểm tra kết nối';
        hintEl.textContent = 'Xem thông báo hướng dẫn ngay bên dưới để khắc phục';
        dotEl.className = 'w-2 h-2 rounded-full bg-rose-500';
        break;
      default:
        labelEl.textContent = 'Sẵn sàng đàm thoại';
        hintEl.textContent = 'Nhấn "Bắt Đầu Hội Thoại Live" để trò chuyện cùng Tiểu Bối';
        dotEl.className = 'w-2 h-2 rounded-full bg-emerald-300';
    }
  }

  private sampleOutputAmplitude(): number {
    if (!this.outputAnalyser || this.activeSources.size === 0) return 0;
    const data = new Uint8Array(this.outputAnalyser.frequencyBinCount);
    this.outputAnalyser.getByteTimeDomainData(data);
    let sumSq = 0;
    for (let i = 0; i < data.length; i++) {
      const normalized = (data[i] - 128) / 128;
      sumSq += normalized * normalized;
    }
    return Math.min(1, Math.sqrt(sumSq / data.length) * 3.8);
  }

  private startOrbAnimationLoop() {
    if (this.orbRafHandle !== null) cancelAnimationFrame(this.orbRafHandle);
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const renderFrame = () => {
      const canvas = document.getElementById('liveVoiceOrbCanvas') as HTMLCanvasElement | null;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          this.currentOutputLevel = this.sampleOutputAmplitude();
          const targetEnergy = computeOrbEnergy(
            this.currentInputLevel,
            this.currentOutputLevel,
            this.orbState
          );
          this.smoothOrbEnergy += (targetEnergy - this.smoothOrbEnergy) * 0.16;
          this.orbPhase += reducedMotion ? 0.012 : 0.035 + this.smoothOrbEnergy * 0.06;

          this.drawOrb(ctx, canvas.width, canvas.height, this.smoothOrbEnergy, this.orbPhase);
        }
      }
      this.orbRafHandle = requestAnimationFrame(renderFrame);
    };

    this.orbRafHandle = requestAnimationFrame(renderFrame);
  }

  private drawOrb(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    energy: number,
    phase: number
  ) {
    ctx.clearRect(0, 0, width, height);
    const cx = width / 2;
    const cy = height / 2;
    const baseRadius = Math.min(width, height) * 0.27;

    // Choose color palette by live state
    let primaryRgb = '16, 185, 129'; // emerald
    let secondaryRgb = '20, 184, 166'; // teal
    let highlightRgb = '251, 191, 36'; // amber

    if (this.orbState === 'speaking') {
      primaryRgb = '52, 211, 153';
      secondaryRgb = '245, 158, 11';
      highlightRgb = '253, 224, 71';
    } else if (this.orbState === 'listening') {
      primaryRgb = '45, 212, 191';
      secondaryRgb = '16, 185, 129';
      highlightRgb = '110, 231, 183';
    } else if (this.orbState === 'muted' || this.orbState === 'error') {
      primaryRgb = '244, 63, 94';
      secondaryRgb = '100, 116, 139';
      highlightRgb = '251, 113, 133';
    } else if (this.orbState === 'connecting') {
      primaryRgb = '245, 158, 11';
      secondaryRgb = '16, 185, 129';
      highlightRgb = '252, 211, 77';
    }

    // Outer ambient halo
    const haloRadius = baseRadius * (1.75 + energy * 0.65);
    const haloGrad = ctx.createRadialGradient(cx, cy, baseRadius * 0.3, cx, cy, haloRadius);
    haloGrad.addColorStop(0, `rgba(${primaryRgb}, ${0.28 + energy * 0.35})`);
    haloGrad.addColorStop(0.55, `rgba(${secondaryRgb}, ${0.12 + energy * 0.18})`);
    haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = haloGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, haloRadius, 0, Math.PI * 2);
    ctx.fill();

    // Organic harmonic waves (3 layered rings)
    const layers = [
      { mult: 1.0, freq: 3, amp: 5 + energy * 14, speed: 1.0, alpha: 0.45, color: secondaryRgb },
      { mult: 0.92, freq: 4, amp: 4 + energy * 11, speed: -1.3, alpha: 0.55, color: primaryRgb },
      { mult: 0.82, freq: 5, amp: 3 + energy * 8, speed: 1.7, alpha: 0.35, color: highlightRgb },
    ];

    for (const layer of layers) {
      ctx.beginPath();
      const steps = 72;
      for (let i = 0; i <= steps; i++) {
        const theta = (i / steps) * Math.PI * 2;
        const wave =
          Math.sin(theta * layer.freq + phase * layer.speed) * layer.amp * 0.6 +
          Math.cos(theta * (layer.freq + 2) - phase * layer.speed * 0.8) * layer.amp * 0.4;
        const r = baseRadius * layer.mult + energy * 10 + wave;
        const x = cx + Math.cos(theta) * r;
        const y = cy + Math.sin(theta) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = `rgba(${layer.color}, ${layer.alpha})`;
      ctx.lineWidth = 2 + energy * 1.5;
      ctx.stroke();
    }

    // Core luminous orb
    const coreRadius = baseRadius * (0.76 + energy * 0.14);
    const coreGrad = ctx.createRadialGradient(
      cx - coreRadius * 0.28,
      cy - coreRadius * 0.28,
      coreRadius * 0.1,
      cx,
      cy,
      coreRadius
    );
    coreGrad.addColorStop(0, `rgba(${highlightRgb}, 0.95)`);
    coreGrad.addColorStop(0.55, `rgba(${primaryRgb}, 0.9)`);
    coreGrad.addColorStop(1, `rgba(${secondaryRgb}, 0.85)`);

    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, coreRadius, 0, Math.PI * 2);
    ctx.fill();

    // Subtle specular ring
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, coreRadius * 0.96, 0, Math.PI * 2);
    ctx.stroke();
  }

  private renderReviewPanel() {
    const panel = document.getElementById('liveReviewPanel');
    if (!panel) return;

    if (this.reviewStatus === 'idle') {
      panel.classList.add('hidden');
      panel.innerHTML = '';
      return;
    }

    panel.classList.remove('hidden');

    if (this.reviewStatus === 'loading') {
      panel.innerHTML = `
        <div class="flex items-center gap-3 p-4 text-emerald-900">
          <div class="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin shrink-0"></div>
          <div>
            <div class="text-sm font-bold">Tiểu Bối đang tổng kết đánh giá sau cuộc hội thoại...</div>
            <div class="text-xs text-slate-500 mt-0.5">Phân tích phát âm, thanh điệu, lỗi dùng từ và gợi ý mẫu câu nói tự nhiên.</div>
          </div>
        </div>
      `;
      return;
    }

    if (this.reviewStatus === 'error') {
      panel.innerHTML = `
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-2">
          <div class="text-xs sm:text-sm text-rose-800 font-medium">${this.escapeHtml(
            this.reviewError || 'Không thể đánh giá phiên hội thoại.'
          )}</div>
          <div class="flex items-center gap-2 shrink-0">
            <button type="button" onclick="window.HanyuLiveTutor?.requestReview()" class="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold cursor-pointer whitespace-nowrap">
              Thử đánh giá lại
            </button>
            <button type="button" onclick="window.HanyuLiveTutor?.closeReview()" class="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer whitespace-nowrap">
              Đóng
            </button>
          </div>
        </div>
      `;
      return;
    }

    const r = this.reviewData;
    if (!r) return;

    const scoreCards = [
      { label: 'Tổng quan', val: r.overallScore, tone: 'text-emerald-800 bg-emerald-50 border-emerald-200' },
      { label: 'Phát âm & Thanh điệu', val: r.pronunciationScore, tone: 'text-teal-800 bg-teal-50 border-teal-200' },
      { label: 'Ngữ pháp & Từ vựng', val: r.grammarScore, tone: 'text-amber-900 bg-amber-50 border-amber-200' },
      { label: 'Phản xạ & Trôi chảy', val: r.fluencyScore, tone: 'text-slate-800 bg-slate-50 border-slate-200' },
    ];

    panel.innerHTML = `
      <div class="space-y-5">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div>
            <div class="text-xs font-bold text-emerald-700">Báo Cáo Sau Cuộc Hội Thoại · ${this.escapeHtml(this.lesson.level)}</div>
            <h4 class="text-base sm:text-lg font-extrabold text-slate-900 mt-0.5">Đánh giá Phát âm, Lỗi sai &amp; Gợi ý Mẫu câu</h4>
          </div>
          <div class="flex items-center gap-2">
            <button type="button" onclick="window.HanyuLiveTutor?.requestReview()" class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer whitespace-nowrap">
              Phân tích lại
            </button>
            <button type="button" onclick="window.HanyuLiveTutor?.closeReview()" class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold cursor-pointer whitespace-nowrap">
              Thu gọn
            </button>
          </div>
        </div>

        <!-- 4 Score Cards -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          ${scoreCards
            .map(
              (sc) => `
            <div class="p-3 rounded-xl border ${sc.tone}">
              <div class="text-[11px] font-semibold opacity-80">${sc.label}</div>
              <div class="text-2xl font-black font-mono tabular-nums mt-0.5">${sc.val}<span class="text-xs font-semibold opacity-70">/100</span></div>
            </div>
          `
            )
            .join('')}
        </div>

        ${
          r.summary
            ? `<p class="text-sm text-slate-700 leading-relaxed bg-slate-50 border border-slate-200 rounded-xl p-3.5">${this.escapeHtml(
                r.summary
              )}</p>`
            : ''
        }

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <!-- Pronunciation Feedback -->
          <div class="p-4 rounded-xl border border-slate-200 bg-white space-y-2.5">
            <h5 class="text-xs font-extrabold text-emerald-900">Đánh giá phát âm &amp; thanh điệu</h5>
            ${
              r.pronunciationFeedback.length > 0
                ? `<ul class="space-y-2 text-xs sm:text-sm text-slate-700">
                    ${r.pronunciationFeedback
                      .map(
                        (item) => `<li class="flex items-start gap-2"><span class="text-emerald-600 font-bold mt-0.5">•</span><span>${this.escapeHtml(item)}</span></li>`
                      )
                      .join('')}
                   </ul>`
                : `<p class="text-xs text-slate-500">Phát âm nhìn chung ổn định, hãy tiếp tục duy trì độ rõ từng thanh điệu.</p>`
            }
          </div>

          <!-- Attention Points -->
          <div class="p-4 rounded-xl border border-slate-200 bg-white space-y-2.5">
            <h5 class="text-xs font-extrabold text-amber-900">Những phần cần chú ý &amp; ghi nhớ</h5>
            ${
              r.attentionPoints.length > 0
                ? `<ul class="space-y-2 text-xs sm:text-sm text-slate-700">
                    ${r.attentionPoints
                      .map(
                        (item) => `<li class="flex items-start gap-2"><span class="text-amber-600 font-bold mt-0.5">•</span><span>${this.escapeHtml(item)}</span></li>`
                      )
                      .join('')}
                   </ul>`
                : `<p class="text-xs text-slate-500">Không có lưu ý đặc biệt thêm trong phiên vừa rồi.</p>`
            }
          </div>
        </div>

        <!-- Mistakes & Corrections -->
        <div class="space-y-2.5">
          <h5 class="text-xs font-extrabold text-slate-900">Lỗi đã gặp &amp; Cách nói chuẩn hơn</h5>
          ${
            r.mistakes.length > 0
              ? `<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                  ${r.mistakes
                    .map(
                      (m) => `
                    <div class="p-3.5 rounded-xl border border-rose-200/80 bg-rose-50/40 space-y-1.5">
                      ${
                        m.original
                          ? `<div class="text-xs text-rose-700"><span class="font-bold">Chưa chuẩn:</span> <span class="font-chinese">${this.escapeHtml(
                              m.original
                            )}</span></div>`
                          : ''
                      }
                      <div class="flex items-start justify-between gap-2">
                        <div>
                          <div class="text-sm font-bold text-emerald-900 font-chinese">${this.escapeHtml(
                            m.corrected
                          )}</div>
                          ${
                            m.pinyin
                              ? `<div class="text-xs text-emerald-700 font-medium">${this.escapeHtml(
                                  m.pinyin
                                )}</div>`
                              : ''
                          }
                        </div>
                        ${
                          m.corrected
                            ? `<button type="button" onclick="window.speakText?.('${this.escapeJs(
                                m.corrected
                              )}')" class="px-2.5 py-1 rounded-lg bg-white border border-emerald-200 hover:bg-emerald-50 text-emerald-800 text-[11px] font-bold shrink-0 cursor-pointer">Nghe chuẩn</button>`
                            : ''
                        }
                      </div>
                      <p class="text-xs text-slate-600 leading-relaxed">${this.escapeHtml(
                        m.explanation
                      )}</p>
                    </div>
                  `
                    )
                    .join('')}
                </div>`
              : `<p class="text-xs text-emerald-800 bg-emerald-50/60 border border-emerald-200 rounded-xl p-3">Rất tốt! Không phát hiện lỗi ngữ pháp nghiêm trọng nào trong cuộc trò chuyện vừa rồi.</p>`
          }
        </div>

        <!-- Suggested Sentences -->
        <div class="space-y-2.5">
          <h5 class="text-xs font-extrabold text-slate-900">Gợi ý mẫu câu nói hay để dùng tiếp</h5>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            ${r.suggestedPhrases
              .map(
                (p) => `
              <div class="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/40 flex flex-col justify-between gap-2">
                <div>
                  <div class="font-chinese font-bold text-sm text-slate-900">${this.escapeHtml(
                    p.hanzi
                  )}</div>
                  ${
                    p.pinyin
                      ? `<div class="text-xs text-emerald-700 font-medium mt-0.5">${this.escapeHtml(
                          p.pinyin
                        )}</div>`
                      : ''
                  }
                  <div class="text-xs text-slate-700 font-medium mt-1">${this.escapeHtml(
                    p.vietnamese
                  )}</div>
                  ${
                    p.usageNote
                      ? `<div class="text-[11px] text-slate-500 mt-1">${this.escapeHtml(
                          p.usageNote
                        )}</div>`
                      : ''
                  }
                </div>
                <div class="flex items-center gap-2 pt-2 border-t border-emerald-100">
                  <button type="button" onclick="window.speakText?.('${this.escapeJs(
                    p.hanzi
                  )}')" class="px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-[11px] font-bold cursor-pointer">Nghe mẫu</button>
                  <button type="button" onclick="window.HanyuLiveTutor?.insertStarter('${this.escapeJs(
                    p.hanzi
                  )}')" class="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-bold cursor-pointer">Thử câu này</button>
                </div>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      </div>
    `;
  }

  private escapeHtml(str: string): string {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private escapeJs(str: string): string {
    return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }
}

const controller = new LiveTutorController();
window.HanyuLiveTutor = {
  init: () => controller.init(),
  syncLesson: (lesson) => controller.syncLesson(lesson),
  startOrStopCall: () => controller.startOrStopCall(),
  toggleMute: () => controller.toggleMute(),
  setScenario: (id) => controller.setScenario(id),
  setVoice: (id) => controller.setVoice(id),
  setLanguageMode: (mode) => controller.setLanguageMode(mode),
  setSpeechPace: (pace) => controller.setSpeechPace(pace),
  pronounceVocab: (hanzi, pinyin) => controller.pronounceVocab(hanzi, pinyin),
  sendTextMessage: (txt) => controller.sendTextMessage(txt),
  replayTurn: (id, rate) => controller.replayTurn(id, rate),
  clearTranscript: () => controller.clearTranscript(),
  insertStarter: (hanzi) => controller.insertStarter(hanzi),
  requestReview: () => controller.requestReview(),
  closeReview: () => controller.closeReview(),
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => controller.init());
} else {
  controller.init();
}

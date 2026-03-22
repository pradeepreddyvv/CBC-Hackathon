// ============================================================
// Speechmatics Realtime STT Client (WebSocket-based)
// Replaces browser SpeechRecognition with Speechmatics API
// ============================================================

const SM_RT_URL = "wss://eu.rt.speechmatics.com/v2";

export interface SpeechmaticsConfig {
  apiKey: string;
  language?: string;
  sampleRate?: number;
  enablePartials?: boolean;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  onStarted?: () => void;
  onEnded?: () => void;
}

export class SpeechmaticsSTT {
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private config: SpeechmaticsConfig;
  private seqNo = 0;
  private finalTranscript = "";
  private started = false;

  constructor(config: SpeechmaticsConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    const apiKey = this.config.apiKey;
    if (!apiKey) {
      this.config.onError?.("No Speechmatics API key");
      return;
    }

    // Get temp key for browser WebSocket auth
    const tempKey = await this.getTempKey(apiKey);
    if (!tempKey) {
      // Fallback: try direct connection with JWT param
      this.config.onError?.("Failed to get temporary key");
      return;
    }

    // Open WebSocket
    this.ws = new WebSocket(`${SM_RT_URL}?jwt=${tempKey}`);
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen = () => {
      // Send StartRecognition
      const startMsg = {
        message: "StartRecognition",
        audio_format: {
          type: "raw",
          encoding: "pcm_f32le",
          sample_rate: this.config.sampleRate || 16000,
        },
        transcription_config: {
          language: this.config.language || "en",
          diarization: "none",
          operating_point: "enhanced",
          max_delay_mode: "flexible",
          max_delay: 1,
          enable_partials: this.config.enablePartials !== false,
          enable_entities: true,
        },
      };
      this.ws!.send(JSON.stringify(startMsg));
    };

    this.ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        const msg = JSON.parse(event.data);
        this.handleMessage(msg);
      }
    };

    this.ws.onerror = () => {
      this.config.onError?.("WebSocket error");
    };

    this.ws.onclose = () => {
      this.config.onEnded?.();
    };
  }

  private async getTempKey(apiKey: string): Promise<string | null> {
    try {
      // Call our server-side API to get a temp key
      const res = await fetch("/api/speechmatics/temp-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.key_value || null;
    } catch {
      return null;
    }
  }

  private handleMessage(msg: { message: string; metadata?: { transcript?: string }; results?: { alternatives?: { content: string }[] }[]; type?: string; reason?: string }) {
    switch (msg.message) {
      case "RecognitionStarted":
        this.started = true;
        this.config.onStarted?.();
        this.startAudioCapture();
        break;

      case "AddPartialTranscript":
        if (msg.metadata?.transcript) {
          this.config.onTranscript?.(
            this.finalTranscript + msg.metadata.transcript,
            false
          );
        }
        break;

      case "AddTranscript":
        if (msg.metadata?.transcript) {
          this.finalTranscript += msg.metadata.transcript;
          this.config.onTranscript?.(this.finalTranscript, true);
        }
        break;

      case "AudioAdded":
        // Server acknowledged audio chunk
        break;

      case "Error":
        this.config.onError?.(msg.reason || "Speechmatics error");
        break;

      case "Warning":
        console.warn("[Speechmatics] Warning:", msg.reason);
        break;

      case "EndOfTranscript":
        this.config.onEnded?.();
        break;
    }
  }

  private async startAudioCapture(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const sampleRate = this.config.sampleRate || 16000;
      this.audioContext = new AudioContext({ sampleRate });
      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);

      // Use ScriptProcessorNode as fallback (AudioWorklet needs HTTPS + setup)
      const bufferSize = 4096;
      const scriptNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

      scriptNode.onaudioprocess = (e) => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.started) return;
        const inputData = e.inputBuffer.getChannelData(0);
        // Send as binary PCM f32le
        const buffer = new Float32Array(inputData);
        this.ws.send(buffer.buffer);
        this.seqNo++;
      };

      this.sourceNode.connect(scriptNode);
      scriptNode.connect(this.audioContext.destination);
    } catch (err) {
      this.config.onError?.(`Audio capture failed: ${err}`);
    }
  }

  stop(): string {
    // Send EndOfStream
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        message: "EndOfStream",
        last_seq_no: this.seqNo,
      }));
    }

    // Clean up audio
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }

    // Close WebSocket after a short delay for EndOfTranscript
    setTimeout(() => {
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
    }, 1000);

    const result = this.finalTranscript;
    this.finalTranscript = "";
    this.seqNo = 0;
    this.started = false;
    return result;
  }

  getFinalTranscript(): string {
    return this.finalTranscript;
  }
}

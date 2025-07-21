// 🎙️ Pipeline de Voz Profissional com Web Audio API Real
// Microfone → Web Audio API → VAD → Vosk.js (ASR local) → Gemma → Kokoro TTS → Playback (ref para AEC)

// 1. 🎧 Captura de Áudio via Web Audio API
export async function getAudioContextAndMic() {
    try {
        console.log('[Pipeline] Solicitando permissão do microfone...');
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const audioContext = new AudioContext({ sampleRate: 16000 });
        const source = audioContext.createMediaStreamSource(stream);
        if (window.log) window.log('🎤 Microfone ativado com sucesso!');
        console.log('[Pipeline] Microfone ativado e AudioContext criado.');
        return { audioContext, source };
    } catch (err) {
        if (window.log) window.log('❌ Erro ao ativar microfone: ' + (err.message || err), 'error');
        console.error('[Mic] Erro ao iniciar Web Audio:', err);
        throw new Error('Permissão negada ou microfone indisponível.');
    }
}

// 2. 🔊 Processador de Áudio (AEC etc.) – placeholder
export class AudioProcessor {
    constructor() {
        this.refBuffer = null;
    }

    process(micFloat32, refBuffer = null) {
        return micFloat32; // placeholder, retorna direto por enquanto
    }

    setReference(refBuffer) {
        this.refBuffer = refBuffer;
    }
}

// 3. 🧠 VAD AVANÇADO PRÓPRIO (energia + zero-crossing + adaptativo)
class AdvancedVAD {
    constructor({ sampleRate = 16000, onVoiceStart, onVoiceEnd, minVoiceMs = 200, silenceMs = 600 } = {}) {
        this.sampleRate = sampleRate;
        this.onVoiceStart = onVoiceStart;
        this.onVoiceEnd = onVoiceEnd;
        this.minVoiceFrames = Math.floor((minVoiceMs / 1000) * sampleRate / 512);
        this.silenceFrames = Math.floor((silenceMs / 1000) * sampleRate / 512);
        this.reset();
    }
    reset() {
        this.voiceActive = false;
        this.voiceFrames = 0;
        this.silenceFramesCount = 0;
        this.lastSpeechBuffer = [];
    }
    process(buffer) {
        // buffer: Float32Array
        const energy = this.getRMS(buffer);
        const zcr = this.getZCR(buffer);
        // Critério adaptativo: energia > 0.02 e zcr > 0.02
        const isSpeech = energy > 0.02 && zcr > 0.02;
        if (isSpeech) {
            this.voiceFrames++;
            this.silenceFramesCount = 0;
            this.lastSpeechBuffer.push(...buffer);
            if (!this.voiceActive && this.voiceFrames > this.minVoiceFrames) {
                this.voiceActive = true;
                console.log('[VAD] Início da fala detectado.');
                this.onVoiceStart && this.onVoiceStart();
            }
        } else if (this.voiceActive) {
            this.silenceFramesCount++;
            if (this.silenceFramesCount > this.silenceFrames) {
                this.voiceActive = false;
                // Copia o buffer de fala detectada
                const speechAudio = new Float32Array(this.lastSpeechBuffer);
                this.lastSpeechBuffer = [];
                this.voiceFrames = 0;
                this.silenceFramesCount = 0;
                console.log('[VAD] Fim da fala detectado.');
                this.onVoiceEnd && this.onVoiceEnd(speechAudio);
            }
        } else {
            this.voiceFrames = 0;
            this.lastSpeechBuffer = [];
        }
    }
    getRMS(buffer) {
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
        return Math.sqrt(sum / buffer.length);
    }
    getZCR(buffer) {
        let zc = 0;
        for (let i = 1; i < buffer.length; i++) {
            if ((buffer[i - 1] >= 0 && buffer[i] < 0) || (buffer[i - 1] < 0 && buffer[i] >= 0)) zc++;
        }
        return zc / buffer.length;
    }
}

// 4. 📝 ASR com Vosk.js
let voskModel = null;

export async function loadVoskModel(modelUrl = '/model/model.tar.gz') {
    try {
        voskModel = await window.Vosk.createModel(modelUrl);
        return voskModel;
    } catch (e) {
        console.error('[Vosk] Erro ao carregar:', e);
        throw new Error('Falha ao carregar modelo.');
    }
}

export async function transcribeWithVosk(float32Audio) {
    if (!voskModel) throw new Error('Modelo não carregado.');
    const recognizer = new voskModel.KaldiRecognizer();
    console.log('[ASR] Iniciando transcrição com Vosk...');
    return new Promise((resolve, reject) => {
        try {
            recognizer.on('result', (msg) => {
                console.log('[ASR] Resultado da transcrição:', msg?.result?.text);
                resolve(msg?.result?.text?.trim() || '');
            });
            recognizer.acceptWaveform(float32Audio);
        } catch (e) {
            console.error('[Vosk] Erro no reconhecimento:', e);
            reject(e);
        }
    });
}

// 5. 🤖 Gemma API
const GEMMA_URL = 'http://apibybritto-v-jbcqp2-7379bf-168-231-95-211.traefik.me/api/generate';
const SYSTEM_PROMPT = 'Você é um assistente virtual brasileiro amigável e útil. Responda de forma natural e concisa em português.';

export async function processWithGemma(userText) {
    const prompt = `${SYSTEM_PROMPT}\n\nUsuário: ${userText}\n\nAssistente:`;
    try {
        console.log('[IA] Enviando texto para Gemma:', userText);
        const res = await fetch(GEMMA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'gemma3:4b', prompt })
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        console.log('[IA] Resposta da Gemma:', data.response);
        return data.response?.trim() || '';
    } catch (e) {
        console.error('[Gemma] Erro:', e);
        return 'Desculpe, não consegui responder.';
    }
}

// 6. 🗣️ Kokoro TTS
const KOKORO_TTS_URL = 'http://apibybritto-b-mubg35-1e8c25-168-231-95-211.traefik.me/v1/audio/speech';

export async function synthesizeWithKokoro(text) {
    const payload = {
        text,
        voice: 'pf_dora',
        speed: 1.0,
        pitch: 1.0,
        volume: 1.0
    };
    try {
        console.log('[TTS] Enviando texto para Kokoro TTS:', text);
        const res = await fetch(KOKORO_TTS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(await res.text());
        const blob = await res.blob();
        console.log('[TTS] Áudio TTS recebido.');
        return blob;
    } catch (e) {
        console.error('[Kokoro] Erro:', e);
        throw e;
    }
}

// 7. 🔊 Reprodução
export function playTTS(blob, onRefBuffer = null) {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.oncanplaythrough = () => {
        console.log('[Player] Iniciando reprodução do TTS...');
        audio.play().catch(err => console.error('[Player] Erro:', err));
    };
    audio.onended = () => {
        console.log('[Player] Fim da reprodução do TTS.');
        URL.revokeObjectURL(url);
    };
}

// 8. 🚀 Pipeline com Web Audio API e VAD próprio
export async function mainPipeline() {
    try {
        console.log('[Pipeline] Iniciando pipeline de voz...');
        await loadVoskModel();
        const { audioContext, source } = await getAudioContextAndMic();
        const processor = audioContext.createScriptProcessor(512, 1, 1);
        const audioProc = new AudioProcessor();
        let isProcessing = false;
        source.connect(processor);
        processor.connect(audioContext.destination);
        const vad = new AdvancedVAD({
            sampleRate: 16000,
            onVoiceStart: () => console.log('[Pipeline] VAD: fala detectada!'),
            onVoiceEnd: async (audio) => {
                if (isProcessing) return;
                isProcessing = true;
                console.log('[Pipeline] VAD: fim da fala, processando...');
                try {
                    const cleaned = audioProc.process(audio, audioProc.refBuffer);
                    const text = await transcribeWithVosk(cleaned);
                    console.log('[Pipeline] Texto reconhecido:', text);
                    if (text) {
                        const response = await processWithGemma(text);
                        console.log('[Pipeline] Resposta da IA:', response);
                        const blob = await synthesizeWithKokoro(response);
                        console.log('[Pipeline] TTS gerado, reproduzindo...');
                        playTTS(blob, (ref) => audioProc.setReference(ref));
                    }
                } catch (e) {
                    console.error('[Pipeline] Erro:', e);
                }
                setTimeout(() => { isProcessing = false; }, 2000);
            }
        });
        processor.onaudioprocess = (event) => {
            const input = event.inputBuffer.getChannelData(0);
            vad.process(input);
        };
        console.log('[Pipeline] Pipeline de voz iniciado com VAD próprio. Fale algo!');
    } catch (e) {
        console.error('[Pipeline] Erro:', e);
    }
}
 
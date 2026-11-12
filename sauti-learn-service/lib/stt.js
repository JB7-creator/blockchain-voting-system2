/**
 * Sauti Learn - Speech-to-Text adapters
 *
 * Provider routing (by the language the USER declared at init, not auto-detect):
 *  - en / sw : Google STT (WEBM_OPUS & FLAC) -> Azure STT (WAV/PCM) -> Whisper API (webm/mp3/wav)
 *  - kik     : Python sidecar (MMS kik / Wav2Vec2-BERT Kikuyu ASR) only.
 *              If the sidecar is absent we return null and the caller answers
 *              in Swahili with a clear "voice unsupported" note.
 *
 * No key configured anywhere -> returns null -> caller falls back to the
 * offline FAQ (text-only). The service never throws to the UI.
 */

const {
  normalizeLang,
} = require('./i18n');

const TIMEOUT_MS = Number(process.env.SAUTI_REQUEST_TIMEOUT_MS || 12000);

/** Tiny format sniffer so we can pick a provider that accepts the payload. */
function sniffFormat(buf) {
    if (!Buffer.isBuffer(buf) || buf.length < 12) return 'unknown';
    if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WAVE') return 'wav';
    if (buf.toString('latin1', 0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return 'mp3';
    if (buf.toString('latin1', 0, 4) === 'OggS') return 'ogg';
    if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'webm';
    if (buf.toString('latin1', 4, 8) === 'ftyp') return 'mp4';
    return 'unknown';
}

async function postJson(url, body, headers = {}, timeoutMs = TIMEOUT_MS) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => '')}`);
    return res.json();
}

/* ── Google Cloud Speech-to-Text ─────────────────────────────────────────── */
async function googleStt(audioBuffer, lang) {
    const key = process.env.GOOGLE_STT_API_KEY;
    if (!key) return null;
    const fmt = sniffFormat(audioBuffer);
    let encoding, sampleRateHertz = 16000;
    if (fmt === 'wav') encoding = 'LINEAR16';
    else if (fmt === 'ogg' || fmt === 'webm') encoding = 'WEBM_OPUS';
    else if (fmt === 'mp3' || fmt === 'mp4') encoding = 'MP3';
    else encoding = 'FLAC'; // unknown: try FLAC (most browsers record webm anyway)

    // Best available locale for the declared language
    const languageCode = lang === 'sw' ? 'sw-KE' : 'en-KE';

    const payload = {
        config: {
            encoding,
            sampleRateHertz: fmt === 'wav' ? undefined : undefined, // opus/mp3 streams are self-describing enough
            languageCode,
            alternativeLanguageCodes: lang === 'sw' ? ['sw-TZ'] : ['en-US', 'en-GB'],
            model: 'latest_long',
        },
        audio: { content: audioBuffer.toString('base64') },
    };

    try {
        const data = await postJson(
            `https://speech.googleapis.com/v1/speech:recognize?key=${key}`,
            payload
        );
        const text = data?.results?.[0]?.alternatives?.[0]?.transcript?.trim();
        return text ? { text, provider: 'google-stt', lang } : null;
    } catch (err) {
        console.warn('[Sauti][STT] google:', err.message);
        return null;
    }
}

/* ── OpenAI Whisper API (accepts webm/mp3/wav/m4a) ───────────────────────── */
async function whisperStt(audioBuffer, lang) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return null;
    const fmt = sniffFormat(audioBuffer);
    const mimeMap = { webm: 'audio/webm', mp3: 'audio/mpeg', mp4: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg' };
    const mime = mimeMap[fmt] || 'audio/webm';

    const form = new FormData();
    form.append('file', new Blob([audioBuffer], { type: mime }), `audio.${fmt}`);
    form.append('model', 'whisper-1');
    // Whisper expects language hints only when confident; Kikuyu is NOT supported by it.
    if (lang !== 'kik') form.append('language', lang === 'sw' ? 'sw' : 'en');

    try {
        const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}` },
            body: form,
            signal: AbortSignal.timeout(TIMEOUT_MS * 2), // uploads take longer
        });
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();
        const text = (data.text || '').trim();
        return text ? { text, provider: 'whisper', lang } : null;
    } catch (err) {
        console.warn('[Sauti][STT] whisper:', err.message);
        return null;
    }
}

/* ── Groq Whisper ASR (multilingual, accepts webm/mp3/wav/m4a) ────────────── */
async function groqStt(audioBuffer, lang) {
    const key = process.env.GROQ_API_KEY;
    if (!key) return null;
    const fmt = sniffFormat(audioBuffer);
    const mimeMap = { webm: 'audio/webm', mp3: 'audio/mpeg', mp4: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg' };
    const mime = mimeMap[fmt] || 'audio/webm';

    const form = new FormData();
    form.append('file', new Blob([audioBuffer], { type: mime }), `audio.${fmt}`);
    form.append('model', process.env.GROQ_ASR_MODEL || 'whisper-large-v3');
    form.append('response_format', 'json');
    if (lang) form.append('language', lang === 'sw' ? 'sw' : 'en');

    try {
        const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}` },
            body: form,
            signal: AbortSignal.timeout(TIMEOUT_MS * 2),
        });
        if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => '')}`);
        const data = await res.json();
        const text = (data.text || '').trim();
        return text ? { text, provider: 'groq-whisper', lang } : null;
    } catch (err) {
        console.warn('[Sauti][STT] groq:', err.message);
        return null;
    }
}

/* ── Gemini audio understanding (multilingual, incl. Kikuyu attempts) ────── */
async function geminiStt(audioBuffer, lang) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return null;
    const fmt = sniffFormat(audioBuffer);
    const mimeMap = { webm: 'audio/webm', mp3: 'audio/mp3', mp4: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg' };
    const mime = mimeMap[fmt] || 'audio/webm';
    const model = process.env.GEMINI_ASR_MODEL || 'gemini-3.5-flash';
    const langName = lang === 'sw' ? 'Kiswahili' : lang === 'kik' ? 'Gikuyu' : 'English';

    try {
        const data = await postJson(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
            {
                contents: [{
                    role: 'user',
                    parts: [
                        { inlineData: { mimeType: mime, data: audioBuffer.toString('base64') } },
                        { text: `Transcribe this speech exactly as spoken in ${langName}. Reply with ONLY the transcript, no commentary.` },
                    ],
                }],
                generationConfig: { temperature: 0, maxOutputTokens: 200 },
            }
        );
        const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('')?.trim();
        return text ? { text, provider: 'gemini-audio', lang } : null;
    } catch (err) {
        console.warn('[Sauti][STT] gemini:', String(err.message).slice(0, 120));
        return null;
    }
}

/* ── Azure AI Speech (REST, short audio; WAV/PCM 16k) ────────────────────── */
async function azureStt(audioBuffer, lang) {
    const key = process.env.AZURE_SPEECH_KEY;
    const region = process.env.AZURE_SPEECH_REGION;
    if (!key || !region) return null;
    const fmt = sniffFormat(audioBuffer);
    if (fmt !== 'wav') return null; // REST endpoint only accepts WAV/PCM containers
    const locale = lang === 'sw'
        ? (process.env.AZURE_STT_LOCALE_SW || 'sw-KE')
        : (process.env.AZURE_STT_LOCALE_EN || 'en-KE');

    try {
        const res = await fetch(
            `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${locale}`,
            {
                method: 'POST',
                headers: {
                    'Ocp-Apim-Subscription-Key': key,
                    'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
                    Accept: 'application/json',
                },
                body: audioBuffer,
                signal: AbortSignal.timeout(TIMEOUT_MS),
            }
        );
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();
        const text = (data.DisplayText || '').trim();
        return text ? { text, provider: 'azure-stt', lang } : null;
    } catch (err) {
        console.warn('[Sauti][STT] azure:', err.message);
        return null;
    }
}

/* ── Kikuyu sidecar (self-hosted MMS/W2V-BERT ASR) ───────────────────────── */
async function sidecarStt(audioBuffer, lang) {
    const base = process.env.SIDECAR_URL;
    if (!base) return null;
    try {
        const data = await postJson(`${base}/asr`, {
            audioBase64: audioBuffer.toString('base64'),
            lang,
        });
        const text = (data.text || '').trim();
        return text ? { text, provider: 'sidecar-mms-kik', lang } : null;
    } catch (err) {
        console.warn('[Sauti][STT] sidecar:', err.message);
        return null;
    }
}

/**
 * Transcribe caller audio in the language they declared.
 * @returns {Promise<{text:string, provider:string, lang:string}|null>}
 */
async function transcribe(audioBuffer, declaredLang) {
    const lang = normalizeLang(declaredLang);
    if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length < 64) return null;

    if (lang === 'kik') {
        // Try Gemini audio understanding first (no 2.4 GB model download),
        // then the dedicated Kikuyu ASR sidecar.
        return (await geminiStt(audioBuffer, 'kik')) || (await sidecarStt(audioBuffer, 'kik'));
    }

    return (
        (await googleStt(audioBuffer, lang)) ||
        (await groqStt(audioBuffer, lang)) ||
        (await whisperStt(audioBuffer, lang)) ||
        (await geminiStt(audioBuffer, lang)) ||
        (await azureStt(audioBuffer, lang))
    );
}

module.exports = { transcribe, sniffFormat };

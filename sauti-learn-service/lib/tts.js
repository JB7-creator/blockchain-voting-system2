/**
 * Sauti Learn - Text-to-Speech adapters (English & Kiswahili)
 *
 * Voices prioritized for natural cadence, clarity, and low latency:
 *  1. ElevenLabs (natural human civic voice, if configured)
 *  2. OpenAI TTS (natural voice, e.g. 'coral' or 'nova')
 *  3. Gemini TTS (native Kenyan English & Swahili support via raw PCM -> WAV)
 *  4. Groq Orpheus TTS (English)
 *  5. Azure Neural TTS ('sw-KE' / 'en-KE')
 *  6. Google Cloud TTS ('sw-KE' / 'en-KE')
 *
 * If no server provider is available, returns null so the browser's native
 * SpeechSynthesis or IVR AT <Say> can seamlessly take over.
 */

const { normalizeLang } = require('./i18n');

const TIMEOUT_MS = Number(process.env.SAUTI_REQUEST_TIMEOUT_MS || 12000);

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

function xmlEscape(str) {
    return String(str || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/* ── PCM to WAV packager ─────────────────────────────────────────────────── */
function pcmToWav(pcm, sampleRate, channels = 1, bitsPerSample = 16) {
    const byteRate = (sampleRate * channels * bitsPerSample) / 8;
    const blockAlign = (channels * bitsPerSample) / 8;
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + pcm.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);           // PCM format
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(pcm.length, 40);
    return Buffer.concat([header, pcm]);
}

/* ── Gemini TTS (speaks Swahili and English natively) ───────────────────── */
async function geminiTts(text, lang) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return null;

    const models = [
        process.env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-tts',
        'gemini-3.8-flash-lite-tts',
        'gemini-3.1-flash-tts-preview',
    ];

    for (const model of [...new Set(models)]) {
        try {
            const data = await postJson(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
                {
                    contents: [{ role: 'user', parts: [{ text }] }],
                    generationConfig: { responseModalities: ['AUDIO'] },
                }
            );
            const inline = data?.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData;
            if (!inline?.data) continue;

            const mime = String(inline.mimeType || '');
            const rateMatch = mime.match(/rate=(\d+)/);
            const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;
            const pcm = Buffer.from(inline.data, 'base64');
            const wav = pcmToWav(pcm, sampleRate);
            return { audioBase64: wav.toString('base64'), mime: 'audio/wav', provider: 'gemini-tts', lang };
        } catch (err) {
            console.warn(`[Sauti][TTS] gemini(${model}):`, String(err.message).slice(0, 120));
        }
    }
    return null;
}

/* ── OpenAI TTS ─────────────────────────────────────────────────────────── */
async function openaiTts(text, lang) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return null;
    const fmt = process.env.OPENAI_TTS_FORMAT || 'mp3';
    try {
        const res = await fetch('https://api.openai.com/v1/audio/speech', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
                voice: process.env.OPENAI_TTS_VOICE || 'coral',
                input: text,
                response_format: fmt,
                instructions: 'Speak warmly, calmly, and clearly, like a helpful Kenyan civic-education presenter.',
            }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => '')}`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (!buf.length) return null;
        return { audioBase64: buf.toString('base64'), mime: `audio/${fmt}`, provider: 'openai-tts', lang };
    } catch (err) {
        console.warn('[Sauti][TTS] openai:', err.message);
        return null;
    }
}

/* ── ElevenLabs TTS ─────────────────────────────────────────────────────── */
async function elevenLabsTts(text, lang) {
    const key = process.env.ELEVENLABS_API_KEY;
    const voiceId = process.env.ELEVENLABS_VOICE_ID;
    if (!key || !voiceId) return null;
    try {
        const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
            method: 'POST',
            headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text,
                model_id: process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2',
                voice_settings: { stability: 0.5, similarity_boost: 0.8 },
            }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (!buf.length) return null;
        return { audioBase64: buf.toString('base64'), mime: 'audio/mpeg', provider: 'elevenlabs', lang };
    } catch (err) {
        console.warn('[Sauti][TTS] elevenlabs:', err.message);
        return null;
    }
}

/* ── Groq TTS (English fast voice) ──────────────────────────────────────── */
async function groqTts(text) {
    const key = process.env.GROQ_API_KEY;
    if (!key) return null;
    try {
        const res = await fetch('https://api.groq.com/openai/v1/audio/speech', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'canopylabs/orpheus-v1-english',
                voice: 'troy',
                input: text,
                response_format: 'wav',
            }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (!buf.length) return null;
        return { audioBase64: buf.toString('base64'), mime: 'audio/wav', provider: 'groq-tts', lang: 'en' };
    } catch (err) {
        console.warn('[Sauti][TTS] groq:', err.message);
        return null;
    }
}

/* ── Azure neural TTS ('sw-KE' / 'en-KE') ────────────────────────────────── */
async function azureTts(text, lang) {
    const key = process.env.AZURE_SPEECH_KEY;
    const region = process.env.AZURE_SPEECH_REGION;
    if (!key || !region) return null;
    const locale = lang === 'sw' ? 'sw-KE' : 'en-KE';

    const ssml = `<?xml version="1.0" encoding="UTF-8"?>
<speak version="1.0" xml:lang="${locale}">
  <voice xml:lang="${locale}">${xmlEscape(text)}</voice>
</speak>`;

    try {
        const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
            method: 'POST',
            headers: {
                'Ocp-Apim-Subscription-Key': key,
                'Content-Type': 'application/ssml+xml',
                'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
                'User-Agent': 'SautiLearn/1.0',
            },
            body: ssml,
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (!buf.length) return null;
        return { audioBase64: buf.toString('base64'), mime: 'audio/mpeg', provider: 'azure-tts', lang };
    } catch (err) {
        console.warn('[Sauti][TTS] azure:', err.message);
        return null;
    }
}

/* ── Google Cloud TTS ('sw-KE' / 'en-KE') ────────────────────────────────── */
async function googleTts(text, lang) {
    const key = process.env.GOOGLE_STT_API_KEY;
    if (!key) return null;
    const languageCode = lang === 'sw' ? 'sw-KE' : 'en-KE';
    try {
        const data = await postJson(
            `https://texttospeech.googleapis.com/v1/text:synthesize?key=${key}`,
            {
                input: { text },
                voice: { languageCode },
                audioConfig: { audioEncoding: 'MP3' },
            }
        );
        if (!data.audioContent) return null;
        return { audioBase64: data.audioContent, mime: 'audio/mpeg', provider: 'google-tts', lang };
    } catch (err) {
        console.warn('[Sauti][TTS] google:', err.message);
        return null;
    }
}

/**
 * Synthesize speech for text in 'en' or 'sw'.
 */
async function synthesize(text, declaredLang) {
    const lang = normalizeLang(declaredLang);
    const clean = String(text || '').trim().slice(0, Number(process.env.SAUTI_MAX_ANSWER_CHARS || 300));
    if (!clean) return null;

    return (
        (await elevenLabsTts(clean, lang)) ||
        (await openaiTts(clean, lang)) ||
        (await geminiTts(clean, lang)) ||
        (lang === 'en' ? await groqTts(clean) : null) ||
        (await azureTts(clean, lang)) ||
        (await googleTts(clean, lang))
    );
}

/** Africa's Talking <Say> XML fragment. */
function sayXml(text, lang) {
    return `<Say>${xmlEscape(text)}</Say>`;
}

module.exports = { synthesize, sayXml };

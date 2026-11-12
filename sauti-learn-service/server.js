/**
 * Sauti Learn Service - DeVote Kenya voice-learning module
 * =========================================================
 * Standalone microservice. Languages: English (en), Kiswahili (sw), Gikuyu (kik).
 *
 * Routes
 *   GET  /health                      -> service status + which providers are active
 *   GET  /languages                   -> [{code,label,voiceSupported}]
 *   POST /ask        {question,lang}  -> {answer,lang,provider,suggestions}
 *   POST /voice/ask  {audioBase64,lang} -> {transcript, answer, tts{audioBase64,mime}}
 *   POST /tts        {text,lang}      -> {audioBase64,mime,provider}
 *   GET  /lesson?topic=&lang=        -> short lesson text (USSD-safe <=182 chars)
 *   GET  /lesson/full?topic=&lang=   -> full lesson text (SMS-safe)
 *
 * Safety rails: request timeout wrappers, in-memory rate limit, per-question
 * answer cache (cost control), and a guaranteed text answer even with zero
 * API keys configured (offline FAQ mode). No voter PII is ever accepted here.
 */

require('dotenv').config();
const express = require('express');

const { LANGS, LANG_LABELS, normalizeLang, t } = require('./lib/i18n');
const { FAQ, suggestionsFor } = require('./lib/faq');
const { transcribe } = require('./lib/stt');
const { synthesize } = require('./lib/tts');
const { answer } = require('./lib/llm');

const app = express();
app.use(express.json({ limit: '12mb' })); // audio payloads arrive base64-encoded

// ── CORS ──────────────────────────────────────────────────────────────────
// The React app (localhost:3000 in dev, Netlify in prod) calls this service
// directly from the browser, so cross-origin headers are mandatory.
// Configure SAUTI_ALLOWED_ORIGINS="https://site.com,http://localhost:3000" in prod.
const ALLOWED_ORIGINS = (process.env.SAUTI_ALLOWED_ORIGINS || '*')
    .split(',').map(s => s.trim()).filter(Boolean);

app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (!origin || ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) {
        res.set('Access-Control-Allow-Origin', origin || '*');
        res.set('Vary', 'Origin');
    }
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.set('Access-Control-Max-Age', '86400');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

const PORT = Number(process.env.PORT || 5050);
const MAX_AUDIO_SECONDS = Number(process.env.SAUTI_MAX_AUDIO_SECONDS || 30);

/* ── Answer cache (same question+language costs one LLM call, not many) ── */
const answerCache = new Map();
const ANSWER_CACHE_TTL_MS = 10 * 60 * 1000;
const ANSWER_CACHE_MAX = 500;

function cacheGet(key) {
    const hit = answerCache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.at > ANSWER_CACHE_TTL_MS) {
        answerCache.delete(key);
        return null;
    }
    return hit.value;
}

function cacheSet(key, value) {
    if (answerCache.size >= ANSWER_CACHE_MAX) {
        const oldest = answerCache.keys().next().value;
        answerCache.delete(oldest);
    }
    answerCache.set(key, { at: Date.now(), value });
}

/* ── Simple per-IP token-bucket guard ─────────────────────────────────────── */
const buckets = new Map();
const BUCKET_MAX = 60;        // requests ...
const BUCKET_WINDOW_MS = 60_000; // ... per minute per IP

function rateLimit(req) {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    let b = buckets.get(ip);
    if (!b || now > b.resetAt) {
        b = { count: 0, resetAt: now + BUCKET_WINDOW_MS };
        buckets.set(ip, b);
    }
    b.count += 1;
    return b.count <= BUCKET_MAX;
}

/* ── Lesson catalogue shared by /lesson and /lesson/full ──────────────────── */
function getLesson(topicId, lang) {
    const l = normalizeLang(lang);
    const t0 = FAQ.find(f => f.id === topicId);
    if (!t0) return null;
    if (l === 'kik') return null; // Gikuyu lessons come from the sidecar only
    return { topic: t0.id, lang: l, text: (t0[l] || t0.en).a };
}

/* ────────────────────────────── ROUTES ─────────────────────────────────── */

app.get('/health', (_req, res) => {
    res.json({
        status: 'Sauti Learn active',
        version: 1,
        languages: ['en', 'sw', 'kik'],
        providers: {
            stt: {
                google: Boolean(process.env.GOOGLE_STT_API_KEY),
                groq: Boolean(process.env.GROQ_API_KEY),
                whisper: Boolean(process.env.OPENAI_API_KEY),
                azure: Boolean(process.env.AZURE_SPEECH_KEY),
                kikuyuSidecar: Boolean(process.env.SIDECAR_URL),
            },
            tts: {
                gemini: Boolean(process.env.GEMINI_API_KEY),
                azure: Boolean(process.env.AZURE_SPEECH_KEY),
                google: Boolean(process.env.GOOGLE_STT_API_KEY),
                groq: Boolean(process.env.GROQ_API_KEY),
                kikuyuSidecar: Boolean(process.env.SIDECAR_URL),
            },
            llm: {
                gemini: Boolean(process.env.GEMINI_API_KEY),
                groq: Boolean(process.env.GROQ_API_KEY),
                opencode: Boolean(process.env.OPENCODE_API_KEY && process.env.OPENCODE_MODEL),
                openai: Boolean(process.env.OPENAI_API_KEY),
                offlineFaq: true,
            },
        },
    });
});

app.get('/languages', (_req, res) => {
    res.json(LANGS.map(code => ({
        code,
        label: LANG_LABELS[code],
        voiceSupported: code === 'kik'
            ? Boolean(process.env.SIDECAR_URL)
            : Boolean(process.env.GOOGLE_STT_API_KEY || process.env.OPENAI_API_KEY || process.env.AZURE_SPEECH_KEY),
    })));
});

// Text question -> grounded answer
app.post('/ask', async (req, res) => {
    if (!rateLimit(req)) return res.status(429).json({ error: 'rate_limited' });
    const { question, lang } = req.body || {};
    if (!question || !String(question).trim()) {
        return res.status(400).json({ error: 'question_required' });
    }
    const l = normalizeLang(lang);
    const key = `${l}:${String(question).trim().toLowerCase().slice(0, 200)}`;
    const cached = cacheGet(key);
    if (cached) return res.json(cached);

    try {
        const result = await answer(question, l);
        cacheSet(key, result);
        res.json(result);
    } catch (err) {
        console.error('[Sauti] /ask error:', err.message);
        res.status(200).json({
            answer: l === 'sw'
                ? 'Hitilafu. Jaribu tena au piga 0800 221 221 kwa msaada.'
                : 'Something went wrong. Please try again, or call 0800 221 221.',
            lang: 'sw' === l ? 'sw' : 'en',
            provider: 'offline-faq',
        });
    }
});

// Audio question -> transcript + grounded answer + synthesized audio
app.post('/voice/ask', async (req, res) => {
    if (!rateLimit(req)) return res.status(429).json({ error: 'rate_limited' });
    const { audioBase64, lang } = req.body || {};
    if (!audioBase64) return res.status(400).json({ error: 'audioBase64_required' });

    const l = normalizeLang(lang);
    const buffer = Buffer.from(String(audioBase64), 'base64');

    // Rough duration guard: 16 kHz, 16-bit mono ≈ 32 KB/s
    if (buffer.length > MAX_AUDIO_SECONDS * 32000) {
        return res.status(413).json({ error: 'audio_too_long', maxSeconds: MAX_AUDIO_SECONDS });
    }

    let transcript = null;
    try {
        transcript = await transcribe(buffer, l);
    } catch (err) {
        console.error('[Sauti] transcribe error:', err.message);
    }

    if (!transcript) {
        // Degrade, never fail: tell the user in their language.
        const note = l === 'kik'
            ? 'Sauti haikusikia. Jaribu kwa Kiswahili au andika swali lako.'
            : l === 'sw'
                ? 'Sauti haikusikia vizuri. Andika swali lako au jaribu tena.'
                : 'I could not hear you clearly. Try again, or type your question.';
        return res.json({ transcript: null, answer: note, lang: l === 'kik' ? 'sw' : l, provider: 'none' });
    }

    try {
        const result = await answer(transcript.text, l);
        const tts = await synthesize(result.answer, result.lang).catch(() => null);
        res.json({
            transcript: transcript.text,
            transcriptProvider: transcript.provider,
            answer: result.answer,
            lang: result.lang,
            provider: result.provider,
            suggestions: result.suggestions,
            degraded: result.degraded,
            tts, // { audioBase64, mime, provider } or null -> use browser voice
        });
    } catch (err) {
        console.error('[Sauti] /voice/ask error:', err.message);
        res.status(200).json({ transcript: transcript.text, answer: t(lang, 'noProvider'), lang: l, provider: 'offline-faq' });
    }
});

// Text -> speech (used by the web UI when the browser voice is unavailable)
app.post('/tts', async (req, res) => {
    if (!rateLimit(req)) return res.status(429).json({ error: 'rate_limited' });
    const { text, lang } = req.body || {};
    if (!text || !String(text).trim()) return res.status(400).json({ error: 'text_required' });
    const tts = await synthesize(String(text), normalizeLang(lang)).catch(() => null);
    if (!tts) {
        return res.status(501).json({ error: 'tts_unavailable', lang });
    }
    res.json(tts);
});

// Short lesson text (USSD screens are <=182 chars)
app.get('/lesson', (req, res) => {
    const { topic, lang } = req.query;
    const lesson = getLesson(String(topic || ''), String(lang || 'en'));
    if (!lesson) {
        return res.type('text/plain').send(String(t(lang, 'welcome') || '').slice(0, 160));
    }
    res.type('text/plain').send(lesson.text.slice(0, 180));
});

// Full lesson text (SMS)
app.get('/lesson/full', (req, res) => {
    const { topic, lang } = req.query;
    const lesson = getLesson(String(topic || ''), String(lang || 'en'));
    const text = lesson ? lesson.text : t(lang, 'welcome');
    res.type('text/plain').send(String(text || '').slice(0, 900));
});

// Topic catalogue for menus
app.get('/topics', (_req, res) => {
    res.json(FAQ.map(f => ({ id: f.id, en: f.en.q, sw: f.sw ? f.sw.q : f.en.q })));
});

// Suggestions helper for the UI
app.get('/suggestions', (req, res) => {
    res.json({ suggestions: suggestionsFor(req.query.lang) });
});

// JSON body errors -> 400 instead of an express crash trace
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
    console.error('[Sauti] middleware error:', err.message);
    res.status(400).json({ error: 'bad_request' });
});

app.listen(PORT, () => {
    console.log(`\n${'═'.repeat(55)}`);
    console.log(`  🔊 Sauti Learn service`);
    console.log(`  🚀 http://localhost:${PORT}`);
    console.log(`  🌐 Languages: English / Kiswahili / Gĩkũyũ`);
    console.log(`  🔌 Providers: ${describeProviders()}`);
    console.log(`${'═'.repeat(55)}\n`);
});

function describeProviders() {
    const on = [];
    if (process.env.GEMINI_API_KEY) on.push('Gemini');
    if (process.env.GROQ_API_KEY) on.push('Groq');
    if (process.env.OPENCODE_API_KEY && process.env.OPENCODE_MODEL) on.push('OpenCode');
    if (process.env.OPENAI_API_KEY) on.push('OpenAI');
    if (!on.length) on.push('Offline FAQ');
    return `LLM[${on.join(', ')}] STT[${Boolean(process.env.GOOGLE_STT_API_KEY || process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY || process.env.AZURE_SPEECH_KEY)}] KikuyuSidecar[${Boolean(process.env.SIDECAR_URL)}]`;
}

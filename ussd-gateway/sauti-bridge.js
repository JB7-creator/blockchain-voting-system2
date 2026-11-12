/**
 * Sauti Learn - USSD/Voice bridge for the DeVote gateway
 * ======================================================
 * This module is the ONLY thing the existing gateway knows about Sauti Learn.
 * It is designed so that:
 *   - every entry point is gated by SAUTI_ENABLED (default OFF),
 *   - no existing function is modified (only appended to),
 *   - any failure degrades to a plain text lesson instead of an error.
 *
 * It talks to the standalone `sauti-learn-service` over HTTP and sends SMS via
 * the Africa's Talking HTTP API (identical credentials the gateway already uses).
 */

const SAUTI_ENABLED = ['1', 'true', 'yes'].includes(String(process.env.SAUTI_ENABLED || '').toLowerCase());
const SAUTI_URL = (process.env.SAUTI_URL || 'http://localhost:5050').replace(/\/$/, '');
const AT_API_KEY = process.env.AT_API_KEY || '';
const AT_USERNAME = process.env.AT_USERNAME || 'sandbox';
const AT_SENDER_ID = process.env.AT_SENDER_ID || 'DEVOTE';
const REQUEST_TIMEOUT_MS = Number(process.env.SAUTI_REQUEST_TIMEOUT_MS || 15000);

function isEnabled() { return SAUTI_ENABLED; }

/* ── Topic catalogue (mirrors sauti-learn-service FAQ ids) ────────────────── */
const TOPICS = [
    { id: 'register',  en: 'Register to vote',  sw: 'Jisajili kupiga kura' },
    { id: 'positions', en: 'The 6 ballots',     sw: 'Kura 6' },
    { id: 'verify',    en: 'Verify on chain',   sw: 'Kagua kwenye blockchain' },
    { id: 'secret',    en: 'Is my vote secret', sw: 'Kura yangu ni siri' },
    { id: 'day',       en: 'Voting day',        sw: 'Siku ya kupiga kura' },
    { id: 'help',      en: 'Help channels',     sw: 'Msaada' },
];

const MENU = {
    en: {
        menu: 'CON Sauti Learn - learn by voice\n1. Register\n2. The 6 ballots\n3. Verify on chain\n4. Vote secrecy\n5. Voting day\n6. Help\n0. Back',
        smsOffer: (t) => `CON ${t}\n1. Send full lesson by SMS\n0. Back`,
        smsSent: 'END Full lesson sent by SMS.\nFree: 0800 221 221',
        noService: 'END Sauti Learn is resting.\nTry again later.',
    },
    sw: {
        menu: 'CON Sauti Learn - funzwa kwa sauti\n1. Jisajili\n2. Kura 6\n3. Kagua blockchain\n4. Siri ya kura\n5. Siku ya kura\n6. Msaada\n0. Rudi',
        smsOffer: (t) => `CON ${t}\n1. Tuma somo kamili SMS\n0. Rudi`,
        smsSent: 'END Somo kamili limetumwa SMS.\nBure: 0800 221 221',
        noService: 'END Sauti Learn haipatikana.\nJaribu baadaye.',
    },
};

const VOICE = {
    en: {
        langPrompt: 'Sauti Learn. For English press 1. Kwa Kiswahili bonyeza 2.',
        listen: 'Please ask your question after the beep. Press hash when done.',
        retry: 'I did not hear you. Please ask again after the beep.',
        again: 'Press 1 to ask another question. Press 2 to end.',
        bye: 'Thank you for learning with DeVote. Goodbye.',
    },
    sw: {
        langPrompt: 'Sauti Learn. Kiingereza bonyeza 1. Kiswahili bonyeza 2.',
        listen: 'Uliza swali lako baada ya mlio. Bonyeza reli ukitaka.',
        retry: 'Sikukuskia. Tafadhali uliza tena baada ya mlio.',
        again: 'Bonyeza 1 kuuliza tena. Bonyeza 2 kumaliza.',
        bye: 'Asante kwa kujifunza na DeVote. Kwaheri.',
    },
};

/* ── HTTP helpers (never throw) ───────────────────────────────────────────── */
async function callService(path, options = {}) {
    try {
        const res = await fetch(`${SAUTI_URL}${path}`, {
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            ...options,
        });
        if (options.raw) return res;
        if (!res.ok) return null;
        return await res.json();
    } catch (err) {
        console.warn('[Sauti] service unreachable:', err.message);
        return null;
    }
}

async function getLessonText(topicId, lang) {
    const data = await callService(`/lesson?topic=${encodeURIComponent(topicId)}&lang=${encodeURIComponent(lang)}`, { raw: true });
    if (!data || !data.ok) return null;
    return (await data.text()).trim();
}

/* ── USSD branch ──────────────────────────────────────────────────────────── */
/**
 * Flow: 6 -> topic menu -> lesson -> optional SMS of full lesson.
 * @param {string[]} subInputs inputs after language choice (subInputs[0] === '6')
 * @param {'en'|'sw'} lang
 * @returns {Promise<{text:string,end:boolean}>}
 */
async function handleUssdSauti(subInputs, lang, phoneNumber) {
    const l = lang === 'sw' ? 'sw' : 'en';
    const t = MENU[l];
    const branch = subInputs.slice(1); // everything after "6"

    // Level 1: topic menu
    if (branch.length === 0) return { text: t.menu, end: false };

    if (branch[0] === '0') return { text: l === 'sw' ? 'CON 1.Piga Kura 2.Usajili 3.Wagombea 4.Matokeo 5.Msaada' : 'CON 1.Vote 2.Status 3.Candidates 4.Results 5.Help', end: false };

    const topicIndex = parseInt(branch[0], 10) - 1;
    const topic = TOPICS[topicIndex];
    if (!topic) return { text: t.menu, end: false };

    // Level 2: lesson offer
    if (branch.length === 1) {
        const lesson = await getLessonText(topic.id, l);
        if (!lesson) return { text: t.noService, end: true };
        return { text: t.smsOffer(lesson), end: false };
    }

    // Level 3: send SMS
    if (branch[1] === '1') {
        const full = await callService(`/lesson/full?topic=${encodeURIComponent(topic.id)}&lang=${l}`);
        const text = typeof full === 'string' ? full.trim() : '';
        if (text) await sendSmsRaw(phoneNumber, `DeVote Sauti Learn\n${text}`);
        return { text: t.smsSent, end: true };
    }

    if (branch[1] === '0') return { text: t.menu, end: false };
    return { text: t.menu, end: false };
}

/* ── SMS via Africa's Talking HTTP API (same credentials as gateway) ───────── */
async function sendSmsRaw(phoneNumber, message) {
    if (!phoneNumber) return false;
    if (!AT_API_KEY) {
        console.log(`\n══ SAUTI SMS (simulated) To:${phoneNumber} ══\n${message}\n══`);
        return true;
    }
    try {
        const body = new URLSearchParams({
            username: AT_USERNAME,
            to: phoneNumber,
            message,
        });
        if (AT_USERNAME !== 'sandbox') body.append('from', AT_SENDER_ID);
        const res = await fetch('https://api.africastalking.com/version1/messaging', {
            method: 'POST',
            headers: {
                Authorization: 'Basic ' + Buffer.from(`${AT_USERNAME}:${AT_API_KEY}`).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json',
            },
            body,
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        const ok = res.ok;
        console.log(`[Sauti][SMS] ${ok ? 'sent' : 'failed'} -> ${phoneNumber}`);
        return ok;
    } catch (err) {
        console.warn('[Sauti][SMS] error:', err.message);
        return false;
    }
}

/* ── Voice IVR helpers ────────────────────────────────────────────────────── */
function voicePrompts(lang) {
    const l = lang === 'sw' ? 'sw' : 'en';
    return VOICE[l];
}

/** Download an Africa's Talking recording (basic auth is optional per account). */
async function fetchRecording(url) {
    try {
        const headers = {};
        if (AT_API_KEY) headers.Authorization = 'Basic ' + Buffer.from(`${AT_USERNAME}:${AT_API_KEY}`).toString('base64');
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        if (!res.ok) throw new Error(`${res.status}`);
        return Buffer.from(await res.arrayBuffer());
    } catch (err) {
        console.warn('[Sauti] recording fetch failed:', err.message);
        return null;
    }
}

/* ── In-memory audio tokens for <Play> (Gikuyu TTS from the sidecar) ──────── */
const audioTokens = new Map();
const AUDIO_TTL_MS = 5 * 60 * 1000;

function storeAudio(buffer, mime) {
    const token = Math.random().toString(36).slice(2, 12);
    audioTokens.set(token, { buffer, mime, at: Date.now() });
    return token;
}

function audioRoute(req, res) {
    const entry = audioTokens.get(req.params.token);
    if (!entry) { res.status(404).send('expired'); return; }
    res.set('Content-Type', entry.mime);
    res.send(entry.buffer);
}

setInterval(() => {
    const now = Date.now();
    for (const [k, v] of audioTokens) if (now - v.at > AUDIO_TTL_MS) audioTokens.delete(k);
}, 60_000).unref();

/**
 * Handle the Africa's Talking <Record> callback for the Sauti IVR flow.
 * @param body AT callback fields (sessionId, recording/recordingUrl, durationInSeconds, callerNumber...)
 * @param sessions Map used by the gateway voice handler (passed in, never imported)
 * @param deps { xmlFor(text, getDigits?) } - provided by the gateway (its own escaping)
 */
async function handleVoiceRecord(body, sessions, deps) {
    const { sessionId } = body;
    const url = body.recordingUrl || body.recording || body.recordingFile || null;
    let session = sessions.get(sessionId);
    const lang = session?.sautiLang || 'sw';
    const prompts = voicePrompts(lang);

    try {
        if (!url) return deps.xmlFor(prompts.retry, { numDigits: 1, timeout: 8 });

        const liveUntil = Number(body.durationInSeconds || 0);
        if (liveUntil > 0 && liveUntil < 1) return deps.xmlFor(prompts.retry, { numDigits: 1, timeout: 8 });

        const audio = await fetchRecording(url);
        if (!audio) return deps.xmlFor(lang === 'sw' ? 'Samahani, sauti haikupata. Jaribu tena.' : 'Sorry, I could not get the audio. Try again.', { numDigits: 1, timeout: 8 });

        const result = await callService('/voice/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64: audio.toString('base64'), lang }),
        });

        if (!result || !result.answer) {
            return deps.xmlFor(lang === 'sw' ? 'Sauti Learn haipatikana sasa. Jaribu tena baadaye.' : 'Sauti Learn is unavailable right now. Try again later.', { numDigits: 1, timeout: 8 });
        }

        // Mark session so the follow-up digit can loop back
        if (session) session.step = 'SAUTI_AFTER';

        const answerText = String(result.answer).slice(0, 240);

        // Gikuyu TTS audio (sidecar) must be served via <Play>; EN/SW use <Say>
        if (result.tts && result.tts.audioBase64) {
            const buffer = Buffer.from(result.tts.audioBase64, 'base64');
            const token = storeAudio(buffer, result.tts.mime || 'audio/mpeg');
            const playUrl = `${deps.baseUrl}/sauti/audio/${token}`;
            return deps.xmlForPlay(playUrl, prompts.again);
        }

        return deps.xmlFor(`${answerText} ${prompts.again}`, { numDigits: 1, timeout: 12 });
    } catch (err) {
        console.error('[Sauti] voice record error:', err.message);
        return deps.xmlFor(lang === 'sw' ? 'Hitilafu. Jaribu tena.' : 'An error occurred. Try again.', { numDigits: 1, timeout: 8 });
    }
}

module.exports = {
    isEnabled,
    handleUssdSauti,
    handleVoiceRecord,
    voicePrompts,
    audioRoute,
    TOPICS,
};

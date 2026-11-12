/**
 * Sauti Learn - LLM adapters (Gemini / OpenAI) + offline FAQ brain
 *
 * Hard guardrails (system prompt):
 *  - Answer ONLY about the DeVote Kenya voting process (registration, positions,
 *    blockchain receipts, secrecy, voting day, help channels).
 *  - NEVER ask for or accept National ID, PIN, phone number, or wallet address.
 *  - NEVER give opinions about candidates, parties, or election outcomes.
 *  - Keep answers short (<= 220 words) and end with a next step.
 *
 * Gikuyu is served through the translation bridge: kik -> sw (sidecar),
 * answer in sw, then sidecar sw -> kik for TTS. If the sidecar is down we
 * answer in Swahili and tell the user (degrades, never blocks).
 */

const { normalizeLang, I18N } = require('./i18n');
const { FAQ, matchFaq, offlineAnswer, suggestionsFor } = require('./faq');

const TIMEOUT_MS = Number(process.env.SAUTI_LLM_TIMEOUT_MS || process.env.SAUTI_REQUEST_TIMEOUT_MS || 15000);
const MAX_ANSWER_CHARS = Number(process.env.SAUTI_MAX_ANSWER_CHARS || 500);

/** Gemini models tried in order (the first is what you configure; the rest absorb 503 spikes). */
const GEMINI_MODEL_FALLBACKS = [
    process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-flash-latest',
];

/** Truncate at a word/sentence boundary so answers never end mid-word. */
function safeTruncate(text, max) {
    const s = String(text || '').trim();
    if (s.length <= max) return s;
    const cut = s.slice(0, max);
    const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '), cut.lastIndexOf('\n'));
    if (lastStop > max * 0.4) return cut.slice(0, lastStop + 1);
    const lastSpace = cut.lastIndexOf(' ');
    return `${cut.slice(0, lastSpace > max * 0.4 ? lastSpace : max)}…`;
}

const SYSTEM_PROMPT = `You are "Sauti Learn", the voice teacher of the DeVote Kenya blockchain voting system.
Rules:
- Answer only about the DeVote voting process: registration, the 6 ballots (President, Governor, Senator, Woman Rep, MP, MCA), how votes are recorded on Ethereum Sepolia, SMS receipts, vote secrecy, voting-day steps, and help channels.
- Never ask for or accept a National ID, PIN, phone number, wallet, or any personal detail. If the user volunteers one, ignore it.
- Never give opinions about candidates, parties, or likely outcomes. Be strictly factual and neutral.
- If you do not know, say so and point to IEBC toll-free 0800 221 221 or the website.
- Answer in ONE of: English, Kiswahili, or Gikuyu, matching the language the user asked in. Keep it under 60 words and end with one clear next step.`;

/** Grounding context built from the curated FAQ (never answer outside it). */
function groundingContext(question) {
    const topic = matchFaq(question);
    const pool = topic ? [topic, ...FAQ.filter(f => f.id !== topic.id).slice(0, 2)] : FAQ.slice(0, 3);
    return pool
        .map(t => `Q: ${t.en.q}\nA: ${t.en.a}${t.sw ? `\n(Swahili) Q: ${t.sw.q}\nA: ${t.sw.a}` : ''}`)
        .join('\n\n');
}

async function postJson(url, body, headers = {}) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => '')}`);
    return res.json();
}

/* ── Google Gemini (with model fallback for 503 spikes) ───────────────────── */
async function geminiAnswer(question, lang, context) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return null;

    const payload = () => ({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{
            role: 'user',
            parts: [{ text: `Reference material:\n${context}\n\nVoter question (${lang}): ${question}` }],
        }],
        generationConfig: {
            maxOutputTokens: 2048,
            temperature: 0.3,
            // Gemini 3.x are "thinking" models by default - thoughts eat the
            // output budget, so disable thinking for short spoken answers.
            thinkingConfig: { thinkingBudget: 0 },
        },
    });

    for (const model of [...new Set(GEMINI_MODEL_FALLBACKS)]) {
        try {
            const data = await postJson(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
                payload(model)
            );
            const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('')?.trim();
            if (text) return safeTruncate(text, MAX_ANSWER_CHARS);
        } catch (err) {
            console.warn(`[Sauti][LLM] gemini(${model}):`, String(err.message).slice(0, 120));
            // 503/overloaded -> next model; hard auth errors -> stop trying Gemini
            if (/API key|API_KEY_INVALID|401|403/.test(String(err.message))) break;
        }
    }
    return null;
}

/* ── OpenAI ───────────────────────────────────────────────────────────────── */
async function openaiAnswer(question, lang, context) {
    const key = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    if (!key) return null;
    try {
        const data = await postJson(
            'https://api.openai.com/v1/chat/completions',
            {
                model,
                max_tokens: 256,
                temperature: 0.3,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: `Reference material:\n${context}\n\nVoter question (${lang}): ${question}` },
                ],
            },
            { Authorization: `Bearer ${key}` }
        );
        const text = data?.choices?.[0]?.message?.content?.trim();
        return text ? safeTruncate(text, MAX_ANSWER_CHARS) : null;
    } catch (err) {
        console.warn('[Sauti][LLM] openai:', err.message);
        return null;
    }
}

/* ── Kikuyu translation bridge (sidecar) ──────────────────────────────────── */
/* ── Groq (OpenAI-compatible, very fast) ─────────────────────────────────── */
async function groqAnswer(question, lang, context) {
    const key = process.env.GROQ_API_KEY;
    if (!key) return null;
    const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
    try {
        const data = await postJson(
            'https://api.groq.com/openai/v1/chat/completions',
            {
                model,
                max_tokens: 256,
                temperature: 0.3,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: `Reference material:\n${context}\n\nVoter question (${lang}): ${question}` },
                ],
            },
            { Authorization: `Bearer ${key}` }
        );
        const text = data?.choices?.[0]?.message?.content?.trim();
        return text ? safeTruncate(text, MAX_ANSWER_CHARS) : null;
    } catch (err) {
        console.warn('[Sauti][LLM] groq:', err.message);
        return null;
    }
}

/* ── OpenCode (OpenAI-compatible gateway, many models) ────────────────────── */
async function opencodeAnswer(question, lang, context) {
    const key = process.env.OPENCODE_API_KEY;
    if (!key) return null;
    const model = process.env.OPENCODE_MODEL; // account-specific ID - must be set in .env
    if (!model) return null;
    const base = (process.env.OPENCODE_BASE_URL || 'https://opencode.ai/zen/v1').replace(/\/$/, '');
    try {
        const data = await postJson(
            `${base}/chat/completions`,
            {
                model,
                max_tokens: 256,
                temperature: 0.3,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: `Reference material:\n${context}\n\nVoter question (${lang}): ${question}` },
                ],
            },
            { Authorization: `Bearer ${key}` }
        );
        const text = data?.choices?.[0]?.message?.content?.trim();
        return text ? safeTruncate(text, MAX_ANSWER_CHARS) : null;
    } catch (err) {
        console.warn('[Sauti][LLM] opencode:', err.message);
        return null;
    }
}

async function sidecarTranslate(text, from, to) {
    const base = process.env.SIDECAR_URL;
    if (!base) return null;
    try {
        const data = await postJson(`${base}/translate`, { text, from, to });
        return (data.text || '').trim() || null;
    } catch (err) {
        console.warn('[Sauti][Translate] sidecar:', err.message);
        return null;
    }
}

/**
 * Resolve with the first provider that returns a non-empty answer.
 * Gemini (quality) and Groq (speed) are raced in parallel so a slow or
 * overloaded provider no longer blocks the voter's answer.
 */
async function firstSuccess(providers) {
    if (providers.length === 0) return null;
    if (providers.length === 1) return providers[0]().catch(() => null);
    return new Promise((resolve) => {
        let remaining = providers.length;
        let settled = false;
        const done = (value) => {
            if (settled) return;
            if (value) { settled = true; resolve(value); return; }
            remaining -= 1;
            if (remaining === 0) { settled = true; resolve(null); }
        };
        providers.forEach((p) => { p().then(done, () => done(null)); });
    });
}

/**
 * Answer a question in the requested language.
 * Returns { answer, lang, provider, suggestions, degraded? }.
 */
async function answer(question, declaredLang) {
    const lang = normalizeLang(declaredLang);
    const q = String(question || '').trim();
    if (!q) return { answer: '...', lang, provider: 'none', error: 'empty' };

    let workingLang = lang;
    let workingQ = q;

    // ─ Gikuyu: translate the question to Swahili first ─
    if (lang === 'kik') {
        const bridged = await sidecarTranslate(q, 'kik', 'sw');
        if (bridged) {
            workingLang = 'sw';
            workingQ = bridged;
        } else {
            // No sidecar -> answer in Swahili and be explicit about it.
            const off = offlineAnswer(q, 'sw');
            return {
                answer: off.answer,
                lang: 'sw',
                provider: 'offline-faq',
                degraded: true,
                suggestions: suggestionsFor('sw'),
            };
        }
    }

    const context = groundingContext(workingQ);

    // ─ Race the two primary providers in parallel (speed + resilience),
    //    then fall back to OpenCode / OpenAI, then the offline FAQ.
    const racers = [];
    if (process.env.GEMINI_API_KEY) {
        racers.push(() => geminiAnswer(workingQ, workingLang, context));
    }
    if (process.env.GROQ_API_KEY) {
        racers.push(() => groqAnswer(workingQ, workingLang, context));
    }

    const llmAnswer =
        (await firstSuccess(racers)) ||
        (await opencodeAnswer(workingQ, workingLang, context)) ||
        (await openaiAnswer(workingQ, workingLang, context));

    if (llmAnswer) {
        // ─ Gikuyu: translate the answer back for local voice output ─
        let finalText = llmAnswer;
        let answerLang = workingLang;
        if (lang === 'kik') {
            const back = await sidecarTranslate(llmAnswer, workingLang, 'kik');
            if (back) {
                finalText = back;
                answerLang = 'kik';
            }
        }
        return { answer: finalText.slice(0, MAX_ANSWER_CHARS), lang: answerLang, provider: 'llm', suggestions: suggestionsFor(answerLang) };    }

    // ─ Offline FAQ fallback (no LLM keys / LLM down) ─
    const off = offlineAnswer(workingQ, workingLang);
    return { answer: off.answer, lang: off.lang, provider: 'offline-faq', suggestions: suggestionsFor(off.lang) };
}

module.exports = { answer, SYSTEM_PROMPT, groundingContext };

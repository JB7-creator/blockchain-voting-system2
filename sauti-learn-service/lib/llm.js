/**
 * Sauti Learn - LLM adapters (Gemini / Groq / OpenAI) + offline FAQ brain
 *
 * Hard civic guardrails (system prompt):
 *  - Answer ONLY about DeVote Kenya voting (registration, the 6 ballots, blockchain
 *    SMS receipts, vote secrecy, voting without internet via USSD, voting day, help lines).
 *  - NEVER ask for or collect National ID, PIN, phone number, or wallet address.
 *  - NEVER give opinions about candidates, political parties, or election outcomes.
 *  - Use simple, plain, friendly language (avoid crypto/blockchain jargon).
 *  - Keep answers concise (under 60 words for voice) and end with a clear next step.
 */

const { normalizeLang } = require('./i18n');
const { FAQ, matchFaq, offlineAnswer, suggestionsFor } = require('./faq');

const TIMEOUT_MS = Number(process.env.SAUTI_LLM_TIMEOUT_MS || process.env.SAUTI_REQUEST_TIMEOUT_MS || 12000);
const MAX_ANSWER_CHARS = Number(process.env.SAUTI_MAX_ANSWER_CHARS || 500);

// Only try 2 real Gemini model names — fewer retries = less quota burn
const GEMINI_MODEL_FALLBACKS = [
    process.env.GEMINI_MODEL || 'gemini-1.5-flash',
    'gemini-1.5-flash-8b',
];

function safeTruncate(text, max) {
    const s = String(text || '').trim();
    if (s.length <= max) return s;
    const cut = s.slice(0, max);
    const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '), cut.lastIndexOf('\n'));
    if (lastStop > max * 0.4) return cut.slice(0, lastStop + 1);
    const lastSpace = cut.lastIndexOf(' ');
    return `${cut.slice(0, lastSpace > max * 0.4 ? lastSpace : max)}…`;
}

const SYSTEM_PROMPT = `You are "Sauti Learn", the friendly voice guide of DeVote Kenya, an accessible blockchain voting system.

Rules:
1. Answer strictly about the DeVote voting process:
   - Voter registration (ID, phone, wallet, location, admin verification)
   - The 6 leadership ballots (President, Governor, Senator, Woman Rep, MP, MCA)
   - Voting without internet via simple USSD code
   - Instant SMS receipts & blockchain verification
   - 100% vote secrecy & voter privacy
   - Voting day checklist & polling hours (6:00 AM - 5:00 PM)
   - Help channels (IEBC toll-free 0800 221 221, Fraud line 1195)
2. NEVER ask for or accept a National ID, PIN, phone number, wallet, or any personal details. If a user provides one, politely ignore it.
3. NEVER take sides, express political opinions, or discuss candidates/parties. Remain completely neutral and factual.
4. Speak in warm, plain, respectful language suitable for Kenyan voters:
   - In English: use simple, friendly Kenyan English. Avoid technical cryptobabble like "hash digests" or "EVM execution".
   - In Kiswahili: use natural Kiswahili Rahisi (e.g. "kura yako ni siri", "daftari salama la kidijitali").
5. Keep voice answers under 60 words and end with one helpful next step question.`;

/** Grounding context built from the curated FAQ. */
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

/* ── Google Gemini ──────────────────────────────────────────────────────── */
async function geminiAnswer(question, lang, context) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return null;

    const payload = () => ({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{
            role: 'user',
            parts: [{ text: `Reference material:\n${context}\n\nVoter question (${lang === 'sw' ? 'Kiswahili' : 'English'}): ${question}` }],
        }],
        generationConfig: {
            maxOutputTokens: 256,
            temperature: 0.3,
            thinkingConfig: { thinkingBudget: 0 },
        },
    });

    for (const model of [...new Set(GEMINI_MODEL_FALLBACKS)]) {
        try {
            const data = await postJson(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
                payload()
            );
            const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('')?.trim();
            if (text) return safeTruncate(text, MAX_ANSWER_CHARS);
        } catch (err) {
            console.warn(`[Sauti][LLM] gemini(${model}):`, String(err.message).slice(0, 120));
            if (/API key|API_KEY_INVALID|401|403/.test(String(err.message))) break;
        }
    }
    return null;
}

/* ── Groq LLM (ultra fast) ──────────────────────────────────────────────── */
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
                    { role: 'user', content: `Reference material:\n${context}\n\nVoter question (${lang === 'sw' ? 'Kiswahili' : 'English'}): ${question}` },
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

/* ── OpenAI LLM ─────────────────────────────────────────────────────────── */
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
                    { role: 'user', content: `Reference material:\n${context}\n\nVoter question (${lang === 'sw' ? 'Kiswahili' : 'English'}): ${question}` },
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

/* ── Sequential provider chain (Groq first → Gemini → OpenAI → FAQ) ───────
 * We try Groq FIRST because it's faster and has its own quota.
 * Gemini is only tried if Groq fails/unavailable.
 * This prevents Gemini 429 spam when Gemini quota is exhausted.
 */
async function tryInOrder(providerFns) {
    for (const fn of providerFns) {
        try {
            const result = await fn();
            if (result) return result;
        } catch (_) { /* continue to next */ }
    }
    return null;
}

/**
 * Answer a question in the declared language ('en' | 'sw').
 * Provider order: Groq → Gemini → OpenAI → offline FAQ
 */
async function answer(question, declaredLang) {
    const lang = normalizeLang(declaredLang);
    const q = String(question || '').trim();
    if (!q) return { answer: '...', lang, provider: 'none', error: 'empty' };

    const context = groundingContext(q);

    // Build ordered provider list: Groq first (fast, separate quota), then Gemini, then OpenAI
    const providerFns = [];
    if (process.env.GROQ_API_KEY)   providerFns.push(() => groqAnswer(q, lang, context));
    if (process.env.GEMINI_API_KEY) providerFns.push(() => geminiAnswer(q, lang, context));
    if (process.env.OPENAI_API_KEY) providerFns.push(() => openaiAnswer(q, lang, context));

    const llmAnswer = await tryInOrder(providerFns);

    if (llmAnswer) {
        return {
            answer: llmAnswer.slice(0, MAX_ANSWER_CHARS),
            lang,
            provider: 'llm',
            suggestions: suggestionsFor(lang),
        };
    }

    // Offline FAQ fallback — always works, no API keys needed
    const off = offlineAnswer(q, lang);
    return {
        answer: off.answer,
        lang: off.lang,
        provider: 'offline-faq',
        suggestions: suggestionsFor(off.lang),
    };
}

module.exports = { answer, SYSTEM_PROMPT, groundingContext };

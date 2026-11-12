/**
 * Sauti Learn - Curated DeVote FAQ (offline brain + LLM grounding material)
 *
 * Three entry points per topic:
 *  - keywords[] : English + Swahili surface forms used for offline routing
 *  - answer     : per-language answer for OFFLINE mode (en / sw)
 *  - lessonKey  : key into I18N[lang].lessons for USSD/SMS text lessons
 *
 * LLM providers use the answers here as grounding context (never answer
 * outside this material) so the assistant cannot hallucinate policy.
 *
 * kik answers are not static - Gikuyu is served through the
 * ASR -> translate -> LLM -> translate -> TTS bridge (see lib/stt.js,
 * lib/llm.js, lib/tts.js and the README sidecar).
 */

const FAQ = [
    {
        id: 'register',
        lessonKey: 'register',
        keywords: ['register', 'registration', 'sign up', 'usajili', 'jisajili', 'sajili', 'enroll', 'apply', 'new voter', 'napataje'],
        en: {
            q: 'How do I register to vote?',
            a: 'Open the DeVote web app, click "Sign In to Vote", connect your wallet, then complete the Registration page with your National ID, phone number, county, constituency and ward. An administrator approves your registration, and once approved you can vote.',
        },
        sw: {
            q: 'Ninajisajilishaje kupiga kura?',
            a: 'Fungua tovuti ya DeVote, bonyeza "Ingia Kupiga Kura", unganisha wallet yako, kisha jaza ukurasa wa Usajili kwa Nambari ya Kitambulisho, namba ya simu, kaunti, jimbo na kata. Msimamizi atakubali usajili wako, na baada ya kuthibitishwa utaweza kupiga kura.',
        },
    },
    {
        id: 'positions',
        lessonKey: 'positions',
        keywords: ['position', 'positions', 'ballot', 'ballots', 'president', 'governor', 'senator', 'woman rep', 'mp', 'mca', 'nafasi', 'kura ngapi', 'rais', 'gavana', 'mbunge', 'diwani', 'how many ballots', 'candidates', 'mgombea', 'wagombea'],
        en: {
            q: 'Which positions am I voting for?',
            a: 'There are 6 ballots: President, Governor, Senator, Woman Representative, MP (Member of Parliament) and MCA. You may cast each ballot once. Results are tallied per position.',
        },
        sw: {
            q: 'Napiga kura za nafasi zipi?',
            a: 'Kuna kura 6: Rais, Gavana, Seneta, Mwakilishi wa Wanawake, Mbunge na Diwani. Kila kura unapiga mara moja tu. Matokeo huhesabiwa kwa kila nafasi.',
        },
    },
    {
        id: 'verify',
        lessonKey: 'onchain',
        keywords: ['blockchain', 'verified', 'verify', 'receipt', 'counted', 'transaction', 'tx', 'hash', 'etherscan', 'trust', 'secure', 'sepolia', 'imehesabiwa', 'risiti', 'kukagua', 'thamani', 'wazi'],
        en: {
            q: 'How do I know my vote was counted?',
            a: 'Every ballot is a transaction on the Ethereum Sepolia blockchain. After voting, you receive an SMS receipt with the transaction hash and a link. Anyone can verify that transaction on Etherscan.',
        },
        sw: {
            q: 'Najuaaje kuwa kura yangu imehesabiwa?',
            a: 'Kila kura ni muamala kwenye blockchain ya Ethereum Sepolia. Baada ya kupiga kura, unapokea risiti ya SMS yenye hash ya muamala na kiungo. Mtu yeyote anaweza kukagua muamala huo kwenye Etherscan.',
        },
    },
    {
        id: 'secret',
        lessonKey: 'secret',
        keywords: ['secret', 'private', 'anonymous', 'privacy', 'siri', 'faragha', 'huwa', 'nini', 'know', 'see my choice', 'confidential', 'protected', 'secure my vote'],
        en: {
            q: 'Is my vote secret?',
            a: 'Yes. The contract records only that your registered wallet voted, and for which candidate. Your name and National ID stay in the approved-voter registry and are never written to the blockchain.',
        },
        sw: {
            q: 'Kura yangu ni siri?',
            a: 'Ndiyo. Mkataba huweka tu kwamba wallet yako iliyosajiliwa imepiga kura, na kwa mgombea yupi. Jina lako na Nambari ya Kitambulisho hubaki kwenye daftari la wapiga kura walioidhinishwa, hazijaandikwa kwenye blockchain.',
        },
    },
    {
        id: 'day',
        lessonKey: 'day',
        keywords: ['voting day', 'what do i need', 'requirements', 'documents', 'id', 'pin', 'phone', 'siku ya kupiga', 'nahitaji', 'mahitaji', 'kitambulisho', 'simu', 'help', 'support', 'msaada', 'how to vote', 'vote now', 'piga kura', 'steps', 'process', 'procedure', 'ath'],
        en: {
            q: 'What do I do on voting day?',
            a: 'You need your National ID and your 4-digit PIN. Dial the DeVote USSD code from any phone, or open the web app and connect your wallet. You can also call the voice hotline and Sauti will guide you.',
        },
        sw: {
            q: 'Nafanya nini siku ya kupiga kura?',
            a: 'Unahitaji Nambari yako ya Kitambulisho na PIN ya tarakimu 4. Piga msimbo wa USSD wa DeVote kutoka simu yoyote, au fungua tovuti na unganisha wallet yako. Unaweza pia kupiga namba ya sauti na Sauti atakuongoza.',
        },
    },
    {
        id: 'help',
        lessonKey: null,
        keywords: ['help', 'msaada', 'saidia', 'nisaidie', 'support', 'call center', 'iebc', 'toll free', 'bure', 'contact', 'complain', 'fraud', 'ulaghai', 'ripoti'],
        en: {
            q: 'How do I get help?',
            a: 'IEBC toll-free: 0800 221 221. Fraud hotline: 1195. Or ask Sauti Learn any question - I am here 24/7 in English, Kiswahili and Gikuyu.',
        },
        sw: {
            q: 'Nawezaje kupata msaada?',
            a: 'IEBC bure: 0800 221 221. Ulaghai: 1195. Au uliza Sauti Learn swali lolote - nipo 24/7 kwa Kiingereza, Kiswahili na Gikuyu.',
        },
    },
];

const STOPWORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'do', 'i', 'you', 'my', 'me', 'how', 'what', 'for', 'of', 'to', 'and', 'on', 'in', 'it', 'can', 'na', 'ya', 'wa', 'kwa', 'ni', 'na', 'ku', 'cha', 'hi', 'hii', 'yangu', 'yako', 'je', 'nini', 'sasa', 'please', 'tafadhali', 'tell', 'me', 'about', 'want', 'need', 'like', 'know', 'get',
]);

function normalize(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9\u0129\u0169\u0129\u0169\u0131\u0300-\u036f\s]/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenize(text) {
    return normalize(text).split(' ').filter(w => w.length > 1 && !STOPWORDS.has(w));
}

/** Scores FAQ topics against a free-form question. Returns best-scoring topic or null. */
function matchFaq(question) {
    const tokens = tokenize(question);
    if (tokens.length === 0) return null;

    let best = null;
    let bestScore = 0;

    for (const topic of FAQ) {
        let score = 0;
        for (const kw of topic.keywords) {
            const kwTokens = normalize(kw).split(' ');
            if (kwTokens.every(kt => tokens.some(tk => tk === kt || tk.startsWith(kt) || kt.startsWith(tk)))) {
                score += kwTokens.length + 1;
            }
        }
        // phrase bonus for exact substring matches
        const q = normalize(question);
        for (const kw of topic.keywords) {
            if (kw.includes(' ') && q.includes(kw)) score += 3;
        }
        if (score > bestScore) { bestScore = score; best = topic; }
    }

    return bestScore >= 2 ? best : null;
}

/** Offline answer for a question (used when no LLM key is configured). */
function offlineAnswer(question, lang) {
    const l = lang === 'sw' ? 'sw' : lang === 'kik' ? 'kik' : 'en';
    const topic = matchFaq(question);

    if (!topic) {
        // Kikuyu has no static answers by design -> answer in Swahili fallback
        if (l === 'kik') {
            return {
                answer: I18N_lang('sw').lessons.day || 'Jaribu tena kwa Kiswahili.',
                topic: null,
                provider: 'offline-faq',
                lang: 'sw',
            };
        }
        return {
            answer: l === 'sw'
                ? 'Samahani, sijaelewa swali lako. Jaribu: usajili, nafasi, blockchain, siri, msaada.'
                : 'Sorry, I did not understand. Try asking about: registration, positions, the blockchain, vote secrecy, or help.',
            topic: null,
            provider: 'offline-faq',
            lang: l,
        };
    }

    const localized = l === 'kik' ? topic.sw : topic[l] || topic.en;
    return { answer: localized.a, topic: topic.id, provider: 'offline-faq', lang: localized === topic.kik ? 'kik' : l };
}

// lazy require to avoid a cycle with i18n.js
function I18N_lang(l) {
    // eslint-disable-next-line global-require
    return require('./i18n').I18N[l] || {};
}

/** Suggested follow-up prompts for a language. */
function suggestionsFor(lang) {
    // eslint-disable-next-line global-require
    const { I18N, normalizeLang } = require('./i18n');
    const l = normalizeLang(lang);
    return I18N[l]?.suggestions?.length ? I18N[l].suggestions : I18N.en.suggestions;
}

module.exports = { FAQ, matchFaq, offlineAnswer, suggestionsFor };

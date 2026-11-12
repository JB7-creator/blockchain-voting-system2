/**
 * Sauti Learn - Curated DeVote Kenya FAQ (offline brain + LLM grounding material)
 *
 * Designed for Kenyan voters in simple, friendly, respectful language:
 *  - English (Plain Kenyan English, avoiding cryptographic jargon)
 *  - Kiswahili (Kiswahili Rahisi, natural and easily understood across all 47 counties)
 */

const FAQ = [
    {
        id: 'register',
        lessonKey: 'register',
        keywords: [
            'register', 'registration', 'sign up', 'usajili', 'jisajili', 'sajili',
            'enroll', 'apply', 'new voter', 'napataje', 'kujiandikisha', 'how do i register',
        ],
        en: {
            q: 'How do I register to vote?',
            a: 'Open blockchainelectionsystem.netlify.app, click "Sign In to Vote", connect your wallet, and fill in your National ID, phone number, county, constituency, and ward. An election administrator verifies and approves your registration, and then you are ready to vote.',
        },
        sw: {
            q: 'Ninajisajilishaje kupiga kura?',
            a: 'Fungua wavuti ya blockchainelectionsystem.netlify.app, bonyeza "Ingia Kupiga Kura", unganisha wallet yako, kisha jaza Nambari ya Kitambulisho, simu, kaunti, eneo bunge na kata. Msimamizi atakagua na kuthibitisha usajili wako tayari kupiga kura.',
        },
    },
    {
        id: 'positions',
        lessonKey: 'positions',
        keywords: [
            'position', 'positions', 'ballot', 'ballots', 'president', 'governor', 'senator',
            'woman rep', 'mp', 'mca', 'nafasi', 'kura ngapi', 'rais', 'gavana', 'mbunge',
            'diwani', 'how many ballots', 'candidates', 'mgombea', 'wagombea', '6 ballots',
        ],
        en: {
            q: 'Which positions am I voting for?',
            a: 'You vote for 6 leadership positions: President, Governor, Senator, Woman Representative, MP (Member of Parliament), and MCA (Ward Representative). You can cast one vote for each ballot.',
        },
        sw: {
            q: 'Napiga kura za nafasi zipi?',
            a: 'Kuna kura 6 za uongozi: Rais, Gavana, Seneta, Mwakilishi wa Wanawake, Mbunge na Diwani (MCA). Kila kura unapiga mara moja tu.',
        },
    },
    {
        id: 'verify',
        lessonKey: 'onchain',
        keywords: [
            'blockchain', 'verified', 'verify', 'receipt', 'counted', 'transaction', 'tx',
            'hash', 'etherscan', 'trust', 'secure', 'sepolia', 'imehesabiwa', 'risiti',
            'kukagua', 'thamani', 'wazi', 'sms receipt', 'confirmation',
        ],
        en: {
            q: 'How do I know my vote was counted?',
            a: 'Every vote creates a tamper-proof record on the blockchain that no one can change or delete. Right after voting, you receive an instant SMS receipt with your transaction code to verify anytime.',
        },
        sw: {
            q: 'Najuaaje kuwa kura yangu imehesabiwa?',
            a: 'Kila kura inarekodiwa kwenye daftari salama la kidijitali (blockchain) ambalo hakuna anayeweza kulibadilisha au kulifuta. Baada ya kupiga kura, unapata risiti ya SMS yenye msimbo wa uthibitisho.',
        },
    },
    {
        id: 'secret',
        lessonKey: 'secret',
        keywords: [
            'secret', 'private', 'anonymous', 'privacy', 'siri', 'faragha', 'huwa', 'nini',
            'know', 'see my choice', 'confidential', 'protected', 'secure my vote',
            'will anyone know', 'je kura ni siri',
        ],
        en: {
            q: 'Is my vote secret?',
            a: 'Yes, 100%! Your vote is completely confidential. The system checks your eligibility, but when you cast your ballot, your choice is disconnected from your identity. Nobody can ever see who you voted for.',
        },
        sw: {
            q: 'Kura yangu ni siri?',
            a: 'Ndiyo, asilimia 100! Kura yako ni siri kamili. Mfumo unathibitisha kuwa una haki ya kupiga kura, lakini chaguo lako halihusishwi na jina lako. Hakuna mtu yeyote anayeweza kuona uliyempigia kura.',
        },
    },
    {
        id: 'ussd',
        lessonKey: 'ussd',
        keywords: [
            'ussd', 'feature phone', 'mulika', 'mulika mwizi', 'kabambe', 'no internet',
            'offline', 'bila mtandao', 'simu ndogo', 'bila smartphone', 'code', 'msimbo',
            'simple phone', 'dial',
        ],
        en: {
            q: 'How do I vote without internet or a smartphone?',
            a: 'You can vote from any basic mobile phone by dialing the official DeVote USSD code *384*41484#. Enter your National ID and your secret 4-digit PIN, then follow the numbered prompts on your screen to cast your vote. No data or internet required!',
        },
        sw: {
            q: 'Ninapigaje kura bila mtandao au simu ndogo?',
            a: 'Unaweza kupiga kura kutoka simu yoyote ya kawaida (hata mulika mwizi) kwa kupiga msimbo rasmi wa USSD *384*41484#. Weka Kitambulisho na PIN yako ya siri, kisha fuata maagizo ya nambari kupiga kura. Huhitaji bando wala intaneti!',
        },
    },
    {
        id: 'day',
        lessonKey: 'day',
        keywords: [
            'voting day', 'what do i need', 'requirements', 'documents', 'id', 'pin', 'phone',
            'siku ya kupiga', 'nahitaji', 'mahitaji', 'kitambulisho', 'simu', 'process',
            'polling station', 'time', 'saa ngapi', 'hours',
        ],
        en: {
            q: 'What do I need on voting day?',
            a: 'You need your original National ID (or valid passport) and your secret 4-digit PIN. Voting is open from 6:00 AM to 5:00 PM. You can cast your ballot online or via USSD.',
        },
        sw: {
            q: 'Nafanya nini siku ya kupiga kura?',
            a: 'Unahitaji Kitambulisho chako halisi cha Kitaifa na PIN yako ya siri ya tarakimu 4. Upigaji kura huanza saa 12:00 asubuhi hadi 11:00 jioni. Unaweza kupiga kura mtandaoni au kwa USSD.',
        },
    },
    {
        id: 'help',
        lessonKey: null,
        keywords: [
            'help', 'msaada', 'saidia', 'nisaidie', 'support', 'call center', 'iebc',
            'toll free', 'bure', 'contact', 'complain', 'fraud', 'ulaghai', 'ripoti',
            'hotline', 'phone number',
        ],
        en: {
            q: 'How do I get help or report an issue?',
            a: 'For free assistance, call the official IEBC toll-free line on 0800 221 221. To report fraud or election malpractice, call 1195. Sauti Learn is also here 24/7 in English and Kiswahili.',
        },
        sw: {
            q: 'Nawezaje kupata msaada au kuripoti tatizo?',
            a: 'Kupata msaada wa bure, piga nambari ya IEBC isiyo na malipo 0800 221 221. Kuripoti ulaghai au visa visivyo halali, piga 1195. Sauti Learn pia iko hapa saa 24 kwa Kiingereza na Kiswahili.',
        },
    },
];

const STOPWORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'do', 'i', 'you', 'my', 'me', 'how', 'what', 'for', 'of',
    'to', 'and', 'on', 'in', 'it', 'can', 'na', 'ya', 'wa', 'kwa', 'ni', 'ku', 'cha', 'hi',
    'hii', 'yangu', 'yako', 'je', 'nini', 'sasa', 'please', 'tafadhali', 'tell', 'about',
    'want', 'need', 'like', 'know', 'get',
]);

function normalize(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/gi, ' ')
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
    const l = lang === 'sw' ? 'sw' : 'en';
    const topic = matchFaq(question);

    if (!topic) {
        return {
            answer: l === 'sw'
                ? 'Samahani, sijaelewa vizuri swali lako. Unaweza kuuliza kuhusu: usajili, nafasi 6 za uongozi, jinsi ya kupiga kura bila mtandao (USSD), usiri wa kura, au msaada.'
                : 'Sorry, I did not catch that clearly. You can ask about: registration, the 6 ballots, voting without internet via USSD, vote secrecy, or help.',
            topic: null,
            provider: 'offline-faq',
            lang: l,
        };
    }

    const localized = topic[l] || topic.en;
    return { answer: localized.a, topic: topic.id, provider: 'offline-faq', lang: l };
}

/** Suggested follow-up prompts for a language. */
function suggestionsFor(lang) {
    const { I18N, normalizeLang } = require('./i18n');
    const l = normalizeLang(lang);
    return I18N[l]?.suggestions?.length ? I18N[l].suggestions : I18N.en.suggestions;
}

module.exports = { FAQ, matchFaq, offlineAnswer, suggestionsFor };

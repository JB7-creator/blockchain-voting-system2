/**
 * Sauti Learn - i18n strings (English / Kiswahili / Gikuyu)
 *
 * NOTE: Gikuyu ("kik") entries are intentionally minimal. Full Gikuyu
 * answers are produced at runtime by the translation bridge (ASR/LLM/TTS
 * sidecar). The static strings below must be reviewed by a native speaker
 * before production use - marked with TODO.
 */

const LANGS = ['en', 'sw', 'kik'];

const LANG_LABELS = {
    en: 'English',
    sw: 'Kiswahili',
    kik: 'Gĩkũyũ',
};

const I18N = {
    en: {
        welcome: 'Karibu Sauti Learn! I am your DeVote voting teacher. Ask me anything about registering and voting.',
        chooseLang: 'Choose language: 1. English 2. Kiswahili 3. Gĩkũyũ',
        listening: 'Listening... speak your question now.',
        noAudio: 'I could not hear you. Please ask again after the beep.',
        noProvider: 'Voice is not configured, but I can still teach you in text. Ask a question below.',
        thinking: 'Let me check that for you...',
        suggestions: [
            'How do I register to vote?',
            'Which positions am I voting for?',
            'How do I know my vote was counted?',
            'Is my vote secret?',
            'What do I need on voting day?',
        ],
        lessons: {
            register: 'To register: open devote-ui, click Sign In to Vote, connect your wallet, then complete the Registration page with your National ID, phone, county, constituency and ward. An administrator approves you, then you can vote.',
            positions: 'There are 6 ballots: President, Governor, Senator, Woman Representative, MP and MCA. You can vote for each one once.',
            onchain: 'Every ballot you cast is recorded on the Ethereum Sepolia blockchain. You get an SMS receipt with the transaction hash you can verify on Etherscan.',
            secret: 'Yes. The contract records only that your wallet voted for a candidate, never who you are. Your ID stays in the approved-voter registry only.',
            day: 'On voting day you need your National ID, your 4-digit PIN, and either a smartphone with a wallet or just a phone to dial the USSD code.',
        },
    },
    sw: {
        welcome: 'Karibu Sauti Learn! Mimi ni mwalimu wako wa kupiga kura DeVote. Niulize chochote kuhusu usajili na kupiga kura.',
        chooseLang: 'Chagua lugha: 1. Kiingereza 2. Kiswahili 3. Gĩkũyũ',
        listening: 'Ninasikiliza... semea swali lako sasa.',
        noAudio: 'Sikukuskia. Tafadhali uliza tena baada ya mlio.',
        noProvider: 'Sauti haijasanidiwa, lakini bado naweza kufunza kwa maandishi. Uliza swali hapa chini.',
        thinking: 'Ninaangalia...',
        suggestions: [
            'Ninajisajilishaje kupiga kura?',
            'Napiga kura za nafasi zipi?',
            'Najuaaje kuwa kura yangu imetekelezwa?',
            'Kura yangu ni siri?',
            'Nahitaji nini siku ya kupiga kura?',
        ],
        lessons: {
            register: 'Kujisajili:fungua tovuti ya DeVote, bonyeza Ingia Kupiga Kura, unganisha wallet yako, kisha jaza ukurasa wa Usajili na Nambari ya Kitambulisho, simu, kaunti, jimbo na kata. Msimamizi atakukubali, kisha utaweza kupiga kura.',
            positions: 'Kuna kura 6: Rais, Gavana, Seneta, Mwakilishi wa Wanawake, Mbunge na Diwani. Unaweza kupiga kila moja mara moja tu.',
            onchain: 'Kila kura unayopiga inarekodiwa kwenye blockchain ya Ethereum Sepolia. Unapata risiti ya SMS yenye hash ya muamala unaoweza kukagua kwenye Etherscan.',
            secret: 'Ndiyo. Mkataba anaweka tu kuwa wallet yako imepiga kura kwa mgombea, si wewe ni nani. Nambari yako ya kitambulisho inabaki kwenye daftari ya wapiga kura walioidhinishwa tu.',
            day: 'Siku ya kupiga kura unahitaji Nambari ya Kitambulisho, PIN yako ya tarakimu 4, na simu mahiri yenye wallet au simu ya kawaida kupiga msimbo wa USSD.',
        },
    },
    kik: {
        // TODO: verify all Gikuyu strings with a native speaker.
        welcome: 'Ũhoro! Nĩ ni mũrutani wa DeVote. Ũhota kũũria kĩũria.',
        chooseLang: 'Thagũra rũrĩrĩ: 1. English 2. Kiswahili 3. Gĩkũyũ',
        listening: 'Nĩ ngũigua... aria kĩũria gĩaku rĩu.',
        noAudio: 'Ndinagũĩka. Ũhota kũũria rĩngĩ.',
        noProvider: 'Sauti ndĩrĩ ho, no nĩ ngũhota kũruta na maandishi. Andika kĩũria haha.',
        thinking: 'Nĩ ngũcaria...',
        suggestions: [
            // Gikuyu suggestions are served by the sidecar when available.
        ],
        lessons: {}, // Empty by design: Kikuyu lessons go through the translation bridge.
    },
};

// Fallback language when a provider cannot serve the requested language.
const FALLBACK = { kik: 'sw' };

function normalizeLang(lang) {
    const l = String(lang || '').toLowerCase().trim();
    if (l === 'ki' || l === 'kik' || l === 'kikuyu' || l === 'gikuyu') return 'kik';
    if (l === 'sw' || l === 'swa' || l === 'swahili' || l === 'kiswahili') return 'sw';
    return 'en';
}

function t(lang, key) {
    const l = normalizeLang(lang);
    const dict = I18N[l] || I18N.en;
    const enVal = I18N.en[key];
    return dict[key] !== undefined ? dict[key] : enVal;
}

module.exports = { LANGS, LANG_LABELS, I18N, FALLBACK, normalizeLang, t };

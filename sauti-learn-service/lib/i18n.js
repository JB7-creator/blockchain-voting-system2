/**
 * Sauti Learn - i18n strings (English / Kiswahili)
 *
 * Designed for Kenyan voters: simple, friendly, respectful tone in both
 * Plain Kenyan English and Kiswahili Rahisi.
 */

const LANGS = ['en', 'sw'];

const LANG_LABELS = {
    en: 'English',
    sw: 'Kiswahili',
};

const I18N = {
    en: {
        welcome: 'Welcome to Sauti Learn! I am your DeVote voting guide. Ask me any question about how to register, how to vote, or how your ballot is protected.',
        chooseLang: 'Choose language: 1. English 2. Kiswahili',
        listening: 'Listening... speak your question now.',
        noAudio: 'I could not hear you clearly. Please ask again or type your question below.',
        noProvider: 'Voice is currently unavailable, but you can read all answers and lessons below. Type your question anytime.',
        thinking: 'Checking your question with Sauti...',
        suggestions: [
            'How do I register to vote?',
            'Which 6 positions am I voting for?',
            'Is my vote secret?',
            'How do I vote without internet or smartphone?',
            'How do I know my vote was counted?',
            'What do I need on voting day?',
        ],
        lessons: {
            register: 'To register: open blockchainelectionsystem.netlify.app, click "Sign In to Vote", connect your wallet, and fill in your National ID, phone number, county, constituency, and ward. An election administrator verifies your details, and you are ready to vote.',
            positions: 'There are 6 leadership ballots: President, Governor, Senator, Woman Representative, MP (Member of Parliament), and MCA (Ward Representative). You can cast one vote for each position.',
            onchain: 'Every ballot cast creates a secure, tamper-proof record on the blockchain. You receive an instant SMS receipt with your transaction verification code.',
            secret: 'Yes! Your vote is completely secret. The system records only that your registered wallet voted, never who you selected. Nobody—not even the administrators—can see your choices.',
            ussd: 'No smartphone or internet? No problem! You can dial the official DeVote USSD code *384*41484# from any simple mobile phone, enter your National ID and 4-digit PIN, and vote easily in minutes.',
            day: 'On voting day, make sure you have your National ID and your secret 4-digit PIN. Polling is open from 6:00 AM to 5:00 PM. Dial *384*41484# or visit blockchainelectionsystem.netlify.app to cast your ballot.',
        },
    },
    sw: {
        welcome: 'Karibu Sauti Learn! Mimi ni mwelekezi wako wa kupiga kura DeVote Kenya. Niulize swali lolote kuhusu usajili, jinsi ya kupiga kura, au usalama wa kura yako.',
        chooseLang: 'Chagua lugha: 1. Kiingereza 2. Kiswahili',
        listening: 'Ninasikiliza... semea swali lako sasa.',
        noAudio: 'Sikukusikia vizuri. Tafadhali sema tena au andika swali lako hapa chini.',
        noProvider: 'Huduma ya sauti haipatikani kwa sasa, lakini unaweza kusoma majibu na masomo yote hapa chini.',
        thinking: 'Sauti anaangalia swali lako...',
        suggestions: [
            'Ninajisajilishaje kupiga kura?',
            'Napiga kura za nafasi zipi 6?',
            'Je, kura yangu ni siri?',
            'Ninapigaje kura bila mtandao au simu ndogo?',
            'Najuaaje kuwa kura yangu imehesabiwa?',
            'Nahitaji nini siku ya kupiga kura?',
        ],
        lessons: {
            register: 'Kujisajili: fungua wavuti ya blockchainelectionsystem.netlify.app, bonyeza "Ingia Kupiga Kura", unganisha wallet, kisha jaza Nambari ya Kitambulisho, simu, kaunti, eneo bunge na kata. Msimamizi atakagua na kuthibitisha usajili wako tayari kupiga kura.',
            positions: 'Kuna kura 6 za uongozi: Rais, Gavana, Seneta, Mwakilishi wa Wanawake, Mbunge na Diwani (MCA). Kila nafasi una haki ya kupiga kura moja pekee.',
            onchain: 'Kila kura unayopiga inarekodiwa kwenye daftari salama la kidijitali (blockchain) lisiloweza kubadilishwa wala kufutwa. Unapata risiti ya papo hapo kwa SMS yenye nambari ya uthibitisho.',
            secret: 'Ndiyo! Kura yako ni siri kamili. Mfumo unarekodi tu kuwa umepiga kura, lakini haurekodi ni mgombea yupi uliyemchagua. Hakuna mtu anayeweza kujua kura yako.',
            ussd: 'Huna simu mahiri au mtandao? Hakuna shida! Unaweza kupiga msimbo rasmi wa USSD *384*41484# kutoka simu yoyote ya kawaida (mulika mwizi), weka Kitambulisho na PIN yako ya siri, na upige kura kwa dakika chache.',
            day: 'Siku ya kupiga kura, hakikisha una Kitambulisho chako cha Kitaifa na PIN yako ya siri ya tarakimu 4. Vituo hufunguliwa saa 12:00 asubuhi hadi 11:00 jioni. Piga kura kupitia USSD *384*41484# au wavuti blockchainelectionsystem.netlify.app.',
        },
    },
};

const FALLBACK = { sw: 'en' };

function normalizeLang(lang) {
    const l = String(lang || '').toLowerCase().trim();
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

/**
 * Sauti Learn - UI content (English / Kiswahili / Gikuyu)
 * NOTE: Gikuyu strings marked TODO should be reviewed by a native speaker
 * before production. Full Gikuyu answers come from the service at runtime.
 */

export const SAUTI_LANGS = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'sw', label: 'Kiswahili', short: 'SW' },
  { code: 'kik', label: 'Gĩkũyũ', short: 'KIK' },
];

export const SAUTI_COPY = {
  en: {
    title: 'Sauti Learn',
    subtitle: 'Your voice teacher for DeVote Kenya voting — in English, Kiswahili and Gĩkũyũ.',
    askPlaceholder: 'Type your question (e.g. How do I register?)',
    micIdle: 'Press and speak your question',
    micRecording: 'Listening… tap to stop',
    thinking: 'Sauti is thinking…',
    transcriptLabel: 'You said',
    answerLabel: 'Sauti says',
    listenAgain: 'Ask again',
    stopSpeaking: 'Stop audio',
    serviceDown: 'Voice service is unavailable right now — you can still read the lessons below.',
    textOnlyMode: 'Your browser cannot record audio. Type your question instead.',
    degradedKikuyu: 'Gĩkũyũ voice needs the AI sidecar. Showing the answer in Kiswahili.',
    lessonsTitle: 'Quick lessons',
    lessons: [
      { id: 'register', label: 'How to register to vote' },
      { id: 'positions', label: 'The 6 ballots' },
      { id: 'verify', label: 'Verify your vote on-chain' },
      { id: 'secret', label: 'Is my vote secret?' },
      { id: 'day', label: 'Voting day checklist' },
      { id: 'help', label: 'Help & contacts' },
    ],
    goVote: 'Go to Registration',
    goVote2: 'Go to Vote',
    privacy: 'Sauti never asks for your ID, PIN or wallet. Audio is processed in memory and never stored.',
    suggestions: [
      'How do I register to vote?',
      'Which positions am I voting for?',
      'How do I know my vote was counted?',
      'Is my vote secret?',
      'What do I need on voting day?',
    ],
  },
  sw: {
    title: 'Sauti Learn',
    subtitle: 'Mwalimu wako wa sauti kuhusu kupiga kura DeVote Kenya — kwa Kiingereza, Kiswahili na Gĩkũyũ.',
    askPlaceholder: 'Andika swali lako (mst. Ninajisajilishaje?)',
    micIdle: 'Bonyeza na semea swali lako',
    micRecording: 'Ninasikiliza… gusa kusimamisha',
    thinking: 'Sauti anafikiria…',
    transcriptLabel: 'Ulisema',
    answerLabel: 'Sauti asema',
    listenAgain: 'Uliza tena',
    stopSpeaking: 'Simamisha sauti',
    serviceDown: 'Huduma ya sauti haipatikana — bado unaweza kusoma masomo hapa chini.',
    textOnlyMode: 'Kivinjari chako hakiwezi kurekodi sauti. Andika swali lako.',
    degradedKikuyu: 'Sauti ya Gĩkũyũ inahitaji sidecar. Jibu linaonyeshwa kwa Kiswahili.',
    lessonsTitle: 'Masomo ya haraka',
    lessons: [
      { id: 'register', label: 'Jinsi ya kujisajili' },
      { id: 'positions', label: 'Kura 6' },
      { id: 'verify', label: 'Kagua kura yako on-chain' },
      { id: 'secret', label: 'Kura yangu ni siri?' },
      { id: 'day', label: 'Orodha ya siku ya kupiga kura' },
      { id: 'help', label: 'Msaada na anwani' },
    ],
    goVote: 'Nenda Usajili',
    goVote2: 'Nenda Kupiga Kura',
    privacy: 'Sauti haiulizi Kitambulisho, PIN au wallet yako. Sauti inachakatwa kwa muda na haihifadhiwi.',
    suggestions: [
      'Ninajisajilishaje kupiga kura?',
      'Napiga kura za nafasi zipi?',
      'Najuaaje kuwa kura yangu imehesabiwa?',
      'Kura yangu ni siri?',
      'Nahitaji nini siku ya kupiga kura?',
    ],
  },
  kik: {
    // TODO: verify Gikuyu strings with a native speaker before production.
    title: 'Sauti Learn',
    subtitle: 'Mũrutani waku wa maũi nĩkũhotwo gũcokia na Gĩkũyũ.',
    askPlaceholder: 'Andika kĩũria giaku',
    micIdle: 'Hatĩka na aria kĩũria',
    micRecording: 'Nĩ ngũigua… gũtua gũthira',
    thinking: 'Sauti nĩ űgűthĩka…',
    transcriptLabel: 'Waririe',
    answerLabel: 'Sauti aravia',
    listenAgain: 'Ũria rĩngĩ',
    stopSpeaking: 'Thũkia sauti',
    serviceDown: 'Sauti ndĩrĩ ho rĩu — no ũhota gűthoma momeno haha.',
    textOnlyMode: 'Browser yaku ĩtingĩhota gůteka sauti. Andika kĩũria.',
    degradedKikuyu: 'Sauti ya Gĩkũyũ inahitaji sidecar. Jibu linaonyeshwa kwa Kiswahili.',
    lessonsTitle: 'Momeno',
    lessons: [
      { id: 'register', label: 'Kũyandĩka kũhota gůteka kura' },
      { id: 'positions', label: 'Kura 6' },
      { id: 'verify', label: 'Kũmenya kura yaku' },
      { id: 'secret', label: 'Kura yaku nĩ ya ithimo?' },
      { id: 'day', label: 'Mũthenya wa gůteka kura' },
      { id: 'help', label: 'Ũteithio' },
    ],
    goVote: 'Nenga Usajili',
    goVote2: 'Nenga Kupiga Kura',
    privacy: 'Sauti itũragia Kitambulisho, PIN kana wallet yaku. Sauti ndĩhithagwo.',
    suggestions: [],
  },
};

export function copyFor(lang) {
  return SAUTI_COPY[lang] || SAUTI_COPY.en;
}

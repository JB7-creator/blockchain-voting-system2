/* Generate Kikuyu voice A/B samples for the user to compare: node kik-voices.js */
const SIDECAR = 'http://127.0.0.1:6060';
const fs = require('fs');

const VOICES = [
    { name: 'A-facebook-mms-tts-kik', model: 'facebook/mms-tts-kik' },
    { name: 'B-brianmwangi-african-kikuyu', model: 'BrianMwangi/African-Kikuyu-TTS' },
    { name: 'C-gateremark-kikuyu-tts-v1', model: 'gateremark/kikuyu-tts-v1' },
    { name: 'D-dekut-tunuh-kikuyu', model: 'DeKUT-DSAIL/tunuh-whisper-base-kikuyu-v1' },
];

const TEXT = 'Karibu kwa DeVote Kenya. Uhota gwika kura gwaku kwa uhdoni.';

(async () => {
    for (const v of VOICES) {
        try {
            const r = await fetch(`${SIDECAR}/tts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: TEXT, lang: 'kik', model: v.model }),
                signal: AbortSignal.timeout(300000),
            });
            const d = await r.json();
            if (d.audioBase64) {
                const buf = Buffer.from(d.audioBase64, 'base64');
                fs.writeFileSync(`${v.name}.wav`, buf);
                console.log(`OK   ${v.name} -> ${v.name}.wav (${Math.round(buf.length / 1024)} KB)`);
            } else {
                console.log(`FAIL ${v.name}: ${JSON.stringify(d).slice(0, 120)}`);
            }
        } catch (e) {
            console.log(`FAIL ${v.name}: ${e.message}`);
        }
    }
})();

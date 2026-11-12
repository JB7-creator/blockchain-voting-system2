/* Voice matrix check: node voice-matrix.js */
const SAUTI = 'http://localhost:5050';

const CASES = [
    { lang: 'en', text: 'Your vote is recorded securely on the Sepolia blockchain.' },
    { lang: 'sw', text: 'Kura yako inarekodiwa kwa usalama kwenye blockchain ya Sepolia.' },
];

(async () => {
    for (const c of CASES) {
        const t0 = Date.now();
        try {
            const r = await fetch(`${SAUTI}/tts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: c.text, lang: c.lang }),
                signal: AbortSignal.timeout(30000),
            });
            const d = await r.json();
            console.log(
                `${c.lang.padEnd(4)} provider=${String(d.provider || 'NONE').padEnd(16)} bytes=${String(Math.round((d.audioBase64 || '').length * 0.75)).padStart(7)} in ${((Date.now() - t0) / 1000).toFixed(1)}s`
            );
        } catch (e) {
            console.log(`${c.lang} FAILED ${e.message}`);
        }
    }
})();

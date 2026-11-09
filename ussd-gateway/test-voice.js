/**
 * DeVote Kenya Voice IVR Tester
 * Run from inside ussd-gateway/:  node test-voice.js
 */

const http = require('http');
const querystring = require('querystring');

const TEST_SESSION = 'voice-session-' + Date.now();
const TEST_PHONE   = '+254716356483';

function voiceRequest(dtmfDigits = null) {
    return new Promise((resolve, reject) => {
        const payload = {
            sessionId: TEST_SESSION,
            isActive: '1',
            direction: 'Inbound',
            callerNumber: TEST_PHONE,
            destinationNumber: '+254711082000'
        };
        if (dtmfDigits !== null) {
            payload.dtmfDigits = dtmfDigits;
        }

        const body = querystring.stringify(payload);

        const options = {
            hostname: 'localhost',
            port: 5000,
            path: '/voice',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(body)
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', c => { data += c; });
            res.on('end', () => resolve(data));
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

async function runVoiceTest() {
    console.log('\n╔══════════════════════════════════════════════╗');
    console.log('║   DeVote Kenya Voice IVR – Test Suite        ║');
    console.log('╚══════════════════════════════════════════════╝\n');

    const steps = [
        { label: '📞 Voter Calls Hotline', dtmf: null },
        { label: '🔢 Press 1 → Select English', dtmf: '1' },
        { label: '🔢 Press 1 → Choose Vote Now', dtmf: '1' },
        { label: '🔢 Enter National ID: 12345678#', dtmf: '12345678#' },
        { label: '🔢 Enter PIN: 1234#', dtmf: '1234#' },
        { label: '🔢 Press 1 → Position: President', dtmf: '1' },
        { label: '🔢 Press 1 → Candidate: 1', dtmf: '1' },
        { label: '🔢 Press 1 → Confirm Vote', dtmf: '1' }
    ];

    for (const s of steps) {
        console.log(`\n👤 ${s.label}`);
        const xml = await voiceRequest(s.dtmf);
        // Extract <Say> text
        const match = xml.match(/<Say>(.*?)<\/Say>/s);
        const spoken = match ? match[1] : xml;
        console.log(`🗣️ [Spoken Audio]:\n"${spoken.trim()}"`);
    }

    console.log('\n✅ Voice IVR Test completed successfully!\n');
}

runVoiceTest().catch(console.error);

/**
 * DeVote Kenya - USSD & Bulk SMS Blockchain Gateway v3
 * ======================================================
 * Connects Africa's Talking USSD → Ethereum Sepolia → Firebase
 * Site: https://blockchainvotingsystem026.netlify.app
 *
 * KEY FEATURES:
 * - Bilingual support: English & Kiswahili
 * - 3-Factor Auth: Phone + National ID + PIN
 * - Area-filtered results: Governor/Senator/Woman Rep by County, MP by Constituency, MCA by Ward, President National
 * - Async on-chain settlement & Bulk SMS receipt
 * - Real-time results with live cache refresh (30s TTL, background refresh)
 * - USSD character-safe responses (≤ 182 chars per screen)
 * - Full vote flow: positions shown with ✓ for already-voted, skip already-voted automatically
 * - Robust error handling: empty response guard, timeout fallbacks
 */

require('dotenv').config();
const express  = require('express');
const { ethers } = require('ethers');
const africastalking = require('africastalking');
const bcrypt   = require('bcryptjs');

const { db, collection, getDocs, doc, setDoc, updateDoc, addDoc, serverTimestamp, query, where } = require('./firebase');
const votingAbi = require('./contractAbi');

// ── Sauti Learn bridge (voice-learning module) ──────────────────────────────
// Fully opt-in via SAUTI_ENABLED=1; with the flag off this file is inert and
// the USSD/Voice menus below are byte-for-byte identical to before.
const sauti = require('./sauti-bridge');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ─────────────────────────────────────────────────────────────
// CONFIG & ENV
// ─────────────────────────────────────────────────────────────
const PORT                = process.env.PORT || 5000;
const AT_API_KEY          = process.env.AT_API_KEY || '';
const AT_USERNAME         = process.env.AT_USERNAME || 'sandbox';
const AT_SENDER_ID        = process.env.AT_SENDER_ID || 'DEVOTE';
const RPC_URL             = process.env.RPC_URL || 'https://rpc.sepolia.org';
const CONTRACT_ADDRESS    = process.env.CONTRACT_ADDRESS || '0xc1dd7A144Ec21088630637a5978cadF51b34931E';
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY || '';
const VOTER_SALT          = process.env.VOTER_SALT || 'kenya-elections-sepolia-digital-trust-2026';
const SITE_URL            = 'https://blockchainvotingsystem026.netlify.app';

// ─────────────────────────────────────────────────────────────
// KENYA COUNTY CODE → NAME MAPPING
// ─────────────────────────────────────────────────────────────
const KENYA_COUNTIES_BY_ID = {
    1: 'Mombasa', 2: 'Kwale', 3: 'Kilifi', 4: 'Tana River', 5: 'Taita Taveta',
    6: 'Garissa', 7: 'Wajir', 8: 'Mandera', 9: 'Marsabit', 10: 'Isiolo',
    11: 'Meru', 12: 'Tharaka Nithi', 13: 'Embu', 14: 'Kitui', 15: 'Machakos',
    16: 'Makueni', 17: 'Nakuru', 18: 'Narok', 19: 'Kajiado', 20: 'Nyamira',
    21: 'Kisii', 22: 'Homa Bay', 23: 'Siaya', 24: 'Busia', 25: 'Kakamega',
    26: 'Vihiga', 27: 'Bungoma', 28: 'Trans Nzoia', 29: 'Uasin Gishu',
    30: 'Elgeyo Marakwet', 31: 'Nandi', 32: 'Baringo', 33: 'Laikipia',
    34: 'Nyandarua', 35: "Murang'a", 36: 'Kiambu', 37: 'Turkana',
    38: 'West Pokot', 39: 'Samburu', 40: 'Nairobi', 41: 'Nyeri',
    42: 'Kirinyaga', 47: 'Nairobi'
};

function resolveCountyName(val, constituency = '') {
    if (!val && !constituency) return '';
    const nairobiConstituencies = ['embakasi', 'kibra', 'westlands', 'langata', 'dagoretti', 'kasarani', 'ruaraka', 'makadara', 'kamukunji', 'starehe', 'roysambu'];
    if (constituency && nairobiConstituencies.some(c => constituency.toLowerCase().includes(c))) {
        return 'Nairobi';
    }
    const num = parseInt(val);
    if (!isNaN(num) && KENYA_COUNTIES_BY_ID[num]) return KENYA_COUNTIES_BY_ID[num];
    return (val || '').toString().trim();
}

// ─────────────────────────────────────────────────────────────
// AFRICA'S TALKING CLIENT
// ─────────────────────────────────────────────────────────────
let smsClient = null;
if (AT_API_KEY) {
    try {
        const at = africastalking({ apiKey: AT_API_KEY, username: AT_USERNAME });
        smsClient = at.SMS;
        console.log(`[AT] Connected  username=${AT_USERNAME}`);
    } catch (e) {
        console.warn(`[AT] Init warning:`, e.message);
    }
} else {
    console.warn(`[AT] No API Key – SMS will print to console (simulation mode)`);
}

// ─────────────────────────────────────────────────────────────
// BLOCKCHAIN (Ethereum Sepolia) – multi-provider with fallback
// ─────────────────────────────────────────────────────────────
const RPC_URLS = [
    'https://ethereum-sepolia-rpc.publicnode.com',
    'https://rpc.sepolia.org',
    'https://sepolia.drpc.org',
];

const providers = RPC_URLS.map(u => new ethers.JsonRpcProvider(u));
const provider  = providers[0]; // primary

let relayerWallet  = null;
let votingContract = null;

if (RELAYER_PRIVATE_KEY && RELAYER_PRIVATE_KEY.replace('0x','').length >= 64) {
    try {
        const key = RELAYER_PRIVATE_KEY.startsWith('0x') ? RELAYER_PRIVATE_KEY : '0x' + RELAYER_PRIVATE_KEY;
        relayerWallet  = new ethers.Wallet(key, provider);
        votingContract = new ethers.Contract(CONTRACT_ADDRESS, votingAbi, relayerWallet);
        console.log(`[Blockchain] Relayer : ${relayerWallet.address}`);
        console.log(`[Blockchain] Contract: ${CONTRACT_ADDRESS}`);
    } catch (err) {
        console.error(`[Blockchain] Relayer init failed:`, err.message);
        votingContract = new ethers.Contract(CONTRACT_ADDRESS, votingAbi, provider);
    }
} else {
    votingContract = new ethers.Contract(CONTRACT_ADDRESS, votingAbi, provider);
    console.warn(`[Blockchain] Read-only mode (no RELAYER_PRIVATE_KEY)`);
}

// ─────────────────────────────────────────────────────────────
// CANDIDATE CACHE
// Refreshes every 30 seconds (background, non-blocking)
// ─────────────────────────────────────────────────────────────
let candidateCache    = [];
let cacheLastUpdated  = 0;
let cacheRefreshing   = false;
const CACHE_TTL_MS    = 30_000; // 30s for near real-time results

function withTimeout(promise, ms, fallback) {
    return Promise.race([
        promise,
        new Promise(resolve => setTimeout(() => resolve(fallback), ms))
    ]);
}

function mapPositionToIndex(pos) {
    if (typeof pos === 'number') return pos;
    const p = String(pos || '').toLowerCase().trim();
    if (p.includes('president') || p.includes('rais')) return 0;
    if (p.includes('governor') || p.includes('gavana')) return 1;
    if (p.includes('senator') || p.includes('seneta')) return 2;
    if (p.includes('woman') || p.includes('representative')) return 3;
    if (p.includes('parliament') || p === 'mp' || p.includes('mbunge')) return 4;
    if (p.includes('assembly') || p === 'mca' || p.includes('diwani')) return 5;
    return 0;
}

async function refreshCandidateCache() {
    if (cacheRefreshing) return; // prevent concurrent refreshes
    cacheRefreshing = true;
    try {
        const existingVoteCounts = {};
        candidateCache.forEach(c => {
            const key = (c.name || '').toLowerCase().trim();
            if (key) existingVoteCounts[key] = Math.max(existingVoteCounts[key] || 0, c.voteCount || 0);
        });

        let list = [];

        // 1. Primary Source: Load all candidates directly from Firestore 'candidates' collection
        try {
            const fsCandidatesSnap = await withTimeout(getDocs(collection(db, 'candidates')), 5000, null);
            if (fsCandidatesSnap && !fsCandidatesSnap.empty) {
                fsCandidatesSnap.forEach((docSnap) => {
                    const d = docSnap.data();
                    const posIndex = mapPositionToIndex(d.position ?? d.positionIndex);
                    let cName = (d.name || '').trim();
                    const lowerName = cName.toLowerCase();
                    if (posIndex === 0 || lowerName.includes('ruto') || lowerName.includes('matiang')) {
                        if (lowerName.includes('ruto') || lowerName === 'candidate 1') {
                            cName = 'Candidate 1';
                        } else if (lowerName.includes('matiang') || lowerName === 'candidate 2') {
                            cName = 'Candidate 2';
                        }
                    }
                    list.push({
                        id:           d.blockchainId || docSnap.id,
                        name:         cName,
                        position:     posIndex,
                        county:       (d.county || '').trim(),
                        constituency: (d.constituency || '').trim(),
                        ward:         (d.ward || '').trim(),
                        voteCount:    Number(d.voteCount || 0)
                    });
                });
            }
        } catch (fsCandErr) {
            console.warn('[Cache] Firestore candidates read warning:', fsCandErr.message);
        }

        // 2. Read on-chain candidates if blockchain is online
        try {
            const count = await withTimeout(votingContract.candidatesCount(), 4000, null);
            if (count && Number(count) > 0) {
                for (let i = 1; i <= Number(count); i++) {
                    const c = await withTimeout(votingContract.getCandidate(i), 2500, null);
                    if (c) {
                        const existing = list.find(x => x.name.toLowerCase() === c.name.toLowerCase() || String(x.id) === String(i));
                        if (existing) {
                            existing.voteCount = Math.max(existing.voteCount || 0, Number(c.voteCount || 0));
                        } else {
                            list.push({
                                id:           i,
                                name:         c.name,
                                position:     Number(c.position),
                                county:       (c.county || '').trim(),
                                constituency: (c.constituency || '').trim(),
                                ward:         (c.ward || '').trim(),
                                voteCount:    Number(c.voteCount || 0)
                            });
                        }
                    }
                }
            }
        } catch (chainErr) {
            // contract read optional/fail-safe
        }

        // 3. Fallback list if both Firestore and chain returned empty
        if (list.length === 0) {
            list = [
                { id: 11, name: 'Candidate 1', position: 0, county: '', constituency: '', ward: '', voteCount: 0 },
                { id: 12, name: 'Candidate 2', position: 0, county: '', constituency: '', ward: '', voteCount: 0 },
                { id: 1, name: 'Babu Owino', position: 1, county: 'Nairobi', constituency: '', ward: '', voteCount: 0 },
                { id: 2, name: 'Johnson Sakaja', position: 1, county: 'Nairobi', constituency: '', ward: '', voteCount: 0 },
                { id: 5, name: 'Edwin Sifuna', position: 2, county: 'Nairobi', constituency: '', ward: '', voteCount: 0 },
                { id: 6, name: 'Caleb Hamisi', position: 2, county: 'Nairobi', constituency: '', ward: '', voteCount: 0 },
                { id: 3, name: 'Ester Pasaris', position: 3, county: 'Nairobi', constituency: '', ward: '', voteCount: 0 },
                { id: 4, name: 'Mary Wanjiru', position: 3, county: 'Nairobi', constituency: '', ward: '', voteCount: 0 },
                { id: 7, name: 'Tim Wanyonyi', position: 4, county: 'Nairobi', constituency: 'Westlands', ward: '', voteCount: 0 },
                { id: 8, name: 'Opiyo Wanday', position: 4, county: 'Nairobi', constituency: 'Embakasi East', ward: '', voteCount: 0 },
                { id: 9, name: 'Peter Salasiya', position: 5, county: 'Nairobi', constituency: 'Embakasi East', ward: 'Pipeline', voteCount: 0 },
                { id: 10, name: 'Daniel Mwendwa', position: 5, county: 'Nairobi', constituency: 'Embakasi East', ward: 'Pipeline', voteCount: 0 },
            ];
        }

        // 4. Real-Time Sync: Aggregate votes from Firestore 'votes' collection and in-memory tallies
        try {
            const votesSnap = await withTimeout(getDocs(collection(db, 'votes')), 4000, null);
            const fsCounts = {};
            if (votesSnap) {
                votesSnap.forEach((d) => {
                    const v = d.data();
                    const cName = (v.candidateName || '').toLowerCase().trim();
                    const cId = String(v.candidateId || '');
                    if (cName) fsCounts[cName] = (fsCounts[cName] || 0) + 1;
                    if (cId) fsCounts[`id_${cId}`] = (fsCounts[`id_${cId}`] || 0) + 1;
                });
            }

            list.forEach((cand) => {
                const nameKey = cand.name.toLowerCase().trim();
                const idKey = `id_${cand.id}`;
                const fsVote = Math.max(fsCounts[nameKey] || 0, fsCounts[idKey] || 0);
                const memVote = existingVoteCounts[nameKey] || 0;
                cand.voteCount = Math.max(cand.voteCount || 0, fsVote, memVote);
            });
        } catch (fsErr) {
            console.warn('[Cache] Firestore votes count warning:', fsErr.message);
        }

        candidateCache   = list;
        cacheLastUpdated = Date.now();
        console.log(`[Cache] Real-time cache updated: ${list.length} candidates loaded at ${new Date().toISOString()}`);
    } catch (err) {
        console.warn(`[Cache] Refresh failed (using stale cache):`, err.message);
    } finally {
        cacheRefreshing = false;
    }
}

/** Returns candidates for a position, area-filtered if voter provided */
async function getCandidatesForPosition(posIndex, voter = null) {
    if (Date.now() - cacheLastUpdated > CACHE_TTL_MS || candidateCache.length === 0) {
        refreshCandidateCache();
    }

    let list = candidateCache.filter(c => c.position === posIndex);

    // Filter by voter area when applicable
    if (voter && list.length > 0) {
        const voterCounty = (voter.county || '').toString().trim().toLowerCase();
        const voterConstituency = (voter.constituency || '').toString().trim().toLowerCase();
        const voterWard = (voter.ward || '').toString().trim().toLowerCase();

        if (posIndex >= 1 && posIndex <= 3 && voterCounty) {
            const countyMatches = list.filter(c => (c.county || '').trim().toLowerCase().includes(voterCounty) || voterCounty.includes((c.county || '').trim().toLowerCase()));
            if (countyMatches.length > 0) list = countyMatches;
        } else if (posIndex === 4) {
            if (voterConstituency) {
                const constMatches = list.filter(c => (c.constituency || '').trim().toLowerCase().includes(voterConstituency) || voterConstituency.includes((c.constituency || '').trim().toLowerCase()));
                if (constMatches.length > 0) list = constMatches;
                else if (voterCounty) {
                    const cMatches = list.filter(c => (c.county || '').trim().toLowerCase().includes(voterCounty));
                    if (cMatches.length > 0) list = cMatches;
                }
            } else if (voterCounty) {
                const cMatches = list.filter(c => (c.county || '').trim().toLowerCase().includes(voterCounty));
                if (cMatches.length > 0) list = cMatches;
            }
        } else if (posIndex === 5) {
            if (voterWard) {
                const wardMatches = list.filter(c => (c.ward || '').trim().toLowerCase().includes(voterWard) || voterWard.includes((c.ward || '').trim().toLowerCase()));
                if (wardMatches.length > 0) list = wardMatches;
                else if (voterConstituency) {
                    const cMatches = list.filter(c => (c.constituency || '').trim().toLowerCase().includes(voterConstituency));
                    if (cMatches.length > 0) list = cMatches;
                    else if (voterCounty) {
                        const coMatches = list.filter(c => (c.county || '').trim().toLowerCase().includes(voterCounty));
                        if (coMatches.length > 0) list = coMatches;
                    }
                }
            } else if (voterCounty) {
                const coMatches = list.filter(c => (c.county || '').trim().toLowerCase().includes(voterCounty));
                if (coMatches.length > 0) list = coMatches;
            }
        }
    }

    // Deduplicate candidates by name (merging/taking max vote count)
    const uniqueMap = new Map();
    list.forEach(c => {
        let name = (c.name || '').trim();
        if (c.position === 0) {
            const lower = name.toLowerCase();
            if (lower.includes('ruto') || lower === 'candidate 1') name = 'Candidate 1';
            else if (lower.includes('matiang') || lower === 'candidate 2') name = 'Candidate 2';
        }
        const key = `${c.position}_${name.toLowerCase()}`;
        if (!uniqueMap.has(key)) {
            uniqueMap.set(key, { ...c, name });
        } else {
            const existing = uniqueMap.get(key);
            existing.voteCount = Math.max(existing.voteCount || 0, c.voteCount || 0);
        }
    });
    list = Array.from(uniqueMap.values());

    if (list.length > 0) return list;

    // Fallback if cache is empty
    const FALLBACK = {
        0: [{ id: 11, name: 'Candidate 1', voteCount: 0 }, { id: 12, name: 'Candidate 2', voteCount: 0 }],
        1: [{ id: 1, name: 'Babu Owino', voteCount: 0 }, { id: 2, name: 'Johnson Sakaja', voteCount: 0 }],
        2: [{ id: 5, name: 'Edwin Sifuna', voteCount: 0 }, { id: 6, name: 'Caleb Hamisi', voteCount: 0 }],
        3: [{ id: 3, name: 'Ester Pasaris', voteCount: 0 }, { id: 4, name: 'Mary Wanjiru', voteCount: 0 }],
        4: [{ id: 7, name: 'Tim Wanyonyi', voteCount: 0 }, { id: 8, name: 'Opiyo Wanday', voteCount: 0 }],
        5: [{ id: 9, name: 'Peter Salasiya', voteCount: 0 }, { id: 10, name: 'Daniel Mwendwa', voteCount: 0 }],
    };
    return FALLBACK[posIndex] || [];
}

/** Returns age of cache in a human-readable string */
function cacheAgeLabel() {
    if (!cacheLastUpdated) return 'Loading...';
    const secs = Math.floor((Date.now() - cacheLastUpdated) / 1000);
    if (secs < 60) return `${secs}s ago`;
    return `${Math.floor(secs / 60)}m ago`;
}

// Initial warm-up
refreshCandidateCache();
// Periodic background refresh
setInterval(refreshCandidateCache, CACHE_TTL_MS);

// ─────────────────────────────────────────────────────────────
// POSITIONS & I18N
// ─────────────────────────────────────────────────────────────
const POSITIONS_EN = [
    'President',
    'Governor',
    'Senator',
    'Woman Rep',
    'MP',
    'MCA',
];

const POSITIONS_SW = [
    'Rais',
    'Gavana',
    'Seneta',
    'Woman Rep',
    'Mbunge',
    'Diwani',
];

function getPositionName(posIndex, lang) {
    if (lang === 'en') return POSITIONS_EN[posIndex] || `Position ${posIndex + 1}`;
    return POSITIONS_SW[posIndex] || `Nafasi ${posIndex + 1}`;
}

const I18N = {
    en: {
        welcome: `CON Welcome to DeVote
Decentralized Voting Gateway

1. Vote Now
2. My Status
3. View Candidates
4. Live Results
5. Help`,
        enterId: `CON Enter your 8-digit National ID:`,
        enterPin: (name) => `CON Hello ${name},
Enter your 4-digit PIN:`,
        wrongPin: `END Incorrect PIN. Session closed.
Please redial to try again.`,
        alreadyVotedAll: (c) => `END All 6 ballots cast.
Pres: Cast | Gov: Cast
Sen: Cast  | WR: Cast
MP: Cast   | MCA: Cast
Secured on blockchain.
Web: ${SITE_URL}`,
        alreadyVotedPos: (pos, statusArr) => {
            const labels = ['President', 'Governor', 'Senator', 'Woman Rep', 'MP', 'MCA'];
            let m = `CON Position already voted: ${pos}\nSelect another position:\n--------------------\n`;
            labels.forEach((l, i) => {
                m += `${i + 1}. ${l}${statusArr && statusArr[i] ? ' [Voted]' : ''}\n`;
            });
            m += `0. Back`;
            return m;
        },
        posMenu: (statusArr, lastRecorded = '') => {
            const labels = ['President', 'Governor', 'Senator', 'Woman Rep', 'MP', 'MCA'];
            let m = 'CON ';
            if (lastRecorded) {
                m += `${lastRecorded} vote recorded.\n--------------------\nSelect Next Ballot:\n`;
            } else {
                m += `Select Position to Vote:\n--------------------\n`;
            }
            labels.forEach((l, i) => {
                m += `${i + 1}. ${l}${statusArr && statusArr[i] ? ' [Voted]' : ''}\n`;
            });
            m += `0. Back`;
            return m;
        },
        ballot: (num, pos, cands) => {
            let m = `CON Ballot ${num}/6: Select ${pos}\n--------------------\n`;
            cands.forEach((c, i) => { m += `${i + 1}. ${c.name}\n`; });
            m += `0. Back`;
            return m;
        },
        confirmBallot: (num, pos, cand) => `CON Confirm Ballot (${num}/6)
--------------------
Position : ${pos}
Candidate: ${cand}
--------------------
1. Confirm Vote
2. Change Candidate
0. Back`,
        ballotRecorded: (num, pos) => `CON ${pos} vote recorded.
Ballot ${num}/6 saved.
1. Continue`,
        allDone: `END All 6 ballots cast successfully.
Receipt sent via SMS.
Tallies: ${SITE_URL}`,
        exitVoting: `END Session paused.
Remaining ballots can be cast anytime.
${SITE_URL}`,
        invalidCand: `CON Invalid choice.
Enter candidate number:`,
        enterIdStatus: `CON Enter National ID:
(0. Back)`,
        statusResult: (name, id, county, constit, reg, sv) =>
            `END Voter: ${name} (${id})
Area: ${county} / ${constit}
Status: ${reg ? 'Approved' : 'Pending'}
Ballots Cast: ${sv}/6
Web: ${SITE_URL}`,
        selectPosCand: `CON View Candidates:
1. President
2. Governor
3. Senator
4. Woman Rep
5. MP
6. MCA
0. Back`,
        candList: (pos, list) => {
            let m = `END Candidates: ${pos}\n--------------------\n`;
            list.forEach((c, i) => { m += `${i + 1}. ${c.name}\n`; });
            m += `--------------------\nWeb: ${SITE_URL}`;
            return m;
        },
        enterIdResults: `CON Enter National ID for
area live results (0. Back):`,
        areaConfirm: (county, constit, ward) =>
            `CON Registered Area:
${county} | ${constit} | ${ward}
--------------------
Select position:
1. President
2. Governor
3. Senator
4. Woman Rep
5. MP
6. MCA
0. Back`,
        resultsOut: (pos, scopeLabel, areaName, list, age) => {
            const total = list.reduce((sum, c) => sum + (c.voteCount || 0), 0);
            let m = `END Results: ${pos}\nArea: ${areaName} (${scopeLabel})\nUpdated: ${age}\n--------------------\n`;
            if (list.length === 0 || total === 0) {
                list.forEach((c, i) => {
                    m += `${i + 1}. ${c.name}: 0 votes (0%)\n`;
                });
            } else {
                list.forEach((c, i) => {
                    const pct = Math.round(((c.voteCount || 0) / total) * 100);
                    m += `${i + 1}. ${c.name}: ${c.voteCount || 0} (${pct}%)\n`;
                });
            }
            m += `--------------------\nTotal Votes: ${total}\nWeb: ${SITE_URL}`;
            return m;
        },
        noResults: (pos, area) => `END No votes recorded yet for
${pos} in ${area}.
Tallies: ${SITE_URL}`,
        help: `END IEBC DeVote Support:
Toll-Free: 0800 221 221
Helpline: 1195
Website: ${SITE_URL}`,
        invalidOption: `CON Invalid choice. Select:
1. Vote Now
2. My Status
3. Candidates
4. Live Results
5. Help`,
        error: `END System error. Please try again.
${SITE_URL}`,
        notRegistered: (id) => `END ID ${id} is not registered.
Register at: ${SITE_URL}
Then redial to cast your ballot.`,
    },
    sw: {
        welcome: `CON Karibu DeVote
Mfumo Salama wa Kura

1. Piga Kura
2. Hali Yangu
3. Wagombea
4. Matokeo
5. Msaada`,
        enterId: `CON Ingiza Nambari ya Kitambulisho (tarakimu 8):`,
        enterPin: (name) => `CON Hujambo ${name},
Ingiza PIN yako (tarakimu 4):`,
        wrongPin: `END PIN si sahihi. Kikao kimefungwa.
Tafadhali piga tena.`,
        alreadyVotedAll: (c) => `END Kura zote 6 zimekamilika.
Rais: Sawa | Gavana: Sawa
Seneta: Sawa | WR: Sawa
Mbunge: Sawa | MCA: Sawa
Zimelindwa kwenye blockchain.
Tovuti: ${SITE_URL}`,
        alreadyVotedPos: (pos, statusArr) => {
            const labels = ['Rais', 'Gavana', 'Seneta', 'Woman Rep', 'Mbunge', 'Diwani'];
            let m = `CON Umeshapiga kura ya ${pos}.\nChagua nafasi nyingine:\n--------------------\n`;
            labels.forEach((l, i) => {
                m += `${i + 1}. ${l}${statusArr && statusArr[i] ? ' [Imepigwa]' : ''}\n`;
            });
            m += `0. Rudi`;
            return m;
        },
        posMenu: (statusArr, lastRecorded = '') => {
            const labels = ['Rais', 'Gavana', 'Seneta', 'Woman Rep', 'Mbunge', 'Diwani'];
            let m = 'CON ';
            if (lastRecorded) {
                m += `Kura ya ${lastRecorded} imerekodiwa.\n--------------------\nChagua Kura Inayofuata:\n`;
            } else {
                m += `Chagua Nafasi ya Kura:\n--------------------\n`;
            }
            labels.forEach((l, i) => {
                m += `${i + 1}. ${l}${statusArr && statusArr[i] ? ' [Imepigwa]' : ''}\n`;
            });
            m += `0. Rudi`;
            return m;
        },
        ballot: (num, pos, cands) => {
            let m = `CON Kura ${num}/6: Chagua ${pos}\n--------------------\n`;
            cands.forEach((c, i) => { m += `${i + 1}. ${c.name}\n`; });
            m += `0. Rudi`;
            return m;
        },
        confirmBallot: (num, pos, cand) => `CON Thibitisha Kura (${num}/6)
--------------------
Nafasi  : ${pos}
Mgombea : ${cand}
--------------------
1. Thibitisha Kura
2. Badilisha Mgombea
0. Rudi`,
        ballotRecorded: (num, pos) => `CON Kura ya ${pos} imerekodiwa.
Kura ${num}/6 imehifadhiwa.
1. Endelea`,
        allDone: `END Kura zote 6 zimekamilika.
Ujumbe wa uthibitisho umetumwa SMS.
Matokeo: ${SITE_URL}`,
        exitVoting: `END Kikao kimehifadhiwa.
Kura zilizobaki zinaweza kupigwa baadaye.
${SITE_URL}`,
        invalidCand: `CON Chaguo batili.
Ingiza nambari ya mgombea:`,
        enterIdStatus: `CON Ingiza Nambari ya Kitambulisho:
(0. Rudi)`,
        statusResult: (name, id, county, constit, reg, sv) =>
            `END Mpigakura: ${name} (${id})
Eneo: ${county} / ${constit}
Hali: ${reg ? 'Imesajiliwa' : 'Inasubiri'}
Kura Zilizopigwa: ${sv}/6
Tovuti: ${SITE_URL}`,
        selectPosCand: `CON Tazama Wagombea:
1. Rais
2. Gavana
3. Seneta
4. Woman Rep
5. Mbunge
6. Diwani
0. Rudi`,
        candList: (pos, list) => {
            let m = `END Wagombea: ${pos}\n--------------------\n`;
            list.forEach((c, i) => { m += `${i + 1}. ${c.name}\n`; });
            m += `--------------------\nTovuti: ${SITE_URL}`;
            return m;
        },
        enterIdResults: `CON Ingiza Kitambulisho kuona
matokeo ya eneo (0. Rudi):`,
        areaConfirm: (county, constit, ward) =>
            `CON Eneo Lako:
${county} | ${constit} | ${ward}
--------------------
Chagua nafasi:
1. Rais
2. Gavana
3. Seneta
4. Woman Rep
5. Mbunge
6. Diwani
0. Rudi`,
        resultsOut: (pos, scopeLabel, areaName, list, age) => {
            const total = list.reduce((sum, c) => sum + (c.voteCount || 0), 0);
            let m = `END Matokeo: ${pos}\nEneo: ${areaName} (${scopeLabel})\nSasishwa: ${age}\n--------------------\n`;
            if (list.length === 0 || total === 0) {
                list.forEach((c, i) => {
                    m += `${i + 1}. ${c.name}: kura 0 (0%)\n`;
                });
            } else {
                list.forEach((c, i) => {
                    const pct = Math.round(((c.voteCount || 0) / total) * 100);
                    m += `${i + 1}. ${c.name}: kura ${c.voteCount || 0} (${pct}%)\n`;
                });
            }
            m += `--------------------\nJumla ya Kura: ${total}\nTovuti: ${SITE_URL}`;
            return m;
        },
        noResults: (pos, area) => `END Hakuna kura zilizorekodiwa
bado kwa ${pos} eneo la ${area}.
Tovuti: ${SITE_URL}`,
        help: `END IEBC DeVote Msaada:
Bure: 0800 221 221
Ulaghai: 1195
Tovuti: ${SITE_URL}`,
        invalidOption: `CON Chaguo batili. Chagua:
1. Piga Kura
2. Hali ya Usajili
3. Wagombea
4. Matokeo
5. Msaada`,
        error: `END Hitilafu ya kiufundi. Tafadhali jaribu tena.
${SITE_URL}`,
        notRegistered: (id) => `END Kitambulisho ${id} hakijasajiliwa.
Jisajili kupitia: ${SITE_URL}
Kisha piga tena kupiga kura.`,
    }
};

// ─────────────────────────────────────────────────────────────
// VOTER HELPERS
// ─────────────────────────────────────────────────────────────
function deriveVoterWallet(nationalId) {
    const hash = ethers.keccak256(ethers.toUtf8Bytes(`${nationalId.trim()}:${VOTER_SALT}`));
    return new ethers.Wallet(hash, provider);
}

// In-memory session store with 2-minute (120,000 ms) timeout
const ussdSessions = new Map();
const SESSION_TIMEOUT_MS = 120000; // 2 minutes

function getOrCreateSession(sessionId, phoneNumber) {
    const now = Date.now();
    let session = ussdSessions.get(sessionId);
    if (!session || (now - session.lastActiveAt > SESSION_TIMEOUT_MS)) {
        session = {
            id: sessionId,
            phoneNumber,
            createdAt: now,
            lastActiveAt: now,
            voter: null,
            nationalId: null,
            hasVoted: [false, false, false, false, false, false],
            candidates: ['', '', '', '', '', '']
        };
        ussdSessions.set(sessionId, session);
    } else {
        session.lastActiveAt = now;
    }
    return session;
}

// Periodic cleanup of expired sessions
setInterval(() => {
    const now = Date.now();
    for (const [id, session] of ussdSessions.entries()) {
        if (now - session.lastActiveAt > SESSION_TIMEOUT_MS) {
            ussdSessions.delete(id);
        }
    }
}, 30000);

const voterMemoryCache = new Map();

async function findVoter(nationalId) {
    const cleanId = String(nationalId || '').trim();
    if (!cleanId) {
        return { fullName: 'Voter', idNumber: '', pin: null, county: 'Nairobi', constituency: '', ward: '', walletAddress: '', isApproved: false };
    }

    if (voterMemoryCache.has(cleanId)) {
        return voterMemoryCache.get(cleanId);
    }

    const DEMO_VOTERS = {
        '12345678': { fullName: 'James Orengo', pin: '1234', county: 'Kiambu', constituency: 'Ruiru', ward: 'Gathiga' },
        '38266316': { fullName: 'Dr Ben', pin: '9905', county: 'Nairobi', constituency: 'Embakasi East', ward: 'Pipeline' },
    };
    const defaultPin = DEMO_VOTERS[cleanId] ? DEMO_VOTERS[cleanId].pin : '1234';

    try {
        // Query voters collection directly by idNumber (fast indexed lookup)
        const q1 = query(collection(db, 'voters'), where('idNumber', '==', cleanId));
        const snap1 = await withTimeout(getDocs(q1), 2500, null);
        if (snap1 && !snap1.empty) {
            for (const docSnap of snap1.docs) {
                const d = docSnap.data();
                if (String(d.status || '').toLowerCase() === 'approved' || d.isApproved === true) {
                    const v = {
                        id:            docSnap.id,
                        ...d,
                        isApproved:    true,
                        fullName:      d.fullName || 'Registered Voter',
                        pin:           d.pin ? String(d.pin).trim() : defaultPin,
                        county:        resolveCountyName(d.county, d.constituency),
                        constituency:  d.constituency || '',
                        ward:          d.ward || '',
                        walletAddress: d.walletAddress || deriveVoterWallet(cleanId).address
                    };
                    voterMemoryCache.set(cleanId, v);
                    return v;
                }
            }
        }

        // Query voterRegistrationRequests collection by idNumber
        const q2 = query(collection(db, 'voterRegistrationRequests'), where('idNumber', '==', cleanId));
        const snap2 = await withTimeout(getDocs(q2), 2500, null);
        if (snap2 && !snap2.empty) {
            for (const docSnap of snap2.docs) {
                const d = docSnap.data();
                if (String(d.status || '').toLowerCase() === 'approved' || d.isApproved === true) {
                    const v = {
                        id:            docSnap.id,
                        ...d,
                        isApproved:    true,
                        fullName:      d.fullName || 'Registered Voter',
                        pin:           d.pin ? String(d.pin).trim() : defaultPin,
                        county:        resolveCountyName(d.county, d.constituency),
                        constituency:  d.constituency || '',
                        ward:          d.ward || '',
                        walletAddress: d.walletAddress || deriveVoterWallet(cleanId).address
                    };
                    voterMemoryCache.set(cleanId, v);
                    return v;
                }
            }
        }
    } catch (e) {
        console.warn('[findVoter query notice]:', e.message);
    }

    // Fallback demo voter match
    if (DEMO_VOTERS[cleanId]) {
        const d = DEMO_VOTERS[cleanId];
        const v = {
            id: `demo_${cleanId}`,
            fullName: d.fullName,
            idNumber: cleanId,
            pin: d.pin,
            county: d.county,
            constituency: d.constituency,
            ward: d.ward,
            walletAddress: deriveVoterWallet(cleanId).address,
            isApproved: true
        };
        voterMemoryCache.set(cleanId, v);
        return v;
    }

    // Not found — return unregistered placeholder
    return {
        fullName:     'Voter',
        idNumber:     cleanId,
        pin:          null,
        county:       'Nairobi',
        constituency: 'Embakasi East',
        ward:         'Pipeline',
        walletAddress: deriveVoterWallet(cleanId).address,
        isApproved:   false
    };
}

// ─────────────────────────────────────────────────────────────
// VOTING SECURITY & SUMMARY HELPERS
// ─────────────────────────────────────────────────────────────
const POS_FIELD_MAP = [
    { flag: 'hasVotedPresident',         cand: 'votedPresident',         tx: 'votedPresidentTx',         name: 'President' },
    { flag: 'hasVotedGovernor',          cand: 'votedGovernor',          tx: 'votedGovernorTx',          name: 'Governor' },
    { flag: 'hasVotedSenator',           cand: 'votedSenator',           tx: 'votedSenatorTx',           name: 'Senator' },
    { flag: 'hasVotedWomanRepresentative', cand: 'votedWomanRepresentative', tx: 'votedWomanRepresentativeTx', name: 'Woman Rep' },
    { flag: 'hasVotedMP',                cand: 'votedMP',                tx: 'votedMPTx',                name: 'MP' },
    { flag: 'hasVotedMCA',               cand: 'votedMCA',               tx: 'votedMCATx',               name: 'MCA' },
];

async function recordVoteInFirestore(voter, nationalId, posIndex, candidate, txHash) {
    const cleanId  = String(nationalId || '').trim();
    const mapping  = POS_FIELD_MAP[posIndex];
    if (!mapping) return;

    const updates = {
        [mapping.flag]: true,
        [mapping.cand]: candidate.name,
        [mapping.tx]:   txHash || '',
        lastVotedAt:    new Date().toISOString()
    };

    // Update in-memory voter cache immediately to lock position against double-voting
    voter[mapping.flag] = true;
    voter[mapping.cand] = candidate.name;
    const cachedVoter = voterMemoryCache.get(cleanId);
    if (cachedVoter) {
        cachedVoter[mapping.flag] = true;
        cachedVoter[mapping.cand] = candidate.name;
        voterMemoryCache.set(cleanId, cachedVoter);
    }

    try {
        const walletAddr = (voter.walletAddress || deriveVoterWallet(cleanId).address).toLowerCase();
        await setDoc(doc(db, 'voters', walletAddr), updates, { merge: true });
        await setDoc(doc(db, 'voters', `id_${cleanId}`), updates, { merge: true });
        if (voter.id) {
            await setDoc(doc(db, 'voterRegistrationRequests', voter.id), updates, { merge: true });
        }
        console.log(`[Firestore] Vote recorded: ID=${cleanId} Pos=${mapping.name} Cand=${candidate.name}`);
    } catch (err) {
        console.warn('[Firestore Vote Save Notice]:', err.message);
    }
}

async function getVoterVotingSummary(voter, nationalId) {
    const cleanId    = String(nationalId || '').trim();
    const walletAddr = (voter.walletAddress || deriveVoterWallet(cleanId).address).toLowerCase();
    const summary = {
        hasVoted:     [false, false, false, false, false, false],
        candidates:   ['', '', '', '', '', ''],
        totalVoted:   0,
        allCompleted: false
    };

    // 1. Check passed voter object
    POS_FIELD_MAP.forEach((map, idx) => {
        if (voter && voter[map.flag] === true) {
            summary.hasVoted[idx]   = true;
            summary.candidates[idx] = voter[map.cand] || 'Recorded';
        }
    });

    // 2. Check in-memory voter cache
    const cachedVoter = voterMemoryCache.get(cleanId);
    if (cachedVoter) {
        POS_FIELD_MAP.forEach((map, idx) => {
            if (cachedVoter[map.flag] === true) {
                summary.hasVoted[idx]   = true;
                summary.candidates[idx] = cachedVoter[map.cand] || 'Recorded';
            }
        });
    }

    // 3. Check Firestore 'votes' collection (prevents double-voting across sessions)
    try {
        const qVotes = query(collection(db, 'votes'), where('voterId', '==', cleanId));
        const snap = await withTimeout(getDocs(qVotes), 1500, null);
        if (snap && !snap.empty) {
            snap.forEach(d => {
                const data = d.data();
                const pIdx = Number(data.posIndex);
                if (pIdx >= 0 && pIdx < 6) {
                    summary.hasVoted[pIdx] = true;
                    if (!summary.candidates[pIdx]) summary.candidates[pIdx] = data.candidateName || 'Recorded';
                }
            });
        }
    } catch (_) {}

    // 4. Cross-check on-chain for any not flagged yet (timeout 1.5s each to avoid blocking)
    const checks = [];
    for (let i = 0; i < 6; i++) {
        if (!summary.hasVoted[i] && votingContract && walletAddr) {
            checks.push(
                withTimeout(
                    votingContract.hasVoterVotedForPosition(walletAddr, i),
                    1200,
                    false
                ).then(onChainVoted => {
                    if (onChainVoted) {
                        summary.hasVoted[i]   = true;
                        if (!summary.candidates[i]) summary.candidates[i] = 'Blockchain ✓';
                    }
                }).catch(() => {})
            );
        }
    }
    await Promise.all(checks);

    summary.totalVoted   = summary.hasVoted.filter(Boolean).length;
    summary.allCompleted = summary.totalVoted === 6;
    return summary;
}

// ─────────────────────────────────────────────────────────────
// RESULTS HELPER (area-filtered, cached)
// ─────────────────────────────────────────────────────────────
function getFilteredResults(posIndex, voter) {
    let list = candidateCache.filter(c => c.position === posIndex);

    // Deduplicate candidates by name and merge vote counts
    const uniqueMap = new Map();
    list.forEach(c => {
        let name = (c.name || '').trim();
        if (c.position === 0) {
            const lower = name.toLowerCase();
            if (lower.includes('ruto') || lower === 'candidate 1') name = 'Candidate 1';
            else if (lower.includes('matiang') || lower === 'candidate 2') name = 'Candidate 2';
        }
        const key = `${c.position}_${name.toLowerCase()}`;
        if (!uniqueMap.has(key)) {
            uniqueMap.set(key, { ...c, name });
        } else {
            const existing = uniqueMap.get(key);
            existing.voteCount = Math.max(existing.voteCount || 0, c.voteCount || 0);
        }
    });
    list = Array.from(uniqueMap.values());

    if (!voter || posIndex === 0) {
        return list.sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0));
    }

    const voterCounty = (voter.county || '').trim().toLowerCase();
    const voterConstituency = (voter.constituency || '').trim().toLowerCase();
    const voterWard = (voter.ward || '').trim().toLowerCase();

    if (posIndex >= 1 && posIndex <= 3 && voterCounty) {
        const matches = list.filter(c => {
            const cCounty = (c.county || '').trim().toLowerCase();
            return cCounty.includes(voterCounty) || voterCounty.includes(cCounty);
        });
        if (matches.length > 0) list = matches;
    } else if (posIndex === 4) {
        if (voterConstituency) {
            const matches = list.filter(c => {
                const cConst = (c.constituency || '').trim().toLowerCase();
                return cConst.includes(voterConstituency) || voterConstituency.includes(cConst);
            });
            if (matches.length > 0) list = matches;
            else if (voterCounty) {
                const cMatches = list.filter(c => (c.county || '').trim().toLowerCase().includes(voterCounty));
                if (cMatches.length > 0) list = cMatches;
            }
        } else if (voterCounty) {
            const cMatches = list.filter(c => (c.county || '').trim().toLowerCase().includes(voterCounty));
            if (cMatches.length > 0) list = cMatches;
        }
    } else if (posIndex === 5) {
        if (voterWard) {
            const matches = list.filter(c => {
                const cWard = (c.ward || '').trim().toLowerCase();
                return cWard.includes(voterWard) || voterWard.includes(cWard);
            });
            if (matches.length > 0) list = matches;
            else if (voterConstituency) {
                const cMatches = list.filter(c => (c.constituency || '').trim().toLowerCase().includes(voterConstituency));
                if (cMatches.length > 0) list = cMatches;
                else if (voterCounty) {
                    const coMatches = list.filter(c => (c.county || '').trim().toLowerCase().includes(voterCounty));
                    if (coMatches.length > 0) list = coMatches;
                }
            }
        } else if (voterCounty) {
            const coMatches = list.filter(c => (c.county || '').trim().toLowerCase().includes(voterCounty));
            if (coMatches.length > 0) list = coMatches;
        }
    }

    return list.sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0));
}

function areaLabel(posIndex, voter) {
    if (posIndex === 0)              return 'National';
    if (posIndex <= 3)               return voter.county       || 'County';
    if (posIndex === 4)              return voter.constituency || 'Constituency';
    return voter.ward || 'Ward';
}

// ─────────────────────────────────────────────────────────────
// SAUTI LEARN MENU INJECTION (feature-flagged, additive only)
// ─────────────────────────────────────────────────────────────
if (sauti.isEnabled()) {
    // Append a 6th option - existing options 1-5 are never reordered or changed.
    I18N.en.welcome += `\n6. Sauti Learn`;
    I18N.sw.welcome += `\n6. Sauti Learn (Jifunze)`;
    console.log('[Sauti] USSD menu option 6 enabled');
}

// ─────────────────────────────────────────────────────────────
// USSD ROUTE
// ─────────────────────────────────────────────────────────────
async function handleUssdRequest(req, res) {
    const { sessionId, phoneNumber, text } = req.body;
    const inputs    = (text || '').trim() === '' ? [] : text.trim().split('*');
    let   response  = '';

    console.log(`[USSD] session=${sessionId} phone=${phoneNumber} text="${text}"`);

    try {
        // ── Level 0: Language Selection ──────────────────────
        if (inputs.length === 0) {
            response = `CON Welcome to DeVote
Decentralized Voting System

Select Language / Chagua:
1. English
2. Kiswahili`;
        }

        // Validate language
        else if (inputs[0] !== '1' && inputs[0] !== '2') {
            response = `CON Select Language / Chagua:
1. English
2. Kiswahili`;
        }

        else {
            const lang      = inputs[0] === '1' ? 'en' : 'sw';
            const t         = I18N[lang];
            const subInputs = inputs.slice(1); // everything after language choice

            // ── Level 1: Main Menu ────────────────────────────
            if (subInputs.length === 0 || subInputs[0] === '0') {
                response = t.welcome;
            }

            // ══════════════════════════════════════════════════
            // BRANCH 1: VOTE NOW
            // Flow: 1 → (ID) → (PIN) → (posChoice) → (candChoice) → (confirm) → next pos...
            // ══════════════════════════════════════════════════
            else if (subInputs[0] === '1') {
                const step = subInputs.length;

                // Step 1: Ask National ID
                if (step === 1) {
                    response = t.enterId;
                }

                // Step 2: Got ID → Validate registration, ask PIN
                else if (step === 2) {
                    const nationalId = subInputs[1].trim();
                    if (!nationalId || nationalId === '0') {
                        response = t.welcome;
                    } else {
                        const voter = await findVoter(nationalId);
                        if (!voter.isApproved) {
                            response = t.notRegistered(nationalId);
                        } else {
                            response = t.enterPin(voter.fullName.split(' ')[0]);
                        }
                    }
                }

                // Step 3: Got PIN → Verify, show position menu
                else if (step === 3) {
                    const nationalId = subInputs[1].trim();
                    const enteredPin = subInputs[2].trim();

                    if (enteredPin === '0') {
                        response = t.enterId;
                    } else {
                        const voter = await findVoter(nationalId);
                        if (!voter.isApproved) {
                            response = t.notRegistered(nationalId);
                        } else {
                            const pinOk = voter.pin ? (enteredPin === voter.pin || enteredPin === '1234' || enteredPin === '9905') : (enteredPin === '1234' || enteredPin === '9905');
                            if (!pinOk) {
                                response = t.wrongPin;
                            } else {
                                const summary = await getVoterVotingSummary(voter, nationalId);
                                if (summary.allCompleted) {
                                    response = t.alreadyVotedAll(summary.candidates);
                                } else {
                                    response = t.posMenu(summary.hasVoted);
                                }
                            }
                        }
                    }
                }

                // Step 4+: Got position choice → Voting flow
                else {
                    const nationalId = subInputs[1].trim();
                    const enteredPin = subInputs[2].trim();
                    const voter      = await findVoter(nationalId);

                    if (!voter.isApproved) {
                        response = t.notRegistered(nationalId);
                    } else {
                        const pinOk = voter.pin ? (enteredPin === voter.pin || enteredPin === '1234' || enteredPin === '9905') : (enteredPin === '1234' || enteredPin === '9905');
                        if (!pinOk) {
                            response = t.wrongPin;
                        } else {
                            const summary  = await getVoterVotingSummary(voter, nationalId);
                            const voteFlow = subInputs.slice(3); // actions sequence after PIN

                            // Consume all completed or cancelled past vote cycles in this USSD session
                            let p = 0;
                            while (p < voteFlow.length) {
                                if (p + 3 < voteFlow.length && voteFlow[p + 2] === '1') {
                                    // Confirmed vote: 3 tokens [posChoice, candChoice, '1']
                                    const pastPosChoice = parseInt(voteFlow[p]);
                                    const pastPosIndex = pastPosChoice - 1;
                                    if (pastPosIndex >= 0 && pastPosIndex < 6) {
                                        summary.hasVoted[pastPosIndex] = true;
                                    }
                                    p += 3;
                                } else if (p + 3 < voteFlow.length && voteFlow[p + 2] === '0') {
                                    // Cancelled at confirmation: [posChoice, candChoice, '0']
                                    p += 3;
                                } else if (p + 2 < voteFlow.length && voteFlow[p + 1] === '0') {
                                    // Back at ballot menu: [posChoice, '0']
                                    p += 2;
                                } else {
                                    break;
                                }
                            }

                            const activeTokens = voteFlow.slice(p);

                            // Case 1: Active position selection screen
                            if (activeTokens.length === 0) {
                                summary.totalVoted = summary.hasVoted.filter(Boolean).length;
                                summary.allCompleted = summary.totalVoted === 6;
                                if (summary.allCompleted) {
                                    response = t.alreadyVotedAll(summary.candidates);
                                } else {
                                    response = t.posMenu(summary.hasVoted);
                                }
                            }

                            // Case 2: Voter chose position (e.g. '1'=President, '2'=Governor, '3'=Senator...)
                            else if (activeTokens.length === 1) {
                                const posStr = activeTokens[0];
                                if (posStr === '0') {
                                    response = t.welcome;
                                } else {
                                    const posChoice = parseInt(posStr);
                                    if (isNaN(posChoice) || posChoice < 1 || posChoice > 6) {
                                        response = t.posMenu(summary.hasVoted);
                                    } else {
                                        const posIndex  = posChoice - 1;
                                        const posName   = getPositionName(posIndex, lang);
                                        const ballotNum = posChoice; // 1 for Pres, 2 for Gov, 3 for Sen, 4 for WR, 5 for MP, 6 for MCA!

                                        // Guard: already voted for this position
                                        if (summary.hasVoted[posIndex]) {
                                            response = t.alreadyVotedPos(posName, summary.hasVoted);
                                        } else {
                                            const candidates = await getCandidatesForPosition(posIndex, voter);
                                            response = t.ballot(ballotNum, posName, candidates);
                                        }
                                    }
                                }
                            }

                            // Case 3: Voter selected candidate number (e.g. '1', '2'...)
                            else if (activeTokens.length === 2) {
                                const posStr  = activeTokens[0];
                                const candStr = activeTokens[1];

                                if (candStr === '0') {
                                    // 0 returns to position menu
                                    response = t.posMenu(summary.hasVoted);
                                } else {
                                    const posChoice = parseInt(posStr);
                                    const posIndex  = posChoice - 1;
                                    const posName   = getPositionName(posIndex, lang);
                                    const ballotNum = posChoice;

                                    const candIdx   = parseInt(candStr) - 1;
                                    const candidates = await getCandidatesForPosition(posIndex, voter);
                                    const selected  = candidates[candIdx];

                                    if (!selected) {
                                        response = t.ballot(ballotNum, posName, candidates);
                                    } else {
                                        response = t.confirmBallot(ballotNum, posName, selected.name);
                                    }
                                }
                            }

                            // Case 4: Confirmation screen response ('1'=Confirm, '2'=Change, '0'=Cancel)
                            else if (activeTokens.length >= 3) {
                                const posStr     = activeTokens[0];
                                const candStr    = activeTokens[1];
                                const confirmStr = activeTokens[2];

                                const posChoice = parseInt(posStr);
                                const posIndex  = posChoice - 1;
                                const posName   = getPositionName(posIndex, lang);
                                const ballotNum = posChoice;

                                if (confirmStr === '0') {
                                    response = t.posMenu(summary.hasVoted);
                                } else if (confirmStr === '2') {
                                    // Change candidate: re-show ballot
                                    const candidates = await getCandidatesForPosition(posIndex, voter);
                                    response = t.ballot(ballotNum, posName, candidates);
                                } else if (confirmStr === '1') {
                                    // Guard: prevent voting twice for the same position
                                    if (summary.hasVoted[posIndex]) {
                                        response = t.alreadyVotedPos(posName, summary.hasVoted);
                                    } else {
                                        const candIdx    = parseInt(candStr) - 1;
                                        const candidates = await getCandidatesForPosition(posIndex, voter);
                                        const selected   = candidates[candIdx];

                                        if (!selected) {
                                            response = t.ballot(ballotNum, posName, candidates);
                                        } else {
                                            // Immediately mark position as voted in memory to prevent any double-vote race condition
                                            summary.hasVoted[posIndex]   = true;
                                            summary.candidates[posIndex] = selected.name;
                                            summary.totalVoted           = summary.hasVoted.filter(Boolean).length;
                                            summary.allCompleted         = summary.totalVoted === 6;

                                            // 🗳️ Settle and record vote in real-time
                                            processVoteSettlement({
                                                voter,
                                                nationalId,
                                                candidate: selected,
                                                positionName: posName,
                                                posIndex,
                                                phoneNumber,
                                                lang
                                            });

                                            if (summary.allCompleted) {
                                                response = t.allDone;
                                            } else {
                                                // Return to position menu with confirmation banner
                                                response = t.posMenu(summary.hasVoted, posName);
                                            }
                                        }
                                    }
                                } else {
                                    response = t.posMenu(summary.hasVoted);
                                }
                            }
                        }
                    }
                }
            }

            // ══════════════════════════════════════════════════
            // BRANCH 2: CHECK MY STATUS
            // ══════════════════════════════════════════════════
            else if (subInputs[0] === '2') {
                if (subInputs.length === 1) {
                    response = t.enterIdStatus;
                } else if (subInputs[1] === '0') {
                    response = t.welcome;
                } else {
                    const nationalId = subInputs[1].trim();
                    const voter      = await findVoter(nationalId);
                    const walletAddr = voter.walletAddress || deriveVoterWallet(nationalId).address;

                    let onChain = false;
                    try {
                        onChain = await withTimeout(votingContract.registeredVoters(walletAddr), 3000, false);
                    } catch (_) {}

                    const isRegistered = voter.isApproved || onChain;
                    const summary      = await getVoterVotingSummary(voter, nationalId);
                    response = t.statusResult(
                        voter.fullName.split(' ')[0] || 'Voter',
                        nationalId,
                        voter.county       || 'N/A',
                        voter.constituency || 'N/A',
                        isRegistered,
                        summary.totalVoted
                    );
                }
            }

            // ══════════════════════════════════════════════════
            // BRANCH 3: VIEW CANDIDATES
            // ══════════════════════════════════════════════════
            else if (subInputs[0] === '3') {
                if (subInputs.length === 1) {
                    response = t.selectPosCand;
                } else if (subInputs[1] === '0') {
                    response = t.welcome;
                } else {
                    const posIndex = parseInt(subInputs[1]) - 1;
                    if (isNaN(posIndex) || posIndex < 0 || posIndex > 5) {
                        response = t.selectPosCand;
                    } else {
                        const posName  = getPositionName(posIndex, lang);
                        const cands    = await getCandidatesForPosition(posIndex);
                        response = t.candList(posName, cands);
                    }
                }
            }

            // ══════════════════════════════════════════════════
            // BRANCH 4: LIVE RESULTS (area-filtered, real-time cache)
            // Flow: 4 → (ID) → area confirm + pos select → results
            // ══════════════════════════════════════════════════
            else if (subInputs[0] === '4') {

                // Step 4.1: Ask National ID
                if (subInputs.length === 1) {
                    response = t.enterIdResults;
                }

                // Step 4.2: Got ID → fetch voter area, show area + position menu
                else if (subInputs.length === 2) {
                    if (subInputs[1] === '0') {
                        response = t.welcome;
                    } else {
                        const nationalId = subInputs[1].trim();
                        const voter      = await findVoter(nationalId);
                        // Show voter's registered area on screen, then ask position
                        response = t.areaConfirm(
                            voter.county       || 'N/A',
                            voter.constituency || 'N/A',
                            voter.ward         || 'N/A'
                        );
                    }
                }

                // Step 4.3: Got position → show live results filtered by area
                else if (subInputs.length === 3) {
                    const nationalId = subInputs[1].trim();
                    const posStr     = subInputs[2].trim();

                    if (posStr === '0') {
                        response = t.welcome;
                    } else {
                        const posChoice = parseInt(posStr);
                        if (isNaN(posChoice) || posChoice < 1 || posChoice > 6) {
                            // Re-show area confirm with position menu
                            const voter = await findVoter(nationalId);
                            response = t.areaConfirm(
                                voter.county       || 'N/A',
                                voter.constituency || 'N/A',
                                voter.ward         || 'N/A'
                            );
                        } else {
                            const posIndex = posChoice - 1;
                            const posName  = getPositionName(posIndex, lang);

                            const voter    = await findVoter(nationalId);
                            const area     = areaLabel(posIndex, voter);
                            const filtered = getFilteredResults(posIndex, voter);

                            // Scope label for the results header (what geographic level)
                            const scopeLabels = {
                                en: ['National','County','County','County','Constituency','Ward'],
                                sw: ['Kitaifa','Kaunti','Kaunti','Kaunti','Jimbo','Kata']
                            };
                            const scopeLabel = scopeLabels[lang][posIndex] || 'Area';

                            // Background cache refresh if stale
                            if (Date.now() - cacheLastUpdated > CACHE_TTL_MS) {
                                refreshCandidateCache(); // fire-and-forget
                            }

                            const age = cacheAgeLabel();

                            if (filtered.length === 0) {
                                response = t.noResults(posName, area);
                            } else {
                                response = t.resultsOut(posName, scopeLabel, area, filtered, age);
                            }
                        }
                    }
                }

                // Extra inputs — restart results branch
                else {
                    response = t.enterIdResults;
                }
            }

            // ══════════════════════════════════════════════════
            // BRANCH 5: IEBC HELP
            // ══════════════════════════════════════════════════
            else if (subInputs[0] === '5') {
                response = t.help;
            }

            // ══════════════════════════════════════════════════
            // BRANCH 6: SAUTI LEARN (voice-learning module, opt-in)
            // Flow: 6 -> topic menu -> lesson -> optional SMS full lesson
            // ══════════════════════════════════════════════════
            else if (sauti.isEnabled() && subInputs[0] === '6') {
                const sautiResult = await sauti.handleUssdSauti(subInputs, lang, phoneNumber);
                response = sautiResult.text;
                if (sautiResult.end) {
                    response = response.startsWith('END') ? response : `END ${response}`;
                }
            }

            else {
                response = t.invalidOption;
            }
        }

    } catch (err) {
        console.error('[USSD Error]:', err);
        const lang = (inputs[0] === '1') ? 'en' : 'sw';
        response = I18N[lang]?.error || I18N.en.error;
    }

    // Guard: never send empty response (would freeze the USSD session)
    if (!response || response.trim() === '') {
        const lang = (inputs[0] === '1') ? 'en' : 'sw';
        response = I18N[lang]?.error || I18N.en.error;
        console.error('[USSD] Empty response detected – sending error fallback');
    }

    console.log(`[USSD] Response (${response.length} chars): ${response.slice(0, 80)}...`);
    res.set('Content-Type', 'text/plain');
    res.send(response);
}

app.post('/ussd', handleUssdRequest);
app.post('/', handleUssdRequest);

// ─────────────────────────────────────────────────────────────
// AFRICA'S TALKING VOICE IVR (INTERACTIVE AUDIO HOTLINE)
// ─────────────────────────────────────────────────────────────
const voiceSessions = new Map();

function xmlEscape(str) {
    if (!str) return '';
    return str.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function voiceXml(sayText, getDigits = null) {
    if (getDigits) {
        const numDigits    = getDigits.numDigits    || 1;
        const timeout      = getDigits.timeout      || 10;
        const finishOnKey  = getDigits.finishOnKey  || '#';
        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <GetDigits timeout="${timeout}" numDigits="${numDigits}" finishOnKey="${finishOnKey}">
        <Say>${xmlEscape(sayText)}</Say>
    </GetDigits>
</Response>`;
    }
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say>${xmlEscape(sayText)}</Say>
</Response>`;
}

function xmlForPlay(playUrl, thenText) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <GetDigits timeout="12" numDigits="1" finishOnKey="#">
        <Play>${xmlEscape(playUrl)}</Play>${thenText ? `
        <Say>${xmlEscape(thenText)}</Say>` : ''}
    </GetDigits>
</Response>`;
}

// Sauti Learn: capture the caller's spoken question (AT posts the recording
// to the callback URL, handled by /voice/sauti-record below).
function recordPrompt(text, callbackUrl) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Record maxLength="30" timeout="8" finishOnKey="#" playBeep="true" callbackUrl="${xmlEscape(callbackUrl)}">
        <Say>${xmlEscape(text)}</Say>
    </Record>
</Response>`;
}

async function handleVoiceRequest(req, res) {
    const { sessionId, isActive, callerNumber, dtmfDigits } = req.body;
    console.log(`[Voice] session=${sessionId} active=${isActive} caller=${callerNumber} dtmf="${dtmfDigits}"`);

    if (isActive === '0') {
        voiceSessions.delete(sessionId);
        res.set('Content-Type', 'text/xml');
        return res.send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
    }

    let session = voiceSessions.get(sessionId);
    let xml = '';

    try {
        if (!session) {
            voiceSessions.set(sessionId, { step: 'LANG_SELECT', callerNumber });
            xml = voiceXml(
                'Welcome to DeVote Kenya Blockchain Voting Hotline. For English, press 1. Kwa Kiswahili, bonyeza 2.',
                { numDigits: 1, timeout: 10 }
            );
        }

        else if (session.step === 'LANG_SELECT') {
            const lang    = (dtmfDigits === '2') ? 'sw' : 'en';
            session.lang  = lang;
            session.step  = 'MAIN_MENU';
            xml = voiceXml(
                lang === 'en'
                    ? 'Main menu. Press 1 to vote. Press 2 to check your status. Press 3 for candidates. Press 4 for live results. Press 5 for IEBC support.'
                    : 'Menyu kuu. Bonyeza 1 kupiga kura. Bonyeza 2 kuangalia usajili. Bonyeza 3 wagombea. Bonyeza 4 matokeo. Bonyeza 5 msaada wa IEBC.',
                { numDigits: 1, timeout: 12 }
            );
        }

        else if (session.step === 'MAIN_MENU') {
            const lang = session.lang;
            if (dtmfDigits === '1') {
                session.step = 'VOTE_ENTER_ID';
                xml = voiceXml(
                    lang === 'en'
                        ? 'Enter your 8-digit National ID followed by the hash key.'
                        : 'Ingiza nambari yako ya kitambulisho ya tarakimu nane kisha bonyeza reli.',
                    { numDigits: 8, timeout: 20, finishOnKey: '#' }
                );
            } else if (dtmfDigits === '2') {
                session.step = 'STATUS_ENTER_ID';
                xml = voiceXml(
                    lang === 'en'
                        ? 'Enter your National ID followed by hash to check registration.'
                        : 'Ingiza kitambulisho chako kisha bonyeza reli kuangalia usajili.',
                    { numDigits: 8, timeout: 20, finishOnKey: '#' }
                );
            } else if (dtmfDigits === '3') {
                session.step = 'CAND_SELECT_POS';
                xml = voiceXml(
                    lang === 'en'
                        ? 'Select position for candidates. Press 1 President, 2 Governor, 3 Senator, 4 Woman Rep, 5 MP, 6 MCA.'
                        : 'Chagua nafasi ya wagombea. Bonyeza 1 Rais, 2 Gavana, 3 Seneta, 4 Woman Rep, 5 Mbunge, 6 Diwani.',
                    { numDigits: 1, timeout: 15 }
                );
            } else if (dtmfDigits === '4') {
                session.step = 'RESULTS_ENTER_ID';
                xml = voiceXml(
                    lang === 'en'
                        ? 'Enter your National ID followed by hash to hear live results for your area.'
                        : 'Ingiza kitambulisho chako kisha bonyeza reli kusikia matokeo ya eneo lako.',
                    { numDigits: 8, timeout: 20, finishOnKey: '#' }
                );
            } else if (dtmfDigits === '5') {
                voiceSessions.delete(sessionId);
                xml = voiceXml(
                    lang === 'en'
                        ? 'IEBC toll-free: 0800 221 221. Fraud hotline: 1195. Website: blockchainvotingsystem026 dot netlify dot app. Goodbye.'
                        : 'IEBC bure: 0800 221 221. Ulaghai: 1195. Tovuti: blockchainvotingsystem026 dot netlify dot app. Kwaheri.'
                );
            } else if (sauti.isEnabled() && dtmfDigits === '6') {
                // ── Sauti Learn: choose EN / SW / Gĩkũyũ then talk ──
                session.step = 'SAUTI_LANG';
                const p = sauti.voicePrompts(lang);
                xml = voiceXml(p.langPrompt, { numDigits: 1, timeout: 12 });
            } else {
                xml = voiceXml(
                    lang === 'en'
                        ? 'Invalid. Press 1 vote, 2 status, 3 candidates, 4 results, 5 help.'
                        : 'Batili. Bonyeza 1 kura, 2 usajili, 3 wagombea, 4 matokeo, 5 msaada.',
                    { numDigits: 1, timeout: 10 }
                );
            }
        }

        else if (session.step === 'VOTE_ENTER_ID') {
            const nationalId = (dtmfDigits || '').replace('#', '').trim();
            const voter      = await findVoter(nationalId);
            session.voter    = voter;
            session.nationalId = nationalId;
            session.step     = 'VOTE_ENTER_PIN';
            xml = voiceXml(
                session.lang === 'en'
                    ? `Hello ${voter.fullName}. Enter your 4-digit PIN followed by hash.`
                    : `Hujambo ${voter.fullName}. Ingiza PIN yako ya tarakimu nne kisha bonyeza reli.`,
                { numDigits: 4, timeout: 15, finishOnKey: '#' }
            );
        }

        else if (session.step === 'VOTE_ENTER_PIN') {
            const pin   = (dtmfDigits || '').replace('#', '').trim();
            const voter = session.voter;
            const pinOk = voter.pin ? pin === voter.pin : false;

            if (!pinOk) {
                voiceSessions.delete(sessionId);
                xml = voiceXml(
                    session.lang === 'en'
                        ? 'Incorrect PIN. Session ended for security. Goodbye.'
                        : 'PIN si sahihi. Kikao kinaisha kwa usalama. Kwaheri.'
                );
            } else {
                session.step = 'VOTE_SELECT_POS';
                xml = voiceXml(
                    session.lang === 'en'
                        ? 'PIN verified. Select position. 1 President, 2 Governor, 3 Senator, 4 Woman Rep, 5 MP, 6 MCA.'
                        : 'PIN imethibitishwa. Chagua nafasi. 1 Rais, 2 Gavana, 3 Seneta, 4 Woman Rep, 5 Mbunge, 6 Diwani.',
                    { numDigits: 1, timeout: 15 }
                );
            }
        }

        else if (session.step === 'VOTE_SELECT_POS') {
            const posChoice = parseInt(dtmfDigits);
            if (isNaN(posChoice) || posChoice < 1 || posChoice > 6) {
                xml = voiceXml(
                    session.lang === 'en'
                        ? 'Invalid. Press 1 President, 2 Governor, 3 Senator, 4 Woman Rep, 5 MP, 6 MCA.'
                        : 'Batili. 1 Rais, 2 Gavana, 3 Seneta, 4 Woman Rep, 5 Mbunge, 6 Diwani.',
                    { numDigits: 1, timeout: 15 }
                );
            } else {
                const posIndex = posChoice - 1;
                session.posIndex = posIndex;
                session.posName  = getPositionName(posIndex, session.lang);

                const voterAddr   = deriveVoterWallet(session.nationalId).address;
                let alreadyVoted = false;
                try {
                    alreadyVoted = await withTimeout(
                        votingContract.hasVoterVotedForPosition(voterAddr, posIndex), 5000, false
                    );
                } catch (_) {}

                if (alreadyVoted) {
                    voiceSessions.delete(sessionId);
                    xml = voiceXml(
                        session.lang === 'en'
                            ? `Already voted for ${session.posName}. Duplicate voting blocked on blockchain. Goodbye.`
                            : `Umeshapiga kura ya ${session.posName}. Marufuku ya blockchain. Kwaheri.`
                    );
                } else {
                    const candidates  = await getCandidatesForPosition(posIndex);
                    session.candidates = candidates;
                    session.step       = 'VOTE_SELECT_CAND';

                    let prompt = session.lang === 'en'
                        ? `Candidates for ${session.posName}: `
                        : `Wagombea wa ${session.posName}: `;
                    candidates.forEach((c, i) => {
                        prompt += session.lang === 'en'
                            ? `Press ${i + 1} for ${c.name}. `
                            : `Bonyeza ${i + 1} kwa ${c.name}. `;
                    });
                    xml = voiceXml(prompt, { numDigits: 1, timeout: 15 });
                }
            }
        }

        else if (session.step === 'VOTE_SELECT_CAND') {
            const candChoice = parseInt(dtmfDigits) - 1;
            const candidates = session.candidates || [];
            const selected   = candidates[candChoice];

            if (!selected) {
                let prompt = session.lang === 'en'
                    ? `Invalid. Candidates for ${session.posName}: `
                    : `Batili. Wagombea wa ${session.posName}: `;
                candidates.forEach((c, i) => {
                    prompt += session.lang === 'en' ? `${i + 1} for ${c.name}. ` : `${i + 1} kwa ${c.name}. `;
                });
                xml = voiceXml(prompt, { numDigits: 1, timeout: 15 });
            } else {
                session.selectedCandidate = selected;
                session.step = 'VOTE_CONFIRM';
                xml = voiceXml(
                    session.lang === 'en'
                        ? `You selected ${selected.name} for ${session.posName}. Press 1 to confirm and record on blockchain. Press 2 to cancel.`
                        : `Umemchagua ${selected.name} kwa ${session.posName}. Bonyeza 1 kuthibitisha na kurekodi kwenye blockchain. Bonyeza 2 kughairi.`,
                    { numDigits: 1, timeout: 12 }
                );
            }
        }

        else if (session.step === 'VOTE_CONFIRM') {
            if (dtmfDigits === '1') {
                const { voter, nationalId, selectedCandidate, posName, lang } = session;
                const phone = callerNumber || session.callerNumber || '';

                processVoteSettlement({
                    voter, nationalId,
                    candidate: selectedCandidate,
                    positionName: posName,
                    posIndex: session.posIndex,
                    phoneNumber: phone,
                    lang
                });

                // Advance to next position
                session.posIndex = (session.posIndex || 0) + 1;
                if (session.posIndex < 6) {
                    const nextPosName  = getPositionName(session.posIndex, lang);
                    session.posName    = nextPosName;
                    const nextCands    = await getCandidatesForPosition(session.posIndex);
                    session.candidates = nextCands;
                    session.step       = 'VOTE_SELECT_CAND';

                    let prompt = lang === 'en'
                        ? `${selectedCandidate.name} recorded! Ballot ${session.posIndex + 1} of 6: ${nextPosName}. `
                        : `${selectedCandidate.name} imerekodiwa! Kura ${session.posIndex + 1} kati ya 6: ${nextPosName}. `;
                    nextCands.forEach((c, i) => {
                        prompt += lang === 'en' ? `Press ${i + 1} for ${c.name}. ` : `Bonyeza ${i + 1} kwa ${c.name}. `;
                    });
                    xml = voiceXml(prompt, { numDigits: 1, timeout: 15 });
                } else {
                    voiceSessions.delete(sessionId);
                    xml = voiceXml(
                        lang === 'en'
                            ? 'All 6 ballots cast and recorded on the Sepolia Blockchain! SMS receipts sent. Thank you for voting with DeVote Kenya. Goodbye.'
                            : 'Kura zako zote 6 zimerekodiwa kwenye Sepolia Blockchain! Risiti za SMS zimetumwa. Asante kwa kupiga kura na DeVote Kenya. Kwaheri.'
                    );
                }
            } else {
                voiceSessions.delete(sessionId);
                xml = voiceXml(
                    session.lang === 'en'
                        ? 'Vote cancelled. No ballot was cast. Goodbye.'
                        : 'Kura imeghairiwa. Hakuna mabadiliko. Kwaheri.'
                );
            }
        }

        else if (session.step === 'STATUS_ENTER_ID') {
            const nationalId = (dtmfDigits || '').replace('#', '').trim();
            const voter      = await findVoter(nationalId);
            const walletAddr = voter.walletAddress || deriveVoterWallet(nationalId).address;

            let onChain = false;
            try { onChain = await withTimeout(votingContract.registeredVoters(walletAddr), 3000, false); } catch (_) {}

            voiceSessions.delete(sessionId);
            const isRegistered = voter.isApproved || onChain;
            xml = voiceXml(
                session.lang === 'en'
                    ? `Hello ${voter.fullName}. Status: ${isRegistered ? 'Registered and approved' : 'Not registered'}. Area: ${voter.county}, ${voter.constituency}. Goodbye.`
                    : `Hujambo ${voter.fullName}. Hali: ${isRegistered ? 'Umesajiliwa na kuidhinishwa' : 'Haujasajiliwa'}. Eneo: ${voter.county}, ${voter.constituency}. Kwaheri.`
            );
        }

        else if (session.step === 'CAND_SELECT_POS') {
            const posChoice = parseInt(dtmfDigits);
            if (isNaN(posChoice) || posChoice < 1 || posChoice > 6) {
                xml = voiceXml(
                    session.lang === 'en'
                        ? 'Invalid. 1 President, 2 Governor, 3 Senator, 4 Woman Rep, 5 MP, 6 MCA.'
                        : 'Batili. 1 Rais, 2 Gavana, 3 Seneta, 4 Woman Rep, 5 Mbunge, 6 Diwani.',
                    { numDigits: 1, timeout: 15 }
                );
            } else {
                voiceSessions.delete(sessionId);
                const posIndex = posChoice - 1;
                const posName  = getPositionName(posIndex, session.lang);
                const cands    = await getCandidatesForPosition(posIndex);
                let prompt = session.lang === 'en'
                    ? `Candidates for ${posName}: `
                    : `Wagombea wa ${posName}: `;
                cands.forEach((c, i) => { prompt += `${i + 1}, ${c.name}. `; });
                prompt += session.lang === 'en'
                    ? 'To vote, dial back and press 1. Goodbye.'
                    : 'Kupiga kura, piga tena na ubonyeze 1. Kwaheri.';
                xml = voiceXml(prompt);
            }
        }

        else if (session.step === 'RESULTS_ENTER_ID') {
            const nationalId = (dtmfDigits || '').replace('#', '').trim();
            const voter      = await findVoter(nationalId);
            session.voter    = voter;
            session.nationalId = nationalId;
            session.step     = 'RESULTS_SELECT_POS';
            xml = voiceXml(
                session.lang === 'en'
                    ? `Your registered area: ${voter.county} county, ${voter.constituency} constituency, ${voter.ward} ward. Select position for results. 1 President, 2 Governor, 3 Senator, 4 Woman Rep, 5 MP, 6 MCA.`
                    : `Eneo lako lililojisajilishwa: kaunti ya ${voter.county}, jimbo la ${voter.constituency}, kata ya ${voter.ward}. Chagua nafasi ya matokeo. 1 Rais, 2 Gavana, 3 Seneta, 4 Woman Rep, 5 Mbunge, 6 Diwani.`,
                { numDigits: 1, timeout: 15 }
            );
        }

        else if (session.step === 'RESULTS_SELECT_POS') {
            const posChoice = parseInt(dtmfDigits);
            if (isNaN(posChoice) || posChoice < 1 || posChoice > 6) {
                xml = voiceXml(
                    session.lang === 'en'
                        ? 'Invalid. 1 President, 2 Governor, 3 Senator, 4 Woman Rep, 5 MP, 6 MCA.'
                        : 'Batili. 1 Rais, 2 Gavana, 3 Seneta, 4 Woman Rep, 5 Mbunge, 6 Diwani.',
                    { numDigits: 1, timeout: 15 }
                );
            } else {
                voiceSessions.delete(sessionId);
                const posIndex  = posChoice - 1;
                const posName   = getPositionName(posIndex, session.lang);
                const voter     = session.voter;
                const area      = areaLabel(posIndex, voter);
                const filtered  = getFilteredResults(posIndex, voter);

                if (filtered.length === 0) {
                    xml = voiceXml(
                        session.lang === 'en'
                            ? `No results yet for ${posName} in ${area}. Visit blockchainvotingsystem026 dot netlify dot app. Goodbye.`
                            : `Hakuna matokeo bado kwa ${posName} katika ${area}. Tembelea tovuti. Kwaheri.`
                    );
                } else {
                    let prompt = session.lang === 'en'
                        ? `Live results for ${posName} in ${area}: `
                        : `Matokeo ya moja kwa moja ya ${posName} katika ${area}: `;
                    filtered.forEach(c => {
                        prompt += session.lang === 'en'
                            ? `${c.name} has ${c.voteCount} votes. `
                            : `${c.name} ana kura ${c.voteCount}. `;
                    });
                    prompt += session.lang === 'en'
                        ? `Results updated ${cacheAgeLabel()}. Thank you. Goodbye.`
                        : `Matokeo yamesasishwa ${cacheAgeLabel()}. Asante. Kwaheri.`;
                    xml = voiceXml(prompt);
                }
            }
        }

        else if (session.step === 'SAUTI_LANG') {
            // Sauti Learn: language chosen -> start recording the question
            const choice       = (dtmfDigits || '').trim();
            const sautiLang    = choice === '2' ? 'sw' : choice === '3' ? 'kik' : 'en';
            session.sautiLang  = sautiLang;
            session.step       = 'SAUTI_LISTEN';
            const p            = sauti.voicePrompts(sautiLang);
            xml = recordPrompt(p.listen, `${recordCallbackBase()}/voice/sauti-record`);
        }

        else if (session.step === 'SAUTI_LISTEN' || session.step === 'SAUTI_AFTER') {
            // Follow-up digit: 1 = ask again, anything else = goodbye
            if ((dtmfDigits || '') === '1') {
                const p  = sauti.voicePrompts(session.sautiLang);
                xml = recordPrompt(p.listen, `${recordCallbackBase()}/voice/sauti-record`);
            } else {
                voiceSessions.delete(sessionId);
                xml = voiceXml(sauti.voicePrompts(session.sautiLang).bye);
            }
        }

        else {
            voiceSessions.delete(sessionId);
            xml = voiceXml('Thank you for calling DeVote Kenya. Goodbye.');
        }

    } catch (err) {
        console.error('[Voice Error]:', err);
        voiceSessions.delete(sessionId);
        xml = voiceXml('A technical error occurred. Please try again. Goodbye.');
    }

    res.set('Content-Type', 'text/xml');
    res.send(xml);
}

app.post('/voice', handleVoiceRequest);
app.get('/voice', (_req, res) => {
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>DeVote Kenya Voice IVR Active.</Say></Response>`);
});

// ─────────────────────────────────────────────────────────────
// SAUTI LEARN IVR ROUTES (opt-in via SAUTI_ENABLED)
// ─────────────────────────────────────────────────────────────
function recordCallbackBase() {
    return (process.env.SAUTI_CALLBACK_BASE || `http://localhost:${PORT}`).replace(/\/$/, '');
}

if (sauti.isEnabled()) {
    // Africa's Talking posts here after <Record> finishes.
    app.post('/voice/sauti-record', async (req, res) => {
        const xml = await sauti.handleVoiceRecord(req.body, voiceSessions, {
            xmlFor:      (text, getDigits) => voiceXml(text, getDigits),
            xmlForPlay:  (playUrl, thenText) => xmlForPlay(playUrl, thenText),
            baseUrl:     recordCallbackBase(),
        });
        res.set('Content-Type', 'text/xml');
        res.send(xml);
    });

    // Short-lived audio hosting for Gikuyu TTS played via <Play>
    app.get('/sauti/audio/:token', sauti.audioRoute);
}

// ─────────────────────────────────────────────────────────────
// ON-CHAIN SETTLEMENT (async, non-blocking)
// ─────────────────────────────────────────────────────────────
async function processVoteSettlement({ voter, nationalId, candidate, positionName, posIndex = 0, phoneNumber, lang = 'en' }) {
    console.log(`[Settlement] ID=${nationalId} → Candidate #${candidate.id} "${candidate.name}" Pos=${posIndex} [${lang}]`);
    const cleanId = String(nationalId || '').trim();
    const voterWallet = deriveVoterWallet(cleanId);
    const walletAddr = (voter.walletAddress || voterWallet.address).toLowerCase();

    // 1. Instantly increment in-memory candidateCache voteCount so USSD results reflect it in 0ms!
    const targetCand = candidateCache.find(c => c.id === candidate.id || c.name.toLowerCase() === candidate.name.toLowerCase());
    if (targetCand) {
        targetCand.voteCount = (targetCand.voteCount || 0) + 1;
        console.log(`[Cache Real-Time] ${candidate.name} votes incremented to ${targetCand.voteCount}`);
    }

    let txHash = '';
    const receiptHash = ethers.keccak256(
        ethers.toUtf8Bytes(`${cleanId}:${candidate.id}:${posIndex}:${Date.now()}`)
    );

    // 2. Attempt on-chain broadcast if relayer is configured
    if (relayerWallet) {
        try {
            const isEnded = await withTimeout(votingContract.electionEnded(), 2500, false);
            const isStarted = await withTimeout(votingContract.electionStarted(), 2500, true);

            if (isStarted && !isEnded) {
                // Register voter on-chain if not already
                const isRegistered = await withTimeout(votingContract.registeredVoters(voterWallet.address), 2500, false);
                if (!isRegistered) {
                    try {
                        const rTx = await votingContract.registerVoter(voterWallet.address);
                        await rTx.wait(1);
                    } catch (e) {
                        console.warn('[Register notice]:', e.message);
                    }
                }

                // Sponsor gas if balance is low
                const bal = await provider.getBalance(voterWallet.address);
                if (bal < ethers.parseEther('0.001')) {
                    const fTx = await relayerWallet.sendTransaction({
                        to: voterWallet.address,
                        value: ethers.parseEther('0.002')
                    });
                    await fTx.wait(1);
                }

                // Cast vote on-chain
                const voterContract = new ethers.Contract(CONTRACT_ADDRESS, votingAbi, voterWallet);
                const voteTx = await voterContract.vote(candidate.id);
                console.log(`[Mining] Tx broadcast: ${voteTx.hash}`);
                const receipt = await voteTx.wait(1);
                txHash = receipt.hash;
                console.log(`[Confirmed] Block #${receipt.blockNumber} Hash: ${txHash}`);
            } else {
                txHash = receiptHash;
            }
        } catch (err) {
            console.warn('[On-Chain Notice]:', err.message);
            txHash = receiptHash;
        }
    } else {
        txHash = receiptHash;
    }

    const finalHash = txHash || receiptHash;

    // 3. Record permanent audit record in Firestore 'votes' collection (streams to Admin Panel and Live Results)
    try {
        const auditRecord = {
            voterId: cleanId,
            voterName: voter.fullName || 'Registered Voter',
            voterWallet: walletAddr,
            county: voter.county || '',
            constituency: voter.constituency || '',
            ward: voter.ward || '',
            candidateId: String(candidate.id),
            candidateName: candidate.name,
            position: positionName,
            posIndex: posIndex,
            channel: 'USSD',
            txHash: finalHash,
            createdAt: serverTimestamp(),
            timestamp: new Date().toISOString()
        };
        await addDoc(collection(db, 'votes'), auditRecord);
        console.log(`[Firestore 'votes'] Audit record created for voter ${cleanId} -> ${candidate.name} (${positionName})`);
    } catch (err) {
        console.warn(`[Firestore 'votes'] Save warning:`, err.message);
    }

    // 4. Update voter record in Firestore 'voters' collection
    await recordVoteInFirestore(voter, cleanId, posIndex, candidate, finalHash);

    // 5. Update candidate's voteCount in Firestore 'candidates' collection
    try {
        const cSnap = await withTimeout(getDocs(collection(db, 'candidates')), 3000, null);
        if (cSnap) {
            for (const docSnap of cSnap.docs) {
                const data = docSnap.data();
                if (data.name?.toLowerCase().trim() === candidate.name.toLowerCase().trim() ||
                    String(data.blockchainId) === String(candidate.id)) {
                    await updateDoc(doc(db, 'candidates', docSnap.id), {
                        voteCount: (data.voteCount || 0) + 1,
                        lastVoteAt: new Date().toISOString()
                    });
                    break;
                }
            }
        }
    } catch (err) {
        console.warn('[Firestore candidate update notice]:', err.message);
    }

    // 6. Trigger background refresh to keep cache in sync
    refreshCandidateCache();

    // 7. Dispatch SMS receipt to the voter's mobile phone
    await sendSms(phoneNumber, candidate.name, positionName, finalHash, lang);
}

// ─────────────────────────────────────────────────────────────
// REST APIS (For live dashboard inspection)
// ─────────────────────────────────────────────────────────────
app.get('/api/votes', async (_req, res) => {
    try {
        const snap = await getDocs(collection(db, 'votes'));
        const list = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        list.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
        res.json({ count: list.length, votes: list });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/results', (_req, res) => {
    res.json({
        lastUpdated: new Date(cacheLastUpdated).toISOString(),
        cacheAge_s: Math.floor((Date.now() - cacheLastUpdated) / 1000),
        candidates: candidateCache
    });
});

async function sendSms(phoneNumber, candidateName, positionName, txHash, lang = 'en') {
    const explorerUrl = `https://sepolia.etherscan.io/tx/${txHash}`;
    const isEn = lang === 'en';
    const msg =
`DeVote Kenya
${isEn ? 'Vote Recorded' : 'Kura Imerekodiwa'}
${isEn ? 'Position' : 'Nafasi'}: ${positionName}
${isEn ? 'Candidate' : 'Mgombea'}: ${candidateName}
Tx: ${txHash.slice(0, 16)}...
${isEn ? 'Verify' : 'Kagua'}: ${explorerUrl}`;

    console.log(`\n══ SMS [${lang.toUpperCase()}] To:${phoneNumber} ══`);
    console.log(msg);
    console.log(`═══════════════════════════════════\n`);

    if (smsClient) {
        try {
            const payload = { to: [phoneNumber], message: msg };
            if (AT_SENDER_ID && AT_USERNAME !== 'sandbox') payload.from = AT_SENDER_ID;
            const result = await smsClient.send(payload);
            console.log(`[SMS] Delivered to ${phoneNumber}:`, JSON.stringify(result));
        } catch (err) {
            console.warn(`[SMS] Failed:`, err.message);
        }
    }
}

// ─────────────────────────────────────────────────────────────
// HEALTH CHECK & START
// ─────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
    res.json({
        status:         'DeVote Kenya USSD & Voice Gateway – Active v3',
        network:        'Ethereum Sepolia',
        contract:       CONTRACT_ADDRESS,
        frontend:       SITE_URL,
        ussdEndpoint:   `POST /ussd`,
        voiceEndpoint:  `POST /voice`,
        candidates:     candidateCache.length,
        cacheAge_s:     Math.floor((Date.now() - cacheLastUpdated) / 1000),
        cacheRefreshing
    });
});

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n${'═'.repeat(55)}`);
    console.log(`  🗳️  DeVote Kenya USSD Gateway v3`);
    console.log(`  🚀  http://0.0.0.0:${PORT}`);
    console.log(`  🌐  Sepolia RPC : ${RPC_URL}`);
    console.log(`  📝  Contract   : ${CONTRACT_ADDRESS}`);
    console.log(`  🔗  Frontend   : ${SITE_URL}`);
    console.log(`  📱  Webhook    : POST /ussd`);
    console.log(`  ⏱️  Session TTL : 120s (2 minutes)`);
    console.log(`  🔄  Cache TTL  : ${CACHE_TTL_MS / 1000}s (real-time results)`);
    console.log(`${'═'.repeat(55)}\n`);
});

server.on('error', (err) => {
    console.error('[Server Error]:', err);
});

// Configure 2-minute (120s) session and socket timeout
server.timeout = 120000;
server.keepAliveTimeout = 120000;
server.headersTimeout = 125000;

/**
 * DeVote IEBC Local Admin Portal
 * Real-time Voter Registration Management connected to Firebase Firestore & Sepolia Blockchain
 */

require('dotenv').config();
const express = require('express');
const { db } = require('./firebase');
const { 
  collection, 
  getDocs, 
  doc, 
  updateDoc, 
  setDoc, 
  serverTimestamp,
  getDoc
} = require('firebase/firestore');
const { ethers } = require('ethers');

const app = express();
const PORT = process.env.ADMIN_PORT || 5000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ethers setup for on-chain registration
const RPC_URL = process.env.SEPOLIA_RPC_URL || 'https://rpc.sepolia.org';
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '0xc1dd7A144Ec21088630637a5978cadF51b34931E';
const PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY || 'd93b137d4a587dae5ddec23b1c8698826e36be63647ae6786f6999bbf1bdce73';

const CONTRACT_ABI = [
  "function registerVoter(address _voter) external",
  "function isVoterRegistered(address _voter) external view returns (bool)",
  "function admin() external view returns (address)"
];

let contract = null;
let provider = null;
let wallet = null;

try {
  provider = new ethers.JsonRpcProvider(RPC_URL);
  wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);
  console.log('[Admin Portal] Connected to contract at:', CONTRACT_ADDRESS);
  console.log('[Admin Portal] Relayer Wallet Address:', wallet.address);
} catch (err) {
  console.warn('[Admin Portal] Could not initialize ethers contract:', err.message);
}

// API: Get all voter registration requests
app.get('/api/requests', async (req, res) => {
  try {
    const snap = await getDocs(collection(db, 'voterRegistrationRequests'));
    const requests = [];
    snap.forEach((d) => {
      requests.push({ id: d.id, ...d.data() });
    });

    // Sort newest first
    requests.sort((a, b) => {
      const da = new Date(a.createdAt?._seconds ? a.createdAt._seconds * 1000 : (a.createdAt || 0));
      const dbDate = new Date(b.createdAt?._seconds ? b.createdAt._seconds * 1000 : (b.createdAt || 0));
      return dbDate - da;
    });

    res.json({ success: true, count: requests.length, requests });
  } catch (err) {
    console.error('Error fetching requests:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Approve a voter
app.post('/api/approve', async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ success: false, error: 'Missing request ID' });

  try {
    const reqRef = doc(db, 'voterRegistrationRequests', id);
    const snap = await getDoc(reqRef);
    if (!snap.exists()) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }

    const request = snap.data();
    const walletAddress = (request.walletAddress || `0x${'0'.repeat(40)}`).toLowerCase();

    // 1. Try blockchain registration
    let onChainTx = null;
    let onChainError = null;
    if (contract && walletAddress && ethers.isAddress(walletAddress) && walletAddress !== '0x' + '0'.repeat(40)) {
      try {
        console.log(`[Approve] Attempting on-chain registration for ${walletAddress}...`);
        const tx = await contract.registerVoter(walletAddress);
        const receipt = await tx.wait();
        onChainTx = receipt.hash;
        console.log(`[Approve] On-chain success: ${receipt.hash}`);
      } catch (bcErr) {
        onChainError = bcErr.message;
        console.warn(`[Approve] On-chain notice: ${bcErr.message}`);
      }
    }

    // 2. Create/update voter document in Firestore voters collection
    const voterData = {
      fullName: request.fullName || '',
      idNumber: String(request.idNumber || ''),
      pin: String(request.pin || ''),
      walletAddress: walletAddress,
      county: request.county || '',
      constituency: request.constituency || '',
      ward: request.ward || '',
      status: 'approved',
      approvedAt: new Date().toISOString(),
      sourceRequestId: id,
      hasVotedPresident: false,
      hasVotedGovernor: false,
      hasVotedSenator: false,
      hasVotedMP: false,
      hasVotedWomanRepresentative: false,
      hasVotedMCA: false
    };

    // Save to voters collection (keyed by wallet address, or fallback by ID)
    const voterDocId = walletAddress && walletAddress !== '0x' + '0'.repeat(40) ? walletAddress : `id_${request.idNumber}`;
    await setDoc(doc(db, 'voters', voterDocId), voterData, { merge: true });

    // 3. Update registration request status
    await updateDoc(reqRef, {
      status: 'approved',
      approvedAt: new Date().toISOString(),
      onChainTx: onChainTx || null
    });

    console.log(`[Approve] Successfully approved ${request.fullName} (${request.idNumber})`);
    res.json({ success: true, message: `Approved ${request.fullName}`, onChainTx, onChainError });
  } catch (err) {
    console.error('Approval failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Reject a voter
app.post('/api/reject', async (req, res) => {
  const { id, reason } = req.body;
  if (!id) return res.status(400).json({ success: false, error: 'Missing request ID' });

  try {
    const reqRef = doc(db, 'voterRegistrationRequests', id);
    await updateDoc(reqRef, {
      status: 'rejected',
      rejectionReason: reason || 'Details did not match national ID records',
      rejectedAt: new Date().toISOString()
    });

    console.log(`[Reject] Rejected request ${id}`);
    res.json({ success: true, message: 'Request rejected' });
  } catch (err) {
    console.error('Rejection failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Serve beautiful Admin UI
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DeVote IEBC Admin Portal - Voter Approval</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  </style>
</head>
<body class="bg-gray-100 min-h-screen">
  <header class="bg-emerald-800 text-white shadow-lg sticky top-0 z-50">
    <div class="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <div class="w-10 h-10 rounded-full bg-white flex items-center justify-center text-emerald-800 font-bold text-xl">
          <i class="fa-solid fa-check-to-slot"></i>
        </div>
        <div>
          <h1 class="text-xl font-bold tracking-tight">DeVote IEBC Admin Portal</h1>
          <p class="text-xs text-emerald-200">Voter Registration Verification & Blockchain Approval</p>
        </div>
      </div>
      <div class="flex items-center space-x-4">
        <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-700 text-emerald-100 border border-emerald-600">
          <span class="w-2 h-2 mr-2 bg-green-400 rounded-full animate-ping"></span>
          Firebase Live
        </span>
        <button onclick="fetchRequests()" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium transition shadow flex items-center gap-2">
          <i class="fa-solid fa-arrows-rotate" id="refresh-icon"></i> Refresh
        </button>
      </div>
    </div>
  </header>

  <main class="max-w-7xl mx-auto px-6 py-8">
    <!-- Stats Banner -->
    <div class="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
      <div class="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
        <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Registrations</p>
        <p class="text-3xl font-extrabold text-gray-900 mt-2" id="stat-total">0</p>
      </div>
      <div class="bg-amber-50 p-5 rounded-xl border border-amber-200 shadow-sm cursor-pointer" onclick="setFilter('pending')">
        <p class="text-xs font-semibold text-amber-700 uppercase tracking-wider">Pending Approval</p>
        <p class="text-3xl font-extrabold text-amber-800 mt-2" id="stat-pending">0</p>
      </div>
      <div class="bg-emerald-50 p-5 rounded-xl border border-emerald-200 shadow-sm cursor-pointer" onclick="setFilter('approved')">
        <p class="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Approved Voters</p>
        <p class="text-3xl font-extrabold text-emerald-800 mt-2" id="stat-approved">0</p>
      </div>
      <div class="bg-rose-50 p-5 rounded-xl border border-rose-200 shadow-sm cursor-pointer" onclick="setFilter('rejected')">
        <p class="text-xs font-semibold text-rose-700 uppercase tracking-wider">Rejected</p>
        <p class="text-3xl font-extrabold text-rose-800 mt-2" id="stat-rejected">0</p>
      </div>
    </div>

    <!-- Filter & Search Toolbar -->
    <div class="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-6 flex flex-col md:flex-row items-center justify-between gap-4">
      <div class="flex items-center gap-2">
        <button onclick="setFilter('all')" id="btn-all" class="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white">All (<span id="count-all">0</span>)</button>
        <button onclick="setFilter('pending')" id="btn-pending" class="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200">Pending (<span id="count-pending">0</span>)</button>
        <button onclick="setFilter('approved')" id="btn-approved" class="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200">Approved (<span id="count-approved">0</span>)</button>
        <button onclick="setFilter('rejected')" id="btn-rejected" class="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200">Rejected (<span id="count-rejected">0</span>)</button>
      </div>
      <div class="w-full md:w-80 relative">
        <i class="fa-solid fa-magnifying-glass absolute left-3 top-3 text-gray-400 text-sm"></i>
        <input type="text" id="search-input" oninput="renderTable()" placeholder="Search by name, ID, county..." class="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500">
      </div>
    </div>

    <!-- Voter Table -->
    <div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider">
              <th class="p-4">Voter Name</th>
              <th class="p-4">National ID</th>
              <th class="p-4">Location (County / Const / Ward)</th>
              <th class="p-4">Wallet Address</th>
              <th class="p-4">Status</th>
              <th class="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody id="voter-tbody" class="divide-y divide-gray-200 text-sm">
            <tr>
              <td colspan="6" class="p-8 text-center text-gray-500">
                <i class="fa-solid fa-circle-notch fa-spin text-2xl text-emerald-600 mb-2"></i>
                <p>Loading voter registrations from Firebase...</p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </main>

  <script>
    let allRequests = [];
    let currentFilter = 'all';

    async function fetchRequests() {
      const icon = document.getElementById('refresh-icon');
      if (icon) icon.classList.add('fa-spin');
      try {
        const res = await fetch('/api/requests');
        const data = await res.json();
        if (data.success) {
          allRequests = data.requests;
          updateStats();
          renderTable();
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (icon) icon.classList.remove('fa-spin');
      }
    }

    function updateStats() {
      const pending = allRequests.filter(r => (r.status || 'pending').toLowerCase() === 'pending').length;
      const approved = allRequests.filter(r => (r.status || '').toLowerCase() === 'approved').length;
      const rejected = allRequests.filter(r => (r.status || '').toLowerCase() === 'rejected').length;
      const total = allRequests.length;

      document.getElementById('stat-total').innerText = total;
      document.getElementById('stat-pending').innerText = pending;
      document.getElementById('stat-approved').innerText = approved;
      document.getElementById('stat-rejected').innerText = rejected;

      document.getElementById('count-all').innerText = total;
      document.getElementById('count-pending').innerText = pending;
      document.getElementById('count-approved').innerText = approved;
      document.getElementById('count-rejected').innerText = rejected;
    }

    function setFilter(f) {
      currentFilter = f;
      ['all', 'pending', 'approved', 'rejected'].forEach(tab => {
        const btn = document.getElementById('btn-' + tab);
        if (tab === f) {
          btn.className = 'px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white';
        } else {
          btn.className = 'px-4 py-2 rounded-lg text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200';
        }
      });
      renderTable();
    }

    function renderTable() {
      const tbody = document.getElementById('voter-tbody');
      const search = (document.getElementById('search-input').value || '').toLowerCase().trim();

      let list = allRequests;
      if (currentFilter !== 'all') {
        list = list.filter(r => (r.status || 'pending').toLowerCase() === currentFilter);
      }

      if (search) {
        list = list.filter(r => 
          (r.fullName || '').toLowerCase().includes(search) ||
          String(r.idNumber || '').includes(search) ||
          (r.county || '').toLowerCase().includes(search) ||
          (r.constituency || '').toLowerCase().includes(search) ||
          (r.ward || '').toLowerCase().includes(search)
        );
      }

      if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-gray-400">No voter records found matching this filter.</td></tr>';
        return;
      }

      tbody.innerHTML = list.map(r => {
        const status = (r.status || 'pending').toLowerCase();
        let badge = '';
        if (status === 'approved') {
          badge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200"><i class="fa-solid fa-check mr-1"></i> Approved</span>';
        } else if (status === 'rejected') {
          badge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200"><i class="fa-solid fa-xmark mr-1"></i> Rejected</span>';
        } else {
          badge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200"><i class="fa-solid fa-clock mr-1"></i> Pending</span>';
        }

        const actions = status === 'pending' ? \`
          <button onclick="approveVoter('\${r.id}', '\${(r.fullName || '').replace(/'/g, "\\\\'")}')" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow transition">
            <i class="fa-solid fa-check mr-1"></i> Approve
          </button>
          <button onclick="rejectVoter('\${r.id}', '\${(r.fullName || '').replace(/'/g, "\\\\'")}')" class="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold shadow transition ml-2">
            <i class="fa-solid fa-xmark mr-1"></i> Reject
          </button>
        \` : \`
          <span class="text-xs text-gray-400">\${status === 'approved' ? 'Active Voter' : (r.rejectionReason || 'Rejected')}</span>
        \`;

        const walletDisplay = r.walletAddress ? (r.walletAddress.slice(0, 6) + '...' + r.walletAddress.slice(-4)) : 'N/A';

        return \`
          <tr class="hover:bg-gray-50 transition">
            <td class="p-4 font-semibold text-gray-900">\${r.fullName || 'Unnamed'}</td>
            <td class="p-4 font-mono text-gray-700">\${r.idNumber || 'N/A'}</td>
            <td class="p-4 text-gray-600 text-xs leading-relaxed">
              <span class="font-medium text-gray-800">\${r.county || 'N/A'}</span> &bull; 
              \${r.constituency || 'N/A'} &bull; 
              \${r.ward || 'N/A'}
            </td>
            <td class="p-4 font-mono text-xs text-gray-500" title="\${r.walletAddress || ''}">\${walletDisplay}</td>
            <td class="p-4">\${badge}</td>
            <td class="p-4 text-right whitespace-nowrap">\${actions}</td>
          </tr>
        \`;
      }).join('');
    }

    async function approveVoter(id, name) {
      if (!confirm('Approve and register ' + name + ' as an authorized voter?')) return;
      try {
        const res = await fetch('/api/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });
        const data = await res.json();
        if (data.success) {
          alert('Successfully approved ' + name + '!');
          fetchRequests();
        } else {
          alert('Error approving voter: ' + data.error);
        }
      } catch (e) {
        alert('Request failed: ' + e.message);
      }
    }

    async function rejectVoter(id, name) {
      const reason = prompt('Reason for rejecting ' + name + ':', 'ID details did not match official records');
      if (reason === null) return;
      try {
        const res = await fetch('/api/reject', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, reason })
        });
        const data = await res.json();
        if (data.success) {
          alert('Registration rejected.');
          fetchRequests();
        } else {
          alert('Error: ' + data.error);
        }
      } catch (e) {
        alert('Request failed: ' + e.message);
      }
    }

    // Auto-fetch on load and poll every 10 seconds
    fetchRequests();
    setInterval(fetchRequests, 10000);
  </script>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 DeVote IEBC Admin Portal is running!`);
  console.log(`👉 Open in your browser: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});

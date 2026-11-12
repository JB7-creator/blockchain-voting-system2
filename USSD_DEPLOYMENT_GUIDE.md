# DeVote Kenya — Complete USSD & Bulk SMS Gateway Guide
**Live System Frontend:** [https://blockchainelectionsystem.netlify.app](https://blockchainelectionsystem.netlify.app)  
**Smart Contract (Ethereum Sepolia):** `0xc1dd7A144Ec21088630637a5978cadF51b34931E`  
**Africa's Talking Dial Code:** `*384*41484#` (Channel: `41484`)  
**Current Active Live Callback:** `https://electro-housing-propose-validity.trycloudflare.com/ussd`

---

## 1. System Architecture

```
   Kenyan Citizens / Peer Testers (Any Phone)
   ┌────────────────────────────────────────────────────────┐
   │ • Web Virtual Dialer: https://simulator.africastalking.com:1517/ │
   │ • OR Africa's Talking Android Mobile App (Sandbox Mode)│
   └───────────────────────────┬────────────────────────────┘
                               │ Dials *384*41484#
                               ▼
                   Africa's Talking USSD Gateway
                               │ HTTP POST /ussd
                               ▼
               DeVote USSD Gateway (Node.js + Express)
     ┌────────────────────────────────────────────────────────┐
     │ 1. Language Select: 1 for English, 2 for Kiswahili    │
     │ 2. Authenticate: Phone + National ID + PIN             │
     │ 3. Check Duplicate: Contract hasVoterVotedForPosition  │
     │ 4. Area Results: Governor/Senator/WR by County,        │
     │                  MP by Constituency, MCA by Ward,       │
     │                  President National                     │
     │ 5. Smooth Back Navigation: Press '0' anytime           │
     │ 6. Immediate Session Close (Beats 30s USSD timeout)    │
     │ 7. Gas-Sponsoring Relayer: 0x9dbeb02aa... on Sepolia  │
     │ 8. Bulk SMS Receipt: Delivers Etherscan tx link        │
     └─────────────┬────────────────────────────┬─────────────┘
                   │                            │
                   ▼                            ▼
        Ethereum Sepolia Testnet     Africa's Talking Bulk SMS
        (Immutable Blockchain)       (Real SMS to Voter's Phone)
```

---

## 2. Testing Right Now (While Server & Tunnel are Live)

Your server and Cloudflare quick tunnel are currently live:
- **Callback URL:** `https://electro-housing-propose-validity.trycloudflare.com/ussd`

### Step 1: Configure Africa's Talking Dashboard
1. Open [Africa's Talking Sandbox Dashboard](https://account.africastalking.com/).
2. In the left sidebar, click **USSD** → **Service Codes** (or **Shared USSD Codes** / **Channels**).
3. Find channel `41484` (dial code `*384*41484#`).
4. Set the **Callback URL** to:
   ```text
   https://electro-housing-propose-validity.trycloudflare.com/ussd
   ```
5. Set Method to **POST** and click **Save**.

### Step 2: Test from Any Phone / Peer
Direct your testers to:
1. Go to [https://simulator.africastalking.com:1517/](https://simulator.africastalking.com:1517/) (or install the Africa's Talking Android App in Sandbox mode).
2. Enter their phone number (e.g., `+254716356483` or any Kenyan number).
3. Dial: `*384*41484#`
4. The bilingual menu appears:
   ```text
   Welcome to DeVote Kenya / Karibu DeVote
   Chagua Lugha / Select Language:
   1. English
   2. Kiswahili
   ```
5. Select `1` or `2`:
   - **Vote Now**: Enter ID and PIN.
   - **Check Status**: Enter National ID.
   - **View Candidates**: View candidates for each position.
   - **View Results (Matokeo)**: Enter National ID to view results filtered to that voter's registered county, constituency, and ward!
   - **IEBC Help**: Shows official IEBC toll-free hotline (`0800 221 221`).

---

## 3. How to Host It Permanently (24/7 Cloud Hosting)

To let anyone test at any time without keeping your laptop running, host the `ussd-gateway` on a free cloud platform like **Render.com** or **Railway.app**.

### Option A: Render.com (Recommended — 1-Click with `render.yaml`)

Your repository already has a `render.yaml` blueprint ready!

#### Step 1: Push code to GitHub
Run in PowerShell:
```powershell
cd C:\Users\BILLY\Downloads\Blockchain-voting-system
git add .gitignore render.yaml ussd-gateway USSD_DEPLOYMENT_GUIDE.md
git commit -m "Deploy bilingual DeVote USSD Gateway"
git push origin main
```

#### Step 2: Connect to Render
1. Visit [https://dashboard.render.com/](https://dashboard.render.com/) and sign in with GitHub.
2. Click **New +** → **Blueprint**.
3. Select your repository: `Blockchain-voting-system`.
4. Render will detect `render.yaml` and configure the `devote-ussd-gateway` service.
5. In the **Environment Variables** prompt, supply the two secure variables:
   - `AT_API_KEY`: `atsk_ee5aa58f7d358e6405231152f00afe2b2e14faee2be888b29eaeb28476d27b694021c52e`
   - `RELAYER_PRIVATE_KEY`: `d93b137d4a587dae5ddec23b1c8698826e36be63647ae6786f6999bbf1bdce73`
6. Click **Apply**.
7. Render will build and deploy your gateway at:
   ```text
   https://devote-ussd-gateway.onrender.com
   ```

#### Step 3: Update Africa's Talking Callback
Once Render shows "Live":
1. Go to [Africa's Talking Sandbox Dashboard](https://account.africastalking.com/) → **USSD** → **Service Codes**.
2. Update Callback URL on channel `41484` to:
   ```text
   https://devote-ussd-gateway.onrender.com/ussd
   ```
3. Click **Save**.

Now anyone in the world can dial `*384*41484#` 24/7!

---

### Option B: Railway.app

1. Go to [https://railway.app/](https://railway.app/) and sign in with GitHub.
2. Click **New Project** → **Deploy from GitHub repo** → select `Blockchain-voting-system`.
3. In settings, set **Root Directory** to `ussd-gateway`.
4. Under **Variables**, add:
   - `PORT`: `5000`
   - `AT_USERNAME`: `sandbox`
   - `AT_API_KEY`: `atsk_ee5aa58f7d358e6405231152f00afe2b2e14faee2be888b29eaeb28476d27b694021c52e`
   - `AT_SENDER_ID`: `DEVOTE`
   - `RELAYER_PRIVATE_KEY`: `d93b137d4a587dae5ddec23b1c8698826e36be63647ae6786f6999bbf1bdce73`
   - `RPC_URL`: `https://ethereum-sepolia-rpc.publicnode.com`
   - `CONTRACT_ADDRESS`: `0xc1dd7A144Ec21088630637a5978cadF51b34931E`
   - `VOTER_SALT`: `kenya-elections-sepolia-digital-trust-2026`
5. Click **Generate Domain**. You will get a permanent URL like `https://ussd-gateway-production.up.railway.app`.
6. Set that as your callback URL in Africa's Talking:
   ```text
   https://ussd-gateway-production.up.railway.app/ussd
   ```

---

## 4. Test Credentials for Peer Testers

| Purpose | National ID | PIN | Area Details |
| :--- | :--- | :--- | :--- |
| **Real Registered Voter** | `12345678` | `1234` | Nairobi / Embakasi East |
| **User Tester (From Log)** | `382663161` | `1205` | Auto-detects registered location from Firestore |
| **Simulation / Test Mode** | *Any 8-digit ID* | `1234` | Nairobi / Embakasi East (Fallback) |

When a vote is cast:
- The voter gets an on-screen confirmation immediately.
- The voter's phone receives an Africa's Talking Bulk SMS receipt containing the Sepolia transaction hash.

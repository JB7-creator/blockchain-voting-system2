/**
 * Firebase Firestore Client for USSD Gateway
 * Connects directly to the DeVote Firebase project: blockchain-election-system
 */

const dns = require('dns');
// Ensure reliable resolution for Google APIs/Firestore across all environments (e.g. Windows local routers)
try {
  const originalLookup = dns.lookup;
  dns.setServers(['8.8.8.8', '1.1.1.1', ...dns.getServers().filter(s => s !== '8.8.8.8' && s !== '1.1.1.1')]);
  dns.lookup = function(hostname, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    if (hostname && (hostname.includes('firestore') || hostname.includes('googleapis') || hostname.includes('google'))) {
      dns.resolve4(hostname, (err, addrs) => {
        if (!err && addrs && addrs.length > 0) {
          if (options && options.all) {
            return callback(null, addrs.map(a => ({ address: a, family: 4 })));
          }
          return callback(null, addrs[0], 4);
        }
        return originalLookup(hostname, options, callback);
      });
    } else {
      return originalLookup(hostname, options, callback);
    }
  };
} catch (e) {
  console.warn('[DNS] DNS patch warning:', e.message);
}

const { initializeApp } = require("firebase/app");
const { 
  getFirestore, 
  collection, 
  getDocs, 
  query, 
  where, 
  addDoc, 
  doc, 
  updateDoc, 
  setDoc,
  increment,
  serverTimestamp 
} = require("firebase/firestore");

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyCmQ80bQ8vqORjuhpPsoiTYFRk3f4kPlUQ",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "blockchain-election-system.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "blockchain-election-system",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "blockchain-election-system.firebasestorage.app",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "419059385621",
  appId: process.env.FIREBASE_APP_ID || "1:419059385621:web:cf2c1d4fe4298e272ad51c"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

module.exports = {
  db,
  collection,
  getDocs,
  query,
  where,
  addDoc,
  doc,
  updateDoc,
  setDoc,
  increment,
  serverTimestamp
};

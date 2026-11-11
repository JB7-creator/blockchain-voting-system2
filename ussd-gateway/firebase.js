/**
 * Firebase Firestore Client for USSD Gateway
 * Connects directly to the DeVote Firebase project: blockchain-election-system
 */

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
  serverTimestamp
};

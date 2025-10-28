// Firebase auth + Firestore wiring for index.html
// - Signs in owner with email/password (Firebase Auth)
// - On sign-in, fetches basic user data (clients/teammates) from Firestore
// - Leaves realtime listeners to page-specific modules (e.g. company.js)

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { firebaseConfig } from "../config.js";

if (!getApps().length) initializeApp(firebaseConfig);
const auth = getAuth();
const db = getFirestore();

function safeHide(el) { if (el) el.style.display = 'none'; }
function safeShowFlex(el) { if (el) el.style.display = 'flex'; }
function safeShowBlock(el) { if (el) el.style.display = 'block'; }

async function fetchUserData(uid) {
  try {
    const clientsRef = collection(db, 'clients');
    const qC = query(clientsRef, where('uid', '==', uid));
    const clientsSnap = await getDocs(qC);
    const clients = clientsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    localStorage.setItem('clients', JSON.stringify(clients));

    const teammatesRef = collection(db, 'teammates');
    const qT = query(teammatesRef, where('uid', '==', uid));
    const teammatesSnap = await getDocs(qT);
    const teammates = teammatesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    localStorage.setItem('teammates', JSON.stringify(teammates));

    // Store simple summary counts for the index/dashboard UI
    localStorage.setItem('clientsCount', String(clients.length));
    localStorage.setItem('teammatesCount', String(teammates.length));
    console.log('Fetched user data:', { clients: clients.length, teammates: teammates.length });
    return { clients, teammates };
  } catch (err) {
    console.error('Failed to fetch user data', err);
    return { clients: [], teammates: [] };
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const ownerBtn = document.getElementById('ownerBtn');
  const employeeBtn = document.getElementById('employeeBtn');
  const selectionScreen = document.getElementById('selectionScreen');
  const loginScreen = document.getElementById('loginScreen');
  const dashboard = document.getElementById('dashboard');
  const loginBtn = document.getElementById('loginBtn');
  const loginEmail = document.getElementById('loginEmail');
  const loginPassword = document.getElementById('loginPassword');
  const loginError = document.getElementById('loginError');

  // Owner button: show login screen
  if (ownerBtn) {
    ownerBtn.addEventListener('click', (e) => {
      e.preventDefault();
      safeHide(selectionScreen);
      safeShowFlex(loginScreen);
      safeHide(dashboard);
    });
  }

  // Employee button: go straight to dashboard (no login for now)
  if (employeeBtn) {
    employeeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      safeHide(selectionScreen);
      safeHide(loginScreen);
      safeShowBlock(dashboard);
    });
  }

  // Login button: use Firebase Auth
  if (loginBtn) {
    loginBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!loginEmail || !loginPassword) return;
      const email = loginEmail.value.trim();
      const pass = loginPassword.value;
      if (!email || !pass) {
        if (loginError) loginError.textContent = 'Please enter email and password.';
        return;
      }
      if (loginError) loginError.textContent = '';
      try {
        const cred = await signInWithEmailAndPassword(auth, email, pass);
        const user = cred.user;
        // fetch initial data and show dashboard
        await fetchUserData(user.uid);
        safeHide(loginScreen);
        safeShowBlock(dashboard);
      } catch (err) {
        console.error('Sign-in failed', err);
        if (loginError) loginError.textContent = err.message || 'Sign-in failed';
      }
    });
  }

  // Optional: listen for auth state changes (other modules also listen)
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      // Ensure client-side data is available for other modules
      await fetchUserData(user.uid);
      // If user is on selection/login, show dashboard
      if (selectionScreen && (selectionScreen.style.display !== 'none')) {
        safeHide(selectionScreen);
        safeHide(loginScreen);
        safeShowBlock(dashboard);
      }
    } else {
      // Signed out — keep selection screen visible
      safeHide(dashboard);
      safeShowFlex(selectionScreen);
      // Clear cached data
      localStorage.removeItem('clients');
      localStorage.removeItem('teammates');
      localStorage.removeItem('clientsCount');
      localStorage.removeItem('teammatesCount');
    }
  });
});

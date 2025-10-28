import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import {
    getFirestore,
    collection,
    addDoc,
    deleteDoc,
    doc,
    query,
    where,
    onSnapshot,
    writeBatch,
    serverTimestamp,
    getDocs // added
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

if (!getApps().length) initializeApp(firebaseConfig);
const auth = getAuth();
const db = getFirestore();

const CLIENTS_COLLECTION = "clients";
const TEAMMATES_COLLECTION = "teammates";
let isUserLoggedIn = false;
let currentUid = null;
let clientsUnsub = null;
let teammatesUnsub = null;

function showError(msg, err) { console.error(msg, err || ''); alert(msg + (err && err.message ? `: ${err.message}` : '')); }

async function attachCompanyListeners(uid) {
    if (clientsUnsub) clientsUnsub();
    if (teammatesUnsub) teammatesUnsub();

    const clientsRef = collection(db, CLIENTS_COLLECTION);
    const qC = query(clientsRef, where('uid', '==', uid));
    clientsUnsub = onSnapshot(qC, snap => {
        const remoteClients = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        localStorage.setItem('clients', JSON.stringify(remoteClients));
        clients = remoteClients;
        if (typeof render === 'function') render();
    }, err => showError('Clients listener error', err));

    const teammatesRef = collection(db, TEAMMATES_COLLECTION);
    const qT = query(teammatesRef, where('uid', '==', uid));
    teammatesUnsub = onSnapshot(qT, snap => {
        const remoteTeammates = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        localStorage.setItem('teammates', JSON.stringify(remoteTeammates));
        teammates = remoteTeammates;
        if (typeof render === 'function') render();
    }, err => showError('Teammates listener error', err));
}

onAuthStateChanged(auth, async user => {
    if (user) {
        isUserLoggedIn = true;
        currentUid = user.uid;

        // Ensure we're not mixing local copies — reset in-memory arrays so snapshot fully controls UI
        clients = [];
        teammates = [];
        render(); // show empty state while listener attaches

        // Attach realtime listeners so UI is driven directly from Firestore (prevents duplicates).
        await attachCompanyListeners(currentUid);

        // Do NOT auto-migrate localStorage here. If you want to migrate, call the manual migration function explicitly.
    } else {
        isUserLoggedIn = false;
        currentUid = null;
        if (clientsUnsub) clientsUnsub();
        if (teammatesUnsub) teammatesUnsub();
        // fallback to local storage for UI when signed out
        clients = JSON.parse(localStorage.getItem('clients') || '[]');
        teammates = JSON.parse(localStorage.getItem('teammates') || '[]');
        render();
    }
});

// --- Change: don't prefill from localStorage here; keep arrays empty until auth/signout decides source
let clients = []; // previously read from localStorage
let teammates = []; // previously read from localStorage

function saveAndRender() {
    localStorage.setItem('clients', JSON.stringify(clients));
    localStorage.setItem('teammates', JSON.stringify(teammates));
    render();
}
function addClientInfo() {
    const nameInput = document.getElementById('infoClientName');
    const projectInput = document.getElementById('infoClientProject');
    const budgetInput = document.getElementById('infoClientBudget');
    const contactInput = document.getElementById('infoClientContact');

    if (!nameInput.value.trim()) return;

    const payload = {
        name: nameInput.value,
        project: projectInput.value,
        budget: budgetInput.value,
        contact: contactInput.value
    };

    if (isUserLoggedIn && currentUid) {
        // remote create — realtime listener will update localStorage/UI
        (async () => {
            try {
                const col = collection(db, CLIENTS_COLLECTION);
                await addDoc(col, { uid: currentUid, ...payload, createdAt: serverTimestamp() });
                // clear inputs
                nameInput.value = projectInput.value = budgetInput.value = contactInput.value = '';
            } catch (err) {
                showError('Failed to add client to Firestore', err);
            }
        })();
    } else {
        // fallback local behavior
        clients.push({ id: Date.now().toString(), ...payload });
        saveAndRender();
        nameInput.value = projectInput.value = budgetInput.value = contactInput.value = '';
    }
}

function deleteClientInfo(id) {
    if (!confirm('Are you sure you want to delete this client?')) return;

    if (isUserLoggedIn && currentUid) {
        (async () => {
            try {
                await deleteDoc(doc(db, CLIENTS_COLLECTION, id));
                // realtime listener will update UI
            } catch (err) {
                showError('Failed to delete client from Firestore', err);
            }
        })();
    } else {
        clients = clients.filter(client => client.id !== id);
        saveAndRender();
    }
}

function addTeammate() {
    const nameInput = document.getElementById('teammateNameInput');
    const roleInput = document.getElementById('teammateRoleInput');
    const contactInput = document.getElementById('teammateContactInput');
    const tasksInput = document.getElementById('teammateTasksInput');

    if (!nameInput.value.trim() || !roleInput.value.trim()) return;

    const payload = {
        name: nameInput.value,
        role: roleInput.value,
        contact: contactInput.value,
        tasks: tasksInput.value
    };

    if (isUserLoggedIn && currentUid) {
        (async () => {
            try {
                const col = collection(db, TEAMMATES_COLLECTION);
                await addDoc(col, { uid: currentUid, ...payload, createdAt: serverTimestamp() });
                nameInput.value = roleInput.value = contactInput.value = tasksInput.value = '';
            } catch (err) {
                showError('Failed to add teammate to Firestore', err);
            }
        })();
    } else {
        teammates.push({ id: Date.now().toString(), ...payload });
        saveAndRender();
        nameInput.value = roleInput.value = contactInput.value = tasksInput.value = '';
    }
}

function deleteTeammate(id) {
    if (!confirm('Are you sure you want to delete this teammate?')) return;

    if (isUserLoggedIn && currentUid) {
        (async () => {
            try {
                await deleteDoc(doc(db, TEAMMATES_COLLECTION, id));
                // realtime listener will update UI
            } catch (err) {
                showError('Failed to delete teammate from Firestore', err);
            }
        })();
    } else {
        teammates = teammates.filter(teammate => teammate.id !== id);
        saveAndRender();
    }
}

// Add: delete all docs helper for a given collection and uid
async function deleteAllDocsInCollectionForUid(collectionName, uid) {
    try {
        const colRef = collection(db, collectionName);
        const q = query(colRef, where('uid', '==', uid));
        const snap = await getDocs(q);
        if (snap.empty) return 0;
        // Delete documents (in batches if needed)
        const docs = snap.docs;
        for (const d of docs) {
            try {
                await deleteDoc(doc(db, collectionName, d.id));
            } catch (err) {
                console.warn(`Failed deleting ${collectionName}/${d.id}:`, err);
            }
        }
        return docs.length;
    } catch (err) {
        showError(`Failed to list/delete documents in ${collectionName}`, err);
        return -1;
    }
}

// Add: clear all clients and teammates (remote if signed in, else local)
async function clearAllClientsAndTeammates() {
    if (!confirm('This will permanently remove ALL clients and teammates. Continue?')) return;

    if (isUserLoggedIn && currentUid) {
        try {
            // Delete remote docs for both collections
            const deletedClients = await deleteAllDocsInCollectionForUid(CLIENTS_COLLECTION, currentUid);
            const deletedTeammates = await deleteAllDocsInCollectionForUid(TEAMMATES_COLLECTION, currentUid);

            // Clear local copies and re-render
            localStorage.removeItem('clients');
            localStorage.removeItem('teammates');
            clients = [];
            teammates = [];
            render();

            alert(`Cleared clients (${deletedClients >= 0 ? deletedClients : 'error'}) and teammates (${deletedTeammates >= 0 ? deletedTeammates : 'error'}).`);
        } catch (err) {
            showError('Failed to clear all data', err);
        }
    } else {
        // Signed out: just clear local storage
        localStorage.removeItem('clients');
        localStorage.removeItem('teammates');
        clients = [];
        teammates = [];
        render();
        alert('Cleared local clients and teammates.');
    }
}

function render() {
    const clientGrid = document.getElementById('clientGrid');
    clientGrid.innerHTML = ''; // Clear existing cards
    clients.forEach(client => {
        const card = document.createElement('div');
        card.className = 'client-card';
        card.innerHTML = `
            <h4><a href="client.html?id=${client.id}" style="text-decoration: none; color: inherit;">${client.name}</a></h4>
            <p><strong>Project:</strong> ${client.project || 'N/A'}</p>
            <p><strong>Budget:</strong> ${client.budget || 'N/A'}</p>
            <p><strong>Contact:</strong> ${client.contact || 'N/A'}</p>
            <div style="margin-top: auto; text-align: right;">
                <button class="edit-btn" data-id="${client.id}" data-type="client">Edit</button>
                <button class="delete-btn" data-id="${client.id}">Delete</button>
            </div>
        `;
        clientGrid.appendChild(card);
    });
    const teammateList = document.getElementById('teammateList');
    teammateList.innerHTML = ''; // Clear existing items
    teammates.forEach(teammate => {
        const div = document.createElement('div');
        div.className = 'teammate-item';
        div.innerHTML = `
            <div style="flex: 1;">
                <a href="teammate.html?id=${teammate.id}" style="text-decoration: none; color: inherit;">
                    <strong>${teammate.name}</strong>
                </a>
                <br>
                <span>${teammate.role}</span><br>
                <small>${teammate.tasks}</small>
            </div>
            <div style="display:flex; gap:8px; align-items:center;">
                <button class="edit-btn" data-id="${teammate.id}" data-type="teammate">Edit</button>
                <button class="delete-btn" data-id="${teammate.id}">Delete</button>
            </div>
        `;
        teammateList.appendChild(div);
    });
}
// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Use a more specific selector for the "Add Client Info" button
    document.getElementById('addClientBtn').addEventListener('click', addClientInfo);

    // Use a more specific selector for the "Add Teammate" button
    document.getElementById('addTeammateBtn').addEventListener('click', addTeammate);

    // Event Delegation for edit & delete buttons (clients)
    document.getElementById('clientGrid').addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-btn')) {
            deleteClientInfo(e.target.dataset.id);
        } else if (e.target.classList.contains('edit-btn')) {
            // Navigate to client edit page
            const id = e.target.dataset.id;
            window.location.href = `client.html?id=${encodeURIComponent(id)}`;
        }
    });

    // Event Delegation for edit & delete buttons (teammates)
    document.getElementById('teammateList').addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-btn')) {
            deleteTeammate(e.target.dataset.id);
        } else if (e.target.classList.contains('edit-btn')) {
            const id = e.target.dataset.id;
            window.location.href = `teammate.html?id=${encodeURIComponent(id)}`;
        }
    });
    // Wire Clear All button if present
    const clearBtn = document.getElementById('clearAllBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearAllClientsAndTeammates);
    }

    render();
});
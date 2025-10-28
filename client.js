const clientNameHeader = document.getElementById('clientNameHeader');
const fieldsContainer = document.getElementById('clientFieldsContainer');

let clientId;

function deleteClient() {
    if (!confirm('Are you sure you want to delete this client? This action cannot be undone.')) return;

    if (isUserLoggedIn && currentUid && clientId && !String(clientId).startsWith('tmp-')) {
        (async () => {
            try {
                // Verify ownership before deleting
                const docRef = doc(db, CLIENTS_COLLECTION, clientId);
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    const data = snap.data();
                    if (data.uid && data.uid !== currentUid) {
                        showError('You do not have permission to delete this client (owner mismatch).');
                        return;
                    }
                } else {
                    // fallback to local removal
                    let clients = JSON.parse(localStorage.getItem('clients') || '[]') || [];
                    clients = clients.filter(c => c.id !== clientId);
                    localStorage.setItem('clients', JSON.stringify(clients));
                    window.location.href = 'company.html';
                    return;
                }

                await deleteDoc(docRef);
                window.location.href = 'company.html';
            } catch (err) {
                showError('Failed to delete client from Firestore', err);
            }
        })();
    } else {
        // local fallback
        let clients = JSON.parse(localStorage.getItem('clients')) || [];
        clients = clients.filter(c => c.id !== clientId);
        localStorage.setItem('clients', JSON.stringify(clients));
        window.location.href = 'company.html';
    }
}

function saveClientData(clientData) {
    if (isUserLoggedIn && currentUid && clientData.id && !String(clientData.id).startsWith('tmp-')) {
        (async () => {
            try {
                const docRef = doc(db, CLIENTS_COLLECTION, clientData.id);
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    const remote = snap.data();
                    if (remote.uid && remote.uid !== currentUid) {
                        showError('You do not have permission to update this client (owner mismatch).');
                        return;
                    }
                    const payload = { uid: currentUid, ...clientData };
                    delete payload.id;
                    await updateDoc(docRef, payload);
                    alert('Changes saved successfully!');
                    const updatedNameField = clientData.fields.find(f => f.label.toLowerCase() === 'client name');
                    clientNameHeader.textContent = `Client: ${updatedNameField ? updatedNameField.value : 'N/A'}`;
                } else {
                    // create new remote doc
                    const col = collection(db, CLIENTS_COLLECTION);
                    const payload = { uid: currentUid, ...clientData };
                    delete payload.id;
                    const res = await addDoc(col, payload);
                    // update localStorage mapping if needed
                    let local = JSON.parse(localStorage.getItem('clients') || '[]') || [];
                    local = local.map(c => c.id === clientData.id ? ({ id: res.id, ...clientData }) : c);
                    localStorage.setItem('clients', JSON.stringify(local));
                    alert('Saved as new remote client.');
                    const updatedNameField = clientData.fields.find(f => f.label.toLowerCase() === 'client name');
                    clientNameHeader.textContent = `Client: ${updatedNameField ? updatedNameField.value : 'N/A'}`;
                }
            } catch (err) {
                showError('Failed to save client to Firestore', err);
            }
        })();
    } else {
        // local fallback
        let clients = JSON.parse(localStorage.getItem('clients')) || [];
        const idx = clients.findIndex(c => c.id === clientData.id);
        if (idx !== -1) clients[idx] = clientData;
        else clients.push(clientData);
        localStorage.setItem('clients', JSON.stringify(clients));
        alert('Changes saved successfully!');
        const updatedNameField = clientData.fields.find(f => f.label.toLowerCase() === 'client name');
        clientNameHeader.textContent = `Client: ${updatedNameField ? updatedNameField.value : 'N/A'}`;
    }
}

function renderFields(clientData) {
    fieldsContainer.innerHTML = '';
    clientData.fields.forEach((field, index) => {
        const fieldDiv = document.createElement('div');
        fieldDiv.className = 'detail-field';
        fieldDiv.innerHTML = `
            <label>${field.label} <span class="delete-field-btn" data-index="${index}" title="Delete field">❌</span></label>
            <div contenteditable="true" data-index="${index}">${field.value}</div>
        `;
        fieldsContainer.appendChild(fieldDiv);
    });

    // Add event listeners for the new fields
    fieldsContainer.querySelectorAll('[contenteditable="true"]').forEach(div => {
        div.addEventListener('blur', (e) => {
            const index = parseInt(e.target.dataset.index, 10);
            const newValue = e.target.textContent;
            clientData.fields[index].value = newValue;

            // If the name field was just edited, update the header immediately.
            if (clientData.fields[index].label.toLowerCase() === 'client name') {
                clientNameHeader.textContent = `Client: ${newValue}`;
            }
        });
    });

    fieldsContainer.querySelectorAll('.delete-field-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index, 10);
            if (confirm(`Are you sure you want to delete the "${clientData.fields[index].label}" field?`)) {
                clientData.fields.splice(index, 1);
                renderFields(clientData); // Re-render the fields without saving
            }
        });
    });
}

function addField(clientData) {
    const newLabel = prompt("Enter the name for the new field (e.g., 'Website'):");
    if (newLabel && newLabel.trim() !== '') {
        clientData.fields.push({ label: newLabel.trim(), value: '' });
        renderFields(clientData); // Re-render without saving
    }
}

function migrateClientData(client) {
    // If client doesn't have a 'fields' array, create it from old properties
    if (!client.fields) {
        client.fields = [
            { label: 'Client Name', value: client.name || '' },
            { label: 'Project Details', value: client.project || '' },
            { label: 'Budget', value: client.budget || '' },
            { label: 'Contact Person', value: client.contact || '' }
        ];
        // Remove old properties
        delete client.name;
        delete client.project;
        delete client.budget;
        delete client.contact;
    }
    return client;
}

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    clientId = params.get('id');

    if (!clientId) {
        clientNameHeader.textContent = 'No Client ID Provided';
        document.getElementById('addFieldBtn').style.display = 'none';
        document.getElementById('deleteClientBtn').style.display = 'none';
        return;
    }
    
    // Display a loading message until Firestore data is fetched.
    clientNameHeader.textContent = 'Loading Client...';
    const actionButtons = document.querySelector('.action-buttons');
    if (actionButtons) {
        actionButtons.style.display = 'none';
    }
});

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { getFirestore, collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, writeBatch, serverTimestamp, getDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

if (!getApps().length) initializeApp(firebaseConfig);
const auth = getAuth();
const db = getFirestore();

const CLIENTS_COLLECTION = "clients";
let isUserLoggedIn = false;
let currentUid = null;
let clientsRef = null;
let clientsUnsub = null;

function showError(msg, err) { console.error(msg, err || ''); alert(msg + (err && err.message ? `: ${err.message}` : '')); }

// Sync helpers
async function syncLocalClientsToFirestore(uid) {
    const local = JSON.parse(localStorage.getItem('clients') || '[]');
    if (!local.length) return;
    try {
        clientsRef = collection(db, CLIENTS_COLLECTION);
        const batch = writeBatch(db);
        local.forEach(c => {
            const r = doc(clientsRef);
            const payload = { uid, name: c.name, project: c.project, budget: c.budget, contact: c.contact, createdAt: serverTimestamp() };
            batch.set(r, payload);
        });
        await batch.commit();
        localStorage.removeItem('clients');
    } catch (err) {
        showError('Failed to sync clients', err);
    }
}

async function attachClientsListener(uid) {
    if (clientsUnsub) clientsUnsub();
    clientsRef = collection(db, CLIENTS_COLLECTION);
    const q = query(clientsRef, where('uid', '==', uid));
    clientsUnsub = onSnapshot(q, snapshot => {
        const remote = snapshot.docs.map(d => ({ id: d.id, ...d.data(), source: 'remote' }));
        localStorage.setItem('clients', JSON.stringify(remote));
        // trigger re-render in company.js by calling window-level function if exists
        if (typeof render === 'function') render();
    }, err => showError('Clients realtime error', err));
}

// Modify addClientInfo to use Firestore when logged in
async function addClientInfo() {
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
        try {
            if (!clientsRef) clientsRef = collection(db, CLIENTS_COLLECTION);
            await addDoc(clientsRef, { uid: currentUid, ...payload, createdAt: serverTimestamp() });
            // clear inputs
            nameInput.value = projectInput.value = budgetInput.value = contactInput.value = '';
        } catch (err) {
            showError('Failed to add client to Firestore', err);
        }
    } else {
        // fallback local behavior
        let clients = JSON.parse(localStorage.getItem('clients')) || [];
        clients.push({ id: Date.now().toString(), ...payload });
        localStorage.setItem('clients', JSON.stringify(clients));
        // clear inputs and re-render
        nameInput.value = projectInput.value = budgetInput.value = contactInput.value = '';
        if (typeof render === 'function') render();
    }
}

// Wire auth state
onAuthStateChanged(auth, async user => {
    if (user) {
        isUserLoggedIn = true;
        currentUid = user.uid;

        // If this page is an edit page with an id, try to fetch the remote doc and render it
        if (clientId) {
            try {
                const docRef = doc(db, CLIENTS_COLLECTION, clientId);
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    const data = snap.data();
                    let currentData = migrateClientData({ id: snap.id, ...data });
                    renderFields(currentData);
                    const clientNameField = currentData.fields.find(f => f.label.toLowerCase() === 'client name');
                    clientNameHeader.textContent = `Client: ${clientNameField ? clientNameField.value : 'N/A'}`;
                    const actionButtons = document.querySelector('.action-buttons');
                    if(actionButtons) actionButtons.style.display = 'block';
                    document.getElementById('saveChangesBtn').style.display = 'inline-block';
                    // Re-wire buttons to use the fetched data
                    document.getElementById('saveChangesBtn').onclick = () => saveClientData(currentData);
                    document.getElementById('deleteClientBtn').onclick = deleteClient;
                    document.getElementById('addFieldBtn').onclick = () => addField(currentData);
                } else {
                    clientNameHeader.textContent = 'Client Not Found';
                    const actionButtons = document.querySelector('.action-buttons');
                    if (actionButtons) {
                        actionButtons.style.display = 'none';
                    }
                }
            } catch (err) {
                clientNameHeader.textContent = 'Error Loading Client';
                console.warn('Failed to fetch remote client for edit page:', err);
            }
        }
    } else {
        isUserLoggedIn = false;
        currentUid = null;
        // If not logged in, user cannot view data from Firestore.
        clientNameHeader.textContent = 'Please log in to view client details.';
        fieldsContainer.innerHTML = '';
        const actionButtons = document.querySelector('.action-buttons');
        if (actionButtons) {
            actionButtons.style.display = 'none';
        }
    }
});
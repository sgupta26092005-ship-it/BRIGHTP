const teammateNameHeader = document.getElementById('teammateNameHeader');
const fieldsContainer = document.getElementById('teammateFieldsContainer');

let teammateId;

// Add Firebase backend support
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import {
    getFirestore,
    collection,
    query,
    where,
    onSnapshot,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    writeBatch,
    serverTimestamp,
    getDoc // added getDoc
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

if (!getApps().length) initializeApp(firebaseConfig);
const auth = getAuth();
const db = getFirestore();

const COLLECTION = "teammates"; // Firestore collection

// New state for backend
let isUserLoggedIn = false;
let currentUid = null;
let collectionRef = null;
let unsubscribe = null;

function showError(msg, err) {
    console.error(msg, err || '');
    // minimal UI feedback
    alert(msg + (err && err.message ? `: ${err.message}` : ''));
}

async function createItemInCollection(collectionRef, data) {
    try {
        const ref = await addDoc(collectionRef, data);
        return { success: true, id: ref.id };
    } catch (err) {
        return { success: false, error: err };
    }
}

async function syncLocalTeammatesToFirestore(uid) {
    const local = JSON.parse(localStorage.getItem('teammates') || '[]');
    if (!local.length) return;
    try {
        collectionRef = collection(db, COLLECTION);
        const batch = writeBatch(db);
        local.forEach(t => {
            const newRef = doc(collectionRef);
            const payload = { uid, ...migrateTeammateData(t) };
            // ensure no functions or DOM nodes included
            delete payload.id;
            batch.set(newRef, payload);
        });
        await batch.commit();
        localStorage.removeItem('teammates');
    } catch (err) {
        showError('Failed to sync teammates to Firestore', err);
    }
}

async function attachTeammatesListener(uid) {
    if (unsubscribe) unsubscribe();
    collectionRef = collection(db, COLLECTION);
    const q = query(collectionRef, where('uid', '==', uid));
    unsubscribe = onSnapshot(q, snapshot => {
        const remote = snapshot.docs.map(d => {
            const data = d.data();
            const item = migrateTeammateData({ id: d.id, ...data });
            item.source = 'remote';
            return item;
        });
        // update UI by rendering fields from selected teammate if open, and keep local list for other operations
        localStorage.setItem('teammates', JSON.stringify(remote)); // keep local copy
        // If current page has this teammate, update currentData and rerender fields
        const current = remote.find(r => String(r.id) === String(teammateId));
        if (current) {
            renderFields(current);
            const nameField = current.fields.find(f => f.label.toLowerCase() === 'name');
            teammateNameHeader.textContent = `Teammate: ${nameField ? nameField.value : 'N/A'}`;
        }
    }, err => {
        showError('Teammates realtime listener error', err);
    });
}

// Delete teammate function
function deleteTeammate() {
    if (!confirm('Are you sure you want to delete this teammate? This action cannot be undone.')) return;

    if (isUserLoggedIn && currentUid && teammateId && !String(teammateId).startsWith('tmp-')) {
        (async () => {
            try {
                const docRef = doc(db, COLLECTION, teammateId);
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    const data = snap.data();
                    if (data.uid && data.uid !== currentUid) {
                        showError('You do not have permission to delete this teammate (owner mismatch).');
                        return;
                    }
                } else {
                    // doc doesn't exist remotely, fall back to local removal
                    let local = JSON.parse(localStorage.getItem('teammates') || '[]') || [];
                    local = local.filter(t => String(t.id) !== String(teammateId));
                    localStorage.setItem('teammates', JSON.stringify(local));
                    window.location.href = 'company.html';
                    return;
                }

                await deleteDoc(docRef);
                window.location.href = 'company.html';
            } catch (err) {
                showError('Failed to delete teammate from Firestore', err);
            }
        })();
    } else {
        // fallback to local
        let teammates = JSON.parse(localStorage.getItem('teammates')) || [];
        teammates = teammates.filter(t => t.id !== teammateId);
        localStorage.setItem('teammates', JSON.stringify(teammates));
        window.location.href = 'company.html';
    }
}

// Save teammate data function
function saveTeammateData(teammateData) {
    if (isUserLoggedIn && currentUid && teammateData.id && !String(teammateData.id).startsWith('tmp-')) {
        (async () => {
            try {
                const docRef = doc(db, COLLECTION, teammateData.id);
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    const remote = snap.data();
                    if (remote.uid && remote.uid !== currentUid) {
                        showError('You do not have permission to update this teammate (owner mismatch).');
                        return;
                    }
                    const payload = { uid: currentUid, ...teammateData };
                    delete payload.id;
                    await updateDoc(docRef, payload);
                    alert('Changes saved successfully!');
                    const updatedNameField = teammateData.fields.find(f => f.label.toLowerCase() === 'name');
                    teammateNameHeader.textContent = `Teammate: ${updatedNameField ? updatedNameField.value : 'N/A'}`;
                } else {
                    // remote doc missing — create new document with uid and payload
                    const col = collection(db, COLLECTION);
                    const payload = { uid: currentUid, ...teammateData };
                    delete payload.id;
                    const res = await addDoc(col, payload);
                    // optionally update local id -> remote id mapping
                    // update localStorage copy if present
                    let local = JSON.parse(localStorage.getItem('teammates') || '[]') || [];
                    local = local.map(t => t.id === teammateData.id ? ({ id: res.id, ...teammateData }) : t);
                    localStorage.setItem('teammates', JSON.stringify(local));
                    alert('Saved as new remote teammate.');
                    const updatedNameField = teammateData.fields.find(f => f.label.toLowerCase() === 'name');
                    teammateNameHeader.textContent = `Teammate: ${updatedNameField ? updatedNameField.value : 'N/A'}`;
                }
            } catch (err) {
                showError('Failed to save teammate to Firestore', err);
            }
        })();
    } else {
        // local storage
        let teammates = JSON.parse(localStorage.getItem('teammates')) || [];
        const idx = teammates.findIndex(t => t.id === teammateData.id);
        if (idx !== -1) {
            teammates[idx] = teammateData;
        } else {
            teammates.push(teammateData);
        }
        localStorage.setItem('teammates', JSON.stringify(teammates));
        alert('Changes saved successfully!');
        const updatedNameField = teammateData.fields.find(f => f.label.toLowerCase() === 'name');
        teammateNameHeader.textContent = `Teammate: ${updatedNameField ? updatedNameField.value : 'N/A'}`;
    }
}

function renderFields(teammateData) {
    fieldsContainer.innerHTML = '';
    teammateData.fields.forEach((field, index) => {
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
            const newValue = e.target.innerText; // Use innerText to avoid extra whitespace issues
            teammateData.fields[index].value = newValue;
        });
    });

    fieldsContainer.querySelectorAll('.delete-field-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index, 10);
            if (confirm(`Are you sure you want to delete the "${teammateData.fields[index].label}" field?`)) {
                teammateData.fields.splice(index, 1);
                renderFields(teammateData); // Re-render the fields without saving
            }
        });
    });
}

function addField(teammateData) {
    const newLabel = prompt("Enter the name for the new field (e.g., 'Skills'):");
    if (newLabel && newLabel.trim() !== '') {
        teammateData.fields.push({ label: newLabel.trim(), value: '' });
        renderFields(teammateData); // Re-render without saving
    }
}

function migrateTeammateData(teammate) {
    // If teammate doesn't have a 'fields' array, create it from old properties
    if (!teammate.fields) {
        teammate.fields = [
            { label: 'Name', value: teammate.name || '' },
            { label: 'Role', value: teammate.role || '' },
            { label: 'Contact Info', value: teammate.contact || '' },
            { label: 'Assigned Tasks', value: teammate.tasks || '' }
        ];
        // Remove old properties
        delete teammate.name;
        delete teammate.role;
        delete teammate.contact;
        delete teammate.tasks;
    }
    return teammate;
}

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    teammateId = params.get('id');

    if (!teammateId) {
        teammateNameHeader.textContent = 'No Teammate ID Provided';
        document.getElementById('addFieldBtn').style.display = 'none';
        document.getElementById('saveChangesBtn').style.display = 'none';
        document.getElementById('deleteTeammateBtn').style.display = 'none';
        return;
    }

    // Display a loading message until Firestore data is fetched.
    teammateNameHeader.textContent = 'Loading Teammate...';
    const actionButtons = document.querySelector('.action-buttons');
    if (actionButtons) {
        actionButtons.style.display = 'none';
    }
});

// Wire auth state to sync and listen
onAuthStateChanged(auth, async (user) => {
    if (user) {
        isUserLoggedIn = true;
        currentUid = user.uid;

        // If on edit page, try to fetch the specific remote doc and render it
        if (teammateId) {
            try {
                const docRef = doc(db, COLLECTION, teammateId);
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    const data = snap.data();
                    let currentData = migrateTeammateData({ id: snap.id, ...data });
                    renderFields(currentData);
                    const nameField = currentData.fields.find(f => f.label.toLowerCase() === 'name');
                    teammateNameHeader.textContent = `Teammate: ${nameField ? nameField.value : 'N/A'}`;
                    const actionButtons = document.querySelector('.action-buttons');
                    if(actionButtons) actionButtons.style.display = 'block';
                    document.getElementById('saveChangesBtn').style.display = 'inline-block'; // Ensure button is visible
                    // Re-wire other buttons
                    document.getElementById('saveChangesBtn').onclick = () => saveTeammateData(currentData);
                    document.getElementById('deleteTeammateBtn').onclick = deleteTeammate;
                    document.getElementById('addFieldBtn').onclick = () => addField(currentData);
                } else {
                    teammateNameHeader.textContent = 'Teammate Not Found';
                    const actionButtons = document.querySelector('.action-buttons');
                    if (actionButtons) {
                        actionButtons.style.display = 'none';
                    }
                }
            } catch (err) {
                teammateNameHeader.textContent = 'Error Loading Teammate';
                console.warn('Failed to fetch remote teammate for edit page:', err);
            }
        }

    } else {
        isUserLoggedIn = false;
        currentUid = null;
        if (unsubscribe) unsubscribe();
        // If not logged in, user cannot view data from Firestore.
        teammateNameHeader.textContent = 'Please log in to view teammate details.';
        fieldsContainer.innerHTML = '';
        const actionButtons = document.querySelector('.action-buttons');
        if (actionButtons) {
            actionButtons.style.display = 'none';
        }
    }
});
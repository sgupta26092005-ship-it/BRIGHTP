import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
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
		writeBatch,
		doc,
		serverTimestamp,
		getDocs
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const COLLECTION = "learnapart";

document.addEventListener('DOMContentLoaded', () => {
	// State
	let items = JSON.parse(localStorage.getItem('learnapartItems') || '[]');
	let currentEditingId = null;
	let isUserLoggedIn = false;
	let currentUid = null;
	let collectionRef = null;
	let unsubscribe = null;
	let firestoreAvailable = true; // NEW: tracks whether Firestore access is permitted

	// DOM
	const modal = document.getElementById('learnEditModal');
	const modalTitle = document.getElementById('learnModalTitle');
	const modalFields = document.getElementById('learnModalFields'); // textarea container
	const closeModalBtn = modal ? modal.querySelector('.close-modal') : null;
	const saveBtn = document.getElementById('saveLearnItemBtn');
	const deleteBtn = document.getElementById('deleteLearnItemBtn');
	const addButtons = document.querySelectorAll('.add-item-btn');

	// Helpers
	function saveLocal() {
		localStorage.setItem('learnapartItems', JSON.stringify(items));
		updateLocalCounts();
	}

	function showError(msg, err) {
		console.error(msg, err || '');
		let box = document.getElementById('learnErrorBox');
		if (!box) {
			box = document.createElement('div');
			box.id = 'learnErrorBox';
			box.style.cssText = 'position:fixed;bottom:12px;right:12px;background:#fee;padding:8px 10px;border:1px solid #c00;border-radius:4px;z-index:9999;';
			document.body.appendChild(box);
		}
		box.innerText = msg + (err && err.message ? ` — ${err.message}` : '');
		clearTimeout(box._t);
		box._t = setTimeout(() => box.innerText = '', 6000);
	}

	// Render
	function render() {
		const collabEl = document.getElementById('collaboratorList');
		const eventEl = document.getElementById('eventsList');
		const notesEl = document.getElementById('notesList');

		if (collabEl) collabEl.innerHTML = '';
		if (eventEl) eventEl.innerHTML = '';
		if (notesEl) notesEl.innerHTML = '';

		items.forEach(item => {
			const container = item.category === 'collaborator' ? collabEl
				: item.category === 'event' ? eventEl
				: item.category === 'note' ? notesEl : null;
			if (!container) return;

			const card = document.createElement('div');
			card.className = 'learn-item-card';
			const title = item.title || 'Untitled';
			const badge = (item.source === 'local' || String(item.id).startsWith('tmp-')) ? `<span style="margin-left:6px;padding:2px 6px;background:#ffd700;border-radius:4px;font-size:12px;">Local</span>` : '';
			card.innerHTML = `
				<p><strong>${title}</strong> ${badge}</p>
				<div class="actions">
					<button class="edit-btn" data-id="${item.id}" data-type="${item.category}">Edit</button>
					<button class="delete-btn" data-id="${item.id}" data-type="${item.category}">Delete</button>
				</div>
			`;
			container.appendChild(card);
		});
		attachItemDelegation();
	}

	function attachItemDelegation() {
		const collabEl = document.getElementById('collaboratorList');
		const eventEl = document.getElementById('eventsList');
		const notesEl = document.getElementById('notesList');

		[collabEl, eventEl, notesEl].forEach(el => {
			if (!el) return;
			// remove previous to avoid duplicates
			el.onclick = (e) => {
				const t = e.target;
				if (t.classList.contains('edit-btn')) {
					openModal(String(t.dataset.id));
				} else if (t.classList.contains('delete-btn')) {
					currentEditingId = String(t.dataset.id);
					deleteItem();
				}
			};
		});
	}

	function openModal(id) {
		const it = items.find(i => String(i.id) === String(id));
		if (!it) return;
		currentEditingId = String(id);
		modalTitle.innerText = it.title || '';
		modalFields.innerHTML = `<textarea id="modal-content-area" style="width:100%;height:220px;background:#222;color:#eee;padding:8px;border:1px solid #444;border-radius:4px;">${it.content || ''}</textarea>`;
		modal.classList.add('active');
	}

	function closeModal() {
		currentEditingId = null;
		modal.classList.remove('active');
	}

	// NEW: helper to enable/disable sync button based on availability & auth
	function updateSyncButtonState() {
		const btn = document.getElementById('syncLocalBtn');
		if (!btn) return;
		btn.disabled = !isUserLoggedIn || !firestoreAvailable;
		if (!isUserLoggedIn) btn.title = 'Log in to sync local items';
		else if (!firestoreAvailable) btn.title = 'Firestore permissions denied — fix rules to enable sync';
		else btn.title = '';
	}

	// Add item (optimistic local then remote if logged in)
	async function addItem(category) {
		// normalize category to avoid sending undefined to Firestore
		const cat = category || 'note';

		const title = prompt(`Enter a title for the new ${cat}:`);
		if (!title || !title.trim()) return;
		const tempId = `tmp-${Date.now()}`;
		const localItem = { id: tempId, title: title.trim(), content: '', category: cat, source: 'local' };
		items.push(localItem);
		saveLocal();
		render();

		// If Firestore is available and user is logged in, attempt remote save
		if (isUserLoggedIn && currentUid && firestoreAvailable) {
			try {
				if (!collectionRef) collectionRef = collection(db, COLLECTION);
				const data = { uid: currentUid, title: localItem.title, content: localItem.content, category: cat, createdAt: serverTimestamp(), lastModified: serverTimestamp() };
				const docRef = await addDoc(collectionRef, data);
				// replace temp id with remote id
				items = items.map(i => i.id === tempId ? { id: docRef.id, ...data, source: 'remote' } : i);
				saveLocal();
				render();
			} catch (err) {
				// If permission error, mark Firestore as unavailable and fall back to local-only mode
				if (err && (err.code === 'permission-denied' || (err.message && err.message.includes('permission')))) {
					firestoreAvailable = false;
					updateSyncButtonState();
					showError('Firestore permission denied. Your Firestore rules prevent access. Items saved locally.', err);
					// leave optimistic local item in place and mark it as local
					items = items.map(i => i.id === tempId ? ({ ...i, source: 'local', __error: true }) : i);
					saveLocal();
					render();
					return;
				}
				showError('Failed to add item to Firestore', err);
				items = items.map(i => i.id === tempId ? ({ ...i, __error: true }) : i);
				saveLocal();
				render();
			}
		} else if (isUserLoggedIn && !firestoreAvailable) {
			showError('Firestore unavailable due to insufficient permissions. Item saved locally.');
		}
	}

	// Save (update) item
	async function saveItem() {
		if (!currentEditingId) return;
		const title = modalTitle.innerText.trim();
		const content = document.getElementById('modal-content-area')?.value || '';
		if (!title) { alert('Title cannot be empty'); return; }

		// Remote update if possible
		if (isUserLoggedIn && currentUid && firestoreAvailable && !String(currentEditingId).startsWith('tmp-')) {
			try {
				if (!collectionRef) collectionRef = collection(db, COLLECTION);
				const docRef = doc(db, COLLECTION, currentEditingId);
				await updateDoc(docRef, { title, content, lastModified: serverTimestamp(), uid: currentUid });
			} catch (err) {
				if (err && (err.code === 'permission-denied' || (err.message && err.message.includes('permission')))) {
					firestoreAvailable = false;
					updateSyncButtonState();
					showError('Firestore permission denied. Changes saved locally only.', err);
					// fall through to local save
				} else {
					showError('Failed to save item to Firestore', err);
					return;
				}
			}
		}

		// Local update (either because user is logged out, editing a tmp item, or Firestore not usable)
		items = items.map(i => i.id === currentEditingId ? ({ ...i, title, content, source: 'local' }) : i);
		saveLocal();
		render();
		closeModal();
	}

	// Delete item
	async function deleteItem() {
		if (!currentEditingId || !confirm('Are you sure you want to delete this item?')) return;

		// Remote delete if possible and item is remote
		if (isUserLoggedIn && currentUid && firestoreAvailable && !String(currentEditingId).startsWith('tmp-')) {
			try {
				await deleteDoc(doc(db, COLLECTION, currentEditingId));
				closeModal();
				return;
			} catch (err) {
				if (err && (err.code === 'permission-denied' || (err.message && err.message.includes('permission')))) {
					firestoreAvailable = false;
					updateSyncButtonState();
					showError('Firestore permission denied. Deletion will be applied locally only.', err);
					// fall through to local delete
				} else {
					showError('Failed to delete item from Firestore', err);
					return;
				}
			}
		}

		// Local delete
		items = items.filter(i => String(i.id) !== String(currentEditingId));
		saveLocal();
		render();
		closeModal();
	}

	// Sync local -> Firestore (batch)
	async function syncLocalToFirestore(uid) {
		const local = JSON.parse(localStorage.getItem('learnapartItems') || '[]') || [];
		if (local.length === 0) return { success: true, count: 0 };
		try {
			if (!collectionRef) collectionRef = collection(db, COLLECTION);
			const batch = writeBatch(db);
			local.forEach(li => {
				const newDocRef = doc(collectionRef);
				batch.set(newDocRef, { uid, title: li.title, content: li.content || '', category: li.category || 'note', createdAt: serverTimestamp(), syncedFromLocal: true });
			});
			await batch.commit();
			localStorage.removeItem('learnapartItems');
			// after successful sync, attachRealtimeListener will repopulate items
			return { success: true, count: local.length };
		} catch (err) {
			showError('Failed to sync local items', err);
			return { success: false, error: err };
		}
	}

	// Real-time listener
	async function attachRealtimeListener(uid) {
		if (unsubscribe) unsubscribe();
		if (!collectionRef) collectionRef = collection(db, COLLECTION);
		const q = query(collectionRef, where('uid', '==', uid));
		unsubscribe = onSnapshot(q, snapshot => {
			// Reset firestoreAvailable on successful snapshot
			firestoreAvailable = true;
			updateSyncButtonState();
			items = snapshot.docs.map(d => ({ id: d.id, ...d.data(), source: 'remote' }));
			render();
		}, err => {
			// If permission denied, surface actionable guidance and fall back to local storage
			if (err && (err.code === 'permission-denied' || (err.message && err.message.includes('permission')))) {
				firestoreAvailable = false;
				updateSyncButtonState();
				showError('Firestore permission denied. Update Firestore rules to allow user read access for the learnapart collection.', err);
				// detach snapshot and revert to local items
				if (unsubscribe) { unsubscribe(); unsubscribe = null; }
				items = JSON.parse(localStorage.getItem('learnapartItems') || '[]') || [];
				items = items.map(i => ({ ...i, source: 'local' }));
				render();
			} else {
				showError('Realtime listener error', err);
			}
		});
	}

	// Local counts UI (small panel)
	function ensureLocalSyncPanel() {
		// Local sync panel removed per user request.
		// Keep this function as a no-op so existing calls remain safe.
		return;
	}

	function updateLocalCounts() {
		const local = JSON.parse(localStorage.getItem('learnapartItems') || '[]') || [];
		const el = document.getElementById('localCount');
		if (el) el.innerText = `Local items: ${local.length}`;
	}

	// Auth handling
	onAuthStateChanged(auth, async user => {
		if (user) {
			isUserLoggedIn = true;
			currentUid = user.uid;
			collectionRef = collection(db, COLLECTION);
			// attempt migration
			await syncLocalToFirestore(currentUid);
			await attachRealtimeListener(currentUid);
		} else {
			isUserLoggedIn = false;
			currentUid = null;
			if (unsubscribe) unsubscribe();
			items = JSON.parse(localStorage.getItem('learnapartItems') || '[]') || [];
			// mark local source for display
			items = items.map(i => ({ ...i, source: 'local' }));
			render();
		}
		updateLocalCounts();
		updateSyncButtonState();
	});

	// Add custom field into the simplified modal textarea.
	// If the modal uses a single textarea, we append a labeled placeholder block.
	function addCustomFieldToModal() {
		// Ensure modal is open
		if (!modal || !modal.classList.contains('active')) {
			alert('Open an item to edit, then add a custom field.');
			return;
		}

		// Find the textarea in the modal
		const textarea = document.getElementById('modal-content-area');
		if (!textarea) {
			// If modal doesn't use textarea (legacy mode), give a fallback message
			alert('Custom fields are only supported in the simple editor. Please edit content in the modal and add your field manually.');
			return;
		}

		const label = prompt('Enter label for the new field:');
		if (!label || !label.trim()) return;

		// Append a labeled placeholder to the textarea content
		const current = textarea.value || '';
		const toAppend = `\n\n${label.trim()}:\n\n`; // leave blank value for user to fill
		textarea.value = current + toAppend;
		textarea.focus();
		// Place cursor at end
		textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
	}

	// Wire UI buttons and initial render
	addButtons.forEach(b => b.addEventListener('click', () => addItem(b.dataset.type)));
	if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
	if (saveBtn) saveBtn.addEventListener('click', saveItem);
	if (deleteBtn) deleteBtn.addEventListener('click', deleteItem);
	// Wire the Add Field button (if present) to the modal helper
	const addFieldBtn = document.getElementById('addCustomFieldBtn');
	if (addFieldBtn) addFieldBtn.addEventListener('click', addCustomFieldToModal);
	if (modal) modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

	ensureLocalSyncPanel();
	updateLocalCounts();
	updateSyncButtonState();
	render();
});
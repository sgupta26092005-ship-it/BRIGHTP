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
    getDocs,
    limit,
    getDoc // Add this import
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

// Initialize Firebase services directly in this file
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

document.addEventListener('DOMContentLoaded', () => {
    let scripts = JSON.parse(localStorage.getItem('scripts') || '[]'); // Load from local storage initially
    let currentEditingId = null;
    let isUserLoggedIn = false;
    let currentUid = null;
    let scriptsCollectionRef;
    let unsubscribe = null; // To detach Firestore listener
    let isDbConnected = false; // New connection status variable

    const modal = document.getElementById('videoModal');
    const modalTitle = document.getElementById('videoTitle');
    const modalScript = document.getElementById('videoScript');
    const closeModalBtn = document.querySelector('.close-modal');
    const saveScriptBtn = document.getElementById('saveScriptBtn');
    const deleteScriptBtn = document.getElementById('deleteScriptBtn');
    const addButtons = document.querySelectorAll('.add-script-btn');

    function saveScripts() {
        localStorage.setItem('scripts', JSON.stringify(scripts));
    }

    function renderScripts() {
        const youtubeContainer = document.getElementById('youtube-scripts');
        const instagramContainer = document.getElementById('instagram-scripts');
        const linkedinContainer = document.getElementById('linkedin-scripts');

        youtubeContainer.innerHTML = '';
        instagramContainer.innerHTML = '';
        linkedinContainer.innerHTML = '';

        console.log("Rendering scripts. Current scripts array:", scripts);
        scripts.forEach(script => {
            const card = document.createElement('div');
            card.className = 'video-card';
            card.dataset.id = script.id;
            card.innerHTML = `<strong>${script.title}</strong>`;

            card.addEventListener('click', () => openModal(script.id));

            if (script.category === 'youtube') {
                youtubeContainer.appendChild(card);
            } else if (script.category === 'instagram') {
                instagramContainer.appendChild(card);
            } else if (script.category === 'linkedin') {
                linkedinContainer.appendChild(card);
            }
        });

        // Call setupAddScriptButtonListeners after rendering
        setupAddScriptButtonListeners();
    }

    function openModal(scriptId) {
        const script = scripts.find(s => s.id === scriptId);
        if (script) {
            currentEditingId = script.id;
            console.log("Opening modal for script ID:", currentEditingId);
            modalTitle.innerText = script.title;
            modalScript.innerText = script.content;
            modal.classList.add('active');
        }
    }

    // Close modal function
    const closeModal = () => {
        currentEditingId = null;
        modal.classList.remove('active');
    };

    async function checkDatabaseConnection() {
        try {
            // Simple ping to check if Firestore is accessible
            await getDocs(collection(db, "scripts"));
            isDbConnected = true;
            console.log("✅ Database connection successful");
            return true;
        } catch (error) {
            console.error("❌ Database connection failed:", error);
            if (error.code === 'permission-denied') {
                // Permission denied is actually a successful connection
                isDbConnected = true;
                return true;
            }
            isDbConnected = false;
            return false;
        }
    }

    async function initializeDatabase() {
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount < maxRetries) {
            try {
                console.log(`🔄 Initializing database... (Attempt ${retryCount + 1}/${maxRetries})`);
                
                // Check connection first
                const isConnected = await checkDatabaseConnection();
                if (!isConnected) {
                    throw new Error("Database connection failed");
                }

                // Initialize collection reference
                scriptsCollectionRef = collection(db, "scripts");
                console.log("✅ Database initialized successfully");
                return true;

            } catch (error) {
                retryCount++;
                console.error(`❌ Database initialization failed (Attempt ${retryCount}/${maxRetries}):`, error);
                
                if (retryCount === maxRetries) {
                    console.error("❌ All initialization attempts failed");
                    return false;
                }

                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        return false;
    }

    async function addScript(category, retryCount = 0) {
        const title = prompt(`Enter a title for the new ${category} script:`);
        if (!title || title.trim() === '') return;

        if (isUserLoggedIn && currentUid) {
            try {
                if (!scriptsCollectionRef) {
                    scriptsCollectionRef = collection(db, "scripts");
                }

                // Create the document data first
                const scriptData = {
                    uid: currentUid,
                    title: title.trim(),
                    content: 'Start writing your script here...',
                    category: category,
                    createdAt: serverTimestamp(),
                    lastModified: serverTimestamp()
                };

                // Add the document with the prepared data
                const newDoc = await addDoc(scriptsCollectionRef, scriptData);
                console.log("✅ Script added successfully with ID:", newDoc.id);
            } catch (error) {
                console.error("❌ Error adding script:", error);
                if (error.code === 'permission-denied') {
                    alert("Permission denied. Please sign in again.");
                } else {
                    alert(`Failed to add script: ${error.message}`);
                }
            }
        } else {
            // Logged out: Add to localStorage
            const newScript = {
                id: Date.now().toString(), // Use string for consistency
                title: title.trim(),
                content: 'Start writing your script here...',
                category: category
            };
            scripts.push(newScript);
            saveScripts();
            renderScripts(); // Manually re-render
            console.log("✅ Script added to localStorage.");
        }
    }

    // Helper: read text from an element or input reliably
	function getElementText(el) {
		if (!el) return '';
		// input/textarea have value, other nodes use innerText
		return (el.value !== undefined) ? el.value : el.innerText;
	}

    // Replace the existing saveScript with this updated function
    async function saveScript() {
        if (!currentEditingId) return;

        // read values using helper (works for inputs or contenteditable elements)
        const title = getElementText(modalTitle).trim();
        const content = getElementText(modalScript).trim();

        if (!title || !content) {
            alert('Title and content cannot be empty.');
            return;
        }

        if (isUserLoggedIn && currentUid) {
            console.log("Attempting to save script to Firestore. ID:", currentEditingId);
            try {
                const scriptDocRef = doc(db, "scripts", currentEditingId);

                // Update document in Firestore
                await updateDoc(scriptDocRef, {
                    title: title,
                    content: content,
                    lastModified: serverTimestamp()
                });

                console.log("✅ Script updated in Firestore");
                closeModal(); // close on success; onSnapshot will refresh UI
            } catch (error) {
                console.error("❌ Error saving script:", error);
                alert(`Failed to save script: ${error.message}`);
                // keep modal open so user can retry
            }
        } else {
            // Logged out: Update localStorage
            console.log("Saving script to localStorage. ID:", currentEditingId);
            const scriptIndex = scripts.findIndex(s => s.id === currentEditingId);
            if (scriptIndex > -1) {
                scripts[scriptIndex].title = title;
                scripts[scriptIndex].content = content;
                scripts[scriptIndex].lastModified = new Date().toISOString();
                saveScripts();
                renderScripts();
                closeModal();
            } else {
                console.warn("Script not found in localStorage for editing. ID:", currentEditingId);
            }
        }
    }

    async function deleteScript() {
        if (!currentEditingId || !confirm('Are you sure you want to delete this script?')) return;

        if (isUserLoggedIn) {
            // Logged in: Delete from Firestore
            try {
                const scriptDocRef = doc(db, "scripts", currentEditingId);
                await deleteDoc(scriptDocRef);
                console.log("✅ Script deleted from Firestore.");
            } catch (error) {
                console.error("❌ Error deleting script from Firestore:", error);
                alert("There was an error deleting your script. Please try again.");
            }
        } else {
            // Logged out: Delete from localStorage
            scripts = scripts.filter(s => s.id !== currentEditingId);
            saveScripts();
            renderScripts();
        }
        closeModal();
    }

    // Add this new function before onAuthStateChanged
    async function syncLocalScriptsToFirestore(uid) {
        const localScripts = JSON.parse(localStorage.getItem('scripts') || '[]');
        if (localScripts.length === 0) return;

        try {
            const batch = writeBatch(db);
            console.log(`Syncing ${localScripts.length} local scripts to Firestore...`);

            localScripts.forEach(script => {
                const newDocRef = doc(scriptsCollectionRef);
                batch.set(newDocRef, {
                    uid: uid, // Ensure the uid field is added
                    title: script.title,
                    content: script.content,
                    category: script.category,
                    createdAt: serverTimestamp(),
                    syncedFromLocal: true
                });
            });

            await batch.commit();
            console.log("✅ Local scripts synced to Firestore successfully");
            localStorage.removeItem('scripts'); // Clear local storage after successful sync
        } catch (error) {
            console.error("❌ Error syncing local scripts:", error);
        }
    }

    function setAddButtonsEnabled(enabled, tooltip = "") {
        const buttons = document.querySelectorAll('.add-script-btn');
        buttons.forEach(btn => {
            btn.disabled = !enabled;
            btn.title = tooltip;
            // Remove any existing listeners
            const newBtn = btn.cloneNode(true);
            if (enabled) {
                newBtn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    await addScript(newBtn.dataset.category);
                });
            }
            btn.parentNode.replaceChild(newBtn, btn);
        });
    }

    // Replace the existing setupAddScriptButtonListeners with this
    function setupAddScriptButtonListeners() {
        const buttons = document.querySelectorAll('.add-script-btn');
        buttons.forEach(btn => {
            // Remove old listeners and create fresh button
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            // Add new click listener
            newBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!newBtn.disabled) {
                    await addScript(newBtn.dataset.category);
                }
            });
        });
    }

    // Fix the initialize function
    async function initialize() {
        // attach modal button listeners once
		if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
		if (saveScriptBtn) saveScriptBtn.addEventListener('click', saveScript);
		if (deleteScriptBtn) deleteScriptBtn.addEventListener('click', deleteScript);

        renderScripts();
        setupAddScriptButtonListeners();
        
        if (!isUserLoggedIn) {
            setAddButtonsEnabled(true, "Scripts are saved locally. Log in to sync.");
        }
    }

    // --- Add: reconnect helper ---
    async function reconnectToDatabase(maxRetries = 5, delayMs = 3000) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            console.log(`🔄 Reconnect attempt ${attempt}/${maxRetries}...`);
            const ok = await checkDatabaseConnection();
            if (ok) {
                console.log("✅ Reconnected to Firestore");
                isDbConnected = true;
                setAddButtonsEnabled(true, "");
                return true;
            }
            await new Promise(r => setTimeout(r, delayMs));
        }
        console.error("❌ Could not reconnect to Firestore after retries");
        alert("Unable to reconnect to the database. Please check your connection.");
        return false;
    }

    // --- Add: reusable real-time listener attach ---
    async function attachRealtimeListener() {
        if (!currentUid) return;
        if (unsubscribe) unsubscribe();

        if (!scriptsCollectionRef) scriptsCollectionRef = collection(db, "scripts");

        try {
            const q = query(scriptsCollectionRef, where("uid", "==", currentUid));
            unsubscribe = onSnapshot(q,
                (snapshot) => {
                    scripts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                    renderScripts();
                    setAddButtonsEnabled(true, "");
                },
                async (error) => {
                    console.error("❌ Snapshot listener error:", error);
                    isDbConnected = false;
                    setAddButtonsEnabled(false, "Database connection lost. Attempting to reconnect...");
                    const reconnected = await reconnectToDatabase();
                    if (reconnected) {
                        // reattach listener after successful reconnect
                        await attachRealtimeListener();
                    }
                }
            );
        } catch (error) {
            console.error("Failed to set up real-time listener:", error);
            isDbConnected = false;
            setAddButtonsEnabled(false, "Database connection lost. Please refresh the page.");
        }
    }

    // Clean up the auth state change handler
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            isUserLoggedIn = true;
            currentUid = user.uid;

            const isInitialized = await initializeDatabase();
            if (!isInitialized) {
                alert("Unable to initialize database. Please check your internet connection and refresh the page.");
                setAddButtonsEnabled(false, "Database connection failed");
                return;
            }

            setAddButtonsEnabled(true, "");
            scriptsCollectionRef = collection(db, "scripts");
            await syncLocalScriptsToFirestore(user.uid);

            // Use the reusable attachRealtimeListener to handle onSnapshot and reconnection
            await attachRealtimeListener();

        } else {
            isUserLoggedIn = false;
            currentUid = null;
            if (unsubscribe) unsubscribe();
            scripts = JSON.parse(localStorage.getItem('scripts') || '[]');
            renderScripts();
            setAddButtonsEnabled(true, "Scripts are saved locally");
        }
    });

    // Initialize the application
    initialize();
});
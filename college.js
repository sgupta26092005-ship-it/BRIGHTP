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
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const COLLEGE_COLLECTION = "collegeAssignments";

let nav = 0; // Shared navigation offset
let events = [];

const pendingList = document.getElementById('pendingAssignmentsList');
const completedList = document.getElementById('completedAssignmentsList');
const upcomingList = document.getElementById('upcomingAssignmentsList');

let isUserLoggedIn = false;
let currentUid = null;
let collectionRef;
let unsubscribe = null;

async function addAssignmentFromInput() {
    const titleInput = document.getElementById('assignmentTitleInput');
    const dateInput = document.getElementById('assignmentDateInput');

    if (titleInput.value && dateInput.value) {
        const date = new Date(dateInput.value);
        const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate() + 1).padStart(2, '0')}`;
        const newAssignmentData = {
            date: dateString,
            title: titleInput.value,
            description: '',
            status: 'pending',
            completed: false,
        };

        if (isUserLoggedIn && currentUid) {
            try {
                await addDoc(collectionRef, { ...newAssignmentData, uid: currentUid, createdAt: serverTimestamp() });
            } catch (error) {
                console.error("Error adding assignment to Firestore:", error);
                alert("Failed to save assignment online.");
            }
        } else {
            events.push({ id: `local-${Date.now()}`, ...newAssignmentData });
            saveAndRender();
        }

        titleInput.value = '';
        dateInput.value = '';
    }
}

async function deleteEvent(eventId) {
    if (confirm('Are you sure you want to delete this assignment?')) {
        if (isUserLoggedIn && !String(eventId).startsWith('local-')) {
            await deleteDoc(doc(db, COLLEGE_COLLECTION, eventId));
        } else {
            events = events.filter(e => e.id !== eventId);
            saveAndRender();
        }
    }
}

async function toggleEvent(eventId) {
    const event = events.find(e => e.id === eventId);
    if (event) {
        const newCompletedStatus = !event.completed;
        if (isUserLoggedIn && !String(eventId).startsWith('local-')) {
            try {
                const docRef = doc(db, COLLEGE_COLLECTION, eventId);
                await updateDoc(docRef, { 
                    completed: newCompletedStatus,
                    status: newCompletedStatus ? 'completed' : 'pending'
                });
            } catch (error) {
                console.error("Error updating assignment status in Firestore:", error);
                alert("Failed to update assignment status online.");
            }
        } else {
            event.completed = newCompletedStatus;
            event.status = newCompletedStatus ? 'completed' : 'pending';
            saveAndRender();
        }
    }
}

function saveAndRender() {
    localStorage.setItem('events', JSON.stringify(events));
    loadAssignmentLists();
    // Also notify calendar to re-render
    window.dispatchEvent(new Event('events-updated'));
}

function loadAssignmentLists() {
    pendingList.innerHTML = '';
    completedList.innerHTML = '';
    upcomingList.innerHTML = '';

    const dt = new Date();
    if (nav !== 0) {
        dt.setMonth(new Date().getMonth() + nav);
    }
    const currentMonth = dt.getMonth();
    const currentYear = dt.getFullYear();
    const year = currentYear; // for the display string

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize to the start of the day for accurate comparison

    document.getElementById('currentMonthDisplay').innerText = `${dt.toLocaleDateString('en-us', { month: 'long' })} ${year}`;

    const assignments = events.filter(e => {
        const eventDate = new Date(e.date);
        return eventDate.getMonth() === currentMonth && eventDate.getFullYear() === currentYear;
    });

    assignments.forEach(a => {
        const assignmentItem = document.createElement('li');
        assignmentItem.className = 'assignment-item';
        assignmentItem.innerHTML = `
            <div>
                <input type="checkbox" ${a.completed ? 'checked' : ''}>
                <span class="task-text ${a.completed ? 'completed' : ''}">${a.title} ${a.date ? `(${a.date})` : ''}</span>
            </div>
            <div>
                <button class="edit-btn">Edit</button>
                <button class="delete-btn">Delete</button>
            </div>
        `;

        assignmentItem.querySelector('input[type="checkbox"]').addEventListener('change', () => toggleEvent(a.id));
        assignmentItem.querySelector('.delete-btn').addEventListener('click', () => deleteEvent(a.id));
        // Placeholder for edit functionality
        assignmentItem.querySelector('.edit-btn').addEventListener('click', () => alert('Edit functionality coming soon!'));

        const eventDate = new Date(a.date);

        if (a.completed) {
            completedList.appendChild(assignmentItem);
        } else if (eventDate > today || a.status === 'upcoming') {
            upcomingList.appendChild(assignmentItem);
        } else if (a.status === 'pending') { // Only show 'pending' status here
            pendingList.appendChild(assignmentItem);
        }
    });

    // This ensures the accordion state is respected on re-render
    document.querySelectorAll('.accordion-toggle').forEach(button => {
        const content = button.nextElementSibling;
        if (button.classList.contains('active')) {
            content.classList.add('active');
        }
    });
}

// --- Firestore Logic ---
async function syncLocalAssignmentsToFirestore(uid) {
    const localEvents = JSON.parse(localStorage.getItem('events') || '[]');
    if (localEvents.length === 0) return;

    const batch = writeBatch(db);
    localEvents.forEach(item => {
        const docRef = doc(collectionRef);
        const { id, ...data } = item;
        batch.set(docRef, { ...data, uid, syncedFromLocal: true, createdAt: serverTimestamp() });
    });

    try {
        await batch.commit();
        console.log("✅ Local college assignments synced to Firestore.");
        localStorage.removeItem('events');
    } catch (error) {
        console.error("❌ Error syncing college assignments:", error);
    }
}

function attachCollegeListener(uid) {
    if (unsubscribe) unsubscribe();
    const q = query(collectionRef, where("uid", "==", uid));
    unsubscribe = onSnapshot(q, (snapshot) => {
        events = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        localStorage.setItem('events', JSON.stringify(events)); // Save for calendar
        loadAssignmentLists();
        window.dispatchEvent(new CustomEvent('events-updated', { detail: { events: events } }));
    }, (error) => {
        console.error("College listener error:", error);
    });
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Initial render with loading state
    if(pendingList) pendingList.innerHTML = '<p>Loading assignments...</p>';

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            isUserLoggedIn = true;
            currentUid = user.uid;
            collectionRef = collection(db, COLLEGE_COLLECTION);
            await syncLocalAssignmentsToFirestore(user.uid);
            attachCollegeListener(user.uid);
        } else {
            isUserLoggedIn = false;
            currentUid = null;
            if (unsubscribe) unsubscribe();
            events = localStorage.getItem('events') ? JSON.parse(localStorage.getItem('events')) : [];
            loadAssignmentLists();
        }
    });

    document.querySelector('.subsection .add-btn').addEventListener('click', addAssignmentFromInput);

    document.getElementById('nextButton').addEventListener('click', () => {
        nav++;
        loadAssignmentLists();
        window.dispatchEvent(new CustomEvent('nav-change', { detail: { nav } }));
    });

    document.getElementById('backButton').addEventListener('click', () => {
        nav--;
        loadAssignmentLists();
        window.dispatchEvent(new CustomEvent('nav-change', { detail: { nav } }));
    });

    document.querySelectorAll('.accordion-toggle').forEach(button => {
        button.addEventListener('click', () => {
            const content = button.nextElementSibling;
            button.classList.toggle('active');
            content.classList.toggle('active');
            // Ensure the content has the active class if the button does
            if (button.classList.contains('active')) {
                content.classList.add('active');
            }
        });
    });

});

window.addEventListener('events-updated', (e) => {
    // This listener is now primarily for the calendar to receive data.
});
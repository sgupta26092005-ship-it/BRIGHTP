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
const UPSKILL_COLLECTION = "upskillTasks";

let tasks = [];
let nav = 0; // Shared navigation offset

const defaultColors = {
    pending: '#f0ad4e',
    upcoming: '#764ba2',
    completed: '#5cb85c',
};
let taskColors = localStorage.getItem('taskColors') ? JSON.parse(localStorage.getItem('taskColors')) : defaultColors;

let isUserLoggedIn = false;
let currentUid = null;
let collectionRef;
let unsubscribe = null;

async function addTask() {
    const input = document.getElementById('taskInput');
    const date = document.getElementById('taskDate');
    const description = document.getElementById('taskDescription');
    if (input.value.trim()) {
        const newTaskData = {
            text: input.value,
            description: description.value,
            date: date.value,
            completed: false,
        };

        if (isUserLoggedIn && currentUid) {
            try {
                await addDoc(collectionRef, { ...newTaskData, uid: currentUid, createdAt: serverTimestamp() });
            } catch (error) {
                console.error("Error adding task to Firestore:", error);
                alert("Failed to save task online.");
            }
        } else {
            tasks.push({ id: `local-${Date.now()}`, ...newTaskData });
            saveAndRender();
        }

        input.value = '';
        date.value = '';
        description.value = '';
    }
}

async function toggleTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
        const newCompletedStatus = !task.completed;
        if (isUserLoggedIn && !String(taskId).startsWith('local-')) {
            try {
                const docRef = doc(db, UPSKILL_COLLECTION, taskId);
                await updateDoc(docRef, { completed: newCompletedStatus });
            } catch (error) {
                console.error("Error updating task status in Firestore:", error);
                alert("Failed to update task status online.");
            }
        } else {
            task.completed = newCompletedStatus;
            saveAndRender();
        }
    }
}

// Make openEditModal globally accessible so calendar.js can call it
window.openEditModal = openEditModal;

function openEditModal(taskId) {
    const task = tasks.find(t => String(t.id) === String(taskId));
    if (!task) return;

    // Use a generic modal or create a specific one for editing
    // For now, we can reuse the calendar's modal structure
    const modal = document.getElementById('newTaskModal');
    if (!modal) {
        // Fallback if modal is not on the page
        const newText = prompt("Edit task title:", task.text);
        if (newText) {
            task.text = newText;
            updateTask(taskId, { text: newText });
        }
        return;
    }

    const titleInput = document.getElementById('taskTitleInput');
    const descInput = document.getElementById('taskDescInput');
    const statusSelect = document.getElementById('taskStatusSelect');
    const saveButton = document.getElementById('saveButton');
    const backDrop = document.getElementById('modalBackDrop');

    titleInput.value = task.text;
    descInput.value = task.description || '';
    statusSelect.value = task.status || 'pending';

    modal.style.display = 'block';
    backDrop.style.display = 'block';

    // Temporarily change save button to update task
    const newSaveButton = saveButton.cloneNode(true);
    saveButton.parentNode.replaceChild(newSaveButton, saveButton);
    newSaveButton.textContent = 'Update Task';
    newSaveButton.onclick = async () => {
        const updatedData = {
            text: titleInput.value,
            description: descInput.value,
            status: statusSelect.value,
            completed: statusSelect.value === 'completed'
        };
        await updateTask(taskId, updatedData);
        // The closeModal function in calendar.js will handle closing
    };
}

async function deleteTask(taskId) {
    if (!confirm('Are you sure you want to delete this task?')) return;

    if (isUserLoggedIn && !String(taskId).startsWith('local-')) {
        await deleteDoc(doc(db, UPSKILL_COLLECTION, taskId));
    } else {
        tasks = tasks.filter(t => t.id !== taskId);
        saveAndRender();
    }
}

function saveAndRender() {
    localStorage.setItem('upskillTasks', JSON.stringify(tasks));
    renderTasks();
}

function renderTasks() {
    const pendingTaskList = document.getElementById('pendingTaskList');
    const completedTaskList = document.getElementById('completedTaskList');
    const upcomingTaskList = document.getElementById('upcomingTaskList'); // Assuming this exists for consistency

    pendingTaskList.innerHTML = '';
    completedTaskList.innerHTML = '';
    if (upcomingTaskList) upcomingTaskList.innerHTML = '';

    const dt = new Date();
    if (nav !== 0) {
        dt.setMonth(new Date().getMonth() + nav);
    }
    const currentMonth = dt.getMonth();
    const currentYear = dt.getFullYear();

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize to the start of today for accurate comparison

    const monthlyTasks = tasks.filter(task => {
        if (!task.date) return false; // Only include tasks with a date
        const taskDate = new Date(task.date);
        return taskDate.getFullYear() === currentYear && taskDate.getMonth() === currentMonth;
    });

    monthlyTasks.forEach(task => {
        const li = document.createElement('li');
        li.className = 'task-item';
        li.innerHTML = `
            <div>
                <input type="checkbox" ${task.completed ? 'checked' : ''}>
                <span class="task-text ${task.completed ? 'completed' : ''}">${task.text} ${task.date ? `(${task.date})` : ''}</span>
                ${task.description ? `<div class="task-description">${task.description}</div>` : ''}
            </div>
            <div>
                <button class="edit-btn">Edit</button>
                <button class="delete-btn">Delete</button>
            </div>
        `;

        li.querySelector('input[type="checkbox"]').addEventListener('change', () => toggleTask(task.id));
        li.querySelector('.edit-btn').addEventListener('click', () => openEditModal(task.id));
        li.querySelector('.delete-btn').addEventListener('click', () => deleteTask(task.id));

        const taskDate = new Date(task.date);

        if (task.completed) {
            completedTaskList.appendChild(li);
        } else if (taskDate > today) {
            if (upcomingTaskList) upcomingTaskList.appendChild(li);
        } else {
            pendingTaskList.appendChild(li);
        }
    });

    // Add accordion functionality after tasks are rendered
    document.querySelectorAll('.accordion-toggle').forEach(button => {
        button.addEventListener('click', () => {
            const content = button.nextElementSibling;
            button.classList.toggle('active');
            content.classList.toggle('active');
        });
        // Ensure initial state is correct
        if (button.classList.contains('active')) button.nextElementSibling.classList.add('active');
    });

    updateProgress();
}

function updateProgress() {
    const completedCount = tasks.filter(t => t.completed).length;
    const totalTasks = tasks.length;
    const percentage = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;
    const progressFill = document.getElementById('progressFill');
    progressFill.style.width = percentage + '%';
    progressFill.textContent = percentage + '%';
}

async function updateTask(taskId, updatedData) {
    const taskIndex = tasks.findIndex(t => String(t.id) === String(taskId));
    if (taskIndex === -1) return;

    if (isUserLoggedIn && !String(taskId).startsWith('local-')) {
        try {
            const docRef = doc(db, UPSKILL_COLLECTION, taskId);
            await updateDoc(docRef, { ...updatedData, lastModified: serverTimestamp() });
        } catch (error) {
            console.error("Error updating task in Firestore:", error);
            alert("Failed to update task online.");
            return; // Prevent closing modal on failure
        }
    } else {
        tasks[taskIndex] = { ...tasks[taskIndex], ...updatedData };
        saveAndRender();
    }

    // Close modal if it exists
    const modal = document.getElementById('newTaskModal');
    if (modal && modal.style.display === 'block') {
        if (window.closeModal) {
            window.closeModal();
        }
    }
}

function applyColors() {
    document.documentElement.style.setProperty('--event-pending', taskColors.pending);
    document.documentElement.style.setProperty('--event-upcoming', taskColors.upcoming);
    document.documentElement.style.setProperty('--event-completed', taskColors.completed);
}

function setupColorPickers() {
    const pendingColorInput = document.getElementById('pendingColor');
    const upcomingColorInput = document.getElementById('upcomingColor');
    const completedColorInput = document.getElementById('completedColor');

    pendingColorInput.value = taskColors.pending;
    upcomingColorInput.value = taskColors.upcoming;
    completedColorInput.value = taskColors.completed;

    [pendingColorInput, upcomingColorInput, completedColorInput].forEach(input => {
        input.addEventListener('input', (e) => {
            taskColors[e.target.dataset.status] = e.target.value;
            localStorage.setItem('taskColors', JSON.stringify(taskColors));
            applyColors();
        });
    });
}

// --- Firestore Logic ---
async function syncLocalUpskillTasksToFirestore(uid) {
    const localTasks = JSON.parse(localStorage.getItem('upskillTasks') || '[]');
    if (localTasks.length === 0) return;

    const batch = writeBatch(db);
    localTasks.forEach(item => {
        const docRef = doc(collectionRef);
        const { id, ...data } = item;
        batch.set(docRef, { ...data, uid, syncedFromLocal: true, createdAt: serverTimestamp() });
    });

    try {
        await batch.commit();
        console.log("✅ Local upskill tasks synced to Firestore.");
        localStorage.removeItem('upskillTasks');
    } catch (error) {
        console.error("❌ Error syncing upskill tasks:", error);
    }
}

function attachUpskillListener(uid) {
    if (unsubscribe) unsubscribe();
    const q = query(collectionRef, where("uid", "==", uid));
    unsubscribe = onSnapshot(q, (snapshot) => {
        tasks = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        renderTasks();
        window.dispatchEvent(new CustomEvent('tasks-updated', { detail: { tasks: tasks } })); // Notify calendar with data
    }, (error) => {
        console.error("Upskill listener error:", error);
    });
}

// Initial setup and event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Initial render with loading state
    const pendingList = document.getElementById('pendingTaskList');
    if (pendingList) pendingList.innerHTML = '<p>Loading tasks...</p>';

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            isUserLoggedIn = true;
            currentUid = user.uid;
            collectionRef = collection(db, UPSKILL_COLLECTION);
            await syncLocalUpskillTasksToFirestore(user.uid);
            attachUpskillListener(user.uid);
        } else {
            isUserLoggedIn = false;
            currentUid = null;
            if (unsubscribe) unsubscribe();
            tasks = localStorage.getItem('upskillTasks') ? JSON.parse(localStorage.getItem('upskillTasks')) : [];
            renderTasks();
        }
    });

    document.querySelector('.task-input .add-btn').addEventListener('click', addTask);
    document.getElementById('taskInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTask();
    });

    document.getElementById('nextButton').addEventListener('click', () => {
        nav++;
        renderTasks();
        window.dispatchEvent(new CustomEvent('nav-change', { detail: { nav } }));
    });

    document.getElementById('backButton').addEventListener('click', () => {
        nav--;
        renderTasks();
        window.dispatchEvent(new CustomEvent('nav-change', { detail: { nav } }));
    });

    // Initial setup calls
    applyColors();
    setupColorPickers();
});

window.addEventListener('tasks-updated', () => {
    // This listener is now primarily for the calendar to receive data.
});
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
const FINANCE_COLLECTION = "finance";

// --- State Management ---
let entries = [];
let clientPayments = [];
let currentViewMode = 'day'; // 'day', 'month', 'year'
let currentDayNav = 0; // 0 for current day, -1 for yesterday, 1 for tomorrow, etc.
let currentMonthNav = 0;
let currentYearNav = 0;
let financePieChart = null;
let currentChartType = 'income'; // 'income' or 'expense'
let isUserLoggedIn = false;
let currentUid = null;
let financeCollectionRef;
let unsubscribe = null;

function renderAll() {
    const dt = new Date();
    let filteredEntries;
    let displayDateStr;

    if (currentViewMode === 'day') {
        dt.setDate(new Date().getDate() + currentDayNav);
        const currentDay = dt.getDate();
        const currentMonth = dt.getMonth();
        const currentYear = dt.getFullYear();
        displayDateStr = dt.toLocaleDateString('en-us', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

        filteredEntries = entries.filter(entry => {
            const entryDate = new Date(entry.date);
            return entryDate.getFullYear() === currentYear &&
                   entryDate.getMonth() === currentMonth &&
                   entryDate.getDate() === currentDay;
        });
    } else if (currentViewMode === 'month') {
        dt.setMonth(new Date().getMonth() + currentMonthNav);
        const currentMonth = dt.getMonth();
        const currentYear = dt.getFullYear();
        displayDateStr = dt.toLocaleDateString('en-us', { month: 'long', year: 'numeric' });

        filteredEntries = entries.filter(entry => {
            const entryDate = new Date(entry.date);
            return entryDate.getFullYear() === currentYear &&
                   entryDate.getMonth() === currentMonth;
        });
    } else { // 'year'
        dt.setFullYear(new Date().getFullYear() + currentYearNav);
        const currentYear = dt.getFullYear();
        displayDateStr = currentYear.toString();

        filteredEntries = entries.filter(entry => {
            const entryDate = new Date(entry.date);
            return entryDate.getFullYear() === currentYear;
        });
    }

    document.getElementById('currentDateDisplay').textContent = displayDateStr;

    renderEntries(filteredEntries);
    renderCharts(filteredEntries);
}

function renderEntries(filteredEntries) {
    const incomeContainer = document.getElementById('incomeEntries');
    const expenseContainer = document.getElementById('expenseEntries');
    incomeContainer.innerHTML = '';
    expenseContainer.innerHTML = '';

    let totalIncome = 0;    let totalExpenses = 0;
    if (filteredEntries.length === 0) {
        incomeContainer.innerHTML = '<p>No income entries for this day.</p>';
        expenseContainer.innerHTML = '<p>No expense entries for this day.</p>';
    }

    filteredEntries.forEach(entry => {
        const entryBox = document.createElement('div');
        entryBox.className = 'entry-box';

        const amount = parseFloat(entry.amount);
        const formattedAmount = amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' });

        entryBox.innerHTML = `
            <div class="entry-header">
                <span>${entry.description}</span>
                <span style="color: ${entry.type === 'income' ? 'green' : 'red'};">${formattedAmount}</span>
            </div>
            <div class="entry-details">
                <p>Date: ${entry.date}</p>
                <p>Category: ${entry.category || 'N/A'}</p>
                <div style="margin-top: 10px; display: flex; gap: 10px;">
                    <button class="edit-btn" data-id="${entry.id}">Edit</button>
                    <button class="delete-btn" data-id="${entry.id}">Delete</button>
                </div>
            </div>
        `;

        if (entry.type === 'income') {
            incomeContainer.appendChild(entryBox);
            totalIncome += amount;
        } else {
            expenseContainer.appendChild(entryBox);
            totalExpenses += amount;
        }

        // Add click listener for accordion
        entryBox.querySelector('.entry-header').addEventListener('click', (e) => {
            const details = e.currentTarget.nextElementSibling;
            details.style.display = details.style.display === 'block' ? 'none' : 'block';
        });
    });

    updateSummary(totalIncome, totalExpenses);
}

function renderCharts(filteredEntries) {
    const aggregateByCategory = (entries, type) => {
        return entries
            .filter(e => e.type === type)
            .reduce((acc, e) => {
                const category = e.category || 'Uncategorized';
                acc[category] = (acc[category] || 0) + parseFloat(e.amount);
                return acc;
            }, {});
    };

    let chartData, chartTitle;
    const chartColors = ['rgba(255, 99, 132, 0.6)', 'rgba(255, 159, 64, 0.6)', 'rgba(255, 206, 86, 0.6)', 'rgba(75, 192, 192, 0.6)', 'rgba(153, 102, 255, 0.6)'];

    if (currentChartType === 'income') {
        chartData = aggregateByCategory(filteredEntries, 'income');
        chartTitle = 'Income by Category';
    } else { // 'expense'
        chartData = aggregateByCategory(filteredEntries, 'expense');
        chartTitle = 'Expenses by Category';
    }

    const chartCtx = document.getElementById('financePieChart').getContext('2d');
    if (financePieChart) {
        financePieChart.destroy();
    }

    financePieChart = new Chart(chartCtx, {
        type: 'pie',
        data: {
            labels: Object.keys(chartData),
            datasets: [{
                label: chartTitle,
                data: Object.values(chartData),
                backgroundColor: chartColors,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: chartTitle,
                    color: '#e0e0e0',
                    font: { size: 16 }
                },
                legend: {
                    labels: {
                        color: '#e0e0e0' // Set legend text color
                    }
                }
            }
        }
    });
}

function updateSummary(income, expenses) {
    const balance = income - expenses;
    document.getElementById('totalIncome').textContent = income.toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
    document.getElementById('totalExpenses').textContent = expenses.toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
    document.getElementById('balance').textContent = balance.toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
    document.getElementById('balance').style.color = balance >= 0 ? 'green' : 'red';
}

async function addEntry() {
    const descriptionInput = document.getElementById('entryDescription');
    const amountInput = document.getElementById('entryAmount');
    const dateInput = document.getElementById('entryDate');
    const categoryInput = document.getElementById('entryCategory');
    const typeInput = document.getElementById('entryType');

    const description = descriptionInput.value.trim();
    const amountStr = amountInput.value.trim();
    const date = dateInput.value;
    const category = categoryInput.value.trim();
    const type = typeInput.value;

    if (!description) {
        alert('Please enter a description for the entry.');
        return;
    }
    if (!amountStr) {
        alert('Please enter an amount for the entry.');
        return;
    }
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
        alert('Please enter a valid positive amount for the entry.');
        return;
    }
    if (!date) {
        alert('Please select a date for the entry.');
        return;
    }

    const newEntry = { description, amount, date, category, type, itemType: 'entry' };

    if (isUserLoggedIn && currentUid) {
        try {
            await addDoc(financeCollectionRef, { ...newEntry, uid: currentUid, createdAt: serverTimestamp() });
        } catch (error) {
            console.error("Error adding entry to Firestore:", error);
            alert("Failed to save entry online. It will be saved locally.");
            entries.push({ id: `local-${Date.now()}`, ...newEntry });
            localStorage.setItem('financeEntries', JSON.stringify(entries));
            renderAll();
        }
    } else {
        entries.push({ id: `local-${Date.now()}`, ...newEntry });
        localStorage.setItem('financeEntries', JSON.stringify(entries));
        renderAll();
    }

        descriptionInput.value = '';
        amountInput.value = '';
        dateInput.value = '';
        categoryInput.value = '';
}

async function deleteEntry(id) {
    if (confirm('Are you sure you want to delete this entry?')) {
        if (isUserLoggedIn && !String(id).startsWith('local-')) {
            try {
                await deleteDoc(doc(db, FINANCE_COLLECTION, id));
            } catch (error) {
                console.error("Error deleting entry from Firestore:", error);
                alert("Failed to delete entry from cloud.");
            }
        } else {
            entries = entries.filter(entry => entry.id !== id);
            localStorage.setItem('financeEntries', JSON.stringify(entries));
            renderAll();
        }
    }
}

function openEditModal(id) {
    const entry = entries.find(e => String(e.id) === String(id));
    if (!entry) return;

    document.getElementById('editEntryId').value = entry.id;
    document.getElementById('editEntryDescription').value = entry.description;
    document.getElementById('editEntryAmount').value = entry.amount;
    document.getElementById('editEntryCategory').value = entry.category;
    document.getElementById('editEntryDate').value = entry.date;
    document.getElementById('editEntryType').value = entry.type;

    document.getElementById('editEntryModal').style.display = 'block';
}

function closeEditModal() {
    document.getElementById('editEntryModal').style.display = 'none';
}

async function saveEditedEntry() {
    const id = document.getElementById('editEntryId').value;
    const entryIndex = entries.findIndex(e => String(e.id) === String(id));

    if (entryIndex === -1) {
        alert('Error: Could not find entry to update.');
        return;
    }

    const description = document.getElementById('editEntryDescription').value;
    const amount = document.getElementById('editEntryAmount').value;
    const category = document.getElementById('editEntryCategory').value;
    const date = document.getElementById('editEntryDate').value;
    const type = document.getElementById('editEntryType').value;

    if (!description || !amount || !date) {
        alert('Please fill out all fields.');
        return;
    }

    const updatedData = {
        description,
        amount: parseFloat(amount),
        category,
        date,
        type
    };

    if (isUserLoggedIn && !String(id).startsWith('local-')) {
        try {
            const docRef = doc(db, FINANCE_COLLECTION, id);
            await updateDoc(docRef, updatedData);
            closeEditModal();
        } catch (error) {
            console.error("Error updating entry in Firestore:", error);
            alert("Failed to update entry online.");
        }
    } else {
        entries[entryIndex] = { ...entries[entryIndex], ...updatedData };
        localStorage.setItem('financeEntries', JSON.stringify(entries));
        renderAll();
        closeEditModal();
    }
}

function renderPayments() {
    const pendingContainer = document.getElementById('pendingPayments');
    const completedContainer = document.getElementById('completedPayments');
    pendingContainer.innerHTML = '';
    completedContainer.innerHTML = '';

    clientPayments.forEach(payment => {
        const paymentBox = document.createElement('div');
        paymentBox.className = 'payment-box';

        const amount = parseFloat(payment.amount);
        const formattedAmount = amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' });

        paymentBox.innerHTML = `
            <div class="payment-header">
                <span>${payment.clientName}</span>
                <span style="color: ${payment.status === 'pending' ? '#f0ad4e' : 'green'};">${payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}</span>
            </div>
            <div class="payment-details">
                <p><strong>Amount:</strong> ${formattedAmount}</p>
                <p><strong>Due Date:</strong> ${payment.dueDate}</p>
            </div>
        `;

        if (payment.status === 'pending') {
            pendingContainer.appendChild(paymentBox);
        } else {
            completedContainer.appendChild(paymentBox);
        }

        // Add click listener for accordion
        paymentBox.querySelector('.payment-header').addEventListener('click', (e) => {
            const details = e.currentTarget.nextElementSibling;
            details.style.display = details.style.display === 'block' ? 'none' : 'block';
        });
    });
}

async function addPayment() {
    const clientNameInput = document.getElementById('paymentClientName');
    const amountInput = document.getElementById('paymentAmount');
    const dueDateInput = document.getElementById('paymentDueDate');
    const statusInput = document.getElementById('paymentStatus');

    const clientName = clientNameInput.value;
    const amountStr = amountInput.value.trim();
    const dueDate = dueDateInput.value;
    const status = statusInput.value;

    if (!clientName) {
        alert('Please enter a client name.');
        return;
    }
    if (!amountStr) {
        alert('Please enter a payment amount.');
        return;
    }
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
        alert('Please enter a valid positive amount.');
        return;
    }
    if (!dueDate) {
        alert('Please select a due date.');
        return;
    }

    const newPayment = { clientName, amount, dueDate, status, itemType: 'payment' };

    if (isUserLoggedIn && currentUid) {
        try {
            await addDoc(financeCollectionRef, { ...newPayment, uid: currentUid, createdAt: serverTimestamp() });
        } catch (error) {
            console.error("Error adding payment to Firestore:", error);
            alert("Failed to save payment online. It will be saved locally.");
            clientPayments.push({ id: `local-${Date.now()}`, ...newPayment });
            localStorage.setItem('clientPayments', JSON.stringify(clientPayments));
            renderPayments();
        }
    } else {
        clientPayments.push({ id: `local-${Date.now()}`, ...newPayment });
        localStorage.setItem('clientPayments', JSON.stringify(clientPayments));
        renderPayments();
    }

        clientNameInput.value = '';
        amountInput.value = '';
        dueDateInput.value = '';
}

// --- Firestore Logic ---
async function syncLocalFinanceToFirestore(uid) {
    const localEntries = JSON.parse(localStorage.getItem('financeEntries') || '[]');
    const localPayments = JSON.parse(localStorage.getItem('clientPayments') || '[]');
    if (localEntries.length === 0 && localPayments.length === 0) return;

    const batch = writeBatch(db);
    
    localEntries.forEach(item => {
        const docRef = doc(financeCollectionRef);
        const { id, ...data } = item;
        batch.set(docRef, { ...data, uid, syncedFromLocal: true, createdAt: serverTimestamp() });
    });

    localPayments.forEach(item => {
        const docRef = doc(financeCollectionRef);
        const { id, ...data } = item;
        batch.set(docRef, { ...data, uid, syncedFromLocal: true, createdAt: serverTimestamp() });
    });

    try {
        await batch.commit();
        console.log("✅ Local finance data synced to Firestore.");
        localStorage.removeItem('financeEntries');
        localStorage.removeItem('clientPayments');
    } catch (error) {
        console.error("❌ Error syncing finance data:", error);
    }
}

function attachFinanceListener(uid) {
    if (unsubscribe) unsubscribe();
    const q = query(financeCollectionRef, where("uid", "==", uid));
    unsubscribe = onSnapshot(q, (snapshot) => {
        const allItems = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        entries = allItems.filter(item => item.itemType === 'entry');
        clientPayments = allItems.filter(item => item.itemType === 'payment');
        renderAll();
        renderPayments();
    }, (error) => {
        console.error("Finance listener error:", error);
    });
}
// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    console.log('finance.js loaded and DOMContentLoaded fired.');
    document.getElementById('addEntryBtn').addEventListener('click', addEntry);
    document.getElementById('prevBtn').addEventListener('click', () => {
        if (currentViewMode === 'day') currentDayNav--;
        else if (currentViewMode === 'month') currentMonthNav--;
        else if (currentViewMode === 'year') currentYearNav--;
        renderAll();
    });
    document.getElementById('nextBtn').addEventListener('click', () => {
        if (currentViewMode === 'day') currentDayNav++;
        else if (currentViewMode === 'month') currentMonthNav++;
        else if (currentViewMode === 'year') currentYearNav++;
        renderAll();
    });

    document.getElementById('viewDayBtn').addEventListener('click', () => {
        currentViewMode = 'day';
        document.getElementById('viewDayBtn').classList.add('active');
        document.getElementById('viewMonthBtn').classList.remove('active');
        document.getElementById('viewYearBtn').classList.remove('active');
        renderAll();
    });

    document.getElementById('viewMonthBtn').addEventListener('click', () => {
        currentViewMode = 'month';
        document.getElementById('viewDayBtn').classList.remove('active');
        document.getElementById('viewMonthBtn').classList.add('active');
        document.getElementById('viewYearBtn').classList.remove('active');
        renderAll();
    });

    document.getElementById('viewYearBtn').addEventListener('click', () => {
        currentViewMode = 'year';
        document.getElementById('viewDayBtn').classList.remove('active');
        document.getElementById('viewMonthBtn').classList.remove('active');
        document.getElementById('viewYearBtn').classList.add('active');
        renderAll();
    });

    document.getElementById('showIncomeChartBtn').addEventListener('click', () => {
        currentChartType = 'income';
        document.getElementById('showIncomeChartBtn').classList.add('active');
        document.getElementById('showExpenseChartBtn').classList.remove('active');
        renderAll(); // Re-render everything to update the chart
    });

    document.getElementById('showExpenseChartBtn').addEventListener('click', () => {
        currentChartType = 'expense';
        document.getElementById('showIncomeChartBtn').classList.remove('active');
        document.getElementById('showExpenseChartBtn').classList.add('active');
        renderAll(); // Re-render everything to update the chart
    });

    document.querySelector('.accordion-toggle').addEventListener('click', (e) => {
        const toggle = e.currentTarget;
        const content = toggle.nextElementSibling;
        toggle.classList.toggle('active');
        content.classList.toggle('active');
    });

    document.getElementById('saveEditBtn').addEventListener('click', saveEditedEntry);
    document.getElementById('cancelEditBtn').addEventListener('click', closeEditModal);

    // Event delegation for edit and delete buttons
    document.getElementById('incomeEntries').addEventListener('click', handleEntryActions);
    document.getElementById('expenseEntries').addEventListener('click', handleEntryActions);

    document.getElementById('addPaymentBtn').addEventListener('click', addPayment);
    
    // Show a loading state initially. The onAuthStateChanged handler will trigger the first render.
    document.getElementById('incomeEntries').innerHTML = '<p>Loading financial data...</p>';
    document.getElementById('expenseEntries').innerHTML = '<p>Loading financial data...</p>';
    document.getElementById('pendingPayments').innerHTML = '<p>Loading payments...</p>';
});

function handleEntryActions(e) {
    const id = e.target.dataset.id;
    if (!id) return;

    if (e.target.classList.contains('edit-btn')) openEditModal(id);
    if (e.target.classList.contains('delete-btn')) deleteEntry(id);
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        isUserLoggedIn = true;
        currentUid = user.uid;
        financeCollectionRef = collection(db, FINANCE_COLLECTION);
        await syncLocalFinanceToFirestore(user.uid);
        attachFinanceListener(user.uid);
    } else {
        isUserLoggedIn = false;
        currentUid = null;
        if (unsubscribe) unsubscribe();
        // Load from local storage as fallback
        entries = localStorage.getItem('financeEntries') ? JSON.parse(localStorage.getItem('financeEntries')) : [];
        clientPayments = localStorage.getItem('clientPayments') ? JSON.parse(localStorage.getItem('clientPayments')) : [];
        renderAll();
        renderPayments();
    }
});
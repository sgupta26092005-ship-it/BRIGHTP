let nav = 0; // This will be synced with college.js
let clicked = null;
let events = JSON.parse(localStorage.getItem('events') || '[]'); // Load for logged-out users

const calendar = document.getElementById('assignmentCalendar');
const newAssignmentModal = document.getElementById('newAssignmentModal');
const backDrop = document.getElementById('modalBackDrop');
const eventTitleInput = document.getElementById('eventTitleInput');
const eventDescInput = document.getElementById('eventDescInput');
const eventStatusSelect = document.getElementById('eventStatusSelect');
const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function openModal(date) {
    clicked = date;
    newAssignmentModal.style.display = 'block';
    backDrop.style.display = 'block';
}

function load() {
    const dt = new Date();

    if (nav !== 0) {
        dt.setMonth(new Date().getMonth() + nav);
    }

    const day = dt.getDate();
    const month = dt.getMonth();
    const year = dt.getFullYear();

    const firstDayOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const dateString = firstDayOfMonth.toLocaleDateString('en-us', {
        weekday: 'long',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
    });
    const paddingDays = weekdays.indexOf(dateString.split(', ')[0]);

    calendar.innerHTML = '';

    // Render calendar headers
    weekdays.forEach(day => {
        const daySquare = document.createElement('div');
        daySquare.classList.add('calendar-header');
        daySquare.innerText = day.substring(0, 3).toUpperCase();
        calendar.appendChild(daySquare);
    });

    for (let i = 1; i <= paddingDays + daysInMonth; i++) {
        const daySquare = document.createElement('div');
        daySquare.classList.add('calendar-day');

        const dayString = `${year}-${String(month + 1).padStart(2, '0')}-${String(i - paddingDays).padStart(2, '0')}`;

        if (i > paddingDays) {
            daySquare.innerText = i - paddingDays;

            const eventsForDay = events.filter(e => e.date === dayString);

            if (i - paddingDays === day && nav === 0) {
                daySquare.id = 'currentDay';
            }

            if (eventsForDay.length > 0) {
                eventsForDay.forEach(event => {
                    // Determine status for color-coding. If event.completed is true, status is 'completed'.
                    const eventStatus = event.completed ? 'completed' : (event.status || 'pending');
                    const eventDiv = document.createElement('div');
                    eventDiv.classList.add('calendar-task');
                    eventDiv.classList.add(eventStatus);
                    eventDiv.innerText = event.title;
                    // Apply color from CSS variable set in college.js
                    if (eventStatus !== 'exam') eventDiv.style.backgroundColor = `var(--event-${eventStatus})`;
                    daySquare.appendChild(eventDiv);
                });
            }

            daySquare.addEventListener('click', () => openModal(dayString));
        } else {
            daySquare.classList.add('padding');
        }

        calendar.appendChild(daySquare);
    }
}

function closeModal() {
    eventTitleInput.classList.remove('error');
    newAssignmentModal.style.display = 'none';
    backDrop.style.display = 'none';
    eventTitleInput.value = '';
    eventDescInput.value = '';
    clicked = null;
    load();
}

function saveEvent() {
    if (eventTitleInput.value) {
        eventTitleInput.classList.remove('error');

        events.push({
            date: clicked, // Stored in YYYY-MM-DD format
            title: eventTitleInput.value,
            description: eventDescInput.value,
            status: eventStatusSelect.value,
        });

        localStorage.setItem('events', JSON.stringify(events));
        closeModal();
        window.dispatchEvent(new Event('events-updated')); // Notify college.js
    } else {
        eventTitleInput.classList.add('error');
    }
}

function initButtons() {
    document.getElementById('saveButton').addEventListener('click', saveEvent);
    document.getElementById('cancelButton').addEventListener('click', closeModal);
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('assignmentCalendar')) {
        initButtons();
        load();

        window.addEventListener('nav-change', (e) => {
            nav = e.detail.nav;
            load();
        });

        window.addEventListener('events-updated', (e) => {
            if (e.detail && e.detail.events) {
                // If data comes from the event (logged-in user), use it.
                events = e.detail.events;
            } else {
                events = JSON.parse(localStorage.getItem('events') || '[]');
            }
            load();
        });
    }
});
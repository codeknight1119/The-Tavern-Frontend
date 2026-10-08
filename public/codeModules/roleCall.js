import {mainContentArea} from "./dom.js"

const guestUI = document.getElementById("guestUITemplate").content.cloneNode(true);

mainContentArea.appendChild(guestUI);

const waitText = document.getElementById("rollCall_waitText");
waitText.hidden = false;

const API_URL = "https://script.google.com/macros/s/AKfycbwLeJsbo1fDb6Tm7F1JMYthUe0u4h0Y4J8IPXOGl_FNlWK9YqNq6OAwqXQ6GIA7XIQ2/exec";


// ============================================================
// LOAD TODAY'S ATTENDANCE
// ============================================================

async function loadTodayAttendance() {

    waitText.hidden = false;

    try {

        const response = await fetch(
            `${API_URL}?action=today`
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        console.log(data)

        waitText.hidden = true;

        if (!data.success) {
            throw new Error(data.error || "Unknown API error");
        }

        displayAttendance(data);

    } catch (error) {

        waitText.innerText = "Failed to load attendance.";
        waitText.hidden = false;

        console.error("Attendance error:", error);
    }
}


// ============================================================
// DISPLAY ATTENDANCE
// ============================================================

function displayAttendance(data) {

    const checkedInMemberHolder =
        document.getElementById("checkedInMembers");

    const checkedInGuestHolder =
        document.getElementById("checkedInGuests");

    // Clear old results
    checkedInMemberHolder.innerHTML = "";
    checkedInGuestHolder.innerHTML = "";


    // ========================================================
    // MEMBERS
    // ========================================================

    data.members.forEach((person) => {

        const checkedInElement =
            document.createElement("div");

        checkedInElement.dataset.name =
            `${person.firstName} ${person.lastName}`.toLowerCase();

            let eltext = `
            <pre class="checkedInGuest">
${escapeHTML(person.firstName)} ${escapeHTML(person.lastName)}
            </pre>
            <br>
        `
        eltext = eltext.trim()

        checkedInElement.innerHTML = eltext;

        checkedInMemberHolder.appendChild(
            checkedInElement
        );
    });


    // ========================================================
    // GUESTS
    // ========================================================

    data.guests.forEach((person) => {

        let end = "";

        if (person.totalMeetingsAttended >= 3) {

            end = `
Needs to pay dues soon.
            `;
        }

        const checkedInElement =
            document.createElement("div");

        checkedInElement.dataset.name =
            `${person.firstName} ${person.lastName}`.toLowerCase();

            let checkedIntext = `
            <pre class="checkedInGuest">
${escapeHTML(person.firstName)} ${escapeHTML(person.lastName)}: ${person.totalMeetingsAttended}/3 trial meetings.${end}
            </pre>
            <br>
        `
        checkedIntext = checkedIntext.trim()

        checkedInElement.innerHTML = checkedIntext;

        checkedInGuestHolder.appendChild(
            checkedInElement
        );
    });


    // ========================================================
    // NUMBERS
    // ========================================================

    document.getElementById("rollCall_memberNum").innerText =
        data.members.length;

    document.getElementById("rollCall_GuestNum").innerText =
        data.guests.length;
}


// ============================================================
// LOAD A PAST MEETING
// ============================================================

async function loadMeeting(date) {

    try {

        const response = await fetch(
            `${API_URL}?action=day&date=${encodeURIComponent(date)}`
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || "Unknown API error");
        }

        return data;

    } catch (error) {

        console.error(
            `Failed to load meeting ${date}:`,
            error
        );

        return null;
    }
}


// ============================================================
// GET ALL MEETING DATES
// ============================================================

async function getMeetingDates() {

    try {

        const response = await fetch(
            `${API_URL}?action=dates`
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || "Unknown API error");
        }

        return data.dates;

    } catch (error) {

        console.error(
            "Failed to load meeting dates:",
            error
        );

        return [];
    }
}


// ============================================================
// GET CURRENT ROSTER
// ============================================================

async function getCurrentRoster() {

    try {

        const response = await fetch(
            `${API_URL}?action=roster`
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || "Unknown API error");
        }

        return data;

    } catch (error) {

        console.error(
            "Failed to load roster:",
            error
        );

        return null;
    }
}


// ============================================================
// HTML ESCAPE
// ============================================================

function escapeHTML(value) {

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


// ============================================================
// START
// ============================================================

loadTodayAttendance();

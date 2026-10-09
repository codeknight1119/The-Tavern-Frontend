import {mainContentArea} from "./dom.js";
import {state} from "./state.js"

const API_URL = "https://script.google.com/macros/s/AKfycbzInG-Ablpi9hStwvw5rzd7CGDP2vhaxxgpLQlCSSjNnANom5OCYTxPN9ZBv7l0jQ-l/exec";

export async function roleCall() {
    const guestTemplate = document.getElementById("guestUITemplate");
    if (!guestTemplate) {
        console.warn("guestUITemplate not found; roleCall module will not render.");
    } else {
        const guestUI = guestTemplate.content.cloneNode(true);
        mainContentArea.appendChild(guestUI);
    }

    const waitText = document.getElementById("rollCall_waitText");
    if (waitText) {
        waitText.hidden = false;
    }

    async function loadTodayAttendance() {
        if (!waitText) return;
        waitText.hidden = false;

        try {
            const response = await fetch(`${API_URL}?action=today`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            console.log(data);

            waitText.hidden = true;
            if (!data.success) throw new Error(data.error || "Unknown API error");

            displayAttendance(data);
        } catch (error) {
            waitText.innerText = "Failed to load attendance.";
            waitText.hidden = false;
            console.error("Attendance error:", error);
        }
    }

    function displayAttendance(data) {
        const checkedInMemberHolder = document.getElementById("checkedInMembers");
        const checkedInGuestHolder = document.getElementById("checkedInGuests");

        if (!checkedInMemberHolder || !checkedInGuestHolder) return;

        checkedInMemberHolder.innerHTML = "";
        checkedInGuestHolder.innerHTML = "";

        data.members.forEach((person) => {
            const checkedInElement = document.createElement("div");
            checkedInElement.dataset.name = `${person.firstName} ${person.lastName}`.toLowerCase();

            let eltext = `
                <pre class="checkedInGuest">
                ${escapeHTML(person.firstName)} ${escapeHTML(person.lastName)}
                </pre>
                <br>
            `;
            eltext = eltext.trim();
            checkedInElement.innerHTML = eltext;
            checkedInMemberHolder.appendChild(checkedInElement);
        });

        data.guests.forEach((person) => {
            let end = "";
            if (person.totalMeetingsAttended >= 3) {
                end = `
    Needs to pay dues soon.
                `;
            }

            const checkedInElement = document.createElement("div");
            checkedInElement.dataset.name = `${person.firstName} ${person.lastName}`.toLowerCase();

            let checkedIntext = `
                <pre class="checkedInGuest">
    ${escapeHTML(person.firstName)} ${escapeHTML(person.lastName)}: ${person.totalMeetingsAttended}/3 trial meetings.${end}
                </pre>
                <br>
            `;
            checkedIntext = checkedIntext.trim();
            checkedInElement.innerHTML = checkedIntext;
            checkedInGuestHolder.appendChild(checkedInElement);
        });

        document.getElementById("rollCall_memberNum").innerText = data.members.length;
        document.getElementById("rollCall_GuestNum").innerText = data.guests.length;
    }

    async function loadMeeting(date) {
        try {
            const response = await fetch(`${API_URL}?action=day&date=${encodeURIComponent(date)}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            if (!data.success) throw new Error(data.error || "Unknown API error");
            return data;
        } catch (error) {
            console.error(`Failed to load meeting ${date}:`, error);
            return null;
        }
    }

    async function getMeetingDates() {
        try {
            const response = await fetch(`${API_URL}?action=dates`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            if (!data.success) throw new Error(data.error || "Unknown API error");
            return data.dates;
        } catch (error) {
            console.error("Failed to load meeting dates:", error);
            return [];
        }
    }

    async function getCurrentRoster() {
        try {
            const response = await fetch(`${API_URL}?action=roster`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            if (!data.success) throw new Error(data.error || "Unknown API error");
            return data;
        } catch (error) {
            console.error("Failed to load roster:", error);
            return null;
        }
    }

    function escapeHTML(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    loadTodayAttendance();    
}

export async function signInFromSite() {
    const payload = {
        firstName: state.user.firstName,
        lastName: state.user.lastName,
        isGuest: false
    };

    const date = new Date();
    payload.date = new Intl.DateTimeFormat('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(date);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      // Use text/plain to avoid CORS preflight (OPTIONS) triggers in browsers when calling Google Apps Script
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (result.success) {
      console.log("Sign-in recorded:", result.entry);
    } else {
      console.error("Error from script:", result.error);
    }

    return result;
  } catch (error) {
    console.error("Network request failed:", error);
  }
}
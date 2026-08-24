import { FirebaseUtils } from "./firebaseUtils.js";

const settingsBtn = document.getElementById("settings-btn");
const settingsPanel = document.getElementById("settings-panel");
const settingsClose = document.getElementById("settings-close");
const settingsName = document.getElementById("settings-name");
const settingsSaveName = document.getElementById("settings-save-name");
const settingsNameStatus = document.getElementById("settings-name-status");
const settingsLogout = document.getElementById("settings-logout");

function setStatus(message, isError = false) {
    settingsNameStatus.textContent = message;
    settingsNameStatus.classList.toggle("error", isError);
}

function openSettings() {
    settingsPanel.hidden = false;
    setStatus("");
}

function closeSettings() {
    settingsPanel.hidden = true;
}

settingsBtn.addEventListener("click", openSettings);
settingsClose.addEventListener("click", closeSettings);

settingsPanel.addEventListener("click", (event) => {
    if (event.target === settingsPanel) closeSettings();
});

settingsSaveName.addEventListener("click", async () => {
    const name = settingsName.value.trim();

    if (!/^[a-zA-Z0-9._-]{3,30}$/.test(name)) {
        setStatus("Username must be 3-30 characters and use only letters, numbers, periods, underscores, or hyphens.", true);
        return;
    }

    settingsSaveName.disabled = true;
    setStatus("Saving...");

    try {
        const signedIn = await FirebaseUtils.isSignedIn();
        if (!signedIn) {
            window.location.href = "/signIn";
            return;
        }

        await FirebaseUtils.updateDocument(`/users/${signedIn.user.uid}`, {
            displayName: name,
            name: name
        });

        try {
            await FirebaseUtils.setDocument("/manifest/userManifestTimestamp", { timestamp: Date.now() });
        } catch (error) {
            console.warn("Could not update user manifest timestamp:", error);
        }

        setStatus("Username updated.");
    } catch (error) {
        console.error("Failed to update username:", error);
        setStatus("Could not update your username. Please try again.", true);
    } finally {
        settingsSaveName.disabled = false;
    }
});

settingsLogout.addEventListener("click", async () => {
    settingsLogout.disabled = true;

    try {
        await FirebaseUtils.logout();
        window.location.href = "/signIn";
    } catch (error) {
        console.error("Failed to log out:", error);
        settingsLogout.disabled = false;
        setStatus("Could not log out. Please try again.", true);
    }
});

(async () => {
    try {
        const signedIn = await FirebaseUtils.isSignedIn();
        if (signedIn) {
            const user = await FirebaseUtils.getDocument(`/users/${signedIn.user.uid}`);
            settingsName.value = user?.displayName || user?.name || "";
        }
    } catch (error) {
        console.error("Could not load settings:", error);
    }
})();

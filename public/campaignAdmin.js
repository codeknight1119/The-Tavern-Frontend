import { FirebaseUtils } from "./firebaseUtils.js";

const backendUrl = "https://the-tavern-backend.onrender.com";
let activeCampaignId = null;
let firebaseUser = null;

async function getFirebaseUser() {
    if (firebaseUser) return firebaseUser;

    const signedIn = await FirebaseUtils.isSignedIn();
    if (!signedIn?.user) {
        throw new Error("You must be signed in to manage campaign users.");
    }

    firebaseUser = signedIn.user;
    return firebaseUser;
}

async function getUserIdFromRow(row) {
    const label = row.querySelector("span")?.textContent?.trim() || "";
    const separator = label.lastIndexOf(" (");

    if (separator === -1 || !label.endsWith(")")) {
        throw new Error("Could not identify the selected user.");
    }

    const username = label.slice(0, separator).trim();
    const realName = label.slice(separator + 2, -1).trim();

    const manifestDocument = await FirebaseUtils.getDocument("/manifest/userManifest");
    const manifest = Array.isArray(manifestDocument?.manifest)
        ? manifestDocument.manifest
        : [];

    const match = manifest.find((entry) =>
        entry &&
        entry.name === username &&
        entry["Real Name"] === realName
    );

    if (!match?.id) {
        throw new Error("Could not identify the selected user.");
    }

    return match.id;
}

async function addCampaignUser(userId, isCoDm) {
    if (!activeCampaignId) {
        throw new Error("No campaign is currently selected for administration.");
    }

    const authUser = await getFirebaseUser();
    let token = await authUser.getIdToken();

    const makeRequest = (authToken) => fetch(`${backendUrl}/campaignAdmin`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${authToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            action: "addUser",
            campaignId: activeCampaignId,
            userId,
            isCoDm
        })
    });

    let response = await makeRequest(token);

    if (response.status === 401) {
        token = await authUser.getIdToken(true);
        response = await makeRequest(token);
    }

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(result.error || `Backend request failed (${response.status}).`);
    }

    return result;
}

function getUserLabel(row) {
    return row.querySelector("span")?.textContent?.trim() || "That user";
}

function addCoDmButton(row) {
    if (row.querySelector(".campaignAdmin-addCoDm")) return;

    const normalAddButton = row.querySelector("button");
    if (!normalAddButton) return;

    const coDmButton = document.createElement("button");
    coDmButton.type = "button";
    coDmButton.className = "campaignAdmin-addCoDm";
    coDmButton.textContent = "Add as Co-DM";

    coDmButton.addEventListener("click", async () => {
        coDmButton.disabled = true;

        const status = document.getElementById("campaignAdmin-status");
        const userLabel = getUserLabel(row);

        try {
            const userId = await getUserIdFromRow(row);
            const result = await addCampaignUser(userId, true);

            if (result.alreadyAdded) {
                status.textContent = `${userLabel} already has access to this campaign.`;
            } else {
                status.textContent = `${userLabel} was added as a co-DM.`;
            }
        } catch (error) {
            console.error("Failed to add campaign co-DM:", error);
            status.textContent = error.message || "Could not add that user as a co-DM.";
        } finally {
            coDmButton.disabled = false;
        }
    });

    row.appendChild(coDmButton);
}

function processFoundUsers() {
    const output = document.getElementById("campaignAdmin-foundUsers");
    if (!output) return;

    output.querySelectorAll(":scope > div").forEach(addCoDmButton);
}

function watchCampaignAdmin() {
    const foundUsers = document.getElementById("campaignAdmin-foundUsers");

    if (!foundUsers) return;

    // Capture the campaign ID before app.js opens the administration panel.
    document.addEventListener("click", (event) => {
        const editButton = event.target.closest(".dmEditIcon");
        if (!editButton) return;

        const navButton = editButton.closest(".nav-btn");
        if (navButton?.dataset.id) {
            activeCampaignId = navButton.dataset.id;
        }
    }, true);

    const observer = new MutationObserver(() => {
        processFoundUsers();
    });

    observer.observe(foundUsers, {
        childList: true,
        subtree: true
    });

    processFoundUsers();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", watchCampaignAdmin, { once: true });
} else {
    watchCampaignAdmin();
}

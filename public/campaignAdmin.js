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

async function addCampaignUser(userId, isCoDm) {
    if (!activeCampaignId) {
        throw new Error("No campaign is currently selected for administration.");
    }

    const authUser = await getFirebaseUser();
    const token = await authUser.getIdToken();

    const response = await fetch(`${backendUrl}/campaignAdmin`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            action: "addUser",
            campaignId: activeCampaignId,
            userId,
            isCoDm
        })
    });

    if (response.status === 401) {
        firebaseUser = null;
        const refreshedUser = await getFirebaseUser();
        const refreshedToken = await refreshedUser.getIdToken(true);

        const retry = await fetch(`${backendUrl}/campaignAdmin`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${refreshedToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                action: "addUser",
                campaignId: activeCampaignId,
                userId,
                isCoDm
            })
        });

        if (!retry.ok) {
            throw new Error(`Backend request failed (${retry.status}).`);
        }

        return retry.json();
    }

    if (!response.ok) {
        throw new Error(`Backend request failed (${response.status}).`);
    }

    return response.json();
}

function getUserLabel(row) {
    const name = row.querySelector("span")?.textContent?.trim();
    return name || "That user";
}

function addCoDmButton(row) {
    if (row.querySelector(".campaignAdmin-addCoDm")) return;

    const normalAddButton = row.querySelector("button");
    if (!normalAddButton) return;

    const resultId = normalAddButton.dataset.userId;
    if (!resultId) return;

    const coDmButton = document.createElement("button");
    coDmButton.type = "button";
    coDmButton.className = "campaignAdmin-addCoDm";
    coDmButton.textContent = "Add as Co-DM";

    coDmButton.addEventListener("click", async () => {
        coDmButton.disabled = true;

        const status = document.getElementById("campaignAdmin-status");
        const userLabel = getUserLabel(row);

        try {
            const result = await addCampaignUser(resultId, true);

            if (result.alreadyAdded) {
                status.textContent = `${userLabel} already has access to this campaign.`;
            } else if (result.alreadyCoDm) {
                status.textContent = `${userLabel} is already a co-DM.`;
            } else {
                status.textContent = `${userLabel} was added as a co-DM.`;
            }
        } catch (error) {
            console.error("Failed to add campaign co-DM:", error);
            status.textContent = "Could not add that user as a co-DM.";
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
    const adminUI = document.getElementById("campaignAdminUI");
    const foundUsers = document.getElementById("campaignAdmin-foundUsers");

    if (!adminUI || !foundUsers) return;

    // Capture the campaign ID from the campaign's gear button before the
    // existing app.js handler opens the administration panel.
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

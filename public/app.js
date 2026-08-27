import { FirebaseUtils } from "./firebaseUtils.js";
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import { Editor } from 'https://esm.sh/@tiptap/core';
import StarterKit from 'https://esm.sh/@tiptap/starter-kit';
import { Markdown } from 'https://esm.sh/@tiptap/markdown';



//////////////////////////////////////////////////////////////////////
/////////////////////////GLOBAL VARS//////////////////////////////////
//////////////////////////////////////////////////////////////////////
let user = null;
let firebaseUser = null
let permissions = null;
let myFeatures = [];
let currentSelectedSidebar = null
const chatUI = document.getElementById("chatTools")
let ss_TOOLS = new Map()
let ss_CHATS = new Map()
let ss_CAMPAIGNS = new Map()
let activeChat = null;
let activeFeature = null;
let activeFeatureType = null;
let userManifest = null;
let guestManifest = null;



const chatArea = document.getElementById("sendBar")

const messageInput = new Editor({
    element: chatArea,
    extensions: [StarterKit, Markdown.configure({
        transformPastedText: true, // Converts copied markdown into visual styles on paste
    }),],
    editorProps: {
        attributes: { class: 'message-input-styles' },
        handleKeyDown: (view, event) => {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleChatMesage();
                return true;
            }
            return false
        }
    },
})

//////////////////////////////////////////////////////////////////////
/////////////////////////SITE UTILS///////////////////////////////////
//////////////////////////////////////////////////////////////////////
async function checkUserManifest() {
    // --- User Manifest Block ---
    const localUserManifestTimestamp = Number(localStorage.getItem("userManifestTimestamp")) || 0;
    const member_manifestTimestampData = await FirebaseUtils.getDocument("/manifest/userManifestTimestamp/");
    const member_manifestTimestamp = Number(member_manifestTimestampData?.timestamp) || 0;
    
    // Check local storage for existing data
    const cachedUserManifest = localStorage.getItem("userManifest");

    // Fetch if we don't have it in memory, don't have it in cache, OR the server is newer
    if (!userManifest || !cachedUserManifest || member_manifestTimestamp > localUserManifestTimestamp) {
        const rawData = await FirebaseUtils.getDocument("/manifest/userManifest");
        
        localStorage.setItem("userManifestTimestamp", String(member_manifestTimestamp));
        userManifest = rawData ? rawData.manifest : [];
        
        // Save the actual data to cache so it survives page reloads
        localStorage.setItem("userManifest", JSON.stringify(userManifest));
    } else if (!userManifest && cachedUserManifest) {
        // If memory is empty but cache is fresh, load from cache
        userManifest = JSON.parse(cachedUserManifest);
    }
    console.log("userManifest", userManifest);

    // --- Guest Manifest Block ---
    const localGuestManifestTimestamp = Number(localStorage.getItem("guestManifestTimestamp")) || 0;
    const guest_manifestTimestampData = await FirebaseUtils.getDocument("/manifest/guestManifestTimestamp/");
    const guest_manifestTimestamp = Number(guest_manifestTimestampData?.timestamp) || 0;

    const cachedGuestManifest = localStorage.getItem("guestManifest");

    if (!guestManifest || !cachedGuestManifest || guest_manifestTimestamp > localGuestManifestTimestamp) {
        const rawData = await FirebaseUtils.getDocument("/manifest/guestManifest");
        
        localStorage.setItem("guestManifestTimestamp", String(guest_manifestTimestamp));
        guestManifest = rawData ? rawData.manifest : [];
        
        // Save the actual data to cache
        localStorage.setItem("guestManifest", JSON.stringify(guestManifest));
    } else if (!guestManifest && cachedGuestManifest) {
        // Load from cache if it's up to date
        guestManifest = JSON.parse(cachedGuestManifest);
    }
    console.log("guestManifest", guestManifest);
}

async function checkUser() {
    try {
        const userCheck = await FirebaseUtils.getCurrentUserData();
        if (!userCheck) {
            console.log("No user signed in.");
            return;
        }

        user = userCheck.data;
        firebaseUser = userCheck.user;

        if (!firebaseUser) {
            console.log("No Firebase user.");
            return;
        }

        const tokens = await firebaseUser.getIdTokenResult(true);
        const cleanPerms = tokens?.claims?.permissions || {};
        permissions = Object.keys(cleanPerms).filter(key => cleanPerms[key]);

        console.log("User:", user);
        console.log("Permissions:", permissions);

        await checkUserManifest();
    } catch (error) {
        console.error("Error checking user:", error);
    }
}

async function getMyFeatures() {
    if (!user) {
        return;
    }

    myFeatures = [];

    const campaigns = Array.isArray(user.campaigns) ? user.campaigns : [];

    for (const campaign of campaigns) {
        if (!campaign || !campaign.id) {
            continue;
        }

        try {
            const campaignData = await FirebaseUtils.getDocument(`/features/${campaign.id}`);

            if (campaignData) {
                myFeatures.push({
                    ...campaignData,
                    id: campaign.id,
                    type: "campaign",
                    DM: campaign.DM === true
                });
            }
        } catch (error) {
            console.error(`Could not load campaign ${campaign.id}:`, error);
        }
    }

    return myFeatures;
}

function hasPermission(permission) {
    return Array.isArray(permissions) && permissions.includes(permission);
}

function escapeHTML(value) {
    const div = document.createElement("div");
    div.textContent = value ?? "";
    return div.innerHTML;
}

function formatDate(timestamp) {
    if (!timestamp) return "";
    try {
        const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleString();
    } catch {
        return "";
    }
}

//////////////////////////////////////////////////////////////////////
/////////////////////////SERVER UTILS/////////////////////////////////
//////////////////////////////////////////////////////////////////////

const backendUrl = "https://the-tavern-backend.onrender.com";
const serverRetryDelay = 3000;
const serverRequestTimeout = 10000;

let serverReady = false;
let serverWakeupPromise = null;

function showServerWakeup() {
    const popup = document.getElementById("serverWakeupPopup");
    if (popup) {
        popup.style.display = "flex";
    }
}

function hideServerWakeup() {
    const popup = document.getElementById("serverWakeupPopup");
    if (popup) {
        popup.style.display = "none";
    }
}

function fetchWithTimeout(url, options = {}, timeout = serverRequestTimeout) {
    return new Promise((resolve, reject) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        fetch(url, {
            ...options,
            signal: controller.signal
        })
            .then(response => {
                clearTimeout(timer);
                resolve(response);
            })
            .catch(error => {
                clearTimeout(timer);
                reject(error);
            });
    });
}

async function waitForServer() {
    if (serverReady) {
        return true;
    }

    if (serverWakeupPromise) {
        return serverWakeupPromise;
    }

    serverWakeupPromise = (async () => {
        showServerWakeup();

        while (!serverReady) {
            try {
                const healthResponse = await fetchWithTimeout(`${backendUrl}/health`, {
                    method: "GET"
                });

                if (healthResponse.ok) {
                    serverReady = true;
                    hideServerWakeup();
                    return true;
                }

                console.warn(`Server health check returned ${healthResponse.status}. Retrying...`);
            } catch (error) {
                console.warn("Server is not ready yet. Retrying...", error);
            }

            await new Promise(resolve => setTimeout(resolve, serverRetryDelay));
        }

        return true;
    })();

    try {
        return await serverWakeupPromise;
    } finally {
        serverWakeupPromise = null;
    }
}

async function fetchServer(endpoint, postData) {
    if (!endpoint) {
        throw new Error("No backend endpoint specified.");
    }

    const link = `${backendUrl}/${endpoint}`;

    const publicEndpoints = new Set(["health"]);

    let token = null;

    if (!publicEndpoints.has(endpoint)) {
        if (!firebaseUser) {
            try {
                const userCheck = await FirebaseUtils.getCurrentUserData();
                firebaseUser = userCheck?.user || null;
            } catch (error) {
                console.error("Could not get Firebase user:", error);
            }
        }

        if (!firebaseUser) {
            throw new Error("User is not signed in.");
        }

        token = await firebaseUser.getIdToken();
    }

    const headers = {};

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    if (postData !== undefined) {
        headers["Content-Type"] = "application/json";
    }

    const options = {
        method: postData !== undefined ? "POST" : "GET",
        headers,
        ...(postData !== undefined ? { body: JSON.stringify(postData) } : {})
    };

    let response;

    try {
        response = await fetchWithTimeout(link, options);
    } catch (error) {
        // A network/timeout failure may mean Render is waking up.
        // Check the public health endpoint before retrying the original request.
        await waitForServer();

        response = await fetchWithTimeout(link, options);
    }

    if (response.status === 401) {
        throw new Error(`Backend request denied (401): authentication failed.`);
    }

    if (response.status === 403) {
        throw new Error(`Backend request denied (403): insufficient permissions.`);
    }

    if (!response.ok) {
        throw new Error(`Backend request failed (${response.status}).`);
    }

    return await response.json();
}

//////////////////////////////////////////////////////////////////////
/////////////////////////INITIALIZATION///////////////////////////////
//////////////////////////////////////////////////////////////////////

document.addEventListener("DOMContentLoaded", async () => {
    await checkUser();
    await getMyFeatures();

    // Start checking the backend separately from authentication.
    // The health endpoint is public and should not cause an authentication loop.
    waitForServer().catch(error => {
        console.error("Server health check failed:", error);
    });
});

//////////////////////////////////////////////////////////////////////
/////////////////////////SIDEBAR//////////////////////////////////////
//////////////////////////////////////////////////////////////////////

function clearSidebarSelection() {
    document.querySelectorAll(".sidebar-selected").forEach(element => {
        element.classList.remove("sidebar-selected");
    });
}

function selectSidebarElement(element) {
    clearSidebarSelection();

    if (element) {
        element.classList.add("sidebar-selected");
        currentSelectedSidebar = element;
    }
}

function createSidebarButton(icon, name, callback, id = null) {
    const button = document.createElement("button");
    button.className = "sidebar-button";

    if (id) {
        button.id = id;
    }

    button.innerHTML = `
        <i class="${icon}"></i>
        <span>${escapeHTML(name)}</span>
    `;

    button.addEventListener("click", () => {
        selectSidebarElement(button);
        callback();
    });

    return button;
}

function renderSidebar() {
    const sidebar = document.getElementById("sidebar");
    if (!sidebar) {
        return;
    }

    sidebar.innerHTML = "";

    const chatButton = createSidebarButton(
        "ra-comments",
        "Tavern Talk",
        () => renderChat()
    );

    sidebar.appendChild(chatButton);

    if (Array.isArray(myFeatures)) {
        for (const feature of myFeatures) {
            if (!feature) continue;

            const button = createSidebarButton(
                feature.icon || "ra-dragon",
                feature.name || "Campaign",
                () => renderCampaign(feature),
                `campaign-${feature.id}`
            );

            sidebar.appendChild(button);
        }
    }

    if (hasPermission("officer")) {
        const officerButton = createSidebarButton(
            "ra-scroll-unfurled",
            "Officer's Desk",
            () => renderOfficerDesk()
        );

        sidebar.appendChild(officerButton);
    }
}

//////////////////////////////////////////////////////////////////////
/////////////////////////CHAT/////////////////////////////////////////
//////////////////////////////////////////////////////////////////////

async function loadChatMessages(chatId) {
    try {
        return await FirebaseUtils.getDocuments(`/chats/${chatId}/messages`);
    } catch (error) {
        console.error("Could not load chat messages:", error);
        return [];
    }
}

function clearChatArea() {
    const chatContainer = document.getElementById("chatMessages");

    if (chatContainer) {
        chatContainer.innerHTML = "";
    }
}

function renderMessage(message) {
    const chatContainer = document.getElementById("chatMessages");

    if (!chatContainer || !message) {
        return;
    }

    const messageElement = document.createElement("div");
    messageElement.className = "chat-message";

    const sender = message.name || message.displayName || "Unknown";
    const text = message.message || message.text || "";

    messageElement.innerHTML = `
        <div class="chat-message-header">
            <strong>${escapeHTML(sender)}</strong>
            <span>${escapeHTML(formatDate(message.timestamp))}</span>
        </div>
        <div class="chat-message-body">
            ${marked.parse(String(text))}
        </div>
    `;

    chatContainer.appendChild(messageElement);
}

async function renderChat(chatId = "tavernTalk") {
    activeChat = chatId;
    activeFeature = null;
    activeFeatureType = null;

    const title = document.getElementById("chatTitle");
    if (title) {
        title.textContent = "Tavern Talk";
    }

    clearChatArea();

    const messages = await loadChatMessages(chatId);

    for (const message of messages) {
        renderMessage(message);
    }

    const chatContainer = document.getElementById("chatMessages");

    if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
}

//////////////////////////////////////////////////////////////////////
/////////////////////////CAMPAIGN/////////////////////////////////////
//////////////////////////////////////////////////////////////////////

async function renderCampaign(feature) {
    if (!feature) {
        return;
    }

    activeFeature = feature;
    activeFeatureType = "campaign";
    activeChat = null;

    const title = document.getElementById("chatTitle");

    if (title) {
        title.textContent = feature.name || "Campaign";
    }

    clearChatArea();

    try {
        const messages = await FirebaseUtils.getDocuments(`/features/${feature.id}/messages`);

        for (const message of messages) {
            renderMessage(message);
        }

        const chatContainer = document.getElementById("chatMessages");

        if (chatContainer) {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
    } catch (error) {
        console.error("Could not load campaign messages:", error);
    }
}

//////////////////////////////////////////////////////////////////////
/////////////////////////MESSAGE HANDLING/////////////////////////////
//////////////////////////////////////////////////////////////////////

async function handleChatMesage() {
    const messageTxt = messageInput.getMarkdown().trim();

    if (!messageTxt) {
        return;
    }

    try {
        const cleared = await fetchServer("checkMessage", { message: messageTxt });

        if (cleared === false || cleared?.allowed === false) {
            console.warn("Message rejected by server.");
            return;
        }
    } catch (error) {
        console.error("Message check failed:", error);
        return;
    }

    const timestamp = new Date();

    const messageData = {
        message: messageTxt,
        uid: firebaseUser?.uid || "",
        name: user?.name || user?.displayName || "Unknown",
        timestamp
    };

    try {
        if (activeFeatureType === "campaign" && activeFeature?.id) {
            await FirebaseUtils.addDocument(
                `/features/${activeFeature.id}/messages`,
                messageData
            );
        } else {
            await FirebaseUtils.addDocument(
                `/chats/${activeChat || "tavernTalk"}/messages`,
                messageData
            );
        }

        messageInput.commands?.clearContent?.();
        messageInput.commands?.setContent?.("");
        messageInput.commands?.focus?.();

        if (activeFeatureType === "campaign" && activeFeature) {
            await renderCampaign(activeFeature);
        } else {
            await renderChat(activeChat || "tavernTalk");
        }
    } catch (error) {
        console.error("Could not send message:", error);
    }
}

//////////////////////////////////////////////////////////////////////
/////////////////////////OFFICER DESK/////////////////////////////////
//////////////////////////////////////////////////////////////////////

function renderOfficerDesk() {
    activeChat = null;
    activeFeature = null;
    activeFeatureType = null;

    const title = document.getElementById("chatTitle");

    if (title) {
        title.textContent = "Officer's Desk";
    }

    clearChatArea();

    const chatContainer = document.getElementById("chatMessages");

    if (!chatContainer) {
        return;
    }

    chatContainer.innerHTML = `
        <div class="officer-desk">
            <h2>Officer's Desk</h2>

            <div class="officer-user-search">
                <label for="officerUserSearch">Search users</label>
                <input id="officerUserSearch" type="text" placeholder="Search users...">
                <button id="searchUsersButton">Search</button>
            </div>

            <div id="officerUserResults"></div>
            <div id="officerUserPermissions"></div>
        </div>
    `;

    const searchButton = document.getElementById("searchUsersButton");
    const searchInput = document.getElementById("officerUserSearch");

    if (searchButton) {
        searchButton.addEventListener("click", async () => {
            await searchOfficerUsers(searchInput?.value || "");
        });
    }

    if (searchInput) {
        searchInput.addEventListener("keydown", async event => {
            if (event.key === "Enter") {
                event.preventDefault();
                await searchOfficerUsers(searchInput.value);
            }
        });
    }
}

async function searchOfficerUsers(searchTerm) {
    const resultsContainer = document.getElementById("officerUserResults");

    if (!resultsContainer) {
        return;
    }

    resultsContainer.textContent = "Requesting not allowed users...";

    try {
        const users = await fetchServer("getNotAllowedUsers", {});

        const normalized = Array.isArray(users)
            ? users
            : Array.isArray(users?.users)
                ? users.users
                : [];

        const search = searchTerm.trim().toLowerCase();

        const filtered = normalized.filter(candidate => {
            if (!search) {
                return true;
            }

            return [
                candidate?.name,
                candidate?.displayName,
                candidate?.["Real Name"],
                candidate?.realName,
                candidate?.realFirstName,
                candidate?.realLastName,
                candidate?.id
            ]
                .filter(Boolean)
                .some(value => String(value).toLowerCase().includes(search));
        });

        resultsContainer.innerHTML = "";

        if (filtered.length === 0) {
            resultsContainer.textContent = "No users found.";
            return;
        }

        for (const candidate of filtered) {
            const button = document.createElement("button");
            button.className = "officer-user-result";

            const displayName =
                candidate?.name ||
                candidate?.displayName ||
                candidate?.["Real Name"] ||
                candidate?.realName ||
                candidate?.id ||
                "Unknown user";

            button.textContent = displayName;

            button.addEventListener("click", async () => {
                await loadOfficerUser(candidate.id);
            });

            resultsContainer.appendChild(button);
        }
    } catch (error) {
        console.error("User search error:", error);
        resultsContainer.textContent = `Unable to retrieve users: ${error.message}`;
    }
}

async function loadOfficerUser(uid) {
    const permissionsContainer = document.getElementById("officerUserPermissions");

    if (!permissionsContainer || !uid) {
        return;
    }

    permissionsContainer.textContent = "Loading user permissions...";

    try {
        const response = await fetchServer("getUserClaims", { uid });

        const claims = response?.claims || response || {};
        const currentPermissions = claims.permissions || {};

        permissionsContainer.innerHTML = `
            <div>
                <h3>User permissions</h3>
                <div id="permissionCheckboxes"></div>
                <button id="savePermissionsButton">Save Permissions</button>
            </div>
        `;

        const checkboxContainer = document.getElementById("permissionCheckboxes");

        const knownPermissions = [
            "officer",
            "admin"
        ];

        for (const permission of knownPermissions) {
            const wrapper = document.createElement("label");
            wrapper.style.display = "block";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.dataset.permission = permission;
            checkbox.checked = currentPermissions?.[permission] === true;

            wrapper.appendChild(checkbox);
            wrapper.appendChild(document.createTextNode(` ${permission}`));

            checkboxContainer.appendChild(wrapper);
        }

        document.getElementById("savePermissionsButton")?.addEventListener("click", async () => {
            const updatedPermissions = {};

            checkboxContainer.querySelectorAll("input[type='checkbox']").forEach(checkbox => {
                updatedPermissions[checkbox.dataset.permission] = checkbox.checked;
            });

            try {
                await fetchServer("setPermissions", {
                    uid,
                    permissions: updatedPermissions
                });

                permissionsContainer.insertAdjacentHTML(
                    "beforeend",
                    "<p>Permissions updated.</p>"
                );
            } catch (error) {
                console.error("Permission update error:", error);

                permissionsContainer.insertAdjacentHTML(
                    "beforeend",
                    `<p>Permission update failed: ${escapeHTML(error.message)}</p>`
                );
            }
        });
    } catch (error) {
        console.error("Could not load user claims:", error);
        permissionsContainer.textContent =
            `Could not load permissions: ${error.message}`;
    }
}

//////////////////////////////////////////////////////////////////////
/////////////////////////EVENT HANDLERS///////////////////////////////
//////////////////////////////////////////////////////////////////////

const logoutButton = document.getElementById("logoutButton");

if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
        try {
            await FirebaseUtils.logout();
            window.location.reload();
        } catch (error) {
            console.error("Logout failed:", error);
        }
    });
}

const sendButton = document.getElementById("sendButton");

if (sendButton) {
    sendButton.addEventListener("click", async () => {
        await handleChatMesage();
    });
}

//////////////////////////////////////////////////////////////////////
/////////////////////////SETTINGS/////////////////////////////////////
//////////////////////////////////////////////////////////////////////

function openSettings() {
    const settingsPanel = document.getElementById("settingsPanel");

    if (settingsPanel) {
        settingsPanel.style.display = "flex";
    }
}

function closeSettings() {
    const settingsPanel = document.getElementById("settingsPanel");

    if (settingsPanel) {
        settingsPanel.style.display = "none";
    }
}

const settingsButton = document.getElementById("settingsButton");

if (settingsButton) {
    settingsButton.addEventListener("click", openSettings);
}

const settingsCloseButton = document.getElementById("settingsCloseButton");

if (settingsCloseButton) {
    settingsCloseButton.addEventListener("click", closeSettings);
}

const settingsLogoutButton = document.getElementById("settingsLogoutButton");

if (settingsLogoutButton) {
    settingsLogoutButton.addEventListener("click", async () => {
        try {
            await FirebaseUtils.logout();
            window.location.reload();
        } catch (error) {
            console.error("Logout failed:", error);
        }
    });
}

//////////////////////////////////////////////////////////////////////
/////////////////////////USERNAME/////////////////////////////////////
//////////////////////////////////////////////////////////////////////

const usernameForm = document.getElementById("usernameForm");

if (usernameForm) {
    usernameForm.addEventListener("submit", async event => {
        event.preventDefault();

        const usernameInput = document.getElementById("usernameInput");

        if (!usernameInput || !firebaseUser) {
            return;
        }

        const newUsername = usernameInput.value.trim();

        if (!newUsername) {
            return;
        }

        try {
            await FirebaseUtils.setDocument(`/users/${firebaseUser.uid}`, {
                name: newUsername
            });

            if (user) {
                user.name = newUsername;
            }

            closeSettings();
        } catch (error) {
            console.error("Could not change username:", error);
        }
    });
}

//////////////////////////////////////////////////////////////////////
/////////////////////////STARTUP//////////////////////////////////////
//////////////////////////////////////////////////////////////////////

(async () => {
    try {
        await checkUser();
        await getMyFeatures();
        renderSidebar();

        if (!activeChat && !activeFeature) {
            await renderChat();
        }
    } catch (error) {
        console.error("Tavern startup error:", error);
    }
})();
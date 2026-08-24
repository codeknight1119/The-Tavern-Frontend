import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js';
import {
    getFirestore, getDoc, doc, setDoc as firestoreSetDoc, updateDoc,
    getDocs, collection, limit, query, addDoc, orderBy, where,
    deleteDoc, onSnapshot
} from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js';
import {
    getAuth, GoogleAuthProvider, signInWithPopup, signOut,
    getAdditionalUserInfo, createUserWithEmailAndPassword,
    signInWithEmailAndPassword
} from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js';
import { initializeAnalytics, logEvent } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-analytics.js';

export class Firebase {
    constructor(config) {
        this.app = initializeApp(config);
        this.db = getFirestore(this.app);
        this.auth = getAuth(this.app);
        this.analytics = initializeAnalytics(this.app);
        globalThis.__tavernFirebase = this;
        this.__activeCampaignId = null;
        this.__campaignIds = new Set();

        if (window.location.pathname.endsWith("/chat.html")) {
            this.initializeSettingsUI();
            this.initializeCampaignRouting();
        }
    }

    async loginGoogle() {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });

        try {
            const result = await signInWithPopup(this.auth, provider);
            return {
                user: result.user,
                isNew: getAdditionalUserInfo(result)?.isNewUser ?? false,
            };
        } catch (error) {
            console.error('Google login failed:', error);
            return null;
        }
    }

    getTavernAuthEmail(username) {
        return `${username.trim().toLowerCase()}@accounts.thetavern.local`;
    }

    async createTavernAccount(username, password) {
        try {
            const email = this.getTavernAuthEmail(username);
            const result = await createUserWithEmailAndPassword(this.auth, email, password);
            return { user: result.user, isNew: true };
        } catch (error) {
            console.error('Tavern account creation failed:', error);
            throw error;
        }
    }

    async loginTavernAccount(username, password) {
        try {
            const email = this.getTavernAuthEmail(username);
            const result = await signInWithEmailAndPassword(this.auth, email, password);
            return { user: result.user, isNew: false };
        } catch (error) {
            console.error('Tavern account login failed:', error);
            throw error;
        }
    }

    resolveCampaignPath(path) {
        if (!this.__activeCampaignId || typeof path !== 'string') return path;
        const match = path.match(/^\/?features\/([^/]+)\/messages(?:\/.*)?$/);
        if (!match) return path;
        return path.replace(/^\/?features\/[^/]+\//, `campaigns/${this.__activeCampaignId}/`);
    }

    async setDocument(path, data) {
        try {
            await firestoreSetDoc(doc(this.db, path), data);
        } catch (e) {
            console.error(`set doc failed at ${path} ` + JSON.stringify(e));
            throw e;
        }
    }

    async addDocument(path, data) {
        try {
            const resolvedPath = this.resolveCampaignPath(path);
            const docAdded = await addDoc(collection(this.db, resolvedPath), data);
            return docAdded;
        } catch (e) {
            console.error(`add doc failed at ${path} `, e);
            throw e;
        }
    }

    async updateDocument(path, data) {
        try {
            await updateDoc(doc(this.db, path), data);
        } catch (e) {
            console.error(`update doc failed at ${path}` + JSON.stringify(e));
            throw e;
        }
    }

    async getDocument(path) {
        try {
            const docRef = doc(this.db, path);
            const docSnap = await getDoc(docRef);
            return docSnap.exists() ? docSnap.data() : undefined;
        } catch (e) {
            console.error(`get doc failed at link ${path} | Error: ` + JSON.stringify(e));
            throw e;
        }
    }

    async getDocuments(path, l, docParam, arrayFilter) {
        try {
            const resolvedPath = this.resolveCampaignPath(path);
            let constraints = [];

            if (arrayFilter && arrayFilter.field && arrayFilter.value !== undefined) {
                if (Array.isArray(arrayFilter.value)) {
                    constraints.push(where(arrayFilter.field, 'array-contains-any', arrayFilter.value));
                } else {
                    constraints.push(where(arrayFilter.field, '==', arrayFilter.value));
                }
            }

            if (docParam && docParam.field) {
                constraints.push(orderBy(docParam.field, docParam.direction || 'asc'));
            }

            if (typeof l === 'number' && l > 0) {
                constraints.push(limit(l));
            }

            const querySnapshot = await getDocs(query(collection(this.db, resolvedPath), ...constraints));

            return querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (e) {
            console.log(e);
            throw e;
        }
    }

    async getDocumentFieldIncludes(path, field, text) {
        try {
            const q = query(
                collection(this.db, path),
                where(field, '>=', text),
                where(field, '<=', text + '\uf8ff')
            );
            const docSnap = await getDocs(q);
            return docSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (e) {
            console.log(e);
            throw e;
        }
    }

    listenForNewDocInCollection(path, callback) {
        const resolvedPath = this.resolveCampaignPath(path);
        const docQuery = query(collection(this.db, resolvedPath), where('timestamp', '>', Date.now()));
        return onSnapshot(docQuery, (snap) => {
            snap.docChanges().forEach(change => {
                if (change.type === 'added') callback(change.doc.data());
            });
        });
    }

    async deleteDocument(path) {
        try {
            return await deleteDoc(doc(this.db, path));
        } catch (e) {
            console.error(e);
            throw e;
        }
    }

    isSignedIn() {
        return new Promise((resolve, reject) => {
            try {
                const unsubscribe = this.auth.onAuthStateChanged(
                    (user) => {
                        unsubscribe();
                        if (user) {
                            resolve({
                                user,
                                isNew: user.metadata.creationTime === user.metadata.lastSignInTime
                            });
                        } else {
                            resolve(null);
                        }
                    },
                    (error) => reject(error)
                );
            } catch (e) {
                console.error('error + ' + JSON.stringify(e));
                reject(e);
            }
        });
    }

    async logout() {
        try {
            await signOut(this.auth);
        } catch (e) {
            console.error('logout error: ' + JSON.stringify(e));
            throw e;
        }
    }

    initializeCampaignRouting() {
        if (globalThis.__tavernCampaignRoutingInitialized) return;
        globalThis.__tavernCampaignRoutingInitialized = true;

        document.addEventListener("click", async (event) => {
            const navButton = event.target.closest?.(".nav-btn[data-id]");
            if (!navButton) return;

            const id = navButton.dataset.id;
            const signedIn = await this.isSignedIn();
            if (!signedIn) {
                this.__activeCampaignId = null;
                return;
            }

            try {
                const currentUser = await this.getDocument(`/users/${signedIn.user.uid}`);
                const campaigns = Array.isArray(currentUser?.campaigns) ? currentUser.campaigns : [];
                this.__campaignIds = new Set(campaigns.map(entry => entry?.id).filter(Boolean));
                this.__activeCampaignId = this.__campaignIds.has(id) ? id : null;
            } catch (error) {
                console.error("Could not determine campaign membership:", error);
                this.__activeCampaignId = null;
            }
        }, true);
    }

    initializeSettingsUI() {
        if (document.getElementById("settings-btn")) return;

        const style = document.createElement("style");
        style.textContent = `
            #settings-btn {
                position: fixed;
                top: 15px;
                right: 15px;
                z-index: 1001;
                background: var(--base-clr);
                color: var(--text-clr);
                border: 1px solid var(--line-clr);
                border-radius: .5em;
                padding: .65em .8em;
                font-size: 1.25rem;
                cursor: pointer;
            }
            #settings-btn:hover { background: var(--hover-clr); }
            #settings-panel {
                position: fixed;
                top: 65px;
                right: 15px;
                z-index: 1000;
                width: min(350px, calc(100vw - 30px));
                background: var(--base-clr);
                color: var(--text-clr);
                border: 2px solid var(--line-clr);
                border-radius: 8px;
                padding: 20px;
                box-shadow: 0 5px 20px rgba(0,0,0,.35);
            }
            #settings-panel[hidden] { display: none; }
            #settings-panel h2 { margin: 0 0 20px; }
            #settings-close {
                position: absolute;
                top: 8px;
                right: 10px;
                border: none;
                background: transparent;
                color: var(--text-clr);
                font-size: 1.5rem;
                cursor: pointer;
            }
            .settings-section {
                display: flex;
                flex-direction: column;
                gap: 8px;
                margin-bottom: 20px;
            }
            #settings-name { padding: 8px; }
            #settings-panel button:not(#settings-close) {
                cursor: pointer;
                padding: 8px 12px;
            }
            #settings-logout { margin-top: 5px; }
            .settings-status { min-height: 1.2em; }
            .settings-status.error { color: #ffb3b3; }
        `;
        document.head.appendChild(style);

        const button = document.createElement("button");
        button.id = "settings-btn";
        button.title = "Settings";
        button.ariaLabel = "Open settings";
        button.innerHTML = '<i class="ra ra-gears"></i>';

        const panel = document.createElement("div");
        panel.id = "settings-panel";
        panel.hidden = true;
        panel.innerHTML = `
            <button id="settings-close" aria-label="Close settings">&times;</button>
            <h2>Settings</h2>
            <div class="settings-section">
                <label for="settings-name">Username</label>
                <input id="settings-name" type="text" autocomplete="off" maxlength="30">
                <button id="settings-save-name">Save Username</button>
                <p id="settings-name-status" class="settings-status"></p>
            </div>
            <div class="settings-section">
                <button id="settings-logout">Log Out</button>
            </div>
        `;

        document.body.append(button, panel);

        const nameInput = panel.querySelector("#settings-name");
        const status = panel.querySelector("#settings-name-status");
        const saveButton = panel.querySelector("#settings-save-name");

        const setStatus = (message, error = false) => {
            status.textContent = message;
            status.classList.toggle("error", error);
        };

        button.addEventListener("click", async () => {
            panel.hidden = !panel.hidden;
            if (panel.hidden) return;

            setStatus("");
            try {
                const signedIn = await this.isSignedIn();
                if (!signedIn) {
                    window.location.href = "/signIn";
                    return;
                }
                const user = await this.getDocument(`/users/${signedIn.user.uid}`);
                nameInput.value = user?.displayName || user?.name || "";
            } catch (error) {
                console.error("Could not load settings:", error);
                setStatus("Could not load your settings.", true);
            }
        });

        panel.querySelector("#settings-close").addEventListener("click", () => {
            panel.hidden = true;
        });

        saveButton.addEventListener("click", async () => {
            const name = nameInput.value.trim();
            if (!/^[a-zA-Z0-9._-]{3,30}$/.test(name)) {
                setStatus("Username must be 3-30 characters and use only letters, numbers, periods, underscores, or hyphens.", true);
                return;
            }

            saveButton.disabled = true;
            setStatus("Saving...");

            try {
                const signedIn = await this.isSignedIn();
                if (!signedIn) {
                    window.location.href = "/signIn";
                    return;
                }

                await this.updateDocument(`/users/${signedIn.user.uid}`, {
                    displayName: name,
                    name: name
                });

                try {
                    await this.setDocument("/manifest/userManifestTimestamp", { timestamp: Date.now() });
                } catch (error) {
                    console.warn("Could not update user manifest timestamp:", error);
                }

                setStatus("Username updated.");
            } catch (error) {
                console.error("Failed to update username:", error);
                setStatus("Could not update your username. Please try again.", true);
            } finally {
                saveButton.disabled = false;
            }
        });

        panel.querySelector("#settings-logout").addEventListener("click", async () => {
            try {
                await this.logout();
                window.location.href = "/signIn";
            } catch (error) {
                setStatus("Could not log out. Please try again.", true);
            }
        });
    }

    ALog(eventName, data) {
        try {
            logEvent(this.analytics, eventName, data);
        } catch (e) {
            console.error('Analytics logging failed:', e);
        }
    }
}

globalThis.renderCampaign = async function(campaignId) {
    const firebase = globalThis.__tavernFirebase;
    if (!firebase) return;
    firebase.__activeCampaignId = campaignId;

    const signedIn = await firebase.isSignedIn();
    if (!signedIn) return;

    const currentUser = await firebase.getDocument(`/users/${signedIn.user.uid}`);
    const membership = Array.isArray(currentUser?.campaigns)
        ? currentUser.campaigns.find(entry => entry?.id === campaignId)
        : null;
    const isDM = membership?.DM === true;
    const campaign = await firebase.getDocument(`/campaigns/${campaignId}`);
    const campaignUI = document.getElementById("campaignUI");
    if (!campaign || !campaignUI) return;

    let header = campaignUI.querySelector("#campaign-header");
    if (!header) {
        header = document.createElement("section");
        header.id = "campaign-header";
        header.style.cssText = "display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px;";
        campaignUI.prepend(header);
    }

    let iconDisplay = header.querySelector("#campaign-icon-display");
    if (!iconDisplay) {
        iconDisplay = document.createElement("i");
        iconDisplay.id = "campaign-icon-display";
        header.appendChild(iconDisplay);
    }

    let nameDisplay = header.querySelector("#campaign-name-display");
    if (!nameDisplay) {
        nameDisplay = document.createElement("h2");
        nameDisplay.id = "campaign-name-display";
        nameDisplay.className = "cinzel-title";
        nameDisplay.style.margin = "0";
        header.appendChild(nameDisplay);
    }

    nameDisplay.textContent = campaign.name || "Unnamed Campaign";
    iconDisplay.className = `ra ra-3x ${String(campaign.icon || "").trim() || "ra-scroll-unfurled"}`;

    let controls = campaignUI.querySelector("#campaign-dm-controls");
    if (!controls) {
        controls = document.createElement("section");
        controls.id = "campaign-dm-controls";
        controls.style.cssText = "border:1px solid var(--line-clr);border-radius:8px;padding:14px;margin-bottom:18px;";
        controls.innerHTML = `<h3>DM Controls</h3><div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px;"><label for="campaign-name-input">Campaign name:</label><input id="campaign-name-input" type="text" maxlength="100"><button id="campaign-save-name" type="button">Rename Campaign</button><span id="campaign-name-status" aria-live="polite"></span></div><div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px;"><label for="campaign-icon-input">RPG Awesome icon:</label><input id="campaign-icon-input" type="text" maxlength="60" placeholder="ra-dragon"><button id="campaign-save-icon" type="button">Save Icon</button><a href="https://nagoshiashumari.github.io/Rpg-Awesome/" target="_blank" rel="noopener noreferrer">Browse RPG Awesome icons</a><span id="campaign-icon-status" aria-live="polite"></span></div><div><h4>Add People</h4><div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;"><input id="campaign-player-search" type="text" maxlength="100" placeholder="Search by name or username..."><button id="campaign-player-search-btn" type="button">Search</button></div><div id="campaign-player-search-results" style="margin-top:10px;"></div></div>`;
        campaignUI.insertBefore(controls, campaignUI.querySelector("#campaign-left"));
    }
    controls.hidden = !isDM;

    let chat = campaignUI.querySelector("#campaign-chat");
    if (!chat) {
        chat = document.createElement("div");
        chat.id = "campaign-chat";
        chat.style.marginBottom = "18px";
        campaignUI.insertBefore(chat, campaignUI.querySelector("#campaign-left"));
    }

    const chatTools = document.getElementById("chatTools");
    if (chatTools) chatTools.hidden = false;
    chat.replaceChildren();

    const messages = await firebase.getDocuments(`/campaigns/${campaignId}/messages`, 50);
    if (!messages.length) {
        chat.innerHTML = "<h3>No Messages</h3>";
    } else {
        messages.forEach(data => {
            const isMine = data.uid === signedIn.user.uid ? "mine" : "notMine";
            const content = globalThis.marked ? globalThis.marked.parse(data.content || "") : String(data.content || "");
            chat.insertAdjacentHTML("beforeend", `<div class="message ${isMine}"><strong><p>${data.username || data.name || "Unknown"}:</p></strong><div>${content}</div></div>`);
        });
    }

    if (!isDM) return;

    const nameInput = controls.querySelector("#campaign-name-input");
    const iconInput = controls.querySelector("#campaign-icon-input");
    const nameStatus = controls.querySelector("#campaign-name-status");
    const iconStatus = controls.querySelector("#campaign-icon-status");
    const playerSearch = controls.querySelector("#campaign-player-search");
    const playerSearchButton = controls.querySelector("#campaign-player-search-btn");
    const playerResults = controls.querySelector("#campaign-player-search-results");
    nameInput.value = campaign.name || "";
    iconInput.value = campaign.icon || "";
    nameStatus.textContent = "";
    iconStatus.textContent = "";
    playerResults.replaceChildren();

    const status = (element, message, error = false) => {
        element.textContent = message;
        element.style.color = error ? "#ffb3b3" : "";
    };

    controls.querySelector("#campaign-save-name").onclick = async () => {
        const name = nameInput.value.trim();
        if (!name) return status(nameStatus, "Campaign name cannot be empty.", true);
        try {
            await firebase.updateDocument(`/campaigns/${campaignId}`, { name });
            nameDisplay.textContent = name;
            document.querySelectorAll(`.nav-btn[data-id="${CSS.escape(campaignId)}"] .sidebarText`).forEach(el => el.textContent = name);
            status(nameStatus, "Campaign renamed.");
        } catch (error) {
            console.error(error);
            status(nameStatus, "Could not rename the campaign.", true);
        }
    };

    controls.querySelector("#campaign-save-icon").onclick = async () => {
        const icon = iconInput.value.trim();
        try {
            await firebase.updateDocument(`/campaigns/${campaignId}`, { icon });
            iconDisplay.className = `ra ra-3x ${icon || "ra-scroll-unfurled"}`;
            status(iconStatus, "Icon updated.");
        } catch (error) {
            console.error(error);
            status(iconStatus, "Could not update the campaign icon.", true);
        }
    };

    const searchPlayers = async () => {
        const term = playerSearch.value.trim().toLowerCase();
        playerResults.replaceChildren();
        if (!term) return;
        try {
            const rawManifest = await firebase.getDocument("/manifest/userManifest");
            const manifest = Array.isArray(rawManifest?.manifest) ? rawManifest.manifest : [];
            const matches = manifest.filter(person => person?.id && person.id !== signedIn.user.uid && (String(person.name || "").toLowerCase().includes(term) || String(person["Real Name"] || "").toLowerCase().includes(term)));
            if (!matches.length) {
                playerResults.textContent = "No users found.";
                return;
            }
            for (const person of matches) {
                const row = document.createElement("div");
                row.style.cssText = "display:flex;gap:8px;align-items:center;margin-bottom:6px;flex-wrap:wrap;";
                const label = document.createElement("span");
                label.textContent = `${person["Real Name"] || "Unknown"}${person.name ? ` (${person.name})` : ""}`;
                const add = document.createElement("button");
                add.type = "button";
                add.textContent = "Add to Campaign";
                add.onclick = async () => {
                    add.disabled = true;
                    try {
                        const target = await firebase.getDocument(`/users/${person.id}`);
                        const campaigns = Array.isArray(target?.campaigns) ? [...target.campaigns] : [];
                        if (campaigns.some(entry => entry?.id === campaignId)) {
                            add.textContent = "Already Added";
                            return;
                        }
                        campaigns.push({ id: campaignId, DM: false });
                        await firebase.updateDocument(`/users/${person.id}`, { campaigns });
                        add.textContent = "Added";
                        status(nameStatus, `${person.name || "User"} was added to the campaign.`);
                    } catch (error) {
                        console.error(error);
                        add.disabled = false;
                        status(nameStatus, "Could not add that player.", true);
                    }
                };
                row.append(label, add);
                playerResults.appendChild(row);
            }
        } catch (error) {
            console.error(error);
            playerResults.textContent = "Could not search for users.";
        }
    };

    playerSearchButton.onclick = searchPlayers;
    playerSearch.onkeydown = event => {
        if (event.key === "Enter") {
            event.preventDefault();
            searchPlayers();
        }
    };
};

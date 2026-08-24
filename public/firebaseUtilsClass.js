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
        if (window.location.pathname.endsWith("/chat.html")) this.initializeSettingsUI();
    }

    async loginGoogle() {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        try {
            const result = await signInWithPopup(this.auth, provider);
            return { user: result.user, isNew: getAdditionalUserInfo(result)?.isNewUser ?? false };
        } catch (error) { console.error('Google login failed:', error); return null; }
    }

    getTavernAuthEmail(username) { return `${username.trim().toLowerCase()}@accounts.thetavern.local`; }

    async createTavernAccount(username, password) {
        try {
            const email = this.getTavernAuthEmail(username);
            const result = await createUserWithEmailAndPassword(this.auth, email, password);
            return { user: result.user, isNew: true };
        } catch (error) { console.error('Tavern account creation failed:', error); throw error; }
    }

    async loginTavernAccount(username, password) {
        try {
            const email = this.getTavernAuthEmail(username);
            const result = await signInWithEmailAndPassword(this.auth, email, password);
            return { user: result.user, isNew: false };
        } catch (error) { console.error('Tavern account login failed:', error); throw error; }
    }

    async setDocument(path, data) { try { await firestoreSetDoc(doc(this.db, path), data); } catch (e) { console.error(`set doc failed at ${path} ` + JSON.stringify(e)); throw e; } }
    async addDocument(path, data) { try { return await addDoc(collection(this.db, path), data); } catch (e) { console.error(`add doc failed at ${path} `, e); throw e; } }
    async updateDocument(path, data) { try { await updateDoc(doc(this.db, path), data); } catch (e) { console.error(`update doc failed at ${path}` + JSON.stringify(e)); throw e; } }
    async getDocument(path) { try { const docRef = doc(this.db, path); const docSnap = await getDoc(docRef); return docSnap.exists() ? docSnap.data() : undefined; } catch (e) { console.error(`get doc failed at link ${path} | Error: ` + JSON.stringify(e)); throw e; } }
    async getDocuments(path, l, docParam, arrayFilter) {
        try {
            let constraints = [];
            if (arrayFilter && arrayFilter.field && arrayFilter.value !== undefined) {
                if (Array.isArray(arrayFilter.value)) constraints.push(where(arrayFilter.field, 'array-contains-any', arrayFilter.value));
                else constraints.push(where(arrayFilter.field, '==', arrayFilter.value));
            }
            if (docParam && docParam.field) constraints.push(orderBy(docParam.field, docParam.direction || 'asc'));
            if (typeof l === 'number' && l > 0) constraints.push(limit(l));
            const querySnapshot = await getDocs(query(collection(this.db, path), ...constraints));
            return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (e) { console.log(e); throw e; }
    }
    async getDocumentFieldIncludes(path, field, text) {
        try {
            const q = query(collection(this.db, path), where(field, '>=', text), where(field, '<=', text + '\uf8ff'));
            const docSnap = await getDocs(q);
            return docSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (e) { console.log(e); throw e; }
    }
    listenForNewDocInCollection(path, callback) { const docQuery = query(collection(this.db, path), where('timestamp', '>', Date.now())); return onSnapshot(docQuery, (snap) => { snap.docChanges().forEach(change => { if (change.type === 'added') callback(change.doc.data()); }); }); }
    async deleteDocument(path) { try { return await deleteDoc(doc(this.db, path)); } catch (e) { console.error(e); throw e; } }
    isSignedIn() { return new Promise((resolve, reject) => { try { const unsubscribe = this.auth.onAuthStateChanged((user) => { unsubscribe(); if (user) resolve({ user, isNew: user.metadata.creationTime === user.metadata.lastSignInTime }); else resolve(null); }, (error) => reject(error)); } catch (e) { console.error('error + ' + JSON.stringify(e)); reject(e); } }); }
    async logout() { try { await signOut(this.auth); } catch (e) { console.error('logout error: ' + JSON.stringify(e)); throw e; } }

    initializeSettingsUI() {
        if (document.getElementById("settings-btn")) return;
        const style = document.createElement("style");
        style.textContent = `#settings-btn { position: fixed; top: 15px; right: 15px; z-index: 1001; background: var(--base-clr); color: var(--text-clr); border: 1px solid var(--line-clr); border-radius: .5em; padding: .65em .8em; font-size: 1.25rem; cursor: pointer; } #settings-btn:hover { background: var(--hover-clr); } #settings-panel { position: fixed; top: 65px; right: 15px; z-index: 1000; width: min(350px, calc(100vw - 30px)); background: var(--base-clr); color: var(--text-clr); border: 2px solid var(--line-clr); border-radius: 8px; padding: 20px; box-shadow: 0 5px 20px rgba(0,0,0,.35); } #settings-panel[hidden] { display: none; } #settings-panel h2 { margin: 0 0 20px; } #settings-close { position: absolute; top: 8px; right: 10px; border: none; background: transparent; color: var(--text-clr); font-size: 1.5rem; cursor: pointer; } .settings-section { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; } #settings-name { padding: 8px; } #settings-panel button:not(#settings-close) { cursor: pointer; padding: 8px 12px; } #settings-logout { margin-top: 5px; } .settings-status { min-height: 1.2em; } .settings-status.error { color: #ffb3b3; }`;
        document.head.appendChild(style);
        const button = document.createElement("button"); button.id = "settings-btn"; button.title = "Settings"; button.ariaLabel = "Open settings"; button.innerHTML = '<i class="ra ra-gears"></i>';
        const panel = document.createElement("div"); panel.id = "settings-panel"; panel.hidden = true; panel.innerHTML = `<button id="settings-close" aria-label="Close settings">&times;</button><h2>Settings</h2><div class="settings-section"><label for="settings-name">Username</label><input id="settings-name" type="text" autocomplete="off" maxlength="30"><button id="settings-save-name">Save Username</button><p id="settings-name-status" class="settings-status"></p></div><div class="settings-section"><button id="settings-logout">Log Out</button></div>`;
        document.body.append(button, panel);
        const nameInput = panel.querySelector("#settings-name"); const status = panel.querySelector("#settings-name-status"); const saveButton = panel.querySelector("#settings-save-name");
        const setStatus = (message, error = false) => { status.textContent = message; status.classList.toggle("error", error); };
        button.addEventListener("click", async () => { panel.hidden = !panel.hidden; if (panel.hidden) return; setStatus(""); try { const signedIn = await this.isSignedIn(); if (!signedIn) { window.location.href = "/signIn"; return; } const user = await this.getDocument(`/users/${signedIn.user.uid}`); nameInput.value = user?.displayName || user?.name || ""; } catch (error) { console.error("Could not load settings:", error); setStatus("Could not load your settings.", true); } });
        panel.querySelector("#settings-close").addEventListener("click", () => { panel.hidden = true; });
        saveButton.addEventListener("click", async () => { const name = nameInput.value.trim(); if (!/^[a-zA-Z0-9._-]{3,30}$/.test(name)) { setStatus("Username must be 3-30 characters and use only letters, numbers, periods, underscores, or hyphens.", true); return; } saveButton.disabled = true; setStatus("Saving..."); try { const signedIn = await this.isSignedIn(); if (!signedIn) { window.location.href = "/signIn"; return; } await this.updateDocument(`/users/${signedIn.user.uid}`, { displayName: name, name: name }); try { await this.setDocument("/manifest/userManifestTimestamp", { timestamp: Date.now() }); } catch (error) { console.warn("Could not update user manifest timestamp:", error); } setStatus("Username updated."); } catch (error) { console.error("Failed to update username:", error); setStatus("Could not update your username. Please try again.", true); } finally { saveButton.disabled = false; } });
        panel.querySelector("#settings-logout").addEventListener("click", async () => { try { await this.logout(); window.location.href = "/signIn"; } catch (error) { setStatus("Could not log out. Please try again.", true); } });
    }
    ALog(eventName, data) { try { logEvent(this.analytics, eventName, data); } catch (e) { console.error('Analytics logging failed:', e); } }
}
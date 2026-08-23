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

    // Firebase Email/Password auth is used for Tavern accounts without a personal email.
    // The internal email is never shown to the user or used for email communication.
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
            const docAdded = await addDoc(collection(this.db, path), data);
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

            const querySnapshot = await getDocs(query(collection(this.db, path), ...constraints));

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
        const docQuery = query(collection(this.db, path), where('timestamp', '>', Date.now()));
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

    logout() {
        try {
            return signOut(this.auth);
        } catch (e) {
            console.error('logout error: ' + JSON.stringify(e));
        }
    }

    ALog(eventName, data) {
        try {
            logEvent(this.analytics, eventName, data);
        } catch (e) {
            console.error('Analytics logging failed:', e);
        }
    }
}
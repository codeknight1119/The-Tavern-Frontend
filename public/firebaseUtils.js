const firebaseConfig = {
    apiKey: "AIzaSyCQSv-B_1LiYwW6_XDMCesK-uUwx4SvE",
    authDomain: "wchs-thetavern.firebaseapp.com",
    projectId: "wchs-thetavern",
    storageBucket: "wchs-thetavern.firebasestorage.app",
    messagingSenderId: "1067002790985",
    appId: "1:1067002790985:web:5835522f0afede84deeb98",
    measurementId: "G-L2LD6HTME2"
};

import { Firebase } from "/public/utils/firebaseUtilsClass.js";

export const FirebaseUtils = new Firebase(firebaseConfig);

// The backend now runs on Render and requires Firebase authentication.
// Keep existing backend fetch calls working by automatically attaching the
// current Firebase user's ID token to requests made to the backend.
const originalFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input, init = {}) => {
    let url = typeof input === "string" ? input : input?.url;

    if (typeof url === "string" && url.startsWith("https://the-tavern-backend.onrender.com/")) {
        const currentUser = FirebaseUtils.auth.currentUser;

        if (currentUser) {
            const token = await currentUser.getIdToken();
            const headers = new Headers(
                init.headers || (input instanceof Request ? input.headers : undefined)
            );
            headers.set("Authorization", `Bearer ${token}`);
            init = { ...init, headers };
        }

        // The old backend used /serverStatus. The current Render backend
        // exposes the public health check at /health instead.
        const isLegacyServerStatus = url === "https://the-tavern-backend.onrender.com/serverStatus";
        if (isLegacyServerStatus) {
            url = "https://the-tavern-backend.onrender.com/health";
            input = url;
        }

        const response = await originalFetch(input, init);

        // app.js still expects the old { status: "ok" } response.
        if (isLegacyServerStatus && response.ok) {
            return new Response(JSON.stringify({ status: "ok" }), {
                status: response.status,
                statusText: response.statusText,
                headers: { "Content-Type": "application/json" }
            });
        }

        return response;
    }

    return originalFetch(input, init);
};

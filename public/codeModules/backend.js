import {waitForServer} from "./backend.js"
const backendUrl = "https://the-tavern-backend.onrender.com";

export async function fetchWithTimeout(url, options, timeout = 5000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
    }
}

export async function waitForServer() {
    const popup = document.getElementById("loading-popup");
    if (popup) popup.hidden = false;

    while (true) {
        try {
            const healthResponse = await fetchWithTimeout(`${backendUrl}/health`, { method: "GET" });
            if (healthResponse.ok) {
                if (popup) popup.hidden = true;
                return;
            }
        } catch (error) { }

        await new Promise(resolve => setTimeout(resolve, 5000));
    }
}

export async function fetchServer(endpoint, postData) {
    if (!state.firebaseUser) {
        throw new Error("A signed-in Firebase user is required for backend requests.");
    }

    const link = `${backendUrl}/${endpoint}`;

    async function makeRequest(forceRefresh = false) {
        const token = await state.firebaseUser.getIdToken(forceRefresh);
        const headers = {
            Authorization: `Bearer ${token}`
        };

        if (postData !== undefined) {
            headers["Content-Type"] = "application/json";
        }

        const options = {
            method: postData !== undefined ? "POST" : "GET",
            headers,
            ...(postData !== undefined && { body: JSON.stringify(postData) })
        };

        return await fetchWithTimeout(link, options);
    }

    let response;

    try {
        response = await makeRequest(false);
    } catch (error) {
        // Network/timeout errors may mean Render is still waking up.
        // Do not treat HTTP 401/403 as server availability problems.
        await waitForServer();
        response = await makeRequest(false);
    }

    // If the token was stale, refresh it once and retry. This is deliberately
    // limited to one retry so an actual authentication failure cannot loop.
    if (response.status === 401) {
        response = await makeRequest(true);
    }

    if (response.status === 401) {
        throw new Error("Backend request denied (401): authentication failed.");
    }

    if (response.status === 403) {
        throw new Error("Backend request denied (403): insufficient permissions.");
    }

    if (!response.ok) {
        throw new Error(`Backend request failed (${response.status}).`);
    }
    if(endpoint === "checkMessage"){
        setChatSendLocked(postData.conv, false);
    }
    return await response.json();
}
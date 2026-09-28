import { FirebaseUtils } from "./firebaseUtils.js";

import eruda from "https://cdn.jsdelivr.net/npm/eruda/+esm";
import {state} from "public/codeModules/state.js"
import {checkUser} from "public/codeModules/auth.js"
import {getMyFeatures} from "public/codeModules/sidebar.js"



const toggleButton = document.getElementById("toggle-btn")
const sidebar = document.getElementById("sidebar")

toggleButton.addEventListener("click", (event) => {
    sidebar.classList.toggle("close")
    toggleButton.classList.toggle("rotate")
    Array.from(sidebar.getElementsByClassName("show")).forEach((ul) => {
        ul.classList.remove("show")
        ul.previousElementSibling.classList.remove("rotate")
    })
})

//Startup sequence

await checkUser()
await getMyFeatures()

//////////////////////////////////////////////////////////////////////
/////////////////////////PAGE RENDERING///////////////////////////////
//////////////////////////////////////////////////////////////////////

function hideFeatureHTML() {
    Array.from(document.getElementsByClassName("featureHTML")).forEach((val) => { val.hidden = true })
}

function getFeatureById(id) {
    return state.myFeatures.find((obj) => obj.id === id)
}

let mainContentArea = document.getElementById("mainContentArea")

const backendUrl = "https://the-tavern-backend.onrender.com";

async function fetchWithTimeout(url, options, timeout = 5000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
    }
}

async function waitForServer() {
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

async function fetchServer(endpoint, postData) {
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
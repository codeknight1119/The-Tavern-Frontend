import { FirebaseUtils } from "../firebaseUtils.js";
import {state} from "./state.js"
import {mainContentArea} from "./dom.js"


export async function newBoard(title, body, id = null) {
    const fragment = document.getElementById("board-template").content.cloneNode(true);

    // 1. Grab a direct reference to the root container element right away
    const boardRoot = fragment.firstElementChild;

    const titleText = fragment.querySelector(".board-title");
    const bodyText = fragment.querySelector(".board-body");
    const delBtn = fragment.querySelector(".board-delete");
    const isOfficer = state.permissions.includes("officer");

    titleText.contentEditable = bodyText.contentEditable = isOfficer;
    delBtn.hidden = !isOfficer;

    let finalId = id;

    // 2. ONLY add a new document to Firebase if we didn't pass an existing ID
    if (!finalId) {
        const newDocData = await FirebaseUtils.addDocument(`/features/${state.activeFeature}/boards`, {
            title: title || "Title",
            body: body || "Type announcement"
        });
        finalId = newDocData.id;

        if (state.ss_TOOLS.get(state.activeFeature)) {
            state.ss_TOOLS.get(state.activeFeature).unshift({ id: finalId, ...newDocData });
        }
    }

    console.log(finalId);
    const path = `/features/${state.activeFeature}/boards/${finalId}`;

    if (isOfficer) {
        titleText.addEventListener("blur", async (event) => {
            const payload = { title: event.target.innerText };
            await FirebaseUtils.updateDocument(path, payload);
        });

        bodyText.addEventListener("blur", async (event) => {
            const payload = { body: event.target.innerText };
            await FirebaseUtils.updateDocument(path, payload);
        });

        delBtn.addEventListener("click", async () => {
            await FirebaseUtils.deleteDocument(path);
            // 3. Use the direct reference we saved earlier to delete it from the UI
            boardRoot.remove();
        });
    }

    titleText.innerText = title || "Title";
    bodyText.innerHTML = body || "Type announcement";

    // Prepend the finished fragment to your page
    mainContentArea.prepend(fragment);
}

document.getElementById("board-new").addEventListener("click", async () => { await newBoard() })
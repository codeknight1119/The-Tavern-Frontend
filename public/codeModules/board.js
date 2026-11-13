import { FirebaseUtils } from "../firebaseUtils.js";
import {state} from "./state.js"
import {mainContentArea} from "./dom.js"

/*
Used in sidebar.js where boards are constructed 
*/
export async function newBoard(title, body, formLink, id = null) {
    const fragment = document.getElementById("board-template").content.cloneNode(true);

    // 1. Grab a direct reference to the root container element right away
    const boardRoot = fragment.firstElementChild;

    const titleText = fragment.querySelector(".board-title");
    const bodyText = fragment.querySelector(".board-body");
    const officerTools = fragment.querySelector(".officer-tools");
    const isOfficer = state.permissions.includes("officer");

    const delBtn = fragment.querySelector(".board-delete")
    const formLinkIn = fragment.querySelector(".form-link-in")

    const iframe = fragment.querySelector(".form-iframe")

    titleText.contentEditable = bodyText.contentEditable = isOfficer;
    officerTools.hidden = !isOfficer;


    let finalId = id;

    // 2. ONLY add a new document to Firebase if we didn't pass an existing ID
    if (!finalId) {
        const newDocData = await FirebaseUtils.addDocument(`/features/${state.activeFeature}/boards`, {
            title: title || "Title",
            body: body || "Type announcement",
            link: ""
        });
        finalId = newDocData.id;

        if (state.ss_TOOLS.get(state.activeFeature)) {
            state.ss_TOOLS.get(state.activeFeature).unshift({ id: finalId, ...newDocData });
        }
    }

    console.log(finalId);
    const path = `/features/${state.activeFeature}/boards/${finalId}`;


    const updateIframe = ()=>{
        iframe.hidden = true;
        iframe.removeAttribute("src");
        if(formLink && formLink.trim() !== ""){
            iframe.hidden = false
            iframe.src = formLink
        }
    }

    if (isOfficer) {
        titleText.addEventListener("blur", async (event) => {
            const payload = { title: event.target.innerText };
            await FirebaseUtils.updateDocument(path, payload);
        });

        bodyText.addEventListener("blur", async (event) => {
            const payload = { body: event.target.innerText };
            await FirebaseUtils.updateDocument(path, payload);
        });

        formLinkIn.value = formLink || "";

        formLinkIn.addEventListener("blur", async (event) => {
            const link = event.target.value.trim();

            await FirebaseUtils.updateDocument(path, {
                formLink: link
            });

            updateIframe()
        });

        delBtn.addEventListener("click", async () => {
            await FirebaseUtils.deleteDocument(path);
            // 3. Use the direct reference we saved earlier to delete it from the UI
            boardRoot.remove();
        });
    }

    titleText.innerText = title || "Title";
    bodyText.innerHTML = body || "Type announcement";
    updateIframe()

    // Prepend the finished fragment to your page
    mainContentArea.prepend(fragment);
}

document.getElementById("board-new").addEventListener("click", async () => { await newBoard() })
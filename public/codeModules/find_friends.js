import {newFeatureButton, renderChat} from "./codeModules/sidebar.js"
import { FirebaseUtils } from "../firebaseUtils.js";
import {state} from "./state.js"
import {checkUserManifest} from "./campaign.js"


document.getElementById("findFriends-searchBtn").addEventListener("click", search);
findFriends_keyDropdown.addEventListener("change", search);

document.getElementById("findFriends-createConv").addEventListener(
    "click",
    async () => {

        const chatIds = [];
        const chatNames = [];

        Array.from(
            document.getElementById("findFriends-selectedFriends").children
        ).forEach((val) => {
            chatIds.push(val.dataset.id);
            chatNames.push(val.innerText);
        });

        // Always include yourself.
        chatIds.push(state.user.uid);

        // Prevent creating a conversation with nobody else.
        if (chatIds.length < 2) {
            alert("Select at least one person to start a conversation.");
            return;
        }

        const convObj = {
            name:
                document.getElementById("findFriends-convName").value.trim()
                || "Private Conversation",

            users: chatIds,

            type: "conversation",

            tooltip:
                `Conversation with ${chatNames.join(", ")}.`
        };

        try {
            const convData = await FirebaseUtils.addDocument(
                "/conversations",
                convObj
            );

            // The returned object needs its Firebase document ID.
            const conversation = {
                ...convData,
                id: convData.id,
                type: "conversation",
                name: convObj.name
            };

            // VERY IMPORTANT:
            // handleSidebarClick() searches myFeatures.
            state.myFeatures.push(conversation);

            // Put it in the sidebar.
            const frag = newFeatureButton(conversation);
            friendFriendsBtn.after(frag);

            // Start listening for messages immediately.
            listenToConversation(conversation.id);

            // Open the conversation immediately.
            state.activeChat = conversation.id;
            state.activeFeature = "conversation";

            // Close the popup.
            findFriends_popup.style.display = "none";

            // Clear the creation UI.
            document.getElementById("findFriends-convName").value = "";
            document
                .getElementById("findFriends-selectedFriends")
                .replaceChildren();

            // Render the new chat.
            await renderChat(conversation.id, true);

        } catch (error) {
            console.error("Failed to create conversation:", error);
            alert("Could not create the conversation.");
        }
    }
);

const findFriends_popup = document.getElementById("findFriends-popup")
friendFriendsBtn.addEventListener("click", () => {
    findFriends_popup.style.display = "flex";
})

document.getElementById("findFriends-close").addEventListener("click", () => {
    findFriends_popup.style.display = "none";
})

const findFriends_keyDropdown = document.getElementById("findFriends-searchByDropdown")
const findFriends_outTemplateParent = document.getElementById("findFriends-foundFriends")

async function search() {
    const findFriends_textIn = document.getElementById("findFriends-input")
    const searchTerm = findFriends_textIn.value.trim().toLowerCase();
    if (searchTerm === "") return;

    const key = findFriends_keyDropdown.value || "name";
    console.log("key:", key);

    await checkUserManifest()
    const filteredResults = state.userManifest.filter(item => {
        const itemValue = String(item[key] || "").toLowerCase();
        return itemValue.includes(searchTerm);
    });

    // Clear previous search results cleanly
    findFriends_outTemplateParent.replaceChildren();

    // Render matching result
    if (filteredResults.length > 1 || (filteredResults.length === 1 && filteredResults[0].id !== state.user.uid)) {
        filteredResults.forEach((result) => {
            if (result.id === state.user.uid) return
            const clone = document.getElementById("findFriends-foundFriends_template").content.cloneNode(true);

            const card = clone.firstElementChild

            clone.querySelector(".findFriends-template_real_name").innerText = result["Real Name"]
            clone.querySelector(".findFriends-template_name").innerText = result.name

            clone.querySelector(".findFriends-searched-save").addEventListener("click", () => {
                const newEl = document.createElement("div")
                const newEl_HTML = `
            <p>${result.name} (${result["Real Name"]})</p>
            <button class="findFriends_remove">Remove from conversation.</button>
            <br>`
                newEl.innerHTML = newEl_HTML
                newEl.style.display = "flex"
                newEl.dataset.id = result.id

                newEl.querySelector(".findFriends_remove").addEventListener("click", () => {
                    newEl.remove();
                })

                findFriends_textIn.value = "";

                card.remove()

                document.getElementById("findFriends-selectedFriends").appendChild(newEl)
            })


            // Append the populated clone to the DOM container
            findFriends_outTemplateParent.appendChild(clone);
        });

    } else {
        const notFound = document.createElement("p")
        notFound.innerText = `Could not find "${searchTerm}"`
        findFriends_outTemplateParent.appendChild(notFound)
    }
}
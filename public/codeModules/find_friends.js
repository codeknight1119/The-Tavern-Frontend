import { FirebaseUtils } from "../firebaseUtils.js";
import { state } from "./state.js";
import { checkUserManifest } from "./userManifest.js";
import { renderChat, newFeatureButton, listenToConversation } from "./sidebar.js";
import {renderMessage} from "./chat.js"



const friendFriendsBtn = document.getElementById("findFriends-btn");
const findFriends_popup = document.getElementById("findFriends-popup");
const findFriends_keyDropdown = document.getElementById("findFriends-searchByDropdown");
const findFriends_outTemplateParent = document.getElementById("findFriends-foundFriends");

if (document.getElementById("findFriends-searchBtn")) {
    document.getElementById("findFriends-searchBtn").addEventListener("click", search);
}

if (findFriends_keyDropdown) {
    findFriends_keyDropdown.addEventListener("change", search);
}

if (document.getElementById("findFriends-createConv")) {
    document.getElementById("findFriends-createConv").addEventListener(
        "click",
        async () => {
            const chatIds = [];
            const chatNames = [];

            Array.from(document.getElementById("findFriends-selectedFriends").children).forEach((val) => {
                chatIds.push(val.dataset.id);
                chatNames.push(val.innerText);
            });

            chatIds.push(state.user.uid);

            if (chatIds.length < 2) {
                alert("Select at least one person to start a conversation.");
                return;
            }

            const convObj = {
                name: document.getElementById("findFriends-convName").value.trim() || "Private Conversation",
                users: chatIds,
                type: "conversation",
                tooltip: `Conversation with ${chatNames.join(", ")}.`
            };

            try {
                const convData = await FirebaseUtils.addDocument("/conversations", convObj);
                const conversation = {
                    ...convData,
                    id: convData.id,
                    type: "conversation",
                    name: convObj.name
                };

                state.myFeatures.push(conversation);

                const frag = newFeatureButton(conversation);
                friendFriendsBtn.after(frag);

                if (typeof listenToConversation === "function") {
                    listenToConversation(conversation.id);
                }

                state.activeChat = conversation.id;
                state.activeFeature = "conversation";

                if (findFriends_popup) findFriends_popup.style.display = "none";
                document.getElementById("findFriends-convName").value = "";
                document.getElementById("findFriends-selectedFriends").replaceChildren();

                await renderChat(conversation.id, true);
            } catch (error) {
                console.error("Failed to create conversation:", error);
                alert("Could not create the conversation.");
            }
        }
    );
}

if (friendFriendsBtn && findFriends_popup) {
    friendFriendsBtn.addEventListener("click", () => {
        findFriends_popup.style.display = "flex";
    });
}

if (document.getElementById("findFriends-close")) {
    document.getElementById("findFriends-close").addEventListener("click", () => {
        if (findFriends_popup) findFriends_popup.style.display = "none";
    });
}

async function search() {
    const findFriends_textIn = document.getElementById("findFriends-input");
    if (!findFriends_textIn) return;

    const searchTerm = findFriends_textIn.value.trim().toLowerCase();
    if (searchTerm === "") return;

    const key = findFriends_keyDropdown?.value || "name";
    await checkUserManifest();

    const filteredResults = (state.userManifest || []).filter(item => {
        const itemValue = String(item[key] || "").toLowerCase();
        return itemValue.includes(searchTerm);
    });

    if (findFriends_outTemplateParent) {
        findFriends_outTemplateParent.replaceChildren();
    }

    if (filteredResults.length > 1 || (filteredResults.length === 1 && filteredResults[0].id !== state.user.uid)) {
        filteredResults.forEach((result) => {
            if (result.id === state.user.uid) return;
            const clone = document.getElementById("findFriends-foundFriends_template").content.cloneNode(true);
            const card = clone.firstElementChild;

            clone.querySelector(".findFriends-template_real_name").innerText = result["Real Name"];
            clone.querySelector(".findFriends-template_name").innerText = result.name;

            clone.querySelector(".findFriends-searched-save").addEventListener("click", () => {
                const newEl = document.createElement("div");
                newEl.innerHTML = `
                    <p>${result.name} (${result["Real Name"]})</p>
                    <button class="findFriends_remove">Remove from conversation.</button>
                    <br>
                `;
                newEl.style.display = "flex";
                newEl.dataset.id = result.id;

                newEl.querySelector(".findFriends_remove").addEventListener("click", () => {
                    newEl.remove();
                });

                findFriends_textIn.value = "";
                card.remove();
                document.getElementById("findFriends-selectedFriends").appendChild(newEl);
            });

            if (findFriends_outTemplateParent) {
                findFriends_outTemplateParent.appendChild(clone);
            }
        });
    } else {
        const notFound = document.createElement("p");
        notFound.innerText = `Could not find "${searchTerm}"`;
        if (findFriends_outTemplateParent) findFriends_outTemplateParent.appendChild(notFound);
    }
}

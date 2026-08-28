import { FirebaseUtils } from "./firebaseUtils.js";
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import { Editor } from 'https://esm.sh/@tiptap/core';
import StarterKit from 'https://esm.sh/@tiptap/starter-kit';
import { Markdown } from 'https://esm.sh/@tiptap/markdown';



//////////////////////////////////////////////////////////////////////
/////////////////////////GLOBAL VARS//////////////////////////////////
//////////////////////////////////////////////////////////////////////
let user = null;
let firebaseUser = null
let permissions = null;
let myFeatures = [];
let currentSelectedSidebar = null
const chatUI = document.getElementById("chatTools")
let ss_TOOLS = new Map()
let ss_CHATS = new Map()
let ss_CAMPAIGNS = new Map()
let activeChat = null;
let activeFeature = null;
let activeFeatureType = null;
let userManifest = null;
let guestManifest = null;



const chatArea = document.getElementById("sendBar")

const messageInput = new Editor({
    element: chatArea,
    extensions: [StarterKit, Markdown.configure({
        transformPastedText: true, // Converts copied markdown into visual styles on paste
    }),],
    editorProps: {
        attributes: { class: 'message-input-styles' },
        handleKeyDown: (view, event) => {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleChatMesage();
                return true;
            }
            return false
        }
    },
})

function setChatSendLocked(chatId, locked) {
    // Only modify the currently displayed chat.
    if (chatId !== activeChat) return;

    const sendBtn = document.getElementById("sendBtn");
    const sendBar = document.getElementById("sendBar");

    // Lock/unlock the actual TipTap editor.
    messageInput.setEditable(!locked);

    // Lock/unlock the send button.
    sendBtn.disabled = locked;

    // Add/remove the visual overlay.
    sendBar.classList.toggle("chat-send-locked", locked);

    // Tell anything else listening that this chat changed state.
    window.dispatchEvent(new CustomEvent("chatSendState", {
        detail: {
            chatId,
            locked
        }
    }));
}

//////////////////////////////////////////////////////////////////////
/////////////////////////SITE UTILS///////////////////////////////////
//////////////////////////////////////////////////////////////////////
async function checkUserManifest() {
    console.log("=== USER MANIFEST DEBUG START ===");

    try {
        const timestampData =
            await FirebaseUtils.getDocument("/manifest/userManifestTimestamp");

        console.log(
            "Manifest timestamp document:",
            timestampData
        );

        const manifestData =
            await FirebaseUtils.getDocument("/manifest/userManifest");

        console.log(
            "Raw manifest document:",
            manifestData
        );

        console.log(
            "Raw manifest.manifest:",
            manifestData?.manifest
        );

        if (!manifestData) {
            console.error(
                "ERROR: /manifest/userManifest does not exist."
            );

            userManifest = [];
            return;
        }

        if (!Array.isArray(manifestData.manifest)) {
            console.error(
                "ERROR: /manifest/userManifest exists, but .manifest is not an array.",
                manifestData.manifest
            );

            userManifest = [];
            return;
        }

        userManifest = manifestData.manifest;

        console.log(
            `Loaded ${userManifest.length} users into userManifest.`
        );

        if (userManifest.length > 0) {
            console.log(
                "First manifest entry:",
                userManifest[0]
            );

            console.log(
                "Manifest fields:",
                Object.keys(userManifest[0])
            );
        }

        console.log("=== USER MANIFEST DEBUG END ===");

    } catch (error) {
        console.error(
            "ERROR loading user manifest:",
            error
        );

        userManifest = [];
        throw error;
    }
}

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

function toggleSubMenu(event) {
    this.nextElementSibling.classList.toggle("show")
    this.classList.toggle("rotate")
    if (sidebar.classList.contains("close")) {
        sidebar.classList.toggle("close")
        toggleButton.classList.toggle("rotate")
    }
}

const dropdowns = document.querySelectorAll('.dropdown-btn');

dropdowns.forEach((val) => {
    val.addEventListener("click", toggleSubMenu)
})

//////////////////////////////////////////////////////////////////////
/////////////////////////AUTH/////////////////////////////////////////
//////////////////////////////////////////////////////////////////////
async function checkUser() {
    const userCheck = await FirebaseUtils.isSignedIn()


    if (!userCheck) {
        window.location.href = "/signIn"
    } else {

        let uid = userCheck.user.uid
        user = await FirebaseUtils.getDocument(`users/${uid}`)
        user.uid = uid
        firebaseUser = userCheck.user
        console.log("firebase user", firebaseUser)
        console.log("raw user", userCheck)

        const tokens = await firebaseUser.getIdTokenResult(true);
        const claims = tokens?.claims || {};

        // The backend stores application permissions as an array in the
        // custom claim: { permissions: ["officer", "tech", ...] }.
        // Keep a small fallback for older claim formats, but do not treat
        // the "permissions" and "allowed" claim names themselves as roles.
        if (Array.isArray(claims.permissions)) {
            permissions = [...claims.permissions];
        } else {
            const firebaseNoise = [
                "name", "picture", "iss", "aud", "auth_time", "user_id",
                "sub", "iat", "exp", "email", "email_verified", "firebase",
                "permissions", "allowed"
            ];

            permissions = Object.keys(claims)
                .filter(key => !firebaseNoise.includes(key) && claims[key] === true);
        }

        await getMyFeatures()
    }
}
checkUser()

//////////////////////////////////////////////////////////////////////
/////////////////////////PAGE RENDERING///////////////////////////////
//////////////////////////////////////////////////////////////////////

function newFeatureButton(val) {
    const template = document.getElementById("sidebarTemplate");
    const fragment = template.content.cloneNode(true);

    const a = fragment.querySelector(".nav-btn");
    const text = fragment.querySelector(".sidebarText");
    const icon = fragment.querySelector(".ra");

    text.innerText = val.name || "Conversation";

    if (val.icon && val.icon.trim() !== "") {
        icon.classList.add(val.icon.trim());
    }

    if (val.tooltip) {
        a.title = val.tooltip;
    }

    a.dataset.id = val.id;
    a.dataset.personalMessage = "true";

    a.addEventListener("click", handleSidebarClick);

    return fragment;
}

const conversationListeners = new Map();

function listenToConversation(conversationId) {
    // Don't create multiple listeners for the same conversation.
    if (conversationListeners.has(conversationId)) {
        return;
    }

    const unsubscribe = FirebaseUtils.listenForNewDocInCollection(
        `/conversations/${conversationId}/messages`,
        (data) => {
            // Ignore messages from another chat.
            if (conversationId !== activeChat) return;

            // We already render our own message optimistically.
            if (data.uid === user.uid) return;

            renderMessage(data);
        }
    );

    conversationListeners.set(conversationId, unsubscribe);
}

const friendFriendsBtn = document.getElementById("findFriends-btn")
async function getMyFeatures() {
    if (user !== null) {
        async function setUpFeatures(params, parent, setActive) {
            const docs = await FirebaseUtils.getDocuments("/features", undefined, { field: "priority" }, { field: "allowed", value: params })
            myFeatures = myFeatures.concat(docs)

            const parentSidebar = document.getElementById(parent)
            const reversedFeatures = docs.toReversed()

            reversedFeatures.forEach((val, index) => {
                const fragment = newFeatureButton(val)
                if (index === (reversedFeatures.length - 1) && setActive) {
                    const li = fragment.querySelector('li')
                    currentSelectedSidebar = li;
                    li.classList.add("active")
                    loadSidebar(val)
                }
                parentSidebar.prepend(fragment)
            })
        }

        await setUpFeatures(["all"], "everySidebarParent", true)
        if (permissions.length !== 0) {
            await setUpFeatures(permissions, "personal-menu", false)
        }

        if (user.campaigns) {
            user.campaigns.forEach(async (campaign) => {
                let campaignInfo = await FirebaseUtils.getDocument(`/features/${campaign.id}`)
                campaignInfo.id = campaign.id
                myFeatures.push(campaignInfo)
                ss_CAMPAIGNS.set(campaign.id, campaignInfo)
                const fragment = newFeatureButton(campaignInfo)
                document.getElementById("personal-menu").prepend(fragment)
                myFeatures.push(campaign)
            })
        }
            const myPersonalMessages = await FirebaseUtils.getDocuments(
                "/conversations",
                100,
                null,
                {
                    field: "users",
                    value: user.uid,
                    operator: "array-contains"
                }
            );

        myPersonalMessages.forEach((val) => {
            const frag = newFeatureButton(val);

            friendFriendsBtn.after(frag);

            // IMPORTANT:
            // Conversations must be searchable through getFeatureById().
            myFeatures.push(val);

            // Start the real-time listener.
            listenToConversation(val.id);
        });
    }
}
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
    const filteredResults = userManifest.filter(item => {
        const itemValue = String(item[key] || "").toLowerCase();
        return itemValue.includes(searchTerm);
    });

    // Clear previous search results cleanly
    findFriends_outTemplateParent.replaceChildren();

    // Render matching result
    if (filteredResults.length > 1 || (filteredResults.length === 1 && filteredResults[0].id !== user.uid)) {
        filteredResults.forEach((result) => {
            if (result.id === user.uid) return
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
        chatIds.push(user.uid);

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
            myFeatures.push(conversation);

            // Put it in the sidebar.
            const frag = newFeatureButton(conversation);
            friendFriendsBtn.after(frag);

            // Start listening for messages immediately.
            listenToConversation(conversation.id);

            // Open the conversation immediately.
            activeChat = conversation.id;
            activeFeature = "conversation";

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



function handleSidebarClick(event) {

    event.preventDefault();

    const targetAnchor =
        event.target.closest(".nav-btn");

    if (!targetAnchor) return;

    const clickedLi =
        targetAnchor.parentElement;

    if (clickedLi === currentSelectedSidebar) {
        return;
    }

    const idVal =
        targetAnchor.dataset.id;

    const pageData =
        getFeatureById(idVal);

    if (!pageData) {
        console.error(
            "Could not find sidebar item in myFeatures:",
            idVal
        );
        return;
    }

    if (currentSelectedSidebar) {
        currentSelectedSidebar.classList.remove("active");
    }

    clickedLi.classList.add("active");
    currentSelectedSidebar = clickedLi;

    mainContentArea.replaceChildren();

    loadSidebar(pageData);
}

const campaignUI = document.getElementById("campaignUI")
function hideFeatureHTML() {
    Array.from(document.getElementsByClassName("featureHTML")).forEach((val) => { val.hidden = true })
}
async function loadSidebar(data) {
    hideFeatureHTML();

    activeFeatureType = data.type;

    mainContentArea = document.getElementById("mainContentArea");
    mainContentArea.innerHTML = "";

    switch (data.type) {

        case "tool":
            activeFeature = data.id;
            await renderTool(data.id);
            break;

        case "chat":
            activeFeature = data.id;
            await renderChat(data.id, false);
            break;

        case "campaign":
            campaignUI.hidden = false;
            mainContentArea.appendChild(campaignUI);
            mainContentArea = campaignUI;

            activeFeature = data.id;
            await renderChat(data.id, false);
            break;

        case "conversation":
            activeFeature = "conversation";

            await renderChat(data.id, true);
            break;

        default:
            console.warn("Unknown feature type:", data.type);
            break;
    }
}

function getFeatureById(id) {
    return myFeatures.find((obj) => obj.id === id)
}

let mainContentArea = document.getElementById("mainContentArea")

// Add 'id' as an optional third parameter
async function newBoard(title, body, id = null) {
    const fragment = document.getElementById("board-template").content.cloneNode(true);

    // 1. Grab a direct reference to the root container element right away
    const boardRoot = fragment.firstElementChild;

    const titleText = fragment.querySelector(".board-title");
    const bodyText = fragment.querySelector(".board-body");
    const delBtn = fragment.querySelector(".board-delete");
    const isOfficer = permissions.includes("officer");

    titleText.contentEditable = bodyText.contentEditable = isOfficer;
    delBtn.hidden = !isOfficer;

    let finalId = id;

    // 2. ONLY add a new document to Firebase if we didn't pass an existing ID
    if (!finalId) {
        const newDocData = await FirebaseUtils.addDocument(`/features/${activeFeature}/boards`, {
            title: title || "Title",
            body: body || "Type announcement"
        });
        finalId = newDocData.id;

        if (ss_TOOLS.get(activeFeature)) {
            ss_TOOLS.get(activeFeature).unshift({ id: finalId, ...newDocData });
        }
    }

    console.log(finalId);
    const path = `/features/${activeFeature}/boards/${finalId}`;

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

async function renderTool(id) {
    chatUI.hidden = true;

    // FIXED: Reset visibility states so buttons don't bleed across different tool pages
    document.getElementById("board-new").hidden = true;
    document.getElementById("userPermsUI").hidden = true;

    const toolData = getFeatureById(id)
    const BOARD_COUNT = 15

    switch (toolData.toolType) {
        case ("board"):
            let boards;
            if (permissions.includes("officer")) {
                document.getElementById("board-new").hidden = false;
            }

            if (ss_TOOLS.get(id)) {
                boards = ss_TOOLS.get(id)
            } else {
                boards = await FirebaseUtils.getDocuments(`features/${id}/boards`, BOARD_COUNT)
                ss_TOOLS.set(id, boards)
            }

            mainContentArea.replaceChildren();

            if (boards.length === 0) {
                mainContentArea.innerHTML = `<h3>No Messages</h3>`
                return
            }

            boards.forEach((board) => {
                console.log(board)
                const parsedBody = marked.parse(board.body)
                newBoard(board.title, parsedBody, board.id)
            })
            break

        case ("userPermissions"):
            const ui = document.getElementById("userPermsUI")
            ui.hidden = false
            mainContentArea.innerHTML = "<p><strong>Search to find users</strong></p>"
            break

        case ("officerMessage"):
            const OD_ui = document.getElementById("officersDeskUI").content.cloneNode(true)
            OD_ui.querySelector("#OD_submit").addEventListener("click", async () => {
                const ticketType = document.getElementById("OD_ticketType").value
                if (ticketType === "null") {
                    return
                }
                const data = await FirebaseUtils.addDocument(`features/${id}/tickets`, {
                    "creator": user.uid,
                    "type": ticketType,
                    "description": document.getElementById("OD_textInput").value,
                    "progress": "submitted",
                    "created": String(Date.now()),
                    "lastUpdate": String(Date.now())
                })
                document.getElementById("OD_ticketType").value = "null"
                document.getElementById("OD_textInput").value = ""

            })
            mainContentArea.appendChild(OD_ui)
            const showMyTicketBtn = document.getElementById("OD_showMyTickets")

            showMyTicketBtn.addEventListener("click", async () => {
                const isShowing = showMyTicketBtn.dataset.toggle === "true";
                const toggle = !isShowing;

                showMyTicketBtn.dataset.toggle = String(toggle);

                document.getElementById("OD_showMyTicketsText").innerText = toggle
                    ? "Hide my tickets ^"
                    : "See my tickets ⌄";
                const myTicketsArea = document.getElementById("OD_myTickets")
                if (toggle && Array.from(myTicketsArea.children).length === 0) {
                    const myTickets = await FirebaseUtils.getDocuments(
                        `/features/${id}/tickets`,
                        15,
                        {},
                        { field: "creator", value: user.uid }
                    );
                    myTickets.forEach((val) => {
                        const OD_myTicket_Template = document.getElementById("OD_myTicket_template").content.cloneNode(true)

                        OD_myTicket_Template.querySelector(".OD_myTicket_desc").innerText = val.description
                        OD_myTicket_Template.querySelector(".OD_myTicket_progress").innerText = val.progress
                        const time = new Date(Number(val.lastUpdate)).toLocaleString()
                        OD_myTicket_Template.querySelector(".OD_myTicket_lastUpdate").innerText = time
                        myTicketsArea.appendChild(OD_myTicket_Template)
                    })
                }

                myTicketsArea.hidden = !toggle;
            });

            break

        case "roleCall":
            const guestUI = document.getElementById("guestUITemplate").content.cloneNode(true)
            mainContentArea.appendChild(guestUI)
            const waitText = document.getElementById("rollCall_waitText")
            waitText.hidden = false;
            const roleCallPromise = await fetch("https://script.google.com/macros/s/AKfycbztnQLiJnHbNZra08IjKaZsHYtw1vB65zV4F1aweSLW0-mukY_eNLL1zggN_SN532Ot/exec")
            const roleCallData = await roleCallPromise.json();
            waitText.hidden = true;

            const checkedInMemberHolder = document.getElementById("checkedInMembers");
            roleCallData.members.forEach((val) => {
                let htmlCheckedIn = `<pre class="checkedInGuests">${val.firstName} ${val.lastName}</pre><br>`
                const checkedInElement = document.createElement("div")
                checkedInElement.dataset.name = val.studentId
                checkedInElement.innerHTML = htmlCheckedIn
                checkedInMemberHolder.appendChild(checkedInElement)
            })

            const checkedInGuestHolder = document.getElementById("checkedInGuests");
            roleCallData.guests.forEach((val) => {
                let end = ""
                if (val.totalMeetingsAttende === 3) {
                    end = `\nNeeds to pay dues soon.`
                }
                let htmlCheckedIn = `<pre class="checkedInGuest">${val.firstName} ${val.lastName}: ${val.totalMeetingsAttended}/3 trial meetings.${end}</pre><br>`
                const checkedInElement = document.createElement("div")
                checkedInElement.dataset.name = val.studentId
                checkedInElement.innerHTML = htmlCheckedIn
                checkedInGuestHolder.appendChild(checkedInElement)
            })
            document.getElementById("rollCall_memberNum").innerText = roleCallData.members.length;
            document.getElementById("rollCall_GuestNum").innerText = roleCallData.guests.length
            break
    }
}



let chatRenderGeneration = 0;

async function renderChat(id, conversation = false) {

    const renderId = ++chatRenderGeneration;

    chatUI.hidden = false;

    // Set these BEFORE doing the async Firebase request.
    activeChat = id;

    if (conversation) {
        activeFeature = "conversation";
        activeFeatureType = "conversation";

        // Make sure the realtime listener exists.
        listenToConversation(id);
    } else {
        activeFeature = id;
    }

    // Clear the old chat immediately.
    mainContentArea.replaceChildren();

    const dir = conversation
        ? "conversations"
        : "features";

    let messages;

    try {
        messages = await FirebaseUtils.getDocuments(
            `/${dir}/${id}/messages`,
            50,
            { field: "timestamp", direction: "asc" }
        );
    } catch (error) {
        console.error("Failed to load chat:", error);

        // Only show the error if we're still looking at this chat.
        if (activeChat === id) {
            mainContentArea.innerHTML =
                "<p>Could not load this conversation.</p>";
        }

        return;
    }

    // A different chat was selected while Firebase was loading.
    // Do NOT allow the old request to overwrite the new chat.
    if (
        renderId !== chatRenderGeneration ||
        activeChat !== id
    ) {
        return;
    }

    // Clear once more in case something rendered while loading.
    mainContentArea.replaceChildren();

    if (!messages || messages.length === 0) {
        mainContentArea.innerHTML = "<h3>No Messages</h3>";
        return;
    }

    messages.forEach((message) => {
        renderMessage(message);
    });
}


function renderMessage(data) {

    // Don't render messages if we don't currently have a chat.
    if (!activeChat) return;

    const isMine =
        user && data.uid === user.uid
            ? "mine"
            : "notMine";

    const displayName =
        data.username ||
        data.name ||
        "Unknown User";

    const parsedContent =
        marked.parse(data.content || "");

    const htmlText = `
        <div class="message ${isMine}">
            <strong>
                <p>${displayName}:</p>
            </strong>

            <div>${parsedContent}</div>
        </div>
    `;

    // Cache by CHAT ID, not sidebar DOM element.
    if (!ss_CHATS.has(activeChat)) {
        ss_CHATS.set(activeChat, []);
    }

    ss_CHATS.get(activeChat).push(data);

    mainContentArea.insertAdjacentHTML(
        "beforeend",
        htmlText
    );
}

async function handleChatMesage() {

    if (!activeChat) return;

    const chatId = activeChat;

    const markdownContent =
        messageInput.getMarkdown();

    if (!markdownContent || markdownContent.trim() === "") {
        return;
    }

    const messageTxt = markdownContent;

    setChatSendLocked(chatId, true);

    try {

        const cleared = await fetchServer(
            "checkMessage",
            {
                message: messageTxt,
                conv: chatId
            }
        );

        if (!cleared.clean) {
            alert(
                "Inappropriate content found in message.\n" +
                "Please try again with appropriate language."
            );

            return;
        }

        const sendData = {
            content: messageTxt,
            username: user.name,
            uid: user.uid,
            timestamp: Date.now()
        };

        // Clear input only after moderation succeeds.
        messageInput.commands.clearContent();

if (activeChat !== chatId) {
    console.warn(
        "Chat changed while sending message. " +
        "Not rendering optimistic message."
    );
} else {
    renderMessage(sendData);
}

const dir =
    activeFeature === "conversation"
        ? "conversations"
        : "features";

await FirebaseUtils.addDocument(
    `${dir}/${chatId}/messages`,
    sendData
);

    } catch (error) {

        console.error("Failed to send message:", error);

        alert(
            "The message could not be sent. Please try again."
        );

    } finally {

        // ALWAYS unlock this particular chat.
        setChatSendLocked(chatId, false);
    }
}
document.getElementById("sendBtn").addEventListener("click", handleChatMesage)


const searchUserDropdown = document.getElementById("filterDropdown")
const searchTermInput = document.getElementById("searchTermIn")
let currentSearchUpdates = {}
searchUserDropdown.addEventListener("change", (event) => {
    const selectedValue = event.target.value;
    if (selectedValue === "searchName") {
        searchTermInput.hidden = false
    } else {
        searchTermInput.hidden = true
    }
})

document.getElementById("userSearchBttn").addEventListener("click", async () => {

    try {

        let docs = [];

        // ========================================
        // SEARCH USERS
        // ========================================

        switch (searchUserDropdown.value) {

            case "searchName": {
                const searchTerm = searchTermInput.value?.trim().toLowerCase();

                if (!searchTerm) {
                    alert("No search term provided.");
                    return;
                }

                await checkUserManifest();

                docs = userManifest.filter(entry => {
                    const realName = String(entry["Real Name"] || "").toLowerCase();
                    return realName.includes(searchTerm);
                });

                break;
            }

            case "notAllowed": {

                console.log("Requesting not allowed users...");

                // IMPORTANT:
                // Passing {} makes fetchServer use POST.
                const response = await fetchServer(
                    "getNotAllowedUsers",
                    {}
                );

                console.log("Not allowed users response:", response);

                if (!Array.isArray(response)) {
                    alert(
                        response?.error ||
                        "The server did not return a valid user list."
                    );
                    return;
                }

                docs = response;

                break;
            }

            default:

                alert("Please select a search type.");

                return;
        }


        // ========================================
        // NO RESULTS
        // ========================================

        mainContentArea.replaceChildren();

        if (!Array.isArray(docs) || docs.length === 0) {

            const newP = document.createElement("p");

            if (searchUserDropdown.value === "notAllowed") {
                newP.innerText = "No users are currently awaiting approval.";
            } else {
                newP.innerText =
                    "No person found with name " +
                    searchTermInput.value +
                    ".";
            }

            mainContentArea.appendChild(newP);

            return;
        }


        // ========================================
        // TEMPLATE
        // ========================================

        const searchedTemplate =
            document.getElementById("userSearchTemplate");

        if (!searchedTemplate) {
            console.error("userSearchTemplate was not found.");
            alert("User search template is missing.");
            return;
        }


        // ========================================
        // RENDER RESULTS
        // ========================================

        for (const val of docs) {

            console.log("Rendering user:", val);

            const searchedRes =
                searchedTemplate.content.cloneNode(true);

            const userUID = val.id || val.uid;

            if (!userUID) {
                console.warn("Search result has no UID:", val);
                continue;
            }


            // ========================================
            // GET CUSTOM CLAIMS
            // ========================================

            let claims = val.claims || {};

            /*
             * Name searches come from Firestore, so they do not
             * contain claims. Get them from the backend.
             *
             * getNotAllowedUsers already includes claims, so
             * don't make another request for those users.
             */
            if (searchUserDropdown.value === "searchName") {

                console.log(
                    "Getting claims for:",
                    userUID
                );

                const claimsResponse =
                    await fetchServer(
                        "getUserClaims",
                        {
                            uid: userUID
                        }
                    );

                console.log(
                    "Claims response:",
                    claimsResponse
                );

                if (!claimsResponse || claimsResponse.error) {

                    console.error(
                        "Failed to get claims for",
                        userUID,
                        claimsResponse
                    );

                    alert(
                        claimsResponse?.error ||
                        `Could not retrieve permissions for ${val["Real Name"]}.`
                    );

                    continue;
                }

                claims = claimsResponse.claims || {};
            }


            // ========================================
            // NORMALIZE CLAIMS
            // ========================================

            const allowed =
                claims.allowed === true;

            const permissions =
                Array.isArray(claims.permissions)
                    ? [...claims.permissions]
                    : [];


            // ========================================
            // INITIALIZE UPDATE STATE
            // ========================================

            currentSearchUpdates[userUID] = {
                allowed: allowed,
                permissions: [...permissions]
            };


            // ========================================
            // NAME
            // ========================================

            const nameEl =
                searchedRes.querySelector(".searched-Name");

            if (nameEl) {
                nameEl.innerText =
                    val["Real Name"] || val.realName || val.displayName || val.name || userUID
            }


            // ========================================
            // ROLES
            // ========================================

            const rolesEl =
                searchedRes.querySelector(".searched-roles");

            function updateRolesDisplay() {

                if (!rolesEl) {
                    return;
                }

                if (
                    currentSearchUpdates[userUID].permissions.length > 0
                ) {

                    rolesEl.innerText =
                        currentSearchUpdates[userUID]
                            .permissions
                            .join(", ") + ".";

                } else {

                    rolesEl.innerText = "None.";
                }
            }

            updateRolesDisplay();


            // ========================================
            // ALLOWED
            // ========================================

            const allowedEl =
                searchedRes.querySelector(".searched-allowed");

            if (allowedEl) {

                allowedEl.value =
                    String(
                        currentSearchUpdates[userUID].allowed
                    );

                allowedEl.addEventListener(
                    "change",
                    (event) => {

                        currentSearchUpdates[userUID].allowed =
                            event.target.value.toLowerCase() === "true";

                    }
                );
            }


            // ========================================
            // DUES
            // ========================================

            const duesEl =
                searchedRes.querySelector(".searched-dues-paid");

            if (duesEl) {

                duesEl.value =
                    String(val.duesPaid ?? false);

            }


            // ========================================
            // ROLE SELECT
            // ========================================

            const selectNewPerms =
                searchedRes.querySelector(
                    ".searched-addRole-val"
                );


            // ========================================
            // ADD ROLE
            // ========================================

            const addRoleButton =
                searchedRes.querySelector(
                    ".searched-addRole-btn"
                );

            if (addRoleButton) {

                addRoleButton.addEventListener(
                    "click",
                    () => {

                        const addVal =
                            selectNewPerms?.value;

                        if (!addVal) {
                            return;
                        }

                        if (
                            !currentSearchUpdates[userUID]
                                .permissions
                                .includes(addVal)
                        ) {

                            currentSearchUpdates[userUID]
                                .permissions
                                .push(addVal);

                        }

                        updateRolesDisplay();

                    }
                );
            }


            // ========================================
            // REVOKE ROLE
            // ========================================

            const revokeRoleButton =
                searchedRes.querySelector(
                    ".searched-revokeRole-btn"
                );

            if (revokeRoleButton) {

                revokeRoleButton.addEventListener(
                    "click",
                    () => {

                        const removeVal =
                            selectNewPerms?.value;

                        if (!removeVal) {
                            return;
                        }

                        currentSearchUpdates[userUID]
                            .permissions =
                            currentSearchUpdates[userUID]
                                .permissions
                                .filter(
                                    role => role !== removeVal
                                );

                        updateRolesDisplay();

                    }
                );
            }


            // ========================================
            // SAVE
            // ========================================

            const saveButton =
                searchedRes.querySelector(
                    ".searched-save"
                );

            if (saveButton) {

                saveButton.addEventListener(
                    "click",
                    async () => {

                        try {

                            const update =
                                currentSearchUpdates[userUID];

                            console.log(
                                "Saving user claims:",
                                userUID,
                                update
                            );

                            const response =
                                await fetchServer(
                                    "setPermissions",
                                    {
                                        uid: userUID,
                                        allowed: update.allowed,
                                        permissions: update.permissions
                                    }
                                );

                            console.log(
                                "setPermissions response:",
                                response
                            );

                            if (!response || response.error) {

                                alert(
                                    response?.error ||
                                    "Failed to update permissions."
                                );

                                return;
                            }


                            // ========================================
                            // LOG CHANGE
                            // ========================================

                            FirebaseUtils.ALog(
                                "Change Permissions",
                                {
                                    officer: user.uid,
                                    updated_user: userUID,
                                    data: JSON.stringify(update),
                                    time: new Date().toLocaleString()
                                }
                            );


                            // Keep the newly saved state.
                            currentSearchUpdates[userUID] = {
                                allowed: update.allowed,
                                permissions: [
                                    ...update.permissions
                                ]
                            };


                            alert(
                                "Permissions updated successfully."
                            );

                        } catch (error) {

                            console.error(
                                "Error saving permissions:",
                                error
                            );

                            alert(
                                "An error occurred while saving permissions."
                            );
                        }
                    }
                );
            }


            // ========================================
            // ADD RESULT TO PAGE
            // ========================================

            mainContentArea.appendChild(
                searchedRes
            );
        }

    } catch (error) {

        console.error(
            "User search error:",
            error
        );

        alert(
            "Something went wrong while searching for users. Check the console for details."
        );
    }

});

const campaign_divider = document.getElementById("campaign-splitScreenDivide");
const campaign_rightSide = document.getElementById("campaign-right");
const campaign_leftSide = document.getElementById("campaign-left");
const campaign_UI = document.getElementById("campaignUI");


// Function to center the divider perfectly
function centerSplitScreen() {
    // Only center it if the split screen is actually visible
    if (!campaign_divider.hidden) {
        const parentWidth = campaign_UI.getBoundingClientRect().width;
        const middle = parentWidth / 2;

        // Position the elements exactly in the center
        campaign_leftSide.style.right = (parentWidth - middle) + 'px';
        campaign_divider.style.left = middle + 'px';
        campaign_rightSide.style.left = (middle + 4) + 'px'; // 4px accounts for divider width
    }
}
/*
// Run the centering logic when the page first loads
document.addEventListener("DOMContentLoaded", () => {
    // If your split screen starts out HIDDEN, you don't need to center it yet.
    // But if it starts out VISIBLE, call the function right away:
    // centerSplitScreen();
});*///Future gabe test to see if commenting this breaks anything love you mean it - past gabe 


document.getElementById("campaign-enterSplitscreen").addEventListener("click", () => {
    const isOpening = campaign_divider.hidden;

    campaign_divider.hidden = campaign_rightSide.hidden = !isOpening;

    if (isOpening) {
        // Instead of hardcoding 200px, dynamically center it!
        centerSplitScreen();
    } else {
        campaign_leftSide.style.right = "0px";
    }
});

let startX = 0;
let startLeftWidth = 0;
let maxContainerWidth = 0;

campaign_divider.addEventListener('mousedown', function (event) {
    startX = event.clientX;
    startLeftWidth = campaign_leftSide.getBoundingClientRect().width;

    // Dynamically grab the parent's current width so we don't drag out of bounds
    maxContainerWidth = campaign_UI.getBoundingClientRect().width;

    document.addEventListener('mousemove', startResizing);
    document.addEventListener('mouseup', stopResizing);

    event.preventDefault();
});



function startResizing(event) {
    const deltaX = event.clientX - startX;
    let newWidth = startLeftWidth + deltaX;

    // Boundary constraints: Keep the divider inside the parent container
    if (newWidth < 50) newWidth = 50; // Minimum left panel size
    if (newWidth > maxContainerWidth - 50) newWidth = maxContainerWidth - 50; // Minimum right panel size

    // Apply synchronized positioning updates
    campaign_leftSide.style.right = (maxContainerWidth - newWidth) + 'px';
    campaign_divider.style.left = newWidth + 'px';
    campaign_rightSide.style.left = (newWidth + 4) + 'px';
}

function stopResizing() {
    document.removeEventListener('mousemove', startResizing);
    document.removeEventListener('mouseup', stopResizing);
}


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
    if (!firebaseUser) {
        throw new Error("A signed-in Firebase user is required for backend requests.");
    }

    const link = `${backendUrl}/${endpoint}`;

    async function makeRequest(forceRefresh = false) {
        const token = await firebaseUser.getIdToken(forceRefresh);
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

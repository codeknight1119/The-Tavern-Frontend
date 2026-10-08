import { FirebaseUtils } from "../firebaseUtils.js";
import {state} from "./state.js"
import {mainContentArea, sidebar, chatUI, setMainContentArea} from "./dom.js"
import {renderMessage, marked} from "./chat.js"
import {setupCampaignAdmin} from "./campaign.js"
import {newBoard} from "./board.js"

function hideFeatureHTML() {
    Array.from(document.getElementsByClassName("featureHTML")).forEach((val) => { val.hidden = true })
}
function getFeatureById(id) {
    return state.myFeatures.find((obj) => obj.id === id)
}

const campaignUI = document.getElementById("campaignUI")

export function listenToConversation(conversationId) {
    // Don't create multiple listeners for the same conversation.
    if (state.conversationListeners.has(conversationId)) {
        return;
    }

    const unsubscribe = FirebaseUtils.listenForNewDocInCollection(
        `/conversations/${conversationId}/messages`,
        (data) => {
            // Ignore messages from another chat.
            if (conversationId !== state.activeChat) return;

            // We already render our own message optimistically.
            if (data.uid === state.user.uid) return;

            renderMessage(data);
        }
    );

    state.conversationListeners.set(conversationId, unsubscribe);
}

async function loadSidebar(data) {
    hideFeatureHTML();

    state.activeFeatureType = data.type;

    setMainContentArea(document.getElementById("mainContentArea"));
    mainContentArea.innerHTML = "";

    switch (data.type) {

        case "tool":
            state.activeFeature = data.id;
            await renderTool(data.id);
            break;

        case "chat":
            state.activeFeature = data.id;
            await renderChat(data.id, false);
            break;
case "campaign":
    campaignUI.hidden = false;
    mainContentArea.appendChild(campaignUI);
     setMainContentArea(campaignUI);

    state.activeFeature = data.id;

    await renderChat(data.id, false);

    setupCampaignAdmin(data);

    break;
        case "conversation":
            state.activeFeature = "conversation";

            await renderChat(data.id, true);
            break;

        default:
            console.warn("Unknown feature type:", data.type);
            break;
    }
}

async function setUpFeatures(params, parent, setActive) {
    const docs = await FirebaseUtils.getDocuments("/features", undefined, { field: "priority" }, { field: "allowed", value: params })
    state.myFeatures = state.myFeatures.concat(docs)

    const parentSidebar = document.getElementById(parent)
    const reversedFeatures = docs.toReversed()

    reversedFeatures.forEach((val, index) => {
        const fragment = newFeatureButton(val)
        if (index === (reversedFeatures.length - 1) && setActive) {
            const li = fragment.querySelector('li')
            state.currentSelectedSidebar = li;
            li.classList.add("active")
            loadSidebar(val)
        }
        parentSidebar.prepend(fragment)
    })
}

function handleSidebarClick(event) {

    event.preventDefault();

    if (event.target.closest(".dmEditIcon")) {
        return;
    }

    const targetAnchor =
        event.target.closest(".nav-btn");

    if (!targetAnchor) return;

    const clickedLi =
        targetAnchor.parentElement;

    if (clickedLi === state.currentSelectedSidebar) {
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

    if (state.currentSelectedSidebar) {
        state.currentSelectedSidebar.classList.remove("active");
    }

    clickedLi.classList.add("active");
    state.currentSelectedSidebar = clickedLi;

    mainContentArea.replaceChildren();

    loadSidebar(pageData);
}

const friendFriendsBtn = document.getElementById("findFriends-btn")
export async function getMyFeatures() {
    if (state.user !== null) {
        await setUpFeatures(["all"], "everySidebarParent", true)
        if (state.permissions.length !== 0) {
            await setUpFeatures(state.permissions, "personal-menu", false)
        }

        if (state.user.campaigns) {
    state.user.campaigns.forEach(async (campaign) => {
        try {
            // Campaigns now live under /campaigns, not /features.
            const campaignInfo = await FirebaseUtils.getDocument(
                `/campaigns/${campaign.id}`
            );

            if (!campaignInfo) {
                console.error(
                    `Could not load campaign ${campaign.id} from /campaigns`
                );
                return;
            }

            campaignInfo.id = campaign.id;

            // Preserve the user's membership information alongside
            // the campaign document.
            campaignInfo.DM = campaign.DM === true;
            campaignInfo.type = "campaign";

            state.myFeatures.push(campaignInfo);
            state.ss_CAMPAIGNS.set(campaign.id, campaignInfo);

            const fragment = newFeatureButton(campaignInfo);
            document
                .getElementById("personal-menu")
                .prepend(fragment);

        } catch (error) {
            console.error(
                `Failed to load campaign ${campaign.id}:`,
                error
            );
        }
    });
}
            const myPersonalMessages = await FirebaseUtils.getDocuments(
                "/conversations",
                100,
                null,
                {
                    field: "users",
                    value: state.user.uid,
                    operator: "array-contains"
                }
            );

        myPersonalMessages.forEach((val) => {
            const frag = newFeatureButton(val);

            friendFriendsBtn.after(frag);

            // IMPORTANT:
            // Conversations must be searchable through getFeatureById().
            state.myFeatures.push(val);

            // Start the real-time listener.
            listenToConversation(val.id);
        });
    }
}

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


export function newFeatureButton(val) {
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

    if (val.DM) {
        const dmEdit = a.querySelector(".dmEditIcon");

        dmEdit.hidden = false;

        dmEdit.addEventListener("click", (event) => {
            // Don't also activate/open the campaign itself.
            event.preventDefault();
            event.stopPropagation();

            // Initialize the admin panel for THIS campaign.
            setupCampaignAdmin(val);

            document.getElementById("campaignAdminUI").hidden = false;
        });
    }

    a.dataset.id = val.id;
    a.dataset.personalMessage = "true";

    a.addEventListener("click", handleSidebarClick);

    return fragment;
}

export async function renderChat(id, conversation = false) {

    const renderId = ++ state.chatRenderGeneration;

    chatUI.hidden = false;

    // Set these BEFORE doing the async Firebase request.
    state.activeChat = id;

    if (conversation) {
        state.activeFeature = "conversation";
        state.activeFeatureType = "conversation";

        // Make sure the realtime listener exists.
        listenToConversation(id);
    } else {
        state.activeFeature = id;
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
        if (state.activeChat === id) {
            mainContentArea.innerHTML =
                "<p>Could not load this conversation.</p>";
        }

        return;
    }

    // A different chat was selected while Firebase was loading.
    // Do NOT allow the old request to overwrite the new chat.
    if (
        renderId !== state.chatRenderGeneration ||
        state.activeChat !== id
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
    mainContentArea.scrollTop = mainContentArea.scrollHeight;
}

export async function renderTool(id) {
    chatUI.hidden = true;

    // FIXED: Reset visibility states so buttons don't bleed across different tool pages
    document.getElementById("board-new").hidden = true;
    document.getElementById("userPermsUI").hidden = true;

    const toolData = getFeatureById(id)
    const BOARD_COUNT = 15

    switch (toolData.toolType) {
        case ("board"):
            let boards;
            if (state.permissions.includes("officer")) {
                document.getElementById("board-new").hidden = false;
            }

            if (state.ss_TOOLS.get(id)) {
                boards = state.ss_TOOLS.get(id)
            } else {
                boards = await FirebaseUtils.getDocuments(`features/${id}/boards`, BOARD_COUNT)
                state.ss_TOOLS.set(id, boards)
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
                    "creator": state.user.uid,
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
                        { field: "creator", value: state.user.uid }
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
           break 
        }
}

const toggleButton = document.getElementById("toggle-btn")

toggleButton.addEventListener("click", (event) => {
    sidebar.classList.toggle("close")
    toggleButton.classList.toggle("rotate")
    Array.from(sidebar.getElementsByClassName("show")).forEach((ul) => {
        ul.classList.remove("show")
        ul.previousElementSibling.classList.remove("rotate")
    })
})
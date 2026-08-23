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

//////////////////////////////////////////////////////////////////////
/////////////////////////SITE UTILS///////////////////////////////////
//////////////////////////////////////////////////////////////////////

async function checkUserManifest() {
    const localUserManifestTimestamp = Number(localStorage.getItem("userManifestTimestamp")) || 0;
    const member_manifestTimestampData = await FirebaseUtils.getDocument("/users/userManifestTimestamp/");
    const member_manifestTimestamp = Number(member_manifestTimestampData?.timestamp) || 0;
    if (userManifest === null || member_manifestTimestamp > localUserManifestTimestamp) {
        const rawData = await FirebaseUtils.getDocument("/users/userManifest");
        localStorage.setItem("userManifestTimestamp", String(member_manifestTimestamp));
        if (rawData) {
            userManifest = rawData.manifest;
        } else {
            userManifest = []
        }
    }

    const localGuestManifestTimestamp = Number(localStorage.getItem("guestManifestTimestamp")) || 0;
    const guest_manifestTimestampData = await FirebaseUtils.getDocument("/users/guestManifestTimestamp/");
    const guest_manifestTimestamp = Number(guest_manifestTimestampData?.timestamp) || 0;
    if (guestManifest === null || guest_manifestTimestamp > localGuestManifestTimestamp || !localStorage.getItem("guestManifest")) {
        const rawData = await FirebaseUtils.getDocument("/users/guestManifest");
        localStorage.setItem("guestManifestTimestamp", String(guest_manifestTimestamp));
        if (rawData) {
            guestManifest = rawData.manifest;
        } else {
            guestManifest = []
        }
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
        const noisePerms = tokens.claims
        const firebaseNoise = ["name", "picture", "iss", "aud", "auth_time", "user_id", "sub", "iat", "exp", "email", "email_verified", "firebase"]

        const cleanPerms = Object.keys(noisePerms)
            .filter(key => !firebaseNoise.includes(key))
            .reduce((obj, key) => {
                obj[key] = noisePerms[key];
                return obj;
            }, {});
        permissions = Object.keys(cleanPerms)

        await getMyFeatures()
    }
}
checkUser()

//////////////////////////////////////////////////////////////////////
/////////////////////////PAGE RENDERING///////////////////////////////
//////////////////////////////////////////////////////////////////////


function newFeatureButton(val) {
    const template = document.getElementById("sidebarTemplate")
    let fragment = template.content.cloneNode(true)
    const a = fragment.querySelector('.nav-btn')
    const text = fragment.querySelector('.sidebarText')
    const icon = fragment.querySelector(".ra")

    text.innerText = val.name
    if (val.icon && val.icon.trim() !== "") {
        icon.classList.add(val.icon.trim())
    }
    if (val.tooltip) {
        a.title = val.tooltip
    }
    a.dataset.id = val.id
    a.dataset.personalMessage = true

    a.addEventListener("click", handleSidebarClick)


    return fragment
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
                const campaignInfo = await FirebaseUtils.getDocument(`/features/${campaign.id}`)
                campaignInfo.id = campaign.id
                myFeatures.push(campaignInfo)
                ss_CAMPAIGNS.set(campaign.id, campaignInfo)
                const fragment = newFeatureButton(campaignInfo)
                document.getElementById("personal-menu").prepend(fragment)
                myFeatures.push(campaign)
            })
        }
        const myPersonalMessages = await FirebaseUtils.getDocuments("/conversations", 10, null, { field: "users", value: user.uid })
        myPersonalMessages.forEach((val) => {
            const frag = newFeatureButton(val, () => {
                renderChat(val.id, true)
            })
            friendFriendsBtn.after(frag)
            myFeatures.push(val)
            FirebaseUtils.listenForNewDocInCollection(`/conversations/${val.id}/messages`, (data) => {
                if (data.uid === user.uid || val.id !== activeChat) return
                renderMessage(data)
            })
        })
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

    const key = findFriends_keyDropdown.value;

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

document.getElementById("findFriends-createConv").addEventListener("click", async () => {
    let chatIds = []
    let chatNames = []
    Array.from(document.getElementById("findFriends-selectedFriends").children).forEach((val) => {
        chatIds.push(val.dataset.id)
        chatNames.push(val.innerText)
    })
    chatIds.push(user.uid)
    let convObj = {
        name: document.getElementById("findFriends-convName").value,
        users: chatIds,
        type: "conversation",
        tooltip: `Conversation with ${chatNames.join(", ")}.`
    }
    const convData = await FirebaseUtils.addDocument("/conversations", convObj)


    const frag = newFeatureButton(convData)

    friendFriendsBtn.after(frag)

})



function handleSidebarClick(event) {
    event.preventDefault()
    const targetAnchor = event.target.closest('.nav-btn')
    if (!targetAnchor) return
    const clickedLi = targetAnchor.parentElement
    if (clickedLi === currentSelectedSidebar) return

    const idVal = targetAnchor.dataset.id
    const pageData = getFeatureById(idVal)

    if (!pageData) return

    // Cleaned up class toggling
    if (currentSelectedSidebar) {
        currentSelectedSidebar.classList.remove("active")
    }

    clickedLi.classList.add("active")
    currentSelectedSidebar = clickedLi

    mainContentArea.replaceChildren();
    loadSidebar(pageData)
}

const campaignUI = document.getElementById("campaignUI")
function hideFeatureHTML() {
    Array.from(document.getElementsByClassName("featureHTML")).forEach((val) => { val.hidden = true })
}

async function loadSidebar(data) {
    hideFeatureHTML()
    activeFeatureType = data.type;
    mainContentArea = document.getElementById("mainContentArea")
    mainContentArea.innerHTML = ""
    switch (data.type) {
        case "tool":
            activeFeature = data.id;
            renderTool(data.id)
            break;

        case "chat":
            await renderChat(data.id)
            break;
        case "campaign":
            campaignUI.hidden = false;
            mainContentArea.appendChild(campaignUI)
            mainContentArea = campaignUI
            renderChat(data.id)
            break
        case "conversation":
            activeChat = data.id
            await renderChat(data.id, true)
            break
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

async function renderChat(id, conversation = false) {
    chatUI.hidden = false;
    activeChat = id;
    const dir = conversation ? "conversations" : "features"
    if (conversation) {
        activeFeature = "conversation"
    }
    const messages = await FirebaseUtils.getDocuments(`/${dir}/${id}/messages`, 50)
    activeChat = id

    if (messages.length === 0) {
        mainContentArea.innerHTML = `<h3>No Messages</h3>`
        return
    }
    messages.forEach((val) => {
        renderMessage(val)
    });
}

function renderMessage(data) {
    const isMine = (user && data.uid === user.uid) ? "mine" : "notMine";

    const displayName = data.username || data.name;
    const parsedContent = marked.parse(data.content);
    const htmlText = `
        <div class="message ${isMine}">
            <strong><p>${displayName}:</p></strong>
            <div>${parsedContent}</div>
        </div>
        `;
    const messageEl = document.createElement("div")
    if (!ss_CHATS.get(currentSelectedSidebar)) {
        mainContentArea.innerHTML = ""
        ss_CHATS.set(currentSelectedSidebar, [data])
    } else {
        ss_CHATS.get(currentSelectedSidebar).push(data)
    }
    messageEl.innerHTML = htmlText
    mainContentArea.insertAdjacentHTML('beforeend', htmlText);
}

async function handleChatMesage() {
    if (activeChat === null) return

    const markdownContent = messageInput.getMarkdown();
    if (markdownContent.trim() === "") return

    const messageTxt = markdownContent ?? messageInput.getText()

    const cleared = await fetchServer("checkMessage", { message: messageTxt })

    if (!cleared.clean) {
        alert("Inapropiate content found in message. \nPlease try again with appropiate lanuage.")
        return
    }


    const sendData = {
        content: messageTxt,
        username: user.name,
        uid: user.uid,
        timestamp: Date.now()
    }

    messageInput.commands.clearContent();
    if (!ss_CHATS.get(activeChat)) {
        ss_CHATS.set(activeChat, [sendData])
    } else {
        ss_CHATS.get(activeChat).push(sendData)
    }
    renderMessage(sendData)
    const dir = activeFeature === "conversation" ? "conversations" : "features"
    await FirebaseUtils.addDocument(`${dir}/${activeChat}/messages`, sendData)

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

    let docs = null;

    switch (searchUserDropdown.value) {

        case "searchName":

            if (
                searchTermInput.value === undefined ||
                searchTermInput.value.trim() === ""
            ) {
                alert("No search term provided");
                return;
            }

            docs = await FirebaseUtils.getDocumentFieldIncludes(
                "/users",
                "Real Name",
                searchTermInput.value
            );

            break;

        case "notAllowed":

            // allowed is no longer stored in Firestore,
            // so this search is handled through the backend.
            docs = await fetchServer("getNotAllowedUsers", {});

            if (!Array.isArray(docs)) {
                alert(docs?.error || "Failed to find users.");
                return;
            }

            break;
    }

    mainContentArea.replaceChildren();

    if (!docs || docs.length === 0) {
        const newP = document.createElement("p");

        newP.innerText =
            "No Person Found with name " +
            searchTermInput.value +
            ".";

        mainContentArea.appendChild(newP);
        return;
    }

    const searchedTemplate =
        document.getElementById("userSearchTemplate");

    for (const val of docs) {

        const searchedRes =
            searchedTemplate.content.cloneNode(true);

        const userUID = val.id;

        /*
         * Get authorization information from Firebase Auth.
         * This is intentionally done through the backend because
         * custom claims cannot be read for arbitrary users from
         * the client Firebase SDK.
         */
        const claimsResponse = await fetchServer(
            "getUserClaims",
            { uid: userUID }
        );

        if (!claimsResponse || claimsResponse.error) {
            console.error(
                `Could not retrieve claims for ${userUID}:`,
                claimsResponse?.error
            );

            continue;
        }

        const userClaims = claimsResponse.claims || {};

        const existingPermissions =
            Array.isArray(userClaims.permissions)
                ? userClaims.permissions
                : [];

        const existingAllowed =
            userClaims.allowed === true;

        /*
         * Copy the current state into the local update object.
         * This is important because saving without changing a
         * field should preserve its current value.
         */
        currentSearchUpdates[userUID] = {
            allowed: existingAllowed,
            permissions: [...existingPermissions]
        };

        searchedRes.querySelector(".searched-Name").innerText =
            val["Real Name"];

        /*
         * Display permissions
         */
        const rolesText =
            existingPermissions.length > 0
                ? existingPermissions.join(", ") + "."
                : "None.";

        searchedRes.querySelector(".searched-roles").innerText =
            rolesText;

        /*
         * Allowed
         */
        const allowedEl =
            searchedRes.querySelector(".searched-allowed");

        allowedEl.value = String(existingAllowed);

        /*
         * Dues are still Firestore data, so this stays unchanged.
         */
        const duesEl =
            searchedRes.querySelector(".searched-dues-paid");

        duesEl.value = String(val.duesPaid);

        /*
         * Allowed change
         */
        allowedEl.addEventListener("change", (event) => {

            const value = event.target.value;

            currentSearchUpdates[userUID].allowed =
                value.toLowerCase() === "true";

        });

        /*
         * Permission selector
         */
        const selectNewPerms =
            searchedRes.querySelector(".searched-addRole-val");

        /*
         * Revoke permission
         */
        searchedRes
            .querySelector(".searched-revokeRole-btn")
            .addEventListener("click", () => {

                const removeVal = selectNewPerms.value;

                currentSearchUpdates[userUID].permissions =
                    currentSearchUpdates[userUID].permissions.filter(
                        role => role !== removeVal
                    );

                /*
                 * Update the displayed permissions immediately.
                 */
                searchedRes
                    .querySelector(".searched-roles")
                    .innerText =
                    currentSearchUpdates[userUID].permissions.length > 0
                        ? currentSearchUpdates[userUID].permissions.join(", ") + "."
                        : "None.";
            });

        /*
         * Add permission
         */
        searchedRes
            .querySelector(".searched-addRole-btn")
            .addEventListener("click", () => {

                const addVal = selectNewPerms.value;

                if (
                    addVal &&
                    !currentSearchUpdates[userUID].permissions.includes(addVal)
                ) {
                    currentSearchUpdates[userUID].permissions.push(addVal);
                }

                /*
                 * Update the displayed permissions immediately.
                 */
                searchedRes
                    .querySelector(".searched-roles")
                    .innerText =
                    currentSearchUpdates[userUID].permissions.length > 0
                        ? currentSearchUpdates[userUID].permissions.join(", ") + "."
                        : "None.";
            });

        /*
         * Save
         */
        searchedRes
            .querySelector(".searched-save")
            .addEventListener("click", async () => {

                const update =
                    currentSearchUpdates[userUID];

                console.log("Saving claims:", update);

                const response = await fetchServer(
                    "setPermissions",
                    {
                        uid: userUID,
                        allowed: update.allowed,
                        permissions: update.permissions
                    }
                );

                if (!response || response.error) {
                    alert(
                        response?.error ||
                        "Failed to update permissions."
                    );
                    return;
                }

                FirebaseUtils.ALog(
                    "Change Permissions",
                    {
                        officer: user.uid,
                        updated_user: userUID,
                        data: JSON.stringify(update),
                        time: new Date().toLocaleString()
                    }
                );

                /*
                 * Keep the current state in the UI rather than
                 * immediately throwing it away.
                 */
                currentSearchUpdates[userUID] = {
                    allowed: update.allowed,
                    permissions: [...update.permissions]
                };

                alert("Permissions updated.");
            });

        mainContentArea.appendChild(searchedRes);
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
    centerSplitScreen();
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


async function fetchServer(endpoint, postData) {
    const popup = document.getElementById("loading-popup");
    const token = await firebaseUser.getIdToken();
    const link = `https://the-tavern-backend.onrender.com/${endpoint}`;

    const headers = { Authorization: `Bearer ${token}` };
    if (postData) {
        headers["Content-Type"] = "application/json";
    }

    const options = {
        method: postData ? "POST" : "GET",
        headers: headers,
        ...(postData && { body: JSON.stringify(postData) })
    };

    // Step 1: Fast check to see if the server is awake
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    try {
        const response = await fetch(link, { ...options, signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        return await response.json();
    } catch (err) {
        if (err.name === "AbortError") {
            if (popup) popup.hidden = false;

            try {
                const response = await fetch(link, options);
                if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
                return await response.json();
            } finally {
                // Ensure popup hides once finished (success or fail)
                if (popup) popup.hidden = true;
            }
        }
        throw err;
    }
}


/*
console.log(`
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣠⣤⣶⣶⣶⣶⣶⣶⣶⣤⣤⣤⣤⣄⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⣴⡶⠟⠛⠉⠛⠛⠉⠙⠿⢛⣫⣽⣿⣿⣿⣿⣿⣿⣷⣦⣄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⢀⣠⣶⡿⠛⠉⠀⠀⢀⠀⠀⠀⠀⢀⣾⣿⠿⢛⣭⣿⣿⣿⣿⣿⣿⣿⣿⣷⣄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⢀⣴⣿⣿⣁⣤⡶⠂⣠⣴⠏⠀⠀⠤⠾⠟⠋⢁⣀⣛⣛⣻⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣶⣤⡀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⢠⣾⣿⣿⣿⣿⣿⣿⣟⣭⡞⠀⠀⠀⠀⠀⠀⠀⠙⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡦⢹⣦⡀⠀⠀⠀⠀
⠀⠀⠀⠀⣰⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣀⣀⠀⠀⠀⠀⠀⠀⠀⠀⠉⣽⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡟⣿⣿⣷⡄⠀⠀⠀
⠀⠀⠀⣰⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣦⣀⠀⠀⠀⠀⠀⠀⠀⢘⣿⣿⣿⣿⣿⡿⠿⠿⠿⠿⣿⣿⢟⣿⣿⣿⣿⠀⠀⠀
⠀⠀⢠⣿⣿⣿⣿⣿⢿⣿⡿⢿⣿⣿⣿⣿⣿⣿⣿⣿⣷⣶⣶⣶⣾⠿⠿⠛⠛⠉⠁⠀⠀⠀⠀⠀⠀⠈⣻⣦⣿⣿⣿⣿⡆⠀⠀
⠀⠀⣿⣿⣿⣿⣿⠏⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢹⣿⣿⣿⣿⣿⣷⠀⠀
⠀⠀⣿⣿⣿⣿⣿⠀⠀⠀⢀⣄⣀⣀⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠐⠒⠒⠂⠀⣀⣀⣀⣀⣀⠀⠀⠘⣿⣿⣿⣿⣿⣿⠀⠀
⠀⠀⣿⣿⣿⣿⠇⠀⠀⣠⠤⢤⣤⣀⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣠⠤⠴⠒⠛⢉⣉⡥⠤⠶⠬⣽⡢⠀⡘⣿⣿⣿⣿⣿⠀⠀
⠀⠀⣿⣿⣿⣿⠀⠀⠀⣠⡶⠶⠶⠤⣍⡙⠓⠶⢤⣄⣀⡀⠀⠀⠀⢀⣀⡤⠶⠚⢉⡤⠖⠋⢉⠓⠢⠙⠂⠸⣿⣿⣿⣿⡏⠀⠀
⢀⣀⣸⣿⣿⣿⠀⠀⠀⣥⣾⣷⣦⣄⡀⠉⠓⠲⢤⣀⠈⠉⠉⠉⠉⠉⠀⠀⠀⠀⢀⣠⣴⣾⣿⣿⣶⣄⠀⠀⢻⣿⣿⣿⣷⡦⡀
⢻⣧⡉⢿⣿⡏⠀⠀⣼⠟⠉⠙⠛⠿⣿⣷⣦⡀⠀⠈⠑⠀⠀⠀⠀⠀⠀⠀⣠⣶⣿⠿⠛⠉⠈⠉⠉⠻⡄⠀⠘⣿⣿⡿⢿⣷⡷
⠘⣿⡇⠸⣿⡇⠀⢠⡏⠀⠀⣠⠴⢶⣦⣌⡙⠻⢷⣄⠀⣀⣀⡀⣀⡬⣦⠾⠋⢁⣠⣶⣚⣻⣓⠲⣄⠀⠱⠀⠀⣿⣿⠖⢠⣿⠃
⠀⠘⣿⠀⣿⡇⠀⠈⠀⢀⣘⣿⠋⣽⣿⣿⠻⣶⣄⠈⢧⡀⠀⠀⠁⢀⣿⠀⣴⡿⢋⣿⣸⣶⠉⣷⣬⡀⠀⠀⠀⢿⡟⠀⣴⠁⠀
⠀⠀⠸⡇⠘⠃⠀⠀⠀⠀⡛⢯⣀⠻⠿⢟⣀⣾⠿⠂⠞⢳⡀⠀⠀⣿⣟⠈⠛⠃⣄⣛⣛⣋⣠⠵⢋⠀⠀⠀⠀⠀⣧⢸⡇⠀⠀
⠀⠀⠀⣷⠴⡇⠀⠀⣠⠴⠿⣷⣾⣷⣿⣛⣉⠁⠀⠀⠀⢸⡆⠀⠀⠈⠀⠀⠀⠀⠻⢶⣶⣶⡶⠶⠯⠝⠀⠀⠀⢰⠙⣾⠀⠀⠀
⠀⠀⠀⣧⠀⠑⠀⣸⠁⠀⠀⠀⠀⠀⠀⠉⠁⠀⢀⣀⠀⣼⡧⠀⠀⠀⠀⣤⣀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢰⡟⢁⡏⠀⠀⠀
⠀⠀⠀⠻⣆⣀⣴⡏⠀⠀⠀⠀⠀⠀⠀⠀⣠⣾⠏⠉⠙⠏⠀⠀⠀⠀⠀⠛⠈⢹⣷⣄⠀⠀⠀⠀⠀⠓⠀⠀⢸⣧⠜⠁⠀⠀⠀
⠀⠀⠀⠀⠈⠉⢸⣇⠀⠀⠀⠀⠀⠀⢠⡾⠟⠙⢆⡀⠀⠀⠀⠀⠀⠀⠀⠀⣠⣼⠛⠛⠷⣄⡀⠀⠀⠀⠀⠀⣾⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⢸⣿⡇⠀⢀⠀⠀⢰⣏⠀⠀⠀⠀⠉⠛⠳⢦⣀⠀⢀⡴⠛⠋⠀⠀⠀⠀⠀⠉⠢⡀⠀⠀⠀⣿⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⢸⢻⡇⠀⢸⡇⠀⠀⠹⢤⣄⣀⠀⠀⠀⠀⠀⠙⠟⠋⠀⠀⠀⣀⡤⠖⠛⠳⠀⠀⠉⣲⠀⢸⠇⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⢸⡌⢷⡀⠀⢿⡄⠀⠀⠀⠀⢯⡛⢶⡲⠦⠤⠤⡤⠤⠴⠒⢋⡅⠀⠀⠀⠀⠀⠀⢠⠏⢠⡟⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠘⣧⠀⠻⣦⡀⠻⣶⡄⠀⠀⠀⠙⠦⣤⣄⣀⣀⣀⣠⡤⠾⠋⠀⠀⠀⠀⠀⠀⣠⠏⡰⠋⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠙⣧⡀⠈⠻⣦⡈⣿⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⣾⠷⠋⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠈⠛⢷⣦⣜⣿⣿⣿⣄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣤⣾⠟⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠛⠿⢿⣿⣿⣿⣦⣤⣤⣀⣀⣀⣀⣀⣠⣤⣴⣾⡿⠟⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠉⠙⠛⠛⠛⠻⠿⠿⠿⠛⠛⠋⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀`)
console.log(`I can see you`)*/


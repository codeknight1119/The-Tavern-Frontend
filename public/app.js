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
    const member_manifestTimestampData = await FirebaseUtils.getDocument("/manifest/userManifestTimestamp/");
    const member_manifestTimestamp = Number(member_manifestTimestampData?.timestamp) || 0;
    if (userManifest === null || member_manifestTimestamp > localUserManifestTimestamp) {
        const rawData = await FirebaseUtils.getDocument("/manifest/userManifest");
        localStorage.setItem("userManifestTimestamp", String(member_manifestTimestamp));
        if (rawData) {
            userManifest = rawData.manifest;
        } else {
            userManifest = []
        }
    }
    console.log("userManifest", userManifest)

    const localGuestManifestTimestamp = Number(localStorage.getItem("guestManifestTimestamp")) || 0;
    const guest_manifestTimestampData = await FirebaseUtils.getDocument("/manifest/guestManifestTimestamp/");
    const guest_manifestTimestamp = Number(guest_manifestTimestampData?.timestamp) || 0;
    if (guestManifest === null || guest_manifestTimestamp > localGuestManifestTimestamp || !localStorage.getItem("guestManifest")) {
        const rawData = await FirebaseUtils.getDocument("/manifest/guestManifest");
        localStorage.setItem("guestManifestTimestamp", String(guest_manifestTimestamp));
        if (rawData) {
            guestManifest = rawData.manifest;
        } else {
            guestManifest = []
        }
    }
    console.log("guestManifest", guestManifest)
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
                const campaignInfo = await FirebaseUtils.getDocument(`/campaigns/${campaign.id}`)
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
            await renderCampaign(data.id)
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
                const...
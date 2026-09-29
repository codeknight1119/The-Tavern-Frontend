import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import { Editor } from 'https://esm.sh/@tiptap/core';
import StarterKit from 'https://esm.sh/@tiptap/starter-kit';
import { Markdown } from 'https://esm.sh/@tiptap/markdown';
import { FirebaseUtils } from "../firebaseUtils.js";
import {state} from "./state.js"
import {fetchServer} from "./backend.js"
import {mainContentArea, sidebar} from "./dom.js"


function setChatSendLocked(chatId, locked) {
    // Only modify the currently displayed chat.
    if (chatId !== state.activeChat) return;

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

const chatUI = document.getElementById("chatTools")
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

function renderMessage(data) {
    // Don't render messages if we don't currently have a chat.
    if (!state.activeChat) return;

    const isMine =
        user && data.uid === state.user.uid
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
    if (!state.ss_CHATS.has(state.activeChat)) {
        state.ss_CHATS.set(state.activeChat, []);
    }

    state.ss_CHATS.get(state.activeChat).push(data);

    mainContentArea.insertAdjacentHTML(
        "beforeend",
        htmlText
    );
}

async function handleChatMesage() {

    if (!state.activeChat) return;

    const chatId = state.activeChat;

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
            username: state.user.name,
            uid: state.user.uid,
            timestamp: Date.now()
        };

        // Clear input only after moderation succeeds.
        messageInput.commands.clearContent();

if (state.activeChat !== chatId) {
    console.warn(
        "Chat changed while sending message. " +
        "Not rendering optimistic message."
    );
} else {
    renderMessage(sendData);
}

const dir =
    state.activeFeature === "conversation"
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
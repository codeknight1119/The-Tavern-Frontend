import {checkUserManifest} from "public/codeModules/campaign.js"

document.getElementById("campaignAdmin-close").addEventListener("click", () => {
    document.getElementById("campaignAdminUI").hidden = true;
});

function validateCampaignIcon(icon) {
    icon = icon.trim();

    if (!/^ra-[a-z0-9-]+$/.test(icon)) {
        return false;
    }

    // ra-2x, ra-3x, etc. are size modifiers, not icons.
    if (/^ra-\d+x$/.test(icon)) {
        return false;
    }

    const testIcon = document.createElement("i");
    testIcon.className = `ra ${icon}`;

    testIcon.style.position = "absolute";
    testIcon.style.visibility = "hidden";
    testIcon.style.pointerEvents = "none";

    document.body.appendChild(testIcon);

    let content = "";

    try {
        content = getComputedStyle(
            testIcon,
            "::before"
        ).content;
    } catch (error) {
        console.error("Could not validate RPG Awesome icon:", error);
    }

    testIcon.remove();

    return (
        content &&
        content !== "none" &&
        content !== "normal" &&
        content !== '""'
    );
}


function updateCampaignAdminIconPreview() {
    const input = document.getElementById(
        "campaignAdmin-iconInput"
    );

    const preview = document.getElementById(
        "campaignAdmin-iconPreview"
    );

    const status = document.getElementById(
        "campaignAdmin-iconStatus"
    );

    const saveButton = document.getElementById(
        "campaignAdmin-saveIcon"
    );

    const icon = input.value.trim();

    preview.className = "ra ra-2x";
    preview.style.color = "var(--accent-clr)";

    if (!icon) {
        status.textContent = "Enter an icon name.";
        saveButton.disabled = true;
        return false;
    }

    if (!validateCampaignIcon(icon)) {
        status.textContent =
            "That is not a valid RPG Awesome icon.";

        saveButton.disabled = true;
        return false;
    }

    preview.classList.add(icon);

    status.textContent = "Valid RPG Awesome icon.";
    saveButton.disabled = false;

    return true;
}

async function searchCampaignAdminUsers() {
    const input = document.getElementById(
        "campaignAdmin-search"
    );

    const searchBy = document.getElementById(
        "campaignAdmin-searchBy"
    );

    const output = document.getElementById(
        "campaignAdmin-foundUsers"
    );

    const searchTerm = input.value.trim().toLowerCase();

    output.replaceChildren();

    if (!searchTerm) {
        return;
    }

    await checkUserManifest();

    const key = searchBy.value || "name";

    const results = state.userManifest.filter((item) => {
        if (!item || item.id === state.user.uid) {
            return false;
        }

        const value = String(
            item[key] || ""
        ).toLowerCase();

        return value.includes(searchTerm);
    });

    if (results.length === 0) {
        const notFound = document.createElement("p");
        notFound.textContent =
            `Could not find "${searchTerm}"`;

        output.appendChild(notFound);
        return;
    }

    results.forEach((result) => {
        const row = document.createElement("div");

        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.gap = "8px";
        row.style.marginBottom = "8px";

        const name = document.createElement("span");

        name.textContent =
            `${result.name || ""} (${result["Real Name"] || ""})`;

        const addButton = document.createElement("button");

        addButton.textContent = "Add to Campaign";

        addButton.addEventListener("click", async () => {
            if (!state.activeCampaignAdminId) {
                return;
            }

            addButton.disabled = true;

            try {
                const response = await fetchServer(
                    "campaignAdmin",
                    {
                        action: "addUser",
                        campaignId: state.activeCampaignAdminId,
                        userId: result.id
                    }
                );

                const status = document.getElementById(
                    "campaignAdmin-status"
                );

                if (response.alreadyAdded) {
                    status.textContent =
                        `${result.name} already has access to this campaign.`;
                } else {
                    status.textContent =
                        `${result.name} was added to the campaign.`;
                }

            } catch (error) {
                console.error(
                    "Failed to add campaign user:",
                    error
                );

                document.getElementById(
                    "campaignAdmin-status"
                ).textContent =
                    "Could not add that user.";
            } finally {
                addButton.disabled = false;
            }
        });

        row.append(name, addButton);
        output.appendChild(row);
    });
}

const campaignUI = document.getElementById("campaignUI")

function setupCampaignAdmin(campaign) {
    const adminUI = document.getElementById(
        "campaignAdminUI"
    );

    if (!adminUI) {
        console.error(
            "campaignAdminUI was not found in the document."
        );
        return;
    }

    state.activeCampaignAdminId = null;
    adminUI.hidden = true;

    // Only a campaign membership explicitly marked DM gets
    // campaign administration controls.
    if (!campaign || campaign.DM !== true) {
        return;
    }

    state.activeCampaignAdminId = campaign.id;

    const iconInput = document.getElementById(
        "campaignAdmin-iconInput"
    );

    const previewButton = document.getElementById(
        "campaignAdmin-previewIcon"
    );

    const saveIconButton = document.getElementById(
        "campaignAdmin-saveIcon"
    );

    const searchButton = document.getElementById(
        "campaignAdmin-searchBtn"
    );

    const searchInput = document.getElementById(
        "campaignAdmin-search"
    );

    const status = document.getElementById(
        "campaignAdmin-status"
    );

    if (
        !iconInput ||
        !previewButton ||
        !saveIconButton ||
        !searchButton ||
        !searchInput ||
        !status
    ) {
        console.error(
            "Campaign admin UI is missing one or more required elements."
        );
        return;
    }

    const existingIcon =
        campaign.icon || "ra-dragon";

    iconInput.value = existingIcon;

    status.textContent = "";

    updateCampaignAdminIconPreview();

    previewButton.onclick = () => {
        updateCampaignAdminIconPreview();
    };

    iconInput.oninput = () => {
        updateCampaignAdminIconPreview();
    };

    saveIconButton.onclick = async () => {
        if (!state.activeCampaignAdminId) {
            return;
        }

        if (!updateCampaignAdminIconPreview()) {
            return;
        }

        const icon = iconInput.value.trim();

        saveIconButton.disabled = true;
        status.textContent = "Saving campaign icon...";

        try {
            const response = await fetchServer(
                "campaignAdmin",
                {
                    action: "updateIcon",
                    campaignId: state.activeCampaignAdminId,
                    icon
                }
            );

            campaign.icon = response.icon;

            state.ss_CAMPAIGNS.set(
                state.activeCampaignAdminId,
                campaign
            );

            // Update the icon shown in My Pack.
            const sidebarButton = document.querySelector(
                `.nav-btn[data-id="${CSS.escape(state.activeCampaignAdminId)}"]`
            );

            if (sidebarButton) {
                const sidebarIcon =
                    sidebarButton.querySelector("i");

                if (sidebarIcon) {
                    sidebarIcon.className =
                        `ra ra-2x ${response.icon}`;
                }
            }

            status.textContent =
                "Campaign icon updated.";

        } catch (error) {
            console.error(
                "Failed to update campaign icon:",
                error
            );

            status.textContent =
                "Could not update the campaign icon.";

            updateCampaignAdminIconPreview();

        } finally {
            saveIconButton.disabled =
                !validateCampaignIcon(iconInput.value.trim());
        }
    };

    searchButton.onclick =
        searchCampaignAdminUsers;

    searchInput.onkeydown = (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            searchCampaignAdminUsers();
        }
    };
}

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

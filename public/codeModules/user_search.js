import { FirebaseUtils } from "../firebaseUtils.js";
import {state} from "./state.js"
import {checkUserManifest} from "./userManifest.js"
import {fetchServer} from "./backend.js"
import {mainContentArea} from "./dom.js"


const searchUserDropdown = document.getElementById("filterDropdown")
const searchTermInput = document.getElementById("searchTermIn")
let currentSearchUpdates = {}

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

                docs = state.userManifest.filter(entry => {
                    const realName = String(entry["Real Name"] || "").toLowerCase();
                    return realName.includes(searchTerm);
                });

                break;
            }

            case "notAllowed": {

                console.log("Requesting not allowed users...");
                document.getElementById("helpTextUserPerms").innerText = "Loading..."

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
                                    officer: state.user.uid,
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


searchUserDropdown.addEventListener("change", (event) => {
    const selectedValue = event.target.value;
    if (selectedValue === "searchName") {
        searchTermInput.hidden = false
    } else {
        searchTermInput.hidden = true
    }
})
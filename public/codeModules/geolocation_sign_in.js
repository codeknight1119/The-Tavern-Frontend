import {signInFromSite} from "./roleCall.js";
import {state} from "./state.js";

async function checkLocationPermission() {
  if (!navigator.permissions) {
    console.log("Permissions API is not supported.");
    return;
  }

  try {
    const permissionStatus = await navigator.permissions.query({
      name: "geolocation"
    });

    handleStateChange(permissionStatus.state);
    permissionStatus.onchange = () => handleStateChange(permissionStatus.state);
  } catch (error) {
    console.error("Error checking geolocation permission:", error);
  }
}

function handleStateChange(permissionState) {
  const popup = document.getElementById("geolocation-popup");
  if (popup) popup.hidden = permissionState !== "prompt";
}

function getLocalDateKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function getCurrentUserKey() {
  const user = state.user;
  const identity = state.firebaseUser?.uid ||
    (user ? `${user.realFirstName || user.firstName || ""} ${user.realLastName || user.lastName || ""}`.trim().toLowerCase() : "");

  return identity ? `tavern-site-sign-in:${identity}:${getLocalDateKey()}` : null;
}

function hasSignedInToday() {
  const key = getCurrentUserKey();
  if (!key) return false;

  try {
    return localStorage.getItem(key) === "true";
  } catch (error) {
    console.error("Could not read today's sign-in status from local storage:", error);
    return false;
  }
}

export function checkSignIn() {
  const now = new Date();
  const day = now.getDay();
  const timeStart = new Date(now);
  timeStart.setHours(10, 0, 0, 0);
  const timeEnd = new Date(now);
  timeEnd.setHours(12, 30, 0, 0);

  if (
    (day === 1 || day === 5) &&
    now >= timeStart &&
    now <= timeEnd &&
    !hasSignedInToday()
  ) {
    signInPopup.hidden = false;
    signInBttn.hidden = false;
    signInBttn.disabled = false;
    waitSignIn.hidden = true;
  } else {
    signInPopup.hidden = true;
  }
}

const signInPopup = document.getElementById("signIn-popup");
const signInBttn = document.getElementById("signIn-bttn");
const waitSignIn = document.getElementById("signIn-wait");
const cancelSignIn = document.getElementById("signIn-cancel");

cancelSignIn.addEventListener("click", () => {
  signInPopup.hidden = true;
});

signInBttn.addEventListener("click", async () => {
  const storageKey = getCurrentUserKey();

  if (!storageKey) {
    waitSignIn.hidden = false;
    waitSignIn.innerText = "Please sign in to The Tavern first, then try again.";
    return;
  }

  try {
    if (localStorage.getItem(storageKey) === "true") {
      waitSignIn.hidden = false;
      waitSignIn.innerText = "You have already signed in today.";
      signInBttn.hidden = true;
      return;
    }
  } catch (error) {
    console.error("Could not check today's sign-in status:", error);
  }

  waitSignIn.hidden = false;
  waitSignIn.innerText = "Please wait...";
  signInBttn.disabled = true;

  try {
    const result = await signInFromSite();

    if (result?.success) {
      try {
        localStorage.setItem(storageKey, "true");
      } catch (error) {
        console.error("Could not save today's sign-in status:", error);
      }

      waitSignIn.innerText = "Signed in! You can close this window.";
      cancelSignIn.innerText = "Close";
      signInBttn.hidden = true;
    } else {
      waitSignIn.innerText = result?.error || "Sign-in failed. Please try again.";
      signInBttn.disabled = false;
    }
  } catch (error) {
    console.error("Sign-in failed:", error);
    waitSignIn.innerText = "Sign-in failed. Please try again.";
    signInBttn.disabled = false;
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const popup = document.getElementById("geolocation-popup");
  const allowBtn = document.getElementById("geolocation_allow");
  const denyBtn = document.getElementById("geolocation_deny");

  if (allowBtn) {
    allowBtn.addEventListener("click", () => {
      if (!navigator.geolocation) {
        alert("Geolocation is not supported by this browser.");
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log("Location obtained:", position.coords);
          if (popup) popup.hidden = true;
          checkSignIn();
        },
        (error) => console.error("Could not obtain location:", error.message)
      );
    });
  }

  if (denyBtn) {
    denyBtn.addEventListener("click", () => {
      if (popup) popup.hidden = true;
      console.log("User declined the geolocation request.");
    });
  }

  checkLocationPermission();
});

import {signInFromSite} from "./roleCall.js"

let currentStatus = null;

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

    permissionStatus.onchange = () => {
      handleStateChange(permissionStatus.state);
    };
  } catch (error) {
    console.error("Error checking geolocation permission:", error);
  }
}

function handleStateChange(state) {
  currentStatus = state;

  const popup = document.getElementById("geolocation-popup");

  if (state === "prompt") {
    if (popup) popup.hidden = false;
  } else {
    if (popup) popup.hidden = true;
  }
}

function checkSignIn() {
    const now = new Date();
    const day = now.getDay();

    const timeStart = new Date(now);
    timeStart.setHours(10, 0, 0, 0);

    const timeEnd = new Date(now);
    timeEnd.setHours(12, 30, 0, 0);

    if (
        (day === 1 || day === 5) &&
        now >= timeStart &&
        now <= timeEnd
    ) {
        signInPopup.hidden = false;
        signInBttn.hidden = false;
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
    waitSignIn.hidden = false;
    signInBttn.disabled = true;

    try {
        const result = await signInFromSite();

        if (result?.success) {
            waitSignIn.innerText = "Signed in! Click to close window.";
            cancelSignIn.innerText = "Close";
            signInBttn.hidden = true;
        } else {
            waitSignIn.innerText =
                "Sign-in failed. Please try again.";
            signInBttn.disabled = false;
        }
    } catch (error) {
        console.error("Sign-in failed:", error);
        waitSignIn.innerText =
            "Sign-in failed. Please try again.";
        signInBttn.disabled = false;
    }
});

// Run when this module loads.
checkSignIn();
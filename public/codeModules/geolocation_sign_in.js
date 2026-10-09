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
    doSignIn()
  } else {
   // alert("Not time to sign in.");
  }
}

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
        (error) => {
          console.error("Could not obtain location:", error.message);
        }
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

const signInPopup = document.getElementById("signIn-popup")
const signInBttn = document.getElementById("signIn-bttn")
const waitSignIn = document.getElementById("signIn-wait")
const cancelSignIn = document.getElementById("signIn-wait")

cancelSignIn.addEventListener("click", ()=>{
    document.getElementById("signIn-popup").hidden = true;
})

signInBttn.addEventListener("click", ()=>{
    waitSignIn.hidden = false;
    await signInFromSite(); 
    cancelSignIn.innerText = `Signed in! \nClick to close window.`
    signInBttn.hidden = true;
})

function doSignIn(){
    signInBttn.hidden = false;
}
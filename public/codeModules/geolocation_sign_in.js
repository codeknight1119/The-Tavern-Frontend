let currentStatus = null;

async function checkLocationPermission() {
  if (!navigator.permissions) {
    console.log("Permissions API is not supported in this browser.");
    return;
  }

  try {
    const permissionStatus = await navigator.permissions.query({ name: 'geolocation' });
    console.log(`Geolocation permission state: ${permissionStatus.state}`);

    handleStateChange(permissionStatus.state);

    permissionStatus.onchange = () => {
      console.log(`Permission state changed to: ${permissionStatus.state}`);
      handleStateChange(permissionStatus.state);
    };
  } catch (error) {
    console.error("Error checking geolocation permission:", error);
  }
}

function handleStateChange(state) {
  currentStatus = state;
  const popup = document.getElementById("geolocation-popup");

  if (state === 'granted') {
    if (popup) popup.hidden = true;
    checkSignIn();
  } else if (state === 'prompt') {
    if (popup) popup.hidden = false;
  } else if (state === 'denied') {
    if (popup) popup.hidden = true;
    checkSignIn();
  }
}

function checkSignIn() {
  const now = new Date();
  const day = now.getDay(); // 1 = Monday, 5 = Friday
  const timeStart = new Date().setHours(14, 0, 0, 0);
  const timeEnd = new Date().setHours(15, 30, 0, 0);

  if ((day === 1 || day === 5) && (now >= timeStart && now <= timeEnd)) {
    alert("Sign in?");
  } else {
    alert("Not time to sign in.");
  }
}

// Attach the button listener once on load
document.addEventListener("DOMContentLoaded", () => {
  const allowBtn = document.querySelector("#geolocation-popup .geolocation_allow");
  if (allowBtn) {
    allowBtn.addEventListener("click", () => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          // Native browser permission granted; permissionStatus.onchange triggers automatically
        },
        (error) => {
          // Permission denied or dismissed
        }
      );
    });
  }
});

checkLocationPermission();
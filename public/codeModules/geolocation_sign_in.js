let currentStatus = null;

async function checkLocationPermission() {
  if (!navigator.permissions) {
    console.log("Permissions API is not supported in this browser.");
    return;
  }

  try {
    // Query the geolocation permission status
    const permissionStatus = await navigator.permissions.query({ name: 'geolocation' });
    console.log(`Geolocation permission state: ${permissionStatus.state}`);

    // Handle the initial state
    handleStateChange(permissionStatus.state);

    // Optional: Listen for live permission changes (e.g., if the user changes settings)
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
  if (state === 'granted') {

  } else if (state === 'prompt') {
    const popup = document.getElementById("geolocation-popup")
    popup.querySelector(".geolocation_allow").addEventListener("click", ()=>{
        navigator.geolocation.getCurrentPosition(
            (position) => {
                popup.hidden = true
            },
            (error) => {
                //Geolocation blocked or ignored
                popup.hidden = true;
            }
        ) ;
    })
    popup.hidden = false;
  } else if (state === 'denied') {
    checkSignIn()
  }
}

checkLocationPermission();

function checkSignIn(){
    const now = new Date()
    const timeStart = new Date().setHours(14,0,0,0);
    const timeEnd = new Date().setHours(15,30,0,0)
    if((now.currentDay === 1 || now.currentDay === 5) && (now >= timeStart && now <= timeEnd)){
        alert("Sign in?")
    }
}
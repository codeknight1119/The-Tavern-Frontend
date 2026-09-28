import { FirebaseUtils } from "./firebaseUtils.js";

import eruda from "https://cdn.jsdelivr.net/npm/eruda/+esm";
import {state} from "public/codeModules/state.js"
import {checkUser} from "public/codeModules/auth.js"
import {getMyFeatures} from "public/codeModules/sidebar.js"



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

//Startup sequence

await checkUser()
await getMyFeatures()

//////////////////////////////////////////////////////////////////////
/////////////////////////PAGE RENDERING///////////////////////////////
//////////////////////////////////////////////////////////////////////





let mainContentArea = document.getElementById("mainContentArea")

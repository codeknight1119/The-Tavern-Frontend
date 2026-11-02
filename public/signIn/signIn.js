import {state} from "../codeModules/state.js"
import {checkUser} from "../codeModules/auth.js"

await checkUser()
if(state.user){
    document.getElementById("memberSignIn").hidden = false;
}else{
    document.getElementById("guestSignIn").hidden = false;
}
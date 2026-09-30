import { FirebaseUtils } from "./firebaseUtils.js";

import eruda from "https://cdn.jsdelivr.net/npm/eruda/+esm";
try{
import {state} from "./codeModules/state.js"
import {checkUser} from "./codeModules/auth.js"
import {getMyFeatures} from "./codeModules/sidebar.js"

import "./codeModules/chat.js";
import "./codeModules/campaign.js";
import "./codeModules/find_friends.js";
import "./codeModules/user_search.js";
import "./codeModules/board.js";
import "./codeModules/userManifest.js";
console.log("Everything imported")
await checkUser()
await getMyFeatures()
console.log("Everything initilized")

}catch(e){
    console.error(e)
}
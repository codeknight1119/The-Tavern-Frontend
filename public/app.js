import { FirebaseUtils } from "./firebaseUtils.js";

import eruda from "https://cdn.jsdelivr.net/npm/eruda/+esm";

import {state} from "public/codeModules/state.js"
import {checkUser} from "public/codeModules/auth.js"
import {getMyFeatures} from "public/codeModules/sidebar.js"

import "./codeModules/chat.js";
import "./codeModules/campaign.js";
import "./codeModules/find_friends.js";
import "./codeModules/user_search.js";
import "./codeModules/board.js";
import "./codeModules/userManifest.js";

await checkUser()
await getMyFeatures()
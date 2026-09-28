import {state} from "./codeModules/state.js"
import { FirebaseUtils } from "../firebaseUtils.js";
export async function checkUser() {
    const userCheck = await FirebaseUtils.isSignedIn()


    if (!userCheck) {
        window.location.href = "/signIn"
    } else {

        let uid = userCheck.user.uid
        state.user = await FirebaseUtils.getDocument(`users/${uid}`)
        state.user.uid = uid
        state.firebaseUser = userCheck.user
        console.log("firebase user", state.firebaseUser)
        console.log("raw user", state.userCheck)

        const tokens = await state.firebaseUser.getIdTokenResult(true);
        const claims = tokens?.claims || {};

        // The backend stores application permissions as an array in the
        // custom claim: { permissions: ["officer", "tech", ...] }.
        // Keep a small fallback for older claim formats, but do not treat
        // the "permissions" and "allowed" claim names themselves as roles.
        if (Array.isArray(claims.permissions)) {
            state.permissions = [...claims.permissions];
        } else {
            const firebaseNoise = [
                "name", "picture", "iss", "aud", "auth_time", "user_id",
                "sub", "iat", "exp", "email", "email_verified", "firebase",
                "permissions", "allowed"
            ];

            state.permissions = Object.keys(claims)
                .filter(key => !firebaseNoise.includes(key) && claims[key] === true);
        }
        if(state.permissions.includes("tech")){eruda.init();}

        return true
    }
}
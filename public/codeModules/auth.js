import {state} from "./state.js"
import { FirebaseUtils } from "../firebaseUtils.js";

export async function checkUser() {
    const userCheck = await FirebaseUtils.isSignedIn();

    if (!userCheck) {
        window.location.href = "/signIn";
        return false;
    }

    const uid = userCheck.user.uid;
    const userData = await FirebaseUtils.getDocument(`users/${uid}`) ?? {};

    state.user = userData;
    state.user.uid = uid;
    state.firebaseUser = userCheck.user;
    state.permissions = [];

    console.log("firebase user", state.firebaseUser);
    console.log("raw user", state.user);

    const tokens = await state.firebaseUser.getIdTokenResult(true);
    const claims = tokens?.claims || {};

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

    if (state.permissions.includes("tech")) {
        eruda.init();
    }

    return true;
}

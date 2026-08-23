const firebaseConfig = {
    apiKey: "AIzaSyCQSv-B_1LiYwW6_XDMCesK-K-uUwx4SvE",
    authDomain: "wchs-thetavern.firebaseapp.com",
    projectId: "wchs-thetavern",
    storageBucket: "wchs-thetavern.firebasestorage.app",
    messagingSenderId: "1067002790985",
    appId: "1:1067002790985:web:5835522f0afede84deeb98",
    measurementId: "G-L2LD6HTME2"
};

import {Firebase} from "public/utils/firebaseUtilsClass.js"

export const FirebaseUtils = new Firebase(firebaseConfig)
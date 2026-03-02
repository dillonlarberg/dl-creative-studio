import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

// Export function groups from domain-specific modules
export * from "./alliProxy";
export * from "./ai";
export * from "./video";

export const helloWorld = functions.https.onRequest((request, response) => {

    functions.logger.info("Hello logs!", { structuredData: true });
    response.send("PMG Creative Studio Backend is running!");
});

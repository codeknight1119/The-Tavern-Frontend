export async function checkUserManifest() {
    console.log("=== USER MANIFEST DEBUG START ===");

    try {
        const timestampData =
            await FirebaseUtils.getDocument("/manifest/userManifestTimestamp");

        console.log(
            "Manifest timestamp document:",
            timestampData
        );

        const manifestData =
            await FirebaseUtils.getDocument("/manifest/userManifest");

        console.log(
            "Raw manifest document:",
            manifestData
        );

        console.log(
            "Raw manifest.manifest:",
            manifestData?.manifest
        );

        if (!manifestData) {
            console.error(
                "ERROR: /manifest/userManifest does not exist."
            );

            state.userManifest = [];
            return;
        }

        if (!Array.isArray(manifestData.manifest)) {
            console.error(
                "ERROR: /manifest/userManifest exists, but .manifest is not an array.",
                manifestData.manifest
            );

            state.userManifest = [];
            return;
        }

        state.userManifest = manifestData.manifest;

        console.log(
            `Loaded ${state.userManifest.length} users into userManifest.`
        );

        if (state.userManifest.length > 0) {
            console.log(
                "First manifest entry:",
                state.userManifest[0]
            );

            console.log(
                "Manifest fields:",
                Object.keys(state.userManifest[0])
            );
        }

        console.log("=== USER MANIFEST DEBUG END ===");

    } catch (error) {
        console.error(
            "ERROR loading user manifest:",
            error
        );

        state.userManifest = [];
        throw error;
    }
}
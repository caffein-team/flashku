#!/usr/bin/env node
/**
 * scripts/setup-jmdict.js
 *
 * Downloads the JMdict simplified English (common words) JSON file
 * into data/jmdict/ for use by the dictionary lookup service.
 *
 * Run once after cloning:  node scripts/setup-jmdict.js
 */

const https = require("https");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const DATA_DIR = path.resolve(__dirname, "../data/jmdict");
const DEST_ZIP = path.join(DATA_DIR, "jmdict-eng-common.json.zip");

// Fetch the latest release from GitHub API, then download
async function main() {
    fs.mkdirSync(DATA_DIR, { recursive: true });

    // 1. Get latest release metadata
    console.log("Fetching latest JMdict release info...");
    const releaseInfo = await fetchJson("https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest");
    const tagName = releaseInfo.tag_name;
    const asset = releaseInfo.assets.find(a => a.name.includes("jmdict-eng-common") && a.name.endsWith(".json.zip"));

    if (!asset) {
        console.error("Could not find jmdict-eng-common .json.zip asset in latest release.");
        process.exit(1);
    }

    const destJson = path.join(DATA_DIR, asset.name.replace(".zip", ""));
    if (fs.existsSync(destJson)) {
        console.log(`✓ JMdict JSON already exists: ${path.basename(destJson)} — skipping download.`);
        return;
    }

    // 2. Download zip
    console.log(`Downloading ${asset.name} from release ${tagName}...`);
    await downloadFile(asset.browser_download_url, DEST_ZIP);
    console.log(`✓ Downloaded to ${DEST_ZIP} (${(fs.statSync(DEST_ZIP).size / 1024).toFixed(0)} KB)`);

    // 3. Extract zip
    console.log("Extracting...");
    if (process.platform === "win32") {
        execSync(`powershell -Command "Expand-Archive -Path '${DEST_ZIP}' -DestinationPath '${DATA_DIR}' -Force"`);
    } else {
        execSync(`unzip -o '${DEST_ZIP}' -d '${DATA_DIR}'`);
    }

    // 4. Clean up zip
    fs.unlinkSync(DEST_ZIP);

    const jsonFile = fs.readdirSync(DATA_DIR).find(f => f.startsWith("jmdict-eng-common") && f.endsWith(".json"));
    if (!jsonFile) {
        console.error("Extraction succeeded but JSON file not found. Check data/jmdict/ manually.");
        process.exit(1);
    }

    console.log(`✓ JMdict ready: data/jmdict/${jsonFile}`);
    console.log("\n⚠️  Remember to update JMDICT_JSON_PATH in src/utils/dictionary.ts if the filename changed.");
    console.log(`   New filename: ${jsonFile}`);
}

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { "User-Agent": "flashku-backend/1.0" } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchJson(res.headers.location).then(resolve).catch(reject);
            }
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(e); }
            });
            res.on("error", reject);
        }).on("error", reject);
    });
}

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        const download = (downloadUrl) => {
            https.get(downloadUrl, { headers: { "User-Agent": "flashku-backend/1.0" } }, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    return download(res.headers.location);
                }
                res.pipe(file);
                file.on("finish", () => file.close(resolve));
                file.on("error", reject);
                res.on("error", reject);
            }).on("error", reject);
        };
        download(url);
    });
}

main().catch((e) => {
    console.error("Setup failed:", e.message);
    process.exit(1);
});

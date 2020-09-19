import fs from "fs"
import util from "util"
import child from "child_process"

import fetch from "node-fetch"
import Cron from "cron"

// https://github.com/brave/brave-browser/releases/latest
// https://github.com/brave/brave-browser/releases/tag/v1.16.26
// https://github.com/brave/brave-browser/releases/download/v1.16.26/brave-browser-nightly_1.16.26_amd64.deb
// pkgver=1.16.26
// pkgrel=1

const PACKAGE_NAME = "brave-nightly-bin"
const BRAVE_NIGHTLY_PATH = `../${PACKAGE_NAME}`
const PKGBUILD_FILE = `${BRAVE_NIGHTLY_PATH}/PKGBUILD`

const exec = util.promisify(child.exec)

function handleError(err: any) {
    console.error(`ERROR CODE ${err.code}: ${err.stderr}`)
    process.exit(-1)
}

function runUpdateCheck() {
    Promise.all([
        exec(`/usr/bin/grep 'pkgver=' ${PKGBUILD_FILE} | cut -f2 -d= | xargs | tr -d "\n"`),
        fetch("https://github.com/brave/brave-browser/releases/latest", { method: "HEAD" })
    ])
    .then( async ([ local, remote ]) => {
        const currentVersion = local.stdout
        const gitVersion = new URL(remote.url).pathname.split("/").pop()?.split("v")[1].trim() ?? ""

        console.log(`currentVersion: ${currentVersion} gitVersion: ${gitVersion}`);

        // check if error exists from exec command above
        if (local.stderr) { throw local.stderr }

        if (currentVersion !== gitVersion) {
            console.log(`New version detected! ${currentVersion} => ${gitVersion}`);

            console.log(`* Updating PKGBUILD with new version ${gitVersion}..`);
            await exec(`cd ${BRAVE_NIGHTLY_PATH} && sed -i "s/pkgver=.*/pkgver=${gitVersion}/;s/pkgrel=.*/pkgrel=1/" PKGBUILD`).catch(handleError)

            console.log(`* Updating PKGBUILD checksums..`);
            await exec(`cd ${BRAVE_NIGHTLY_PATH} && updpkgsums`).catch(handleError)

            console.log(`* Creating new .SRCINFO file..`);
            await exec(`cd ${BRAVE_NIGHTLY_PATH} && makepkg --printsrcinfo > .SRCINFO`).catch(handleError)

            console.log(`* Creating new package..`);
            await exec(`cd ${BRAVE_NIGHTLY_PATH} && makepkg -Cf`).catch(handleError)

            // what to do next?
            //   run git commit -a -m "Updated to v${gitVersion}"
            //   run git push
        } else {
            console.log("* No updates detected.")
        }

        console.log(`* Next scheduled update check is ${cronJob.nextDate().toString()}`);
    }).catch(err => {
        console.log("ERROR: ", err);
        process.exit(-1)
    })
}

const { CronJob } = Cron
const cronJob = new CronJob("0 */15 * * * *", runUpdateCheck)

console.log("* Starting update cron job")
cronJob.start()
cronJob.fireOnTick()

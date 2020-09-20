import fs from "fs"
import util from "util"
import child from "child_process"

import fetch from "node-fetch"
import Cron from "cron"

const exec = util.promisify(child.exec)

// Configurables.
const LATEST_URL = "https://github.com/brave/brave-browser/releases/latest"
const PROJECT_PATH = process.argv[2] ?? "../brave-nightly-bin"
const PKGBUILD = `${PROJECT_PATH}/PKGBUILD`
const INTERVAL = 15 // in minutes

// Nothing below this line should be changed unless you know what you are doing.
let PROJECT_NAME: string = ""

try {
    fs.accessSync(PKGBUILD, fs.constants.R_OK)

    PROJECT_NAME = (await exec(`grep -m1 pkgname= ${PKGBUILD} | cut -f2 -d=`)).stdout.trim()
} catch (ex) {
    handleError(`Cannot find or read ${PKGBUILD}`)
}

function handleError(err: any) { console.error(`* ERROR: `, err); process.exit(-1) }
function log(msg: string) { console.log(`[${(new Date()).toString()}] [${PROJECT_NAME}]`, msg) }

function runUpdateCheck() {
    Promise.all([
        exec(`/usr/bin/grep -m1 'pkgver=' PKGBUILD | cut -f2 -d= | xargs | tr -d "\n"`, { cwd: PROJECT_PATH }),
        fetch(LATEST_URL, { method: "HEAD" })
    ])
    .then( async ([ local, remote ]) => {
        const currentVersion = local.stdout
        const gitVersion = new URL(remote.url).pathname.split("/").pop()?.split("v")[1].trim() ?? ""

        if (currentVersion !== gitVersion) {
            log(`New version detected! ${currentVersion} => ${gitVersion}`);

            const COMMANDS = [
                { msg: `Updating PKGBUILD with new version ${gitVersion}`,  cmd: `sed -i "s/pkgver=.*/pkgver=${gitVersion}/;s/pkgrel=.*/pkgrel=1/" PKGBUILD` },
                { msg: `Updating PKGBUILD checksums`, cmd: `updpkgsums` },
                { msg: `Creating new .SRCINFO`, cmd: `makepkg --printsrcinfo > .SRCINFO` },
                { msg: `Creating new package`, cmd: `makepkg -Cf` }
            ]

            COMMANDS.forEach(async command => {
                log(`* ${command.msg}..`);
                await exec(command.cmd, { cwd: PROJECT_PATH }).catch(handleError)
            })
        } else {
            log('No new version detected.')
        }

        log(`Next scheduled check at ${cronJob.nextDate().toString()}`);
    }).catch(err => {
        handleError(err);
    })
}

const { CronJob } = Cron
const cronJob = new CronJob(`0 */${INTERVAL} * * * *`, runUpdateCheck)

console.log("* Starting update cron job")
cronJob.start()
cronJob.fireOnTick()

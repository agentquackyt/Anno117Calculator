import { serve } from "bun";
import { parseArgs } from "util";
import homepage from "./src/index.html";
import generateGoodsList from "./tools/generate-goods-list";
import generateItemsList from "./tools/generate-items-list";
import fs from "fs/promises";

const logo = () => {
    console.log(Bun.color("#d4b89b", "ansi-16m"));
    console.log("        ##############        ");
    console.log("         ############                                 __                      ");
    console.log("         #####  #####                                /  |                     ");
    console.log("       ######    ######                          ____$$ |  ______   __     __ ");
    console.log("      ######      ######          ______        /    $$ | /      \\ /  \\   /  |");
    console.log("     ######        ######        /      |      /$$$$$$$ |/$$$$$$  |$$  \\ /$$/ ");
    console.log("    ######          ######       $$$$$$/       $$ |  $$ |$$    $$ | $$  /$$/  ");
    console.log("   ######            ######                    $$ \\__$$ |$$$$$$$$/   $$ $$/   ");
    console.log(" ########            ########                  $$    $$ |$$       |   $$$/    ");
    console.log("##########          ##########                  $$$$$$$/  $$$$$$$/     $/     ");
    console.log(`\n ${Bun.color("#e7cfb6", "ansi")}=== Anno 117: Calculator === `);
};

const { values } = parseArgs({
    args: Bun.argv,
    options: {
        build: {
            type: "boolean",
            default: false,
        },
        commit: {
            type: "boolean",
            default: false,
        },
        dev: {
            type: "boolean",
            default: false
        },
    },
    strict: true,
    allowPositionals: true,
});

if (values.commit) {
    // check env variable
    if (!process.env.CHECK_PRECOMMIT || process.env.CHECK_PRECOMMIT === "false") {
        process.exit(0);
    }
}

console.clear();

logo();
await generateGoodsList({ showList: false, devmode: !values.build });
await generateItemsList({ showList: false, devmode: !values.build });


if (values.build) {
    console.log(`\n${Bun.color("#acf3ff", "ansi-16m") + "[Developer Server] " + Bun.color("#1394bf", "ansi-16m")}Building for production ...`);
    await Bun.$`mkdir ./docs/`.text().catch(() => { /* ignore if already exists */ });
    await Bun.$`rm -rf ./docs/*`.text().catch(() => { /* ignore if already exists */ });

    await Bun.build({
        entrypoints: ["./src/index.html"],
        outdir: "./docs",
        minify: true,
    });

    // Cross-platform asset copy (works on macOS/Linux/Windows shell environments).
    await Bun.$`mkdir -p ./docs/assets`.text().catch(() => { /* ignore if already exists */ });
    await Bun.$`cp -R ./src/assets/. ./docs/`.text();

    // SW must be at the root so its scope covers the entire origin.
    await Bun.write('./docs/sw.js', Bun.file('./src/assets/data/sw.js'));

    console.log(`\n${Bun.color("#acf3ff", "ansi-16m") + "[Developer Server] " + Bun.color("#1394bf", "ansi-16m")}Build completed! Output in ./docs/`);
}

if (values.dev) {
    const server = serve({
        routes: {
            "/": homepage
        },
        async fetch(req) {
            // Serve static asset dir
            let url = new URL(req.url);

            // Serve SW from root with Service-Worker-Allowed header so its
            // scope covers the entire origin (not just /assets/data/).
            if (url.pathname === '/sw.js') {
                const swFile = Bun.file('./src/assets/data/sw.js');
                return new Response(swFile, {
                    headers: {
                        'Content-Type': 'application/javascript',
                        'Service-Worker-Allowed': '/',
                    },
                });
            }

            if (url.pathname.startsWith("/assets")) {
                // strip the trailing slash if it exists
                if (url.pathname.endsWith("/")) {
                    url.pathname = url.pathname.slice(0, -1);
                }
                const assetPath = `./src${url.pathname}`;
                if (await Bun.file(assetPath).exists()) {
                    return new Response(Bun.file(assetPath));
                }
                // check if it an dir exists and list the content if it does (use fs.readdir)
                else {
                    try {
                        const files = await fs.readdir(assetPath);
                        const css = `<style>
                        body { font-family: Arial, sans-serif; padding: 20px; display: flex; flex-direction: column; }
                        h1 { color: #333; } 
                        a { display: block; margin: 5px 0; color: #007acc; text-decoration: none; }
                        a:hover { text-decoration: underline; }
                        </style>`;
                        const header = `<h1>Index of ${url.pathname}</h1><hr>`;
                        const goback = `<a href="${url.pathname}/.." style="color: #00ccbb; text-decoration: underline;">Go Back</a>`;
                        const fileLinks = files.map(file => `<a href="${url.pathname}/${file}">${file}</a>`);
                        return new Response(`${css}${header}${goback}${fileLinks.join("\n")}`, { status: 200, headers: { "Content-Type": "text/html" } });
                    } catch (e) {
                        return new Response("Error: " + e, { status: 404 });
                    }
                }
            }
            return new Response("Not found", { status: 404 });
        },
        development: true
    });

    console.log(`\n${Bun.color("#beffac", "ansi-16m") + "[Developer Server] " + Bun.color("#67bd72", "ansi-16m")}Listening on ${server.url}`);
}

//reset
console.log('\x1b[0m');
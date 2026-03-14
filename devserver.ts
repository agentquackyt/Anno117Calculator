import { serve } from "bun";
import { parseArgs } from "util";
import homepage from "./src/index.html";
import generateGoodsList from "./tools/generate-goods-list";

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

const { values, positionals } = parseArgs({
    args: Bun.argv,
    options: {
        build: {
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

console.clear();

logo();
await generateGoodsList({showList: false, devmode: !values.build});


if(values.build) {
    console.log(`\n${Bun.color("#acf3ff", "ansi-16m") + "[Developer Server] " + Bun.color("#1394bf", "ansi-16m")}Building for production ...`);
    await Bun.$`mkdir ./docs/`.text().catch(() => { /* ignore if already exists */ });
    await Bun.$`rm -rf ./docs/*`.text().catch(() => { /* ignore if already exists */ });

    await Bun.build({
        entrypoints: ["./src/index.html"],
        outdir: "./docs",
        minify: true,
    });

    await Bun.$`xcopy src\\assets docs\\assets /s /i`.text().catch(() => { /* ignore if already exists */ });
    
    console.log(`\n${Bun.color("#acf3ff", "ansi-16m") + "[Developer Server] " + Bun.color("#1394bf", "ansi-16m")}Build completed! Output in ./docs/`);
}

if (values.dev) {
    const server = serve({
        routes: {
            "/": homepage
        },
        async fetch(req) {
            // Serve static asset dir
            if (req.url.startsWith("/assets/")) {
                const assetPath = `./src${req.url}`;
                if (await Bun.file(assetPath).exists()) {
                    return new Response(Bun.file(assetPath));
                } else {
                    return new Response("Not found", { status: 404 });
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
export async function main(ns) {
    // simle deployment of "loop hack"
    //
    // 1 hack, 10 grow, 2 weaken
    //
    // args:
    // host running the attack: string
    // server to hack: string
    // thread scale multiplier: integer
    const runServer = ns.args[0];
    const target = ns.args[1];
    const scale = ns.args[2];

    // ratios
    const ratioHack = 1;
    const ratioGrow = 8;
    const ratioWeaken = 4;


    //script locations
    const growScript = "/loop/loop-grow.js";
    const weakenScript = "/loop/loop-weaken.js";
    const hackScript = "/loop/loop-hack.js";
    const controllerScript = "/loop/loop-controller.js";

    // copy the script to the runServer
    const currentServer = ns.getHostname();
    if (currentServer !== runServer){
        ns.scp(growScript, runServer);
        ns.scp(weakenScript, runServer);
        ns.scp(hackScript, runServer);
    }

    // calculate how much RAM is needed for running the scripts
    const growMem = ns.getScriptRam(growScript);
    const hackMem = ns.getScriptRam(hackScript);
    const weakenMem = ns.getScriptRam(weakenScript);

    const scale1Mem = ratioHack * hackMem + ratioWeaken * weakenMem + ratioGrow * growMem;
    const totalMem = scale1Mem * scale;
    const availableMem = ns.getServerMaxRam(runServer) - ns.getServerUsedRam(runServer);

    if (availableMem < totalMem){
        ns.tprint("Not enough available memory to run the hack");
        ns.tprintf("Available memory: %d", availableMem);
        ns.tprintf("Memory required: %d", totalMem);
        return;
    }

    // run the loop scripts at the right scale
    const hackThreads = scale * ratioHack;
    const growThreads = scale * ratioGrow;
    const weakenThreads = scale * ratioWeaken;

    ns.exec(hackScript, runServer, hackThreads, target);
    ns.exec(growScript, runServer, growThreads, target);
    ns.exec(weakenScript, runServer, weakenThreads, target);
    
}
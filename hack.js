export async function main(ns) {
    // args:
    // host to hack (string)
    // sleep time (int)
    ns.sleep(ns.args[1]);
    ns.hack(ns.args[0]);
}
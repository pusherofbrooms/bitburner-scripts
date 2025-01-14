export async function main(ns) {
    // args:
    // host to weaken (string)
    // sleep time (int)
    ns.sleep(ns.args[1]);
    ns.weaken(ns.args[0]);
}
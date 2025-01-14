export async function main(ns) {
    // args:
    // host to grow (string)
    // sleep time (int)
    ns.sleep(ns.args[1]);
    ns.grow(ns.args[0]);
}
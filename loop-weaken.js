export async function main(ns) {
    // args:
    // host to weaken (string)
    while (true) {
        ns.weaken(ns.args[0]);
    }
}
export async function main(ns) {
    // args:
    // host to grow (string)
    while (true) {
        ns.grow(ns.args[0]);
    }
}
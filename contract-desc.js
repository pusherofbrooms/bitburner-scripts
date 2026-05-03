/** @param {NS} ns **/
export async function main(ns) {
    const [host, filename] = ns.args.map(String);

    if (!host || !filename || ns.args.includes("--help") || ns.args.includes("-h")) {
        ns.tprint("Usage: run contract-desc.js <host> <filename>");
        return;
    }

    const cc = ns.codingcontract;
    ns.tprint(`Host: ${host}`);
    ns.tprint(`File: ${filename}`);
    ns.tprint(`Type: ${cc.getContractType(filename, host)}`);
    ns.tprint(`Tries remaining: ${cc.getNumTriesRemaining(filename, host)}`);
    ns.tprint("Data:");
    ns.tprint(format(cc.getData(filename, host)));
    ns.tprint("Description:");
    ns.tprint(cc.getDescription(filename, host));
}

function format(value) {
    if (typeof value === "string") return value;
    return JSON.stringify(value);
}

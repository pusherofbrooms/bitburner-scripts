/** @param {NS} ns **/
export async function main(ns) {
    if (ns.args.length < 3 || ns.args.includes("--help") || ns.args.includes("-h")) {
        ns.tprint("Usage: run contract-attempt.js <answer> <filename> <host>");
        ns.tprint("Answer may be JSON, e.g. '[1,2,3]', '42', 'true', or a plain string.");
        return;
    }

    const host = String(ns.args[ns.args.length - 1]);
    const filename = String(ns.args[ns.args.length - 2]);
    const rawAnswer = ns.args.slice(0, -2).join(" ");
    const answer = parseAnswer(rawAnswer);

    const triesBefore = ns.codingcontract.getNumTriesRemaining(filename, host);
    ns.tprint(`Attempting ${filename} on ${host}`);
    ns.tprint(`Answer: ${format(answer)}`);
    ns.tprint(`Tries before: ${triesBefore}`);

    const reward = ns.codingcontract.attempt(answer, filename, host);
    if (reward) {
        ns.tprint(`SUCCESS: ${reward}`);
    } else {
        const triesAfter = ns.codingcontract.getNumTriesRemaining(filename, host);
        ns.tprint(`FAILED. Tries remaining: ${triesAfter}`);
    }
}

function parseAnswer(raw) {
    try {
        return JSON.parse(raw);
    } catch {
        return raw;
    }
}

function format(value) {
    if (typeof value === "string") return value;
    return JSON.stringify(value);
}

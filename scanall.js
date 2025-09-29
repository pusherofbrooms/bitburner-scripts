/** @param {NS} ns **/
export async function main(ns) {
    // Usage: run scanall.js [--csv] [--sort level|money|sec|name]
    const args = ns.args.slice();
    const optCsv = args.includes("--csv");
    const sortArg = args.find(a => a.startsWith("--sort="));
    const sortKey = sortArg ? sortArg.split("=")[1] : "level";

    // Gather all servers via BFS from "home"
    const servers = scanAll(ns, "home");

    // Collect server info
    const rows = servers.map(host => {
        const requiredLevel = ns.getServerRequiredHackingLevel(host);
        const maxMoney = ns.getServerMaxMoney(host);
        const moneyAvail = ns.getServerMoneyAvailable(host);
        const minSec = ns.getServerMinSecurityLevel(host);
        const sec = ns.getServerSecurityLevel(host);
        const portsReq = ns.getServerNumPortsRequired(host);
        const hasRoot = ns.hasRootAccess(host);
        const ram = ns.getServerMaxRam(host);
        return {
            host,
            requiredLevel,
            maxMoney,
            moneyAvail,
            minSec,
            sec,
            portsReq,
            hasRoot,
            ram
        };
    });

    // Sorting
    const sorters = {
        level: (a,b) => a.requiredLevel - b.requiredLevel || b.maxMoney - a.maxMoney,
        money: (a,b) => b.maxMoney - a.maxMoney || a.requiredLevel - b.requiredLevel,
        sec: (a,b) => a.minSec - b.minSec || a.sec - b.sec,
        name: (a,b) => a.host.localeCompare(b.host)
    };
    if (sorters[sortKey]) rows.sort(sorters[sortKey]);

    if (optCsv) {
        // CSV header
        ns.tprint("host,requiredLevel,maxMoney,moneyAvail,minSec,sec,portsReq,hasRoot,ram");
        for (const r of rows) {
            ns.tprint(`${r.host},${r.requiredLevel},${r.maxMoney},${r.moneyAvail},${r.minSec},${r.sec},${r.portsReq},${r.hasRoot},${r.ram}`);
        }
        return;
    }

    // Pretty table layout
    const hdr = ["HOST", "REQ_LVL", "MAX $", "CUR $", "MIN SEC", "CUR SEC", "PORTS", "ROOT", "RAM"];
    const colWidths = [20, 8, 12, 12, 8, 8, 6, 5, 8];

    const pad = (s, w, right=true) => {
        const str = String(s);
        return right ? str.padEnd(w) : str.padStart(w);
    };

    ns.tprint(hdr.map((h,i) => pad(h, colWidths[i])).join(" "));
    ns.tprint("-".repeat(colWidths.reduce((a,b)=>a+b+1, -1)));

    for (const r of rows) {
        const line = [
            pad(r.host, colWidths[0]),
            pad(r.requiredLevel, colWidths[1], false),
            pad(formatMoney(r.maxMoney), colWidths[2], false),
            pad(formatMoney(r.moneyAvail), colWidths[3], false),
            pad(round(r.minSec,2), colWidths[4], false),
            pad(round(r.sec,2), colWidths[5], false),
            pad(r.portsReq, colWidths[6], false),
            pad(r.hasRoot ? "Y" : "N", colWidths[7]),
            pad(r.ram + "GB", colWidths[8], false)
        ].join(" ");
        ns.tprint(line);
    }

    // Helpers
    function scanAll(ns, start) {
        const visited = new Set([start]);
        const q = [start];
        const out = [start];
        while (q.length) {
            const cur = q.shift();
            try {
                const neigh = ns.scan(cur);
                for (const n of neigh) {
                    if (!visited.has(n)) {
                        visited.add(n);
                        q.push(n);
                        out.push(n);
                    }
                }
            } catch (e) {
                // ignore inaccessible nodes (shouldn't happen)
            }
        }
        return out;
    }

    function formatMoney(n) {
        if (n === 0) return "$0";
        const negative = n < 0;
        n = Math.abs(n);
        if (n >= 1e9) return (negative?"-":"") + "$" + (n/1e9).toFixed(2) + "b";
        if (n >= 1e6) return (negative?"-":"") + "$" + (n/1e6).toFixed(2) + "m";
        if (n >= 1e3) return (negative?"-":"") + "$" + (n/1e3).toFixed(2) + "k";
        return (negative?"-":"") + "$" + n.toFixed(0);
    }

    function round(x, d=2) {
        return (Math.round(x * (10**d)) / (10**d)).toFixed(d);
    }
}

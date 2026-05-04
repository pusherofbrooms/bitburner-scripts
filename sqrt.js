/** @param {NS} ns **/
export async function main(ns) {
  const args = ns.args.map(String);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    ns.tprint("Usage: run sqrt.js <big-integer>");
    ns.tprint("       run sqrt.js --file <file-containing-big-integer>");
    ns.tprint("Prints the nearest integer square root as a string, suitable for the Square Root contract.");
    ns.tprint("Tip: quote long numbers when passing them in the terminal to avoid numeric precision loss.");
    return;
  }

  let raw;
  if (args[0] === "--file") {
    if (args.length < 2) {
      ns.tprint("Missing filename after --file");
      return;
    }
    raw = ns.read(args[1]);
  } else {
    raw = args.join("");
  }

  try {
    const answer = nearestIntegerSqrt(parseBigInt(raw));
    ns.tprint(answer.toString());
  } catch (error) {
    ns.tprint(`ERROR: ${error.message}`);
  }
}

export function parseBigInt(value) {
  const cleaned = String(value).trim().replace(/[,_\s]/g, "").replace(/n$/, "");
  if (!/^-?\d+$/.test(cleaned)) throw new Error(`Not an integer: ${value}`);
  return BigInt(cleaned);
}

export function nearestIntegerSqrt(n) {
  if (n < 0n) throw new Error("Square root is not defined for negative integers");
  if (n < 2n) return n;

  const root = floorSqrt(n);
  const lowDiff = n - root * root;
  const next = root + 1n;
  const highDiff = next * next - n;

  return highDiff < lowDiff ? next : root;
}

export function floorSqrt(n) {
  if (n < 0n) throw new Error("Square root is not defined for negative integers");
  if (n < 2n) return n;

  // Initial estimate: 2^ceil(bitLength(n) / 2). This keeps Newton iteration fast
  // even for integers far longer than JavaScript's Number precision.
  const bitLength = n.toString(2).length;
  let x = 1n << BigInt(Math.ceil(bitLength / 2));

  while (true) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

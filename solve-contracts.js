import { getAllServers } from "getServers.js";

export async function main(ns) {
    ns.disableLog("ALL");
    // This script could run separately in a loop, howeverit is more RAM-efficient to call the script from a management script
    //while (true) {    
        // get all available servers
        const servers = getAllServers(ns)
        const contracts = servers.flatMap((server) => {
            const onServer = ns.ls(server, ".cct").map((contract) => {
                const type = ns.codingcontract.getContractType(contract, server);
                const data = ns.codingcontract.getData(contract, server);
                const didSolve = solve(type, data, server, contract, ns);
                return `${server} - ${contract} - ${type} - ${didSolve || "FAILED!"}`;
            });
            return onServer;
        });
        //ns.tprint("Found " + contracts.length + " contracts");
        contracts.forEach((contract) => void ns.print(contract));
        // sleep in case this script is run manually
        //await ns.sleep(60000)
    //}
    return;
}

function solve(type, data, server, contract, ns) {
    let solution;
    //ns.tprint(type);
    switch (type) {
        case "Algorithmic Stock Trader I":
            solution = maxProfit([1, data]);
            break;
        case "Algorithmic Stock Trader II":
            solution = maxProfit([Math.ceil(data.length / 2), data]);
            break;
        case "Algorithmic Stock Trader III":
            solution = maxProfit([2, data]);
            break;
        case "Algorithmic Stock Trader IV":
            solution = maxProfit(data);
            break;
        case "Minimum Path Sum in a Triangle":
            solution = solveTriangleSum(data, ns);
            break;
        case "Unique Paths in a Grid I":
            solution = uniquePathsI(data);
            break;
        case "Unique Paths in a Grid II":
            solution = uniquePathsII(data);
            break;
        case "Generate IP Addresses":
            solution = generateIps(data);
            break;
        case "Find Largest Prime Factor":
            solution = factor(data);
            break;
        case "Spiralize Matrix":
            solution = spiral(data);
            break;
        case "Merge Overlapping Intervals":
            solution = mergeOverlap(data);
            break;
        case "Array Jumping Game":
            solution = solverArrayJumpingGame(data);
            break;
        case "Find All Valid Math Expressions":
            //solution = await findAllValidMathExpressions(data, ns);
            solution = solverWaysToExpress(data);
            break;
        case "Subarray with Maximum Sum":
            solution = solverLargestSubset(data);
            break;
        case "Total Ways to Sum":
            solution = solverWaysToSum(data);
            break;
        case "Total Ways to Sum II":
            solution = solverWaysToSumII(data);
            break;
        case "Array Jumping Game II":
            solution = solverArrayJumpingGameII(data);
            break;
        case "Shortest Path in a Grid":
            solution = shortestPathInGrid(data);
            break;
        case "HammingCodes: Integer to Encoded Binary":
            solution = hammingEncode(data);
            break;
        case "HammingCodes: Encoded Binary to Integer":
            solution = hammingDecode(data);
            break;
        case "Proper 2-Coloring of a Graph":
            solution = twoColorGraph(data);
            break;
        case "Compression I: RLE Compression":
            solution = rleCompress(data);
            break;
        case "Compression II: LZ Decompression":
            solution = lzDecompress(data);
            break;
        case "Compression III: LZ Compression":
            solution = lzCompress(data);
            break;
        case "Encryption I: Caesar Cipher":
            solution = caesarCipher(data);
            break;
        case "Encryption II: Vigenère Cipher":
            solution = vigenereCipher(data);
            break;
        case "Square Root":
            solution = sqrtBigInt(data);
            break;
        case "Total Number of Primes":
            solution = totalPrimesInRange(data);
            break;
        case "Largest Rectangle in a Matrix":
            solution = largestRectangle(data);
            break;
        case "Sanitize Parentheses in Expression":
            solution = removeInvalidParenthesis(data);
            break;
        default:
            return false;
    }
    return (solution !== undefined) ? ns.codingcontract.attempt(solution, contract, server) : "";
}

// Sanitize Parentheses in Expression

// method checks if character is parenthesis(open or closed)
function isParenthesis(c)
{
    return ((c == '(') || (c == ')'));
}
 
// method returns true if string contains valid parenthesis
function isValidString(str)
{
    let cnt = 0;
    for (let i = 0; i < str.length; i++)
    {
        if (str[i] == '(')
            cnt++;
        else if (str[i] == ')')
            cnt--;
        if (cnt < 0)
            return false;
    }
    return (cnt == 0);
}

// method to remove invalid parenthesis
function removeInvalidParenthesis(str)
{
    if (str.length==0)
        return [];
   
    // visit set to ignore already visited string
    let visit = new Set();
   
    // queue to maintain BFS
    let q = [];
    let temp;
    let level = false;
    let solutions = []
   
    // pushing given string as starting node into queue
    q.push(str);
    visit.add(str);
    while (q.length!=0)
    {
        str = q.shift();
        if (isValidString(str))
        {
            solutions.push(str);
   
            // If answer is found, make level true
            // so that valid string of only that level
            // are processed.
            level = true;
        }
        if (level)
            continue;
        for (let i = 0; i < str.length; i++)
        {
            if (!isParenthesis(str[i]))
                continue;
   
            // Removing parenthesis from str and
            // pushing into queue,if not visited already
            temp = str.substring(0, i) + str.substring(i + 1);
            if (!visit.has(temp))
            {
                q.push(temp);
                visit.add(temp);
            }
        }
    }
    if (solutions.length == 0){
        solutions.push("");
    }
    return solutions;
}

// Total Ways to Sum

function solverWaysToSum(arrayData){
    var ways = [];
    ways[0] = 1;
 
    for (var a = 1; a <= arrayData; a++) {
        ways[a] = 0;
    }
 
    for (var i = 1; i <= arrayData - 1; i++) {
        for (var j = i; j <= arrayData; j++) {
            ways[j] += ways[j - i];
        }
    }
 
    return ways[arrayData];
}

// Subarray with Maximum Sum

function solverLargestSubset(arrayData) {
    let highestSubset = arrayData[0];

    for (let i = 0; i < arrayData.length; i++) {

        for (let j = i; j < arrayData.length; j++) {
            let tempSubset = 0;
            for (let k = i; k <= j; k++) {
                tempSubset += arrayData[k];
            }

            if (highestSubset < tempSubset) {
                highestSubset = tempSubset;
            }
        }
    }

    return highestSubset;
}

// Find All Valid Math Expressions

function solverWaysToExpress(arrayData) {
    //ns.tprint("solverWaysToExpress()");
    //await ns.sleep(1000);
    let i, j, k;

    let operatorList = ["", "+", "-", "*"];
    let validExpressions = [];

    let tempPermutations = Math.pow(4, (arrayData[0].length - 1));

    for (i = 0; i < tempPermutations; i++) {

        //if (!Boolean(i % 100000)) {
        //    ns.tprint(i + "/" + tempPermutations + ", " + validExpressions.length + " found.");
        //    await ns.sleep(100);
        //}

        let arraySummands = [];
        let candidateExpression = arrayData[0].substr(0, 1);
        arraySummands[0] = parseInt(arrayData[0].substr(0, 1));

        for (j = 1; j < arrayData[0].length; j++) {
            candidateExpression += operatorList[(i >> ((j - 1) * 2)) % 4] + arrayData[0].substr(j, 1);

            let rollingOperator = operatorList[(i >> ((j - 1) * 2)) % 4];
            let rollingOperand = parseInt(arrayData[0].substr(j, 1));

            switch (rollingOperator) {
                case "":
                    rollingOperand = rollingOperand * (arraySummands[arraySummands.length - 1] / Math.abs(arraySummands[arraySummands.length - 1]));
                    arraySummands[arraySummands.length - 1] = arraySummands[arraySummands.length - 1] * 10 + rollingOperand;
                    break;
                case "+":
                    arraySummands[arraySummands.length] = rollingOperand;
                    break;
                case "-":
                    arraySummands[arraySummands.length] = 0 - rollingOperand;
                    break;
                case "*":
                    while (j < arrayData[0].length - 1 && ((i >> (j * 2)) % 4) === 0) {
                        j += 1;
                        candidateExpression += arrayData[0].substr(j, 1);
                        rollingOperand = rollingOperand * 10 + parseInt(arrayData[0].substr(j, 1));
                    }
                    arraySummands[arraySummands.length - 1] = arraySummands[arraySummands.length - 1] * rollingOperand;
                    break;
            }
        }

        let rollingTotal = arraySummands.reduce(function(a, b) { return a + b; });

        //if(arrayData[1] == eval(candidateExpression)){
        if (arrayData[1] === rollingTotal) {
            validExpressions[validExpressions.length] = candidateExpression;
        }
    }

    return validExpressions;
}

// Array Jumping Game

function solverArrayJumpingGame(arrayData) {
    let arrayJump = [0];

    for (let n = 0; n < arrayData.length; n++) {
        if (arrayJump[n] || !n) {
            for (let p = n; p <= Math.min(n + arrayData[n], arrayData.length - 1); p++) {
                arrayJump[p] = 1;
            }
        }
    }
    //tprint("Array Jumping Game: " + 0 + Boolean(arrayJump[arrayData.length - 1]));
    return 0 + Boolean(arrayJump[arrayData.length - 1]);
}

//ALGORITHMIC STOCK TRADER

function maxProfit(arrayData) {
    let i, j, k;

    let maxTrades = arrayData[0];
    let stockPrices = arrayData[1];

    // WHY?
    let tempStr = "[0";
    for (i = 0; i < stockPrices.length; i++) {
        tempStr += ",0";
    }
    tempStr += "]";
    let tempArr = "[" + tempStr;
    for (i = 0; i < maxTrades - 1; i++) {
        tempArr += "," + tempStr;
    }
    tempArr += "]";

    let highestProfit = JSON.parse(tempArr);

    for (i = 0; i < maxTrades; i++) {
        for (j = 0; j < stockPrices.length; j++) { // Buy / Start
            for (k = j; k < stockPrices.length; k++) { // Sell / End
                if (i > 0 && j > 0 && k > 0) {
                    highestProfit[i][k] = Math.max(highestProfit[i][k], highestProfit[i - 1][k], highestProfit[i][k - 1], highestProfit[i - 1][j - 1] + stockPrices[k] - stockPrices[j]);
                } else if (i > 0 && j > 0) {
                    highestProfit[i][k] = Math.max(highestProfit[i][k], highestProfit[i - 1][k], highestProfit[i - 1][j - 1] + stockPrices[k] - stockPrices[j]);
                } else if (i > 0 && k > 0) {
                    highestProfit[i][k] = Math.max(highestProfit[i][k], highestProfit[i - 1][k], highestProfit[i][k - 1], stockPrices[k] - stockPrices[j]);
                } else if (j > 0 && k > 0) {
                    highestProfit[i][k] = Math.max(highestProfit[i][k], highestProfit[i][k - 1], stockPrices[k] - stockPrices[j]);
                } else {
                    highestProfit[i][k] = Math.max(highestProfit[i][k], stockPrices[k] - stockPrices[j]);
                }
            }
        }
    }
    return highestProfit[maxTrades - 1][stockPrices.length - 1];
}

//SMALLEST TRIANGLE SUM

function solveTriangleSum(arrayData, ns) {
    let triangle = arrayData;
    let nextArray = triangle[0];
    let previousArray = triangle[0];
   
    for (let i = 1; i < triangle.length; i++) {
        nextArray = [];
        for (let j = 0; j < triangle[i].length; j++) {
            if (j == 0) {
                nextArray.push(previousArray[j] + triangle[i][j]);
            } else if (j == triangle[i].length - 1) {
                nextArray.push(previousArray[j - 1] + triangle[i][j]);
            } else {
                nextArray.push(Math.min(previousArray[j], previousArray[j - 1]) + triangle[i][j]);
            }

        }

        previousArray = nextArray;
    }

    return Math.min.apply(null, nextArray);
}

//UNIQUE PATHS IN A GRID

function uniquePathsI(grid) {
    const rightMoves = grid[0] - 1;
    const downMoves = grid[1] - 1;

    return Math.round(factorialDivision(rightMoves + downMoves, rightMoves) / (factorial(downMoves)));
}

function factorial(n) {
    return factorialDivision(n, 1);
}

function factorialDivision(n, d) {
    if (n == 0 || n == 1 || n == d)
        return 1;
    return factorialDivision(n - 1, d) * n;
}

function uniquePathsII(grid, ignoreFirst = false, ignoreLast = false) {
    const rightMoves = grid[0].length - 1;
    const downMoves = grid.length - 1;

    let totalPossiblePaths = Math.round(factorialDivision(rightMoves + downMoves, rightMoves) / (factorial(downMoves)));

    for (let i = 0; i < grid.length; i++) {
        for (let j = 0; j < grid[i].length; j++) {

            if (grid[i][j] == 1 && (!ignoreFirst || (i != 0 || j != 0)) && (!ignoreLast || (i != grid.length - 1 || j != grid[i].length - 1))) {
                const newArray = [];
                for (let k = i; k < grid.length; k++) {
                    newArray.push(grid[k].slice(j, grid[i].length));
                }

                let removedPaths = uniquePathsII(newArray, true, ignoreLast);
                removedPaths *= uniquePathsI([i + 1, j + 1]);

                totalPossiblePaths -= removedPaths;
            }
        }

    }

    return totalPossiblePaths;
}

//GENERATE IP ADDRESSES

function generateIps(num) {
    num = num.toString();

    const length = num.length;

    const ips = [];

    for (let i = 1; i < length - 2; i++) {
        for (let j = i + 1; j < length - 1; j++) {
            for (let k = j + 1; k < length; k++) {
                const ip = [
                    num.slice(0, i),
                    num.slice(i, j),
                    num.slice(j, k),
                    num.slice(k, num.length)
                ];
                let isValid = true;

                ip.forEach(seg => {
                    isValid = isValid && isValidIpSegment(seg);
                });

                if (isValid) ips.push(ip.join("."));

            }

        }
    }

    return ips;

}

function isValidIpSegment(segment) {
    if (segment[0] == "0" && segment != "0") return false;
    segment = Number(segment);
    if (segment < 0 || segment > 255) return false;
    return true;
}

//GREATEST FACTOR

function factor(num) {
    for (let div = 2; div <= Math.sqrt(num); div++) {
        if (num % div != 0) {
            continue;
        }
        num = num / div;
        div = 2;
    }
    return num;
}

//SPIRALIZE Matrix

function spiral(arr, accum = []) {
    if (arr.length === 0 || arr[0].length === 0) {
        return accum;
    }
    accum = accum.concat(arr.shift());
    if (arr.length === 0 || arr[0].length === 0) {
        return accum;
    }
    accum = accum.concat(column(arr, arr[0].length - 1));
    if (arr.length === 0 || arr[0].length === 0) {
        return accum;
    }
    accum = accum.concat(arr.pop().reverse());
    if (arr.length === 0 || arr[0].length === 0) {
        return accum;
    }
    accum = accum.concat(column(arr, 0).reverse());
    if (arr.length === 0 || arr[0].length === 0) {
        return accum;
    }
    return spiral(arr, accum);
}

function column(arr, index) {
    const res = [];
    for (let i = 0; i < arr.length; i++) {
        const elm = arr[i].splice(index, 1)[0];
        if (elm !== undefined) {
            res.push(elm);
        }
    }
    return res;
}

// Merge Overlapping Intervals

function mergeOverlap(intervals) {
    intervals.sort(([minA], [minB]) => minA - minB);
    for (let i = 0; i < intervals.length; i++) {
        for (let j = i + 1; j < intervals.length; j++) {
            const [min, max] = intervals[i];
            const [laterMin, laterMax] = intervals[j];
            if (laterMin <= max) {
                const newMax = laterMax > max ? laterMax : max;
                const newInterval = [min, newMax];
                intervals[i] = newInterval;
                intervals.splice(j, 1);
                j = i;
            }
        }
    }
    return intervals;
}

// Total Ways to Sum II
function solverWaysToSumII([target, nums]) {
    const ways = Array(target + 1).fill(0);
    ways[0] = 1;
    for (const n of nums) {
        for (let i = n; i <= target; i++) ways[i] += ways[i - n];
    }
    return ways[target];
}

function solverArrayJumpingGameII(data) {
    const jumps = Array(data.length).fill(Infinity);
    jumps[0] = 0;
    for (let i = 0; i < data.length; i++) {
        for (let j = 1; j <= data[i] && i + j < data.length; j++) {
            jumps[i + j] = Math.min(jumps[i + j], jumps[i] + 1);
        }
    }
    return Number.isFinite(jumps[data.length - 1]) ? jumps[data.length - 1] : 0;
}

function shortestPathInGrid(grid) {
    const rows = grid.length, cols = grid[0].length;
    const dirs = [[1, 0, "D"], [-1, 0, "U"], [0, 1, "R"], [0, -1, "L"]];
    const queue = [[0, 0, ""]];
    const seen = new Set(["0,0"]);
    while (queue.length) {
        const [r, c, path] = queue.shift();
        if (r === rows - 1 && c === cols - 1) return path;
        for (const [dr, dc, ch] of dirs) {
            const nr = r + dr, nc = c + dc, key = `${nr},${nc}`;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc] === 0 && !seen.has(key)) {
                seen.add(key);
                queue.push([nr, nc, path + ch]);
            }
        }
    }
    return "";
}

function hammingEncode(data) {
    const enc = [0];
    const bits = data.toString(2).split("").reverse().map(Number);
    let k = bits.length;
    for (let i = 1; k > 0; i++) enc[i] = (i & (i - 1)) !== 0 ? bits[--k] : 0;
    let parity = 0;
    for (let i = 0; i < enc.length; i++) if (enc[i]) parity ^= i;
    for (let i = 0; 2 ** i < enc.length; i++) enc[2 ** i] = (parity >> i) & 1;
    enc[0] = enc.reduce((a, b) => a + b, 0) % 2;
    return enc.join("");
}

function hammingDecode(data) {
    const bits = data.split("").map(Number);
    let err = 0;
    for (let i = 1; i < bits.length; i++) if (bits[i]) err ^= i;
    const overall = bits.reduce((a, b) => a + b, 0) % 2;
    if (overall && err < bits.length) bits[err] ^= 1;
    const out = [];
    for (let i = 1; i < bits.length; i++) if ((i & (i - 1)) !== 0) out.push(bits[i]);
    return parseInt(out.join(""), 2);
}

function twoColorGraph([n, edges]) {
    const graph = Array.from({ length: n }, () => []);
    for (const [a, b] of edges) { graph[a].push(b); graph[b].push(a); }
    const color = Array(n).fill(-1);
    for (let start = 0; start < n; start++) {
        if (color[start] !== -1) continue;
        color[start] = 0;
        const queue = [start];
        while (queue.length) {
            const v = queue.shift();
            for (const u of graph[v]) {
                if (color[u] === -1) { color[u] = 1 - color[v]; queue.push(u); }
                else if (color[u] === color[v]) return [];
            }
        }
    }
    return color;
}

function rleCompress(data) {
    let out = "";
    for (let i = 0; i < data.length;) {
        let n = 1;
        while (i + n < data.length && data[i + n] === data[i] && n < 9) n++;
        out += n + data[i];
        i += n;
    }
    return out;
}

function lzDecompress(data) {
    let out = "", type = 1;
    for (let i = 0; i < data.length;) {
        const len = Number(data[i++]);
        if (len === 0) { type = 1 - type; continue; }
        if (type === 1) out += data.slice(i, i + len), i += len;
        else {
            const offset = Number(data[i++]);
            for (let j = 0; j < len; j++) out += out[out.length - offset];
        }
        type = 1 - type;
    }
    return out;
}

function lzCompress(plain) {
    let cur = Array.from({ length: 10 }, () => Array(10).fill(null));
    let next = Array.from({ length: 10 }, () => Array(10).fill(null));
    const set = (state, i, j, str) => { if (state[i][j] == null || str.length < state[i][j].length) state[i][j] = str; };
    cur[0][1] = "";
    for (let i = 1; i < plain.length; i++) {
        for (const row of next) row.fill(null);
        for (let len = 1; len <= 9; len++) {
            const s = cur[0][len];
            if (s == null) continue;
            if (len < 9) set(next, 0, len + 1, s);
            else set(next, 0, 1, s + "9" + plain.slice(i - 9, i) + "0");
            for (let off = 1; off <= Math.min(9, i); off++) if (plain[i - off] === plain[i]) set(next, off, 1, s + len + plain.slice(i - len, i));
        }
        for (let off = 1; off <= 9; off++) for (let len = 1; len <= 9; len++) {
            const s = cur[off][len];
            if (s == null) continue;
            if (plain[i - off] === plain[i]) {
                if (len < 9) set(next, off, len + 1, s);
                else set(next, off, 1, s + "9" + off + "0");
            }
            set(next, 0, 1, s + len + off);
        }
        [cur, next] = [next, cur];
    }
    let best = null;
    for (let len = 1; len <= 9; len++) {
        let s = cur[0][len];
        if (s != null) { s += len + plain.slice(plain.length - len); if (best == null || s.length < best.length) best = s; }
    }
    for (let off = 1; off <= 9; off++) for (let len = 1; len <= 9; len++) {
        let s = cur[off][len];
        if (s != null) { s += len + String(off); if (best == null || s.length < best.length) best = s; }
    }
    return best ?? "";
}

function caesarCipher([text, shift]) {
    return [...text].map(c => c === " " ? c : String.fromCharCode(((c.charCodeAt(0) - 65 - shift + 26) % 26) + 65)).join("");
}

function vigenereCipher([text, key]) {
    return [...text].map((c, i) => c === " " ? c : String.fromCharCode(((c.charCodeAt(0) - 130 + key.charCodeAt(i % key.length)) % 26) + 65)).join("");
}

function sqrtBigInt(n) {
    n = BigInt(n);
    if (n < 2n) return n;

    // Bitburner's Square Root contract asks for the nearest integer square root,
    // not just floor(sqrt(n)). Use Newton iteration like sqrt.js, then round.
    let x = 1n << BigInt(Math.ceil(n.toString(2).length / 2));
    while (true) {
        const y = (x + n / x) >> 1n;
        if (y >= x) break;
        x = y;
    }

    const lowDiff = n - x * x;
    const next = x + 1n;
    const highDiff = next * next - n;
    return highDiff < lowDiff ? next : x;
}

function totalPrimesInRange([lo, hi]) {
    if (hi < 2 || hi < lo) return 0;
    const sieve = Array(hi + 1).fill(true);
    sieve[0] = sieve[1] = false;
    for (let p = 2; p * p <= hi; p++) if (sieve[p]) for (let i = p * p; i <= hi; i += p) sieve[i] = false;
    let count = 0;
    for (let i = Math.max(2, lo); i <= hi; i++) if (sieve[i]) count++;
    return count;
}

function largestRectangle(data) {
    const hist = Array.from({ length: data.length }, () => Array(data[0].length).fill(0));
    for (let c = 0; c < data[0].length; c++) {
        let count = 0;
        for (let r = 0; r < data.length; r++) {
            count = data[r][c] === 0 ? count + 1 : 0;
            hist[r][c] = count;
        }
    }
    let maxArea = 0, ans = [[0, 0], [0, 0]];
    for (let r = 0; r < hist.length; r++) for (let c = 0; c < hist[r].length; c++) {
        if (hist[r][c] === 0) continue;
        let left = c, right = c;
        while (hist[r][left - 1] >= hist[r][c]) left--;
        while (hist[r][right + 1] >= hist[r][c]) right++;
        const area = (right - left + 1) * hist[r][c];
        if (area > maxArea) { maxArea = area; ans = [[r - hist[r][c] + 1, left], [r, right]]; }
    }
    return ans;
}

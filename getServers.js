/**
 * Returns an array of all servers reachable from home.
 */
export function getAllServers(ns) {
	const queue = ["home"];
	const discovered = new Set(queue);

	while (queue.length) {
		const server = queue.shift();
		for (const neighbor of ns.scan(server)) {
			if (!discovered.has(neighbor)) {
				discovered.add(neighbor);
				queue.push(neighbor);
			}
		}
	}

	return [...discovered];
}
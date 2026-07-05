# dnet helper fleet

Small darknet helpers intended for disk-rich/RAM-poor nodes.

- `bootstrap.js` starts helpers, tries known passwords first, replicates to solved neighbors, and launches labyrinth workers. It starts `repair.js` first so cracked nodes aggressively clear blocked RAM. If a solved neighbor has no RAM for bootstrap, it launches `/dnet/unlock-ram.js` locally to free enough target RAM and then start bootstrap.
- `sync-files.js` periodically copies the fleet from `home`; only `labyrinth.js` is restarted on change.
- `scout.js` records graph/details to `/data/dnet-map.txt` and `/data/dnet-hints.txt`.
- `static-solve.js` handles cheap/static/offline password transforms.
- `dynamic-solve.js` handles feedback-driven minigames using bounded attempts and heartbleed peeks.
- `brute-worker.js` handles only tiny numeric brute force and re-checks `/data/dnet-passwords.txt` during loops.
- `log-harvest.js` is non-BN15-safe; it uses `heartbleed()` to enrich hints.
- `repair.js` aggressively clears all local blocked RAM in bounded chunks, which guarantees `.cache` rewards on non-labyrinth servers when fully cleared, then restarts missing daemons.

Start with:

```js
run /dnet/bootstrap.js --tail --max-reallocs 50 --labyrinth-free 128
```

For BN15, run bootstrap with `--bn15`/`--no-heartbleed`; do not run `log-harvest.js` or `dynamic-solve.js` because both use `heartbleed()`.

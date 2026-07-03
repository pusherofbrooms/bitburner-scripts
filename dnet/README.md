# dnet helper fleet

Small darknet helpers intended for disk-rich/RAM-poor nodes.

- `bootstrap.js` starts helpers, tries known passwords first, replicates to solved neighbors, and launches labyrinth workers. If a solved neighbor has no RAM for bootstrap, it launches `/dnet/unlock-ram.js` locally to free enough target RAM and then start bootstrap.
- `sync-files.js` periodically copies the fleet from `home`; only `labyrinth.js` is restarted on change.
- `scout.js` records graph/details to `/data/dnet-map.txt` and `/data/dnet-hints.txt`.
- `static-solve.js` handles cheap/static/offline password transforms.
- `brute-worker.js` handles only tiny numeric brute force and re-checks `/data/dnet-passwords.txt` during loops.
- `log-harvest.js` is non-BN15-safe; it uses `heartbleed()` to enrich hints.
- `repair.js` frees enough local blocked RAM for the tiny helper set and restarts missing daemons.

Start with:

```js
run /dnet/bootstrap.js --tail --target-free 16 --labyrinth-free 128
```

For BN15, do not run `log-harvest.js`.

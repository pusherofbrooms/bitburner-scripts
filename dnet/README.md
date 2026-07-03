# dnet helper fleet

Small darknet helpers intended for disk-rich/RAM-poor nodes.

- `bootstrap.js` starts helpers, tries known passwords first, replicates to solved neighbors, and launches labyrinth workers.
- `sync-files.js` periodically copies the fleet from `home`; only `labyrinth.js` is restarted on change.
- `scout.js` records graph/details to `/data/dnet-map.txt` and `/data/dnet-hints.txt`.
- `static-solve.js` handles cheap/static/offline password transforms.
- `brute-worker.js` handles only tiny numeric brute force and re-checks `/data/dnet-passwords.txt` during loops.
- `log-harvest.js` is non-BN15-safe; it uses `heartbleed()` to enrich hints.
- `repair.js` frees blocked RAM and restarts missing tiny helpers.

Start with:

```js
run /dnet/bootstrap.js --tail
```

For BN15, do not run `log-harvest.js`.

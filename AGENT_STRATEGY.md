# Agent Strategy Notes: Bitburner Automation

Living handoff notes for using pi + agent-browser + the Bitburner bridge to start, resume, and manage a Bitburner run end-to-end. Keep this file BitNode-neutral: prefer repeatable observation, safe automation, and only specialize when the current BitNode mechanics justify it.

Core objective: a coding agent should be able to open or recover a headed Bitburner browser session, connect the bridge, inspect current game state, push/run scripts, make progression decisions, and leave enough state for the next agent to continue.

## Fresh agent handoff

Assume the game may already be in progress. Verify before acting.

Local context:

- Bitburner source clone: `~/ai/bitburner-src/`
- Bridge project: `~/ai/pi-bitburner-bridge/`
- This repo contains local scripts to push to Bitburner `home`.
- Default in-game server for script pushes is `home`.

Preferred headed launch/resume:

```text
agent-browser --session bitburner --profile ~/.agent-browser-profiles/bitburner open <bitburner-url>
agent-browser --session bitburner snapshot -i -c
bb_status
bb_list_files home
bb_get_all_servers
```

Use the same `--profile` every time. It gives Chrome durable browser state across agent/browser restarts. `--session <name>` only names the live agent-browser daemon/session; it is not durable storage by itself. `--session-name <name>` persists cookies + localStorage under `~/.agent-browser/sessions/`, but is narrower than a full Chrome profile.

Never run `agent-browser state clear` / `state clear --all` unless intentionally deleting saved state. If `agent-browser` becomes unresponsive while the visible Bitburner UI still works, close/reopen the agent-browser session with the same persistent profile.

If the bridge is listening but not connected, connect it in-game:

```text
Options → Remote API
Host: 127.0.0.1
Port: 12525
Use wss: off
Click Connect
```

Fresh-game bootstrap:

```text
# after bridge connects and scripts exist on home
run rootall.js
run deployall.js basic-hack.js n00dles
# then use UI for early study/work if useful, and buy TOR/programs when affordable
```

If local scripts are missing in-game, push the needed files from this repo to `home` via `bb_push_file` before running them.

Resume-after-interruption checklist:

1. Reopen headed browser with the same persistent `--profile`.
2. Take a snapshot and clear blocking modals/popups if safe.
3. Check `bb_status`; reconnect Remote API in-game if needed.
4. Inspect files, known servers, running scripts, money, work/focus, factions, programs, and current target.
5. Continue from observed state; do not assume the previous plan is still valid.

State to inspect before choosing actions:

- current BitNode/source files/multipliers if visible,
- money, hacking level, home RAM/cores,
- current work/focus state,
- rooted servers and port opener programs,
- TOR/darknet status and installed/bought programs,
- current factions, pending invites, owned/queued augmentations,
- scripts running on `home` and workers,
- side systems unlocked/valuable in this run: IPvGO, stock market, gang, corporation, sleeves, Bladeburner, Stanek.

Avoid `pi-agent.js` in the opening minutes if home RAM is tight. Use Remote API for files/server metadata and `agent-browser` for terminal/UI actions. Install/run `pi-agent.js` later when RAM cost is negligible or diagnostics are worth it.

## Control model

Use a hybrid approach:

- **Remote API / bridge**: push files, list files, inspect known servers, calculate RAM.
- **agent-browser headed mode**: UI actions, terminal commands, city/vendor/faction/course/interactions, visual supervision.
- **Netscript**: actual grind/income/scaling.

Automation bias: if a task can be safely automated with Netscript, prefer a script over repeated manual/agent-browser actions. This reduces cognitive load, makes handoffs cleaner, and keeps the agent focused on decisions rather than UI chores. Singularity-gated actions may still need UI/terminal control until the needed Source-File/API access exists, but non-Singularity automation should be built or used aggressively.

Good automation candidates before Singularity:

- rooting/scanning/pathfinding/server info,
- target scoring and worker deployment,
- purchased-server buying/upgrading,
- coding contract discovery/solving,
- stock, gang, corp, Hacknet, IPvGO, Stanek, and darknet workflows when their APIs are available,
- reporting dashboards that summarize money, work, factions, targets, and next bottlenecks.

Prefer idempotent actions. `rootall.js`, `best-target.js`, `scanall.js`, `find-contracts.js` are safe to repeat. `deployall.js` and `killall.js` intentionally restart/stop workers, so avoid spamming them unless roots, target, or script choice changed.

## Script inventory

Core hacking/scaling:

- `rootall.js` — root everything currently possible.
- `basic-hack.js` — simple weaken/grow/hack loop.
- `deployall.js` — copy and run a script on rooted public worker servers; early-game only, skips `home` and `pserv-*`.
- `best-target.js`, `server-info.js` — target scoring/inspection.
- `fleet-hwgw.js` + `batchhack.js`/`batchgrow.js`/`batchweaken.js` — coordinated HWGW fleet across rooted RAM, including cloud servers.
- `fleet-hwgw-formulas.js` — formulas-aware fleet controller after `Formulas.exe`; supports `--all` multi-target mode.
- `purchase-servers.js`, `upgrade-server.js` — cloud-server scaling via current `ns.cloud.*` APIs.
- `killall.js` — kill scripts on rooted servers; skips `home` unless `--include-home`.

Discovery/utilities:

- `path.js`, `scanall.js`, `getServers.js`, `lsall.js`, `psgrep.js`, `player.js`.
- `find-contracts.js`, `solve-contracts.js`, `contract-desc.js`, `contract-attempt.js`.

Side systems:

- Darknet: `dnet-crawl.js`, `dnet-crawl-bn15.js`.
- IPvGO: `go-one-ply.js`, `go-lookahead.js`, `go-monte-carlo.js`.
- Stocks: `stocks.js`, `liquidate-stocks.js`.
- Gang: `gang.js`.
- Corp: `corp/`.
- Stanek: `stanek-*.js`.
- Sharing: `share.js`.

## Opening plan, BitNode-neutral

After the bootstrap, buy TOR/programs when cash allows, reroot, and reconsider target:

```text
City → Alpha Enterprises → buy TOR
buy -a
run rootall.js
run best-target.js
run deployall.js basic-hack.js <target>
```

`n00dles` is often better than it looks in the mud phase: high growth, low security, high hack chance, and fast feedback. `best-target.js` becomes more reliable after port openers/RAM are available. If a target appears stuck prepping under `basic-hack.js`, fall back to an easier target.

## Program, TOR, and darknet plan

Prefer buying TOR + programs once hacking income is established. Creating programs is usually only attractive when cash is severely constrained, the BitNode changes economics, or the agent needs a specific opener immediately.

Priority:

```text
TOR
BruteSSH.exe
FTPCrack.exe
relaySMTP.exe
HTTPWorm.exe
SQLInject.exe
Formulas.exe when batch precision or late-game automation justifies the price
```

After every new port opener:

```text
run rootall.js
run best-target.js
run deployall.js basic-hack.js <target>
```

Darknet notes:

- TOR is bought through city UI, not terminal: `City → Alpha Enterprises → Purchase TOR router`.
- After TOR, `buy -a` purchases affordable darkweb programs.
- `DarkscapeNavigator.exe` can unlock darknet/cache exploration. Buy it when the cost is small relative to current income or when a BitNode rewards darknet work.
- After buying it, run `dnet-crawl.js` (or `dnet-crawl-bn15.js` in BN15-specific contexts) and inspect/open cache files for extra money/opportunities.

## Hacking income progression

1. **Bootstrap:** `basic-hack.js` on `n00dles` or another easy server.
2. **Expansion:** buy port openers, reroot, redeploy public rooted workers to a better target.
3. **Cloud RAM:** buy/upgrade cloud servers when RAM is the bottleneck; do not rely on `deployall.js` to use them.
4. **Batch transition:** when enough RAM exists, run `fleet-hwgw.js`.
5. **Formulas transition:** after `Formulas.exe`, prefer `fleet-hwgw-formulas.js`, usually in `--all` mode.

Fleet controller examples:

```text
run fleet-hwgw.js <best-target> --reserve 8
run fleet-hwgw-formulas.js <best-target> --reserve 8
run fleet-hwgw-formulas.js --all --targetLimit 8 --reserve 8
```

The `--reserve` flag mainly protects `home` command/control RAM. If running a controller off-home, account for controller-host RAM separately.

Cloud-server caution: `purchase-servers.js` is not fully idempotent. Current Bitburner `ns.cloud.purchaseServer()` auto-renames on hostname collision, so inspect existing cloud servers before rerunning purchase commands. Prefer `upgrade-server.js` for known existing servers.

To clear worker state:

```text
run killall.js
run killall.js --include-home
```

## Augmentation install lifecycle

Treat augmentation purchase/install as a deliberate lifecycle, not an opportunistic click. Purchased augmentations give no benefit until installed, and every augmentation purchase doubles the price of later augmentation purchases in the same life. Costs reset after installation.

Default policy:

1. **Normal life: do not buy augmentations yet.** Earn money/rep, unlock factions, improve income, and track candidate augmentations.
2. **Decide the life is ending.** Stop chasing long-tail goals unless they are close and high-value.
3. **Pre-install spending first.** Upgrade home RAM/cores as much as desired for the next cycle before spending money on queued augmentations. Home RAM/core upgrades persist through augmentation installs.
4. **Liquidate/spend transient resources.** Sell stocks if relevant; spend hashes or other reset-prone side resources where useful.
5. **Buy the selected augmentation bundle.** Respect prerequisites, then buy desired augmentations from most expensive/highest-value down to cheapest filler.
6. **Install immediately.** Do not leave expensive queued augmentations sitting around unless there is a very specific reason.
7. **Post-install recovery.** Rerun the opener: start income scripts, reroot, rebuy TOR/programs as needed, rejoin/backdoor factions, choose focused work.

What resets on augmentation install, per current source/docs:

- **Lost/reset:** money, skills/XP, current work, jobs, faction memberships/invites except special keep-on-install factions, faction/company reputation converted to favor, purchased servers, Hacknet nodes, stocks, TOR router, programs, scripts on non-home servers, running scripts.
- **Kept:** installed augmentations, scripts/files on `home`, home RAM/core upgrades, and stock market account/API access when already unlocked.
- **Conditional exceptions:** some installed augmentations grant starting money/programs; Source-File/BitNode feature unlocks can also grant things after reset. For example, source shows `Formulas.exe` is restored only when the relevant BitNode feature is accessible, and Darkscape Navigator is restored only when the BN15 feature is accessible. Do not assume programs or `Formulas.exe` persist by default.

Install timing heuristics:

- Install when the next-life multiplier gain is worth losing current money/rep/scripts, or when current-life progress has slowed badly.
- Prefer a coherent bundle over a single cheap augmentation unless the BitNode strongly rewards rapid resets.
- Do not delay forever waiting for one expensive augmentation if several cheaper high-impact installs would greatly accelerate the next cycle.
- Before buying, inspect all joined factions and build a global target list. Cheap filler is fine only after the main targets and home upgrades are secured.

## Factions and augmentations

General loop:

```text
run rootall.js
run path.js <server>
connect ...
backdoor
home
accept faction invite
```

Hacker faction chain, common requirements approximate:

```text
CyberSec        → backdoor CSEC          (~51 hacking)
NiteSec         → backdoor avmnite-02h   (~202 hacking)
The Black Hand  → backdoor I.I.I.I       (~340 hacking)
BitRunners      → backdoor run4theh111z  (~505 hacking)
```

Do not overfit to BN1. In each BitNode, prioritize factions/augs that accelerate the current win condition:

- hacking BitNodes: hacking XP, hacking speed, money, faction rep, Hacknet/server RAM support,
- gang/combat BitNodes: combat/gang/faction utility may beat pure hacking,
- corp/stock BitNodes: money multipliers and system-specific unlocks may dominate,
- high-penalty BitNodes: cheap early augments can be worth installing sooner.

Before buying augmentations, make a global list across joined factions, then buy from most expensive to least expensive. Install when the expected multiplier gain is worth resetting money/scripts/rep progress, not merely because one cheap augmentation is affordable.

City-faction lockout lasts only for the current life. Pick a city deliberately based on available augs and current goal. Common hacking-friendly picks include Chongqing/Tian Di Hui early and Sector-12/Aevum in later cycles, but verify current needs instead of treating BN1 preferences as universal.

## Work, study, and focus

Keep all manual/foreground work decisions here. Scripts should handle money in the background; the player's active work should usually target the current bottleneck.

Work priority:

1. **Faction work for selected augmentations** — default best use of focused time once a useful faction is joined. Pick the faction based on the next desired augmentation(s), not just highest current rep.
2. **Company work for unlocks or company augmentations** — only when a company faction/invite or company-specific augmentation is part of the plan. Otherwise it is usually slower than direct faction work for a hacking-focused run.
3. **University study / training** — use free Computer Science for hacking XP when no useful faction/company work is available, or when the next unlock is gated mostly by hacking level. Use other classes/gyms only for a specific requirement.
4. **Crime** — generally not a default work lane for hacking BitNodes. Use it for crime-faction invites, combat stats, karma/gang setup, or BitNodes where crime is favored.
5. **Do nothing / wait** — acceptable only when scripts/side systems are doing the real work and active work would add negligible value.

Focus rules:

- By default, assume unfocused work is penalized. Before long waits/sleeps, focus the highest-value current work.
- The key exception is **Neuroreceptor Management Implant** from **Tian Di Hui** (`75k` rep / `$550m` base cost), whose stat text says it removes the penalty for not focusing on jobs/faction work. After installing it, unfocused work becomes much safer while the agent uses the UI/terminal.
- Before that implant, briefly unfocus only when agent attention is needed for UI-heavy tasks, then return to focused work afterward.
- Recheck work after buying/installing augmentations, joining factions, reaching new hacking thresholds, or changing BitNode goals.

Faction-work loop:

```text
inspect joined factions and available augmentations
choose next desired augmentation bundle
work for the faction with the most valuable reachable bundle
use share.js if faction rep is the bottleneck and spare RAM exists
stop/switch once required rep is reached or another bottleneck dominates
```

Periodically check pending faction invites manually, especially if notification popups are disabled.

## Side-system triage

Treat side systems as optional engines. Start them only when unlocked and expected payoff beats simply improving hacking/faction progress.

- **IPvGO:** run `go-one-ply.js` for cheap/basic play; try `go-lookahead.js` or `go-monte-carlo.js` when RAM/time allows. Re-evaluate payoff by BitNode; GO can be useful passive value but should not starve core hacking in the opener.
- **Darknet:** after `DarkscapeNavigator.exe`, run crawler/cache workflow. Stronger in BitNodes or states where cache rewards are material.
- **Contracts:** run `find-contracts.js` / `solve-contracts.js` when home RAM is free enough; contracts are usually worthwhile one-shots.
- **Stocks:** use `stocks.js` only when market access/seed money/forecast info make it worthwhile. Use `liquidate-stocks.js` before installs or when cash is needed.
- **Gang:** if available, `gang.js` may become the main progression engine; do not ignore it in gang-favorable BitNodes.
- **Corporation:** use `corp/` only when corp is unlocked/affordable or central to the BitNode.
- **Stanek:** use `stanek-*.js` in Stanek-relevant runs; otherwise skip until it is clearly beneficial.
- **Share:** `share.js` is useful when faction reputation is the bottleneck and spare RAM exists.

## UI / notification hygiene

Bitburner notification popups can block or confuse `agent-browser` clicks and snapshots. Consider reducing noisy popups:

```text
Options → Gameplay → disable unwanted notifications
```

If faction invite notifications are disabled, periodically inspect the Factions tab and accept invites manually.

## Local verification

Use the Nix dev shell for local checks; do not assume global Node/TypeScript tools exist:

```text
nix develop --command npm run typecheck
```

Nix can be slow on this machine; use long timeouts before assuming it is hung.

## Standard agent round

1. **Observe**
   - money, hacking level, home RAM/cores,
   - current work/focus state,
   - joined factions, invites, useful aug rep/cost,
   - running scripts and active target,
   - port opener/TOR/darknet/Formulas status,
   - visible errors/modals,
   - side systems worth using now.
2. **Stabilize income**
   - ensure hacking scripts are running,
   - inspect target prep if income stalls,
   - upgrade target/controller only when it improves expected income.
3. **Expand unlocks**
   - buy programs when affordable,
   - reroot and backdoor newly accessible faction servers,
   - upgrade home/purchased servers when RAM is constraining automation.
4. **Progress reputation/augs**
   - pick focused work deliberately,
   - use `share.js` if spare RAM can speed rep,
   - buy/install only at a sensible reset point.
5. **Harvest one-shots/side systems**
   - contracts, darknet caches, IPvGO moves, stock liquidation, etc.
6. **Leave a clean handoff**
   - note active target/scripts, current work, next desired unlock, and any UI state that matters.

Example actions:

```text
if no scripts running / early state:
  run rootall.js
  run deployall.js basic-hack.js n00dles

if enough money and no TOR:
  City → Alpha Enterprises → Purchase TOR router
  buy -a

if new programs acquired:
  run rootall.js
  run best-target.js
  run deployall.js basic-hack.js <target>

if enough home/cloud RAM:
  run fleet-hwgw.js <target> --reserve 8

if Formulas.exe is owned:
  run fleet-hwgw-formulas.js --all --targetLimit 8 --reserve 8

if DarkscapeNavigator.exe is owned:
  run dnet-crawl.js

if IPvGO is worth using:
  run go-one-ply.js  # or lookahead/monte-carlo variant
```

## Historical notes from first BN1 live run

These observations are not universal strategy, but may help explain past choices:

- Hacking reached 60+ from studying/scripts.
- Bought TOR from Alpha Enterprises.
- `buy -a` purchased `BruteSSH.exe` and `FTPCrack.exe`.
- `rootall.js` then rooted many more servers including `CSEC`, `silver-helix`, `zer0`, `neo-net`, `avmnite-02h`, `phantasy`, `the-hub`, `iron-gym`, `max-hardware`, `omega-net`.
- `best-target.js` recommended `sigma-cosmetics` at hack ~65 with 0–2 port openers.
- Redeployed `basic-hack.js` to `sigma-cosmetics` after root expansion.

Open question: whether `sigma-cosmetics` is actually better than staying on `n00dles` until first home upgrades under `basic-hack.js` prep constraints.

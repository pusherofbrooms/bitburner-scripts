# Agent Strategy Notes: BN1 Automation

Living notes for using pi + agent-browser + the Bitburner bridge to play and eventually break BN1.

## Fresh agent handoff

Assume a new handoff is probably a new BN1 game, but verify state before acting.

Useful local context:

- Bitburner source clone: `~/ai/bitburner-src/`
- Bridge project: `~/ai/pi-bitburner-bridge/`
- This repo contains local scripts to push to Bitburner `home`.
- Default in-game server for script pushes is `home`.

First checks:

```text
bb_status
bb_list_files home
bb_get_all_servers
agent-browser --session <name> snapshot -i -c
```

If `bb_status` shows the bridge is listening but not connected, connect it in-game:

```text
Options → Remote API
Host: 127.0.0.1
Port: 12525
Use wss: off
Click Connect
```

Do not assume freshness if a game is already open. Check:

- money and hacking level,
- current activity,
- rooted servers,
- installed/bought programs,
- whether TOR has been purchased,
- current factions and pending faction invites,
- running scripts if `pi-agent.js` is available.

Prefer not to run `pi-agent.js` early unless home RAM is plentiful. Use `agent-browser` terminal typing for early commands, and use the Remote API for file pushes/server metadata.

Release caveat: the web game is release Bitburner, while `~/ai/bitburner-src/` may be dev head. Use source for mechanics/API guidance, but verify live behavior when uncertain.

## Control model

Use a hybrid approach:

- **Remote API / bridge**: push files, list files, inspect known servers, calculate RAM.
- **agent-browser headed mode**: UI actions, terminal commands, city/vendor/faction/course interactions, visual supervision.
- **Netscript**: actual grind/income/scaling.

Avoid `pi-agent.js` at the very start: it costs home RAM. Use it later after home has been upgraded enough that the RAM cost is negligible.

## Current early/mid scripts

Useful repo scripts pushed to `home`:

- `rootall.js` — root everything currently possible.
- `basic-hack.js` — simple weaken/grow/hack loop.
- `deployall.js` — copy and run a script on all rooted worker servers.
- `best-target.js` — score viable targets.
- `fleet-hwgw.js` — coordinated HWGW fleet controller.
- `batchhack.js`, `batchgrow.js`, `batchweaken.js` — fleet workers.
- `purchase-servers.js`, `upgrade-server.js` — cloud server scaling.
- `find-contracts.js`, `solve-contracts.js` — coding contract support.
- `killall.js` — kill scripts on all rooted servers; skips `home` unless `--include-home`.
- `path.js`, `scanall.js`, `server-info.js`, `getServers.js` — utility scripts.

## Fresh BN1 opener

Baseline practical opener:

```text
run rootall.js
run deployall.js basic-hack.js n00dles
```

Then:

```text
City → Alpha Enterprises → buy TOR
buy -a
run rootall.js
run best-target.js
run deployall.js basic-hack.js <target>
```

### Why n00dles first?

`best-target.js` may recommend `foodnstuff` or `sigma-cosmetics` quickly, but `basic-hack.js` is a blunt loop and better-looking targets may spend a long time prepping. `n00dles` is operationally good for the mud phase:

- very high growth,
- low security,
- easy refill,
- high hack chance,
- fast enough cycles,
- immediate money/XP feedback.

Use `n00dles` until the first few unlocks/home upgrades if impatience or reliability matters.

## University study

Free Computer Science at Rothman University gives hacking XP, but early timing gains are damped by Bitburner's formula:

```js
time ∝ 1 / (hacking + 50)
```

For `foodnstuff`, hack level 1 → 30 only changes weaken time from roughly `206s` to `131s`. Useful, but not worth sitting idle.

Preferred rule:

```text
scripts running > free comp-sci study > idle
```

If possible, study simultaneously while scripts run. When sleeping/waiting for progress, click **Focus** on the current study/work/faction task first unless there is a reason to keep the UI interactive; otherwise Bitburner applies the unfocused-efficiency penalty.

## Program acquisition

Prefer buying TOR + programs over creating programs in fresh BN1, once income exists.

Priority:

```text
TOR
BruteSSH.exe
FTPCrack.exe
relaySMTP.exe
HTTPWorm.exe
SQLInject.exe
```

After every new port opener:

```text
run rootall.js
run best-target.js
run deployall.js basic-hack.js <target>
```

## Target selection

`best-target.js` scores rooted viable servers by:

```js
maxMoney * hackAnalyzeChance * log1p(serverGrowth) / weakenTime
```

This is grounded in actual Netscript mechanics, but it is not perfect for the very early `basic-hack.js` phase because it does not fully model prep time/current money/current security/thread budget.

Current heuristic:

- **Bootstrap phase**: `n00dles` is acceptable/preferred for reliable early flow.
- **After TOR + port openers + more RAM**: trust `best-target.js` more.
- **Before fleet HWGW**: if target feels stuck prepping, fall back to easier target.

Potential future improvement: add `--bootstrap` mode to `best-target.js` that heavily rewards current money, short weaken time, high hack chance, and refill ease.

## Home RAM, hacked-server RAM, and fleet transition

`fleet-hwgw.js` costs about `11.1 GB` RAM, so it needs at least one or two home RAM upgrades if run from `home`. However, rooted non-home servers can have useful RAM too. If a rooted hacked server has enough RAM, the fleet controller can run there instead of waiting for home upgrades.

Home-hosted transition condition:

```text
home RAM sufficient for fleet-hwgw.js + reserve
```

Then:

```text
run fleet-hwgw.js <best-target> --reserve 8
```

Non-home controller option:

```text
scp fleet-hwgw.js batchhack.js batchgrow.js batchweaken.js <host>
connect <host>
run fleet-hwgw.js <best-target> --reserve 8
home
```

The current `--reserve` only reserves RAM on `home`. This is intentional because `home` is the command/control machine and should not be filled with batch workers if we need to run `rootall.js`, `best-target.js`, `purchase-servers.js`, etc. If running the controller off-home, its own used RAM is naturally accounted for by `getServerUsedRam`, but there is no extra controller-host reserve.

If fleet is not viable yet, continue with:

```text
run deployall.js basic-hack.js <target>
```

To clear worker state across rooted servers:

```text
run killall.js
run killall.js --include-home
```

## TOR and vendor UI

TOR is bought through city UI, not terminal:

```text
City → Alpha Enterprises → Purchase TOR router
```

Then terminal:

```text
buy -a
```

## Faction strategy

### Hacking factions

BN1 should focus on the hacker faction chain. Unlocks are via backdooring special servers; exact hacking requirements vary somewhat by run, but approximate thresholds are:

```text
CyberSec        → backdoor CSEC          (~51 hacking)
NiteSec         → backdoor avmnite-02h   (~202 hacking)
The Black Hand  → backdoor I.I.I.I       (~340 hacking)
BitRunners      → backdoor run4theh111z  (~505 hacking)
```

Operational loop:

```text
run rootall.js
run path.js <server>
connect ...
backdoor
home
accept faction invite
```

For wall-clock efficiency, do not assume we should always wait for BitRunners before the first install. AFK play can make that natural, but agent play should probably install earlier when high-impact cheap/mid-cost augments are ready.

### City factions

City-faction lockout is only for the current life; after installing augmentations, enemy cities can be swept up in later cycles.

Current hacking-focused city read:

- **Chongqing first** is strong because of:
  - `Neuregen Gene Modification` — `hacking_exp 1.4`, about `$375m` / `37.5k rep`.
  - `DataJack` — `hacking_money 1.25`.
- **Sector-12 + Aevum later** is a good second-cycle/generalist sweep:
  - Sector-12: `CashRoot Starter Kit`, `Neuralstimulator` access.
  - Aevum: `Neurotrainer I`, `Synaptic Enhancement Implant`, `PCMatrix`.
- **New Tokyo / Ishima** look low-priority for hacking BN1. New Tokyo has `DataJack`, but Chongqing has it plus `Neuregen`; Ishima is mostly combat/dex utility.
- **Volhaven** is also not a primary hacking pick; mostly combat/company/social utility.

Expensive city/Tian Di Hui augs need wall-clock scrutiny:

- `Neuralstimulator` is useful but pricey: about `$3b` / `50k rep`; likely not a default first-install target unless already rich.
- `Neuroreceptor Management Implant` from Tian Di Hui removes unfocused work penalties, but costs about `$550m` / `75k rep`. Great for human AFK convenience, less obviously optimal for an agent that can focus/switch deliberately. Default agent strategy: skip first-cycle Neuroreceptor unless it does not significantly delay install.

### Crime

Generally ignore crime in fresh BN1. It is not the natural fastest lane for breaking BN1. Crime factions have some hacking augs, but the direct hacker-faction path is usually better.

Use crime only for a specific desired augmentation or if intentionally exploring.

## UI / notification hygiene

Bitburner notification popups can block or confuse `agent-browser` clicks and snapshots. Consider reducing noisy popups:

```text
Options → Gameplay → disable unwanted notifications
```

If faction invite notifications are disabled, the agent must remember to periodically check and accept invites manually:

```text
Factions tab → accept pending faction invitations
```

Add this especially after a successful `backdoor` on faction servers. The loop should also occasionally inspect the Factions tab even without visible popups.

## Agent loop

A turn looks like:

1. Observe state:
   - bridge status,
   - files,
   - rooted servers,
   - visible money/hack/activity via browser snapshot.
2. Decide one or two safe actions.
3. Execute via terminal/UI.
4. Wait/poll.

Example loop actions:

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

if enough home RAM:
  run fleet-hwgw.js <target> --reserve 8
```

Keep actions mostly idempotent. `rootall.js` and `best-target.js` are safe to repeat. `deployall.js` intentionally kills/restarts scripts on workers, so avoid spamming it unless roots/target changed.

## Notes from first live run

Observed state after some runtime:

- Hacking reached 60+ from studying/scripts.
- Bought TOR from Alpha Enterprises.
- `buy -a` purchased `BruteSSH.exe` and `FTPCrack.exe`.
- `rootall.js` then rooted many more servers including `CSEC`, `silver-helix`, `zer0`, `neo-net`, `avmnite-02h`, `phantasy`, `the-hub`, `iron-gym`, `max-hardware`, `omega-net`.
- `best-target.js` recommended `sigma-cosmetics` at hack ~65 with 0–2 port openers.
- Redeployed `basic-hack.js` to `sigma-cosmetics` after root expansion.

Open question: whether `sigma-cosmetics` is actually better than staying on `n00dles` until first home upgrades under `basic-hack.js` prep constraints.

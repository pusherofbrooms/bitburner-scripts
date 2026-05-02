# Bitburner Scripts

This directory contains local Bitburner scripts that are edited here and pushed into the running game via the pi Bitburner bridge.

Useful context:
- Current Bitburner source clone: `~/ai/bitburner-src/`
- Bridge project: `~/ai/pi-bitburner-bridge/`
- Default in-game target server for pushes: `home`

Guidelines:
- Check current Netscript APIs against `~/ai/bitburner-src/src/ScriptEditor/NetscriptDefinitions.d.ts` when unsure.
- Prefer `bb_push_file` with `localPath` to push completed scripts.
- After script changes, run a syntax check and calculate Bitburner RAM when relevant.
- Keep scripts compatible with Bitburner v3.0+.

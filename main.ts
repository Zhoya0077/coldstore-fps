// Coldstore — entry program for the threejs-fps-02 bounty (Node 22, no
// dependencies). The game itself is the static site under game/: plain ES
// modules plus the vendored three.js 0.187.0 build, playable offline in a
// browser. This program's whole job is the hand-in: copy game/ and
// screenshots/ into the output directory and write the dossier the judge
// reads, using the kit's own library so the bytes match the scorer's copy.
//
// Locally:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(repoDir, 'game'), join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoDir, 'screenshots'))) {
  cpSync(join(repoDir, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

// The caps below are the gate's own numbers (kit reference/gate.json): the
// dossier text the judge reads is capped at 160 KiB, screenshots at 4 files
// of 256 KiB, and game/ at 993 entries and 48 MiB.
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  }),
);

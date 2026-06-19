#!/usr/bin/env node
import { main } from '../src/main.js';

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

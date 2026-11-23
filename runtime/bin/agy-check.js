#!/usr/bin/env node
'use strict';

const { runPanelCli } = require('../panel-cli.js');

runPanelCli(process.argv.slice(2))
  .then(code => {
    if (typeof code === 'number' && code !== 0) {
      process.exit(code);
    }
  })
  .catch(err => {
    process.stderr.write(`${err && err.stack ? err.stack : String(err)}\n`);
    process.exit(1);
  });

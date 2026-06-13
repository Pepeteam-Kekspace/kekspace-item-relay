#!/bin/bash
# Quick Node mock server for the LEGACY endpoint only.
# Listens on :3030 but only accepts POST /Kekspace/Web3ItemTransferLegacy, so you
# see exactly what the game server would receive at the legacy route. Any other
# path returns 404 (the normalized route is intentionally ignored here).
# This is only needed if enabling test mode and there is no game endpoint yet.
node -e "
const LEGACY_PATH = '/Kekspace/Web3ItemTransferLegacy';
require('http').createServer((req, res) => {
  let body = '';
  req.on('data', d => body += d);
  req.on('end', () => {
    if (req.method !== 'POST' || req.url !== LEGACY_PATH) {
      console.log('Ignored ' + req.method + ' ' + req.url + ' (not the legacy endpoint)');
      res.writeHead(404);
      res.end(JSON.stringify({error: 'mock only serves ' + LEGACY_PATH}));
      return;
    }
    let parsed;
    try { parsed = JSON.parse(body); } catch (e) { parsed = body; }
    console.log('Received LEGACY webhook:', parsed);
    res.writeHead(200);
    res.end(JSON.stringify({ok: true}));
  });
}).listen(3030);
console.log('Mock LEGACY webhook server listening on http://localhost:3030' + LEGACY_PATH);
"

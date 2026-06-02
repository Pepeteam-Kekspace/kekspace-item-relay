#!/bin/bash
# Quick Node mock server. Normally the game  will listen to events sent from the listener to port 3000
# This allows testing curl calls with no game/webhook server setup 
# This is only needed if enabling test mode and there is no game endpoint yet
node -e "
require('http').createServer((req, res) => {
  let body = '';
  req.on('data', d => body += d);
  req.on('end', () => {
    console.log('Received webhook:', JSON.parse(body));
    res.writeHead(200);
    res.end(JSON.stringify({ok: true}));
  });
}).listen(3030);
console.log('Mock webhook server on :3030');
"

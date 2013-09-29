#!/usr/bin/env node
(function() {
  var argv, client, host, localport, optimist, port, server, wsHost, wst, _, _ref, _ref1;

  _ = require("under_score");

  wst = require("../lib/wst");

  optimist = require('optimist').usage("\nRun websocket tunnel server or client.\n  To run server: wstunnel -s 8080\n  To run client: wstunnel -t localport:host:port ws://wshost:wsport\nNow connecting to localhost:localport is same as connecting to host:port on wshost\nIf websocket server is behind ssl proxy, then use \"wss://host:port\" in client mode\nFor security, you can \"lock\" the tunnel destination on server side, for eample:\n  wstunnel -s 8080 -t host:port\nServer will tunnel incomming websocket connection to host:port only, so client can just run\n  wstunnel -t localport ws://wshost:port\nIf client run:\n  wstunnel -t localpost:otherhost:otherport ws://wshost:port\n  * otherhost:otherport is ignored, tunnel destination is still \"host:port\" as specified on server.\n").string("s").string("t").alias('t', "tunnel").describe('s', 'run as server, specify listen port').describe('tunnel', 'run as tunnel client, specify localport:host:port');

  argv = optimist.argv;

  if (_.size(argv) === 2) {
    return console.log(optimist.help());
  }

  if (argv.s) {
    if (argv.t) {
      _ref = argv.t.split(":"), host = _ref[0], port = _ref[1];
      server = new wst.server(host, port);
    } else {
      server = new wst.server;
    }
    server.start(argv.s);
  } else if (argv.t) {
    client = new wst.client;
    wsHost = _.last(argv._);
    _ref1 = argv.t.split(":"), localport = _ref1[0], host = _ref1[1], port = _ref1[2];
    if (host && port) {
      client.start(localport, wsHost, "" + host + ":" + port);
    } else {
      client.start(localport, wsHost);
    }
  } else {
    return console.log(optimist.help());
  }

}).call(this);

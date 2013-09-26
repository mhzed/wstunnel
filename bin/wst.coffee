_ = require "under_score"
wst = require "../lib/wst"

optimist = require('optimist')
  .usage("""
     Run websocket tunnel server or client.
       To run server: wstunnel -s 8080
       To run client: wstunnel -tunnel localport:host:port ws://wshost:wsport
     Now connecting to localhsot:localport is same as connecting to host:port
    """)
  .string("s")
  .string("t")
  .alias('t', "tunnel")
  .describe('s', 'run as server, specify listen port')
  .describe('tunnel', 'run as tunnel client, specify localport:host:port')
;
argv =  optimist.argv;

if _.size(argv) == 2
  return console.log(optimist.help());

if argv.s
  server = new wst.server
  server.start(argv.s)
else if argv.t
  client = new wst.client
  wsHost = _.last(argv._)
  [localport, host, port] = argv.t.split(":")  # localport:host:port
  client.start(localport, wsHost, "#{host}:#{port}")
else
  return console.log(optimist.help());

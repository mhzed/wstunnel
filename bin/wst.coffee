_ = require "under_score"

optimist = require('optimist')
  .usage("""

     Run websocket tunnel server or client.
       To run server: wstunnel -s 8080
       To run client: wstunnel -t localport:host:port ws://wshost:wsport
     Now connecting to localhost:localport is same as connecting to host:port on wshost
     If websocket server is behind ssl proxy, then use "wss://host:port" in client mode
     For security, you can "lock" the tunnel destination on server side, for eample:
       wstunnel -s 8080 -t host:port
     Server will tunnel incomming websocket connection to host:port only, so client can just run
       wstunnel -t localport ws://wshost:port
     If client run:
       wstunnel -t localpost:otherhost:otherport ws://wshost:port
       * otherhost:otherport is ignored, tunnel destination is still "host:port" as specified on server.

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
  wst = require "../lib/wst"
  if argv.t
    [host, port] = argv.t.split(":")
    server = new wst.server(host, port)
  else
    server = new wst.server
  server.start(argv.s)
else if argv.t
  require "../lib/https_override" # allow any certificate
  wst = require "../lib/wst"
  client = new wst.client
  wsHost = _.last(argv._)
  [localport, host, port] = argv.t.split(":")  # localport:host:port
  if host && port
    client.start(localport, wsHost, "#{host}:#{port}")
  else
    client.start(localport, wsHost)
else
  return console.log(optimist.help());


module.exports = (Server, Client)->
  optimist = require('optimist')
  argv = optimist
    .usage("""

       Run websocket tunnel server or client.
         To run server: wstunnel -s 8080
         To run client: wstunnel -t localport:host:port ws://wshost:wsport
         Or client via proxy: wstunnel -t localport:host:port -p http://[user:pass@]host:port ws://wshost:wsport

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
    .string("proxy")
    .alias('t', "tunnel")
    .boolean('c')
    .boolean('http')
    .alias('c', 'anycert')
    .default('c', false)
    .describe('s', 'run as server, specify listen port')
    .describe('tunnel', 'run as tunnel client, specify localport:host:port')
    .describe("proxy", "connect via a http proxy server in client mode")
    .describe("c", "accpet any certificates")
    .argv
  ;

  if argv.s
    if argv.t
      [host, port] = argv.t.split(":")
      server = new Server(host, port)
    else
      server = new Server()
    server.start argv.s, (err)=>
      if not err then console.log " Server is listening on #{argv.s}"

  else if argv.t
    require("machine-uuid") (machineId)->
      require("../lib/httpSetup").config(argv.proxy, argv.c)
      client = new Client()

      if argv.http
        client.setHttpOnly true

      wsHost = argv._[..-1][0]
      [localport, host, port] = argv.t.split(":")  # localport:host:port

      client.verbose()
      if host && port
        client.start(localport, wsHost, "#{host}:#{port}", {'x-wstclient': machineId} )
      else
        client.start(localport, wsHost, undefined, {'x-wstclient': machineId} )
  else
    return console.log(optimist.help());


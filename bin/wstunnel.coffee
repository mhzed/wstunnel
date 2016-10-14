
module.exports = (Server, Client)->
  optimist = require('optimist')
  argv = optimist
    .usage("""

       Run websocket tunnel server or client.
         To run server: wstunnel -s 8080
         To run client: wstunnel -t localport:host:port ws[s]://wshost:wsport
         Or client via proxy: wstunnel -t localport:host:port -p http://[user:pass@]host:port ws[s]://wshost:wsport

       Now connecting to localhost:localport is same as connecting to host:port on wshost

       For security, you can "lock" the tunnel destination on server side, for eample:
         wstunnel -s 8080 -t host:port
       Server will tunnel incomming websocket connection to host:port only, so client can just run
         wstunnel -t localport ws://wshost:port
       If client run:
         wstunnel -t localport:otherhost:otherport ws://wshost:port
         * otherhost:otherport is ignored, tunnel destination is still "host:port" as specified on server.

       In client mode, you can bind stdio to the tunnel by running:
         wstunnel -t stdio:host:port ws[s]://wshost:wsport
       This allows the command to be used as ssh proxy:
         ssh -o ProxyCommand="wstunnel -c -t stdio:%h:%p https://wstserver" user@sshdestination
       Above command will ssh to "user@sshdestination" via the wstunnel server at "https://wstserver"

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
      client.verbose()

      localAddr = undefined
      remoteAddr = undefined
      toks = argv.t.split(":")
      if toks.length == 4
        localAddr = "#{toks[0]}:#{toks[1]}"
        remoteAddr = "#{toks[2]}:#{toks[3]}"
      else if toks.length == 3
        if toks[0] == 'stdio'
          client.startStdio(wsHost, remoteAddr, {'x-wstclient': machineId}, (err)=>
            if (err)
              console.error(err)
              process.exit(1)
          )
          return
        else
          localAddr = "127.0.0.1:#{toks[0]}"
          remoteAddr = "#{toks[1]}:#{toks[2]}"
      else if toks.length == 1
        localAddr = "127.0.0.1:#{toks[0]}"

      client.start(localAddr, wsHost, remoteAddr, {'x-wstclient': machineId});

  else
    return console.log(optimist.help());


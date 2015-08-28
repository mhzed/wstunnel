
net = require("net")
WsStream = require "./WsStream"
url = require('url')
log = require "lawg"
ClientConn = require "./httptunnel/ClientConn"
etagHeader = require "./etagHeader"
createWsClient = ()->
  new (require('websocket').client)()

module.exports = class wst_client extends require('events').EventEmitter
  ###
  emit Events:
  'tunnel' (WsStream|ClientConn) when a tunnel is established
  'connectFailed' (err) when ws connection failed
  'connectHttpFailed' (err) when http tunnel connection failed
  ###

  constructor: ()->
    @tcpServer = net.createServer();

  verbose : ()->
    @on 'tunnel', (ws, sock)=>
      if ws instanceof WsStream then log 'Websocket tunnel established'
      else log 'Http tunnel established'
      sock.on 'close', ()=> log 'Tunnel closed'
    @on 'connectHttpFailed', (error)=> log('HTTP connect error: ' + error.toString());
    @on 'connectFailed', (error)=> log('WS connect error: ' + error.toString());

  setHttpOnly : (@httpOnly)->

  # example:  start(8081, "wss://ws.domain.com:454", "dst.domain.com:22")
  # meaning: tunnel *:localport to remoteAddr by using websocket connection to wsHost
  # or start("localhost:8081", "wss://ws.domain.com:454", "dst.domain.com:22")
  # @wsHostUrl:  ws:// denotes standard socket, wss:// denotes ssl socket
  #              may be changed at any time to change websocket server info
  start: (localAddr, @wsHostUrl, remoteAddr, optionalHeaders, cb)->
    if typeof optionalHeaders == 'function'
      cb = optionalHeaders
      optionalHeaders = {}

    if typeof localAddr == 'number' then localPort = localAddr
    else
      [localHost, localPort] = localAddr.split ':'
      if /^\d+$/.test(localHost)
        localPort = localHost
        localHost = null
      localPort = parseInt(localPort)
    localHost ?= '127.0.0.1'

    @tcpServer.listen(localPort, localHost, cb)
    @tcpServer.on("connection", (tcpConn)=>
      wsConnect = (cb)=>
        if remoteAddr then wsurl = "#{@wsHostUrl}/?dst=#{remoteAddr}" else wsurl = "#{@wsHostUrl}"
        wsClient = createWsClient();
        urlo = url.parse wsurl
        if urlo.auth
          optionalHeaders.Authorization = 'Basic ' + (new Buffer(urlo.auth)).toString('base64')
        wsClient.connect(wsurl, 'tunnel-protocol', undefined, optionalHeaders)
        wsClient.on 'connectFailed', (error)=>cb(error)
        wsClient.on 'connect', (wsConn)=>
          wsStream = new WsStream(wsConn);
          cb(null, wsStream)

      httpConnect = (cb)=>
        tunurl = @wsHostUrl.replace /^ws/, 'http'
        if remoteAddr then tunurl += "?dst=#{remoteAddr}"
        httpConn = new ClientConn(tunurl)
        httpConn.connect optionalHeaders, (err)=>
          if err then cb(err)
          else cb(null, httpConn)

      httpConnectCb = (error, httpConn)=>
        if error
          @emit 'connectHttpFailed', error
          tcpConn.end();  # kill tunnel counter part
        else
          require("./bindStream")(httpConn, tcpConn)
          @emit 'tunnel', httpConn, tcpConn

      if @httpOnly
        httpConnect httpConnectCb
      else
        wsConnect (error, wsStream)=>
          if not error
            require("./bindStream")(wsStream, tcpConn)
            @emit 'tunnel', wsStream, tcpConn
          else
            @emit 'connectFailed', error
            httpConnect httpConnectCb

    )
WebSocketServer = require('websocket').server;
http = require('http');
url = require("url");
net = require("net");
WsStream = require "./WsStream"
log = require "lawg"
HttpTunnelServer = require "./httptunnel/Server"
HttpTunnelReq = require "./httptunnel/ConnRequest"
ChainedWebApps = require "./ChainedWebApps"

module.exports = class wst_server

  # if dstHost, dstPort are specified here, then all tunnel end points are at dstHost:dstPort, regardless what
  # client requests, for security option
  # webapp: customize webapp if any, you may use express app
  constructor: (@dstHost, @dstPort, webapp)->
    @httpServer = http.createServer()
    @wsServer = new WebSocketServer(
        httpServer: @httpServer,
        autoAcceptConnections: false
    )
    # each app is http request handler function (req, res, next),  calls next() to ask next app
    # to handle request
    apps = new ChainedWebApps()
    @tunnServer = new HttpTunnelServer(apps)
    if webapp
      apps.setDefaultApp webapp
    apps.bindToHttpServer @httpServer

  # localAddr:  [addr:]port, the local address to listen at, i.e. localhost:8888, 8888, 0.0.0.0:8888
  start: (localAddr, cb)->
    [localHost, localPort] = @_parseAddr(localAddr)
    @httpServer.listen localPort, localHost, (err)=>
      if cb then cb(err)

      handleReq = (request, connWrapperCb)=>
        httpRequest = request.httpRequest
        @authenticate httpRequest, (rejectReason, target, monitor)=>
          if (rejectReason)
            return request.reject(500, JSON.stringify(rejectReason))
          {host, port} = target
          tcpConn = net.connect {host, port, allowHalfOpen: false}, ()=>
            tcpConn.removeAllListeners('error')
            ip = require("./httpReqRemoteIp")(httpRequest)
            log "Client #{ip} establishing #{if request instanceof HttpTunnelReq then 'http' else 'ws' } tunnel to #{host}:#{port}"
            wsConn = request.accept('tunnel-protocol', request.origin);
            if connWrapperCb then wsConn = connWrapperCb(wsConn)
            require("./bindStream")(wsConn, tcpConn)
            if monitor then monitor.bind(wsConn, tcpConn)

          tcpConn.on "error", (err)->
            request.reject(500, JSON.stringify("Tunnel connect error to #{host}:#{port}: " + err))

      @wsServer.on 'request', (req)=>
        handleReq req, (wsConn)->
          #@_patch(wsConn)
          return new WsStream(wsConn)
      @tunnServer.on 'request', (req)=>
        handleReq(req)

  # authCb(rejectReason, {host, port}, monitor)
  authenticate : (httpRequest, authCb)->
    if @dstHost and @dstPort
      [host, port] = [@dstHost, @dstPort]
    else
      dst = @parseUrlDst(httpRequest.url)
      if (!dst) then return authCb('Unable to determine tunnel target')
      else {host, port} = dst
    authCb(null, {host, port})  # allow by default

  # returns {host, port} or undefined
  parseUrlDst : (requrl)->
    uri = url.parse(requrl, true);
    if (!uri.query.dst) then undefined
    else
      [host, port] = uri.query.dst.split(":")
      {host, port}

  _parseAddr : (localAddr)->
    if typeof localAddr == 'number' then localPort = localAddr
    else
      [localHost, localPort] = localAddr.split ':'
      if /^\d+$/.test(localHost)
        localPort = localHost
        localHost = null
      localPort = parseInt(localPort)
    localHost ?= '127.0.0.1'
    [localHost, localPort]

  _patch : (ws)->
    ws.drop = (reasonCode, description, skipCloseFrame)->
      this.closeReasonCode = reasonCode;
      this.closeDescription = description;
      this.outgoingFrameQueue = [];
      this.frameQueue = [];
      this.fragmentationSize = 0;
      if (!skipCloseFrame)
        this.sendCloseFrame(reasonCode, description, true);
      this.connected = false;
      this.state = "closed";
      this.closeEventEmitted = true;
      this.emit('close', reasonCode, description);
      this.socket.end();  # ensure peer receives the close frame

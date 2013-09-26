WebSocketServer = require('websocket').server;
http = require('http');
url = require("url");
net = require("net");
bindSockets = require "./bindSockets"

module.exports = class wst_server
  # if dstHost, dstPort are specified here, then all tunnel end points are at dstHost:dstPort, regardless what
  # client requests, for security option
  constructor: (@dstHost, @dstPort)->
    @httpServer = http.createServer (request, response) ->
        console.log((new Date()) + ' Received unhandled request for ' + request.url);
        response.writeHead(404);
        response.end();
    @wsServer = new WebSocketServer(
        httpServer: @httpServer,
        autoAcceptConnections: false
    )

  start: (port)->
    @httpServer.listen port, ()->
        console.log((new Date()) + " Server is listening on port #{port}");
    @wsServer.on('request', (request)=>
        if (!@originIsAllowed(request.origin))
          # Make sure we only accept requests from an allowed origin
          return @_reject(request, "Illegal origin " + origin);

        uri = url.parse(request.httpRequest.url, true);
        if (!uri.query.dst)
          return @_reject(request,"No tunnel target specified");

        [host, port] = [@dstHost, @dstPort]
        if host && port
          remoteAddr = "#{host}:#{port}"
        else
          remoteAddr = uri.query.dst
          [host, port] = remoteAddr.split(":")

        tcpconn = net.connect {
          port : port,
          host : host,
        }, ()->
          console.log((new Date()) + ' Establishing tunnel to ' + remoteAddr);
          wsconn = request.accept('tunnel-protocol', request.origin);
          bindSockets(wsconn, tcpconn);
        tcpconn.on "error", (err)->
         @_reject(request,"Tunnel connect error to " + remoteAddr + ": " + err);
    )

  originIsAllowed : (origin)->
    # put logic here to detect whether the specified origin is allowed.
    return true

  _reject : (request, msg)->
    request.reject();
    console.log((new Date()) + ' Connection from ' + request.remoteAddress + ' rejected: ' + msg);


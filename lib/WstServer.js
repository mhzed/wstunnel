const WebSocketServer = require('websocket').server;
const http = require('http');
const url = require('url');
const net = require('net');
const dgram = require('dgram');
const WsStream = require('./WsStream');
const log = require('lawg');
const HttpTunnelServer = require('./httptunnel/Server');
const HttpTunnelReq = require('./httptunnel/ConnRequest');
const ChainedWebApps = require('./ChainedWebApps');
const bindStream = require('./bindStream');
const bindUdpStream = require('./bindUdpStream');
const httpReqRemoteIp = require('./httpReqRemoteIp');
module.exports = wst_server = class wst_server {
  // if dstHost, dstPort are specified here, then all tunnel end points are at dstHost:dstPort, regardless what
  // client requests, for security option
  // webapp: customize webapp if any, you may use express app
  constructor({ host, port, proto, webapp } = {}) {
    this.dstHost = host;
    this.dstPort = port;
    this.dstProto = proto;
    this.httpServer = http.createServer();
    this.wsServer = new WebSocketServer({
      httpServer: this.httpServer,
      autoAcceptConnections: false,
    });
    // each app is http request handler function (req, res, next),  calls next() to ask next app
    // to handle request
    const apps = new ChainedWebApps();
    this.tunnServer = new HttpTunnelServer(apps);
    if (webapp) {
      apps.setDefaultApp(webapp);
    }
    apps.bindToHttpServer(this.httpServer);
  }

  accept(request, remote, connWrapperCb) {
    let wsConn;
    const ip = httpReqRemoteIp(request.httpRequest);
    try {
      wsConn = request.accept('tunnel-protocol', request.origin);
      log(
        `Client ${ip} established ${
          request instanceof HttpTunnelReq ? 'http' : 'ws'
        } tunnel to ${remote}`
      );
    } catch (e) {
      log(`Client ${ip} rejected due to ${e.toString()}`);
      return;
    }
    if (connWrapperCb) {
      wsConn = connWrapperCb(wsConn);
    }
    return wsConn;
  }

  connectUdp(request, connWrapperCb, host, port) {
    const socket = dgram.createSocket('udp4');
    socket.bind(() => {
      socket.removeAllListeners('error');
      const wsConn = this.accept(request, `${host}:${port}:udp`, connWrapperCb);
      if (wsConn) {
        bindUdpStream(wsConn, socket, host, port, () => {
          socket.close();
        });
      }
    });
    socket.on('error', (err) =>
      request.reject(500, JSON.stringify(`Tunnel connect error to ${host}:${port}:udp: ` + err))
    );
  }

  connectTcp(request, connWrapperCb, host, port) {
    const tcpConn = net.connect(
      { host, port, allowHalfOpen: false },
      () => {
        tcpConn.removeAllListeners('error');
        const wsConn = this.accept(request, `${host}:${port}`, connWrapperCb);
        if (wsConn) {
          bindStream(wsConn, tcpConn);
        }
      }
    );
    tcpConn.on('error', (err) =>
      request.reject(500, JSON.stringify(`Tunnel connect error to ${host}:${port}:tcp: ` + err))
    );
  }

  // localAddr:  [addr:]port, the local address to listen at, i.e. localhost:8888, 8888, 0.0.0.0:8888
  start(localAddr, cb) {
    const [localHost, localPort] = this._parseAddr(localAddr);
    return this.httpServer.listen(localPort, localHost, (err) => {
      if (cb) {
        cb(err);
      }

      const handleReq = (request, connWrapperCb) => {
        const { httpRequest } = request;
        return this.authenticate(
          httpRequest,
          (rejectReason, target) => {
            if (rejectReason) {
              return request.reject(500, JSON.stringify(rejectReason));
            }
            const { host, port, proto } = target;
            if (proto === 'udp') {
              this.connectUdp(request, connWrapperCb, host, port);
            } else {
              this.connectTcp(request, connWrapperCb, host, port);
            }
          }
        );
      };

      this.wsServer.on('request', (req) => {
        return handleReq(
          req,
          (wsConn) =>
            // @_patch(wsConn)
            new WsStream(wsConn)
        );
      });
      return this.tunnServer.on('request', (req) => {
        return handleReq(req);
      });
    });
  }

  // authCb(rejectReason, {host, port})
  authenticate(httpRequest, authCb) {
    let host, port, proto;
    if (this.dstHost && this.dstPort) {
      [host, port, proto] = [this.dstHost, this.dstPort, this.dstProto];
    } else {
      const dst = this.parseUrlDst(httpRequest.url);
      if (!dst) {
        return authCb('Unable to determine tunnel target');
      } else {
        ({ host, port, proto } = dst);
      }
    }
    port = parseInt(port);
    return authCb(null, { host, port, proto }); // allow by default
  }

  // returns {host, port} or undefined
  parseUrlDst(requrl) {
    const uri = url.parse(requrl, true);
    if (!uri.query.dst) {
      return undefined;
    } else {
      const [host, port, proto] = uri.query.dst.split(':');
      return { host, port, proto };
    }
  }

  _parseAddr(localAddr) {
    let localHost = 'localhost',
      localPort;
    if (typeof localAddr === 'number') {
      localPort = localAddr;
    } else {
      [localHost, localPort] = localAddr.split(':');
      if (/^\d+$/.test(localHost)) {
        localPort = localHost;
        localHost = null;
      }
      localPort = parseInt(localPort);
    }
    return [localHost, localPort];
  }

  _patch(ws) {
    return (ws.drop = function (reasonCode, description, skipCloseFrame) {
      this.closeReasonCode = reasonCode;
      this.closeDescription = description;
      this.outgoingFrameQueue = [];
      this.frameQueue = [];
      this.fragmentationSize = 0;
      if (!skipCloseFrame) {
        this.sendCloseFrame(reasonCode, description, true);
      }
      this.connected = false;
      this.state = 'closed';
      this.closeEventEmitted = true;
      this.emit('close', reasonCode, description);
      // ensure peer receives the close frame
      return this.socket.end();
    });
  }
};

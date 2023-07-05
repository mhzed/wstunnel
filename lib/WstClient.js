const net = require('net');
const dgram = require('dgram');
const WsStream = require('./WsStream');
const url = require('url');
const log = require('lawg');
const ClientConn = require('./httptunnel/ClientConn');
const bindStream = require('./bindStream');
const bindUdpStream = require('./bindUdpStream');
const createWsClient = () => new (require('websocket').client)();

module.exports = wst_client = class wst_client extends require('events')
  .EventEmitter {
  /*
  emit Events:
  'tunnel' (WsStream|ClientConn) when a tunnel is established
  'connectFailed' (err) when ws connection failed
  'connectHttpFailed' (err) when http tunnel connection failed
  */

  constructor() {
    super();
    this.tcpServer = net.createServer();
    this.udpServer = dgram.createSocket('udp4');
  }

  verbose() {
    this.on('tunnel', (sock, ws) => {
      if (ws instanceof WsStream) {
        log('Websocket tunnel established');
      } else {
        log('Http tunnel established');
      }
      return sock.on('close', () => log('Tunnel closed'));
    });
    this.on('connectHttpFailed', (error) =>
      log(`HTTP connect error: ${error.toString()}`)
    );
    return this.on('connectFailed', (error) =>
      log(`WS connect error: ${error.toString()}`)
    );
  }

  setHttpOnly(httpOnly) {
    this.httpOnly = httpOnly;
  }
  // example: start({
  //   localHost: "localhost",
  //   localPort: 8081,
  //   wsHostUrl: "wss://ws.domain.com:454",
  //   remoteAddr: "dst.domain.com:22",
  //   proto: "tcp"
  // });
  // meaning: tunnel localhost:8081 to remoteAddr by using websocket connection to wsHost
  // @wsHostUrl:  ws:// denotes standard socket, wss:// denotes ssl socket
  //              may be changed at any time to change websocket server info
  start({ localHost, localPort, wsHostUrl, remoteAddr, proto }, optionalHeaders, cb) {
    this.wsHostUrl = wsHostUrl;
    if (proto === 'udp') {
      this.listenUdp(localPort, localHost, remoteAddr, optionalHeaders, cb);
    } else {
      this.listenTcp(localPort, localHost, remoteAddr, optionalHeaders, cb);
    }
  }

  startStdio({ wsHostUrl, remoteAddr, proto }, optionalHeaders, cb) {
    this.wsHostUrl = wsHostUrl;
    const bind = (s) => {
      process.stdin.pipe(s);
      s.pipe(process.stdout);
      s.on('close', () => process.exit(0));
      s.on('finish', () => process.exit(0));
    };
    this._connect(
      this.wsHostUrl,
      remoteAddr,
      proto,
      optionalHeaders,
      (err, stream) => {
        if (err) this.emit('connectFailed', err);
        else bind(stream);
        if (cb) cb(err);
      }
    );
  }

  listenUdp(localPort, localHost, remoteAddr, optionalHeaders, cb) {
    const udpServer = dgram.createSocket('udp4');
    this.connections = new Set();
    udpServer.bind(localPort, localHost, cb);
    udpServer.on('message', (data, rinfo) => {
      const id = `${rinfo.address}:${rinfo.port}`;
      if (!this.connections.has(id)) {
        this.connections.add(id);
        this._connect(
          this.wsHostUrl,
          remoteAddr,
          'udp',
          optionalHeaders,
          (err, stream) => {
            if (err) {
              this.emit('connectFailed', err);
              this.connections.delete(id);
            } else {
              bindUdpStream(stream, udpServer, rinfo.address, rinfo.port, () => {
                this.connections.delete(id);
              });
              stream.write(data);
              this.emit('tunnel', udpServer, stream);
            }
          }
        );
      }
    });
  }

  listenTcp(localPort, localHost, remoteAddr, optionalHeaders, cb) {
    const tcpServer = net.createServer();
    tcpServer.listen(localPort, localHost, cb);
    tcpServer.on('connection', (tcpConn) => {
      this._connect(
        this.wsHostUrl,
        remoteAddr,
        'tcp',
        optionalHeaders,
        (err, stream) => {
          if (err) {
            this.emit('connectFailed', err);
          } else {
            bindStream(tcpConn, stream);
            this.emit('tunnel', tcpConn, stream);
          }
        }
      );
    });
  }

  _connect(wsHostUrl, remoteAddr, proto, optionalHeaders, cb) {
    if (remoteAddr && proto) {
      remoteAddr = `${remoteAddr}:${proto}`;
    }
    if (this.httpOnly) {
      return this._httpConnect(wsHostUrl, remoteAddr, optionalHeaders, cb);
    } else {
      return this._wsConnect(
        wsHostUrl,
        remoteAddr,
        optionalHeaders,
        (err, wsStream) => {
          if (!err) {
            cb(err, wsStream);
          } else {
            this.emit('connectFailed', err);
            return this._httpConnect(
              wsHostUrl,
              remoteAddr,
              optionalHeaders,
              cb
            );
          }
        }
      );
    }
  }
  setAgentMaker(maker) {
    this.agentMaker = maker;
  }

  _httpConnect(url, remoteAddr, optionalHeaders, cb) {
    let tunurl = url.replace(/^ws/, 'http');
    if (remoteAddr) {
      tunurl += `?dst=${remoteAddr}`;
    }
    const httpConn = new ClientConn(tunurl, this.agentMaker);
    return httpConn.connect(optionalHeaders, (err) => {
      if (err) {
        this.emit('connectHttpFailed', err);
        return cb(err);
      } else {
        return cb(null, httpConn);
      }
    });
  }

  _wsConnect(wsHostUrl, remoteAddr, optionalHeaders, cb) {
    wsHostUrl = wsHostUrl.replace(/^http/, 'ws');
    let wsurl;
    if (remoteAddr) {
      wsurl = `${wsHostUrl}/?dst=${remoteAddr}`;
    } else {
      wsurl = `${wsHostUrl}`;
    }
    const wsClient = createWsClient();
    const urlo = url.parse(wsurl);
    if (urlo.auth) {
      optionalHeaders.Authorization = `Basic ${Buffer.from(urlo.auth).toString(
        'base64'
      )}`;
    }
    wsClient.connect(wsurl, 'tunnel-protocol', undefined, optionalHeaders, {
      agent: this.agentMaker ? this.agentMaker() : null,
    });
    wsClient.on('connectFailed', (error) => cb(error));
    return wsClient.on('connect', (wsConn) => {
      const wsStream = new WsStream(wsConn);
      return cb(null, wsStream);
    });
  }
};

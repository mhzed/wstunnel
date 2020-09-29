let dlogSock;
const https = require('https');
const http = require('http');
const url = require('url');
const log = require('lawg');
const future = require('phuture');
const debug = require('../debug');
const {
  BlockSize,
  AutoSealDelayMs,
  ReqOpenIntervalMs,
} = require('./Constants');

/*
Example:

  conn = new ClientConn("http://server")
  conn.connect (err)->
    if not err
      console.log 'connected'
      conn.pipe(socket).pipe(conn)

How it works:
  Client maintains two persistent outstanding http request: keep alive and reuse socket.
  One request is for sending data: client is responsible to end request
  One request is for recving data: sever is responsible to end request
*/

if (debug.isDebug) {
  dlogSock = (msg, socket) =>
    log(`[${socket && socket.address() ? socket.address().port : ''}]${msg}`);
} else {
  dlogSock = function () {};
}

module.exports = class ClientConn extends require('stream').Duplex {
  constructor(urlEndPoint, agentMaker) {
    super({});
    this.urlEndPoint = urlEndPoint;
    this._sig = 'httpCli';
    this.url = url.parse(this.urlEndPoint);
    this.connAgent = agentMaker ? agentMaker() : null;
    const opts = { maxSockets: 1, keepAlive: true, keepAliveMsecs: 10000 };
    if (this.url.protocol === 'https:') {
      this.doHttp = https;
      if (!this.url.port) {
        this.url.port = 443;
      }
      if (agentMaker) {
        this.sendAgent = agentMaker(opts);
        this.recvAgent = agentMaker(opts);
      } else {
        this.sendAgent = new https.Agent(opts);
        this.recvAgent = new https.Agent(opts);
      }
    } else {
      this.doHttp = http;
      if (!this.url.port) {
        this.url.port = 80;
      }
      if (agentMaker) {
        this.sendAgent = agentMaker(opts);
        this.recvAgent = agentMaker(opts);
      } else {
        this.sendAgent = new http.Agent(opts);
        this.recvAgent = new http.Agent(opts);
      }
    }
  }
  // headers is optional
  connect(headers, cb) {
    headers['x-htundir'] = 'conn';
    headers['Connection'] = 'keep-alive';
    const req = this.doHttp.request({
      hostname: this.url.hostname,
      port: this.url.port,
      path: this.url.path,
      method: 'GET',
      agent: this.connAgent,
      headers,
    });
    req.on('response', (res) => {
      dlogSock('conn', res.socket);
      if (res.statusCode === 200) {
        this.sessionId = res.headers['x-htunsess'];
        this._recv();
        this._makeSendReq();
        return cb();
      } else {
        return cb(
          new Error(
            `Http conn rejected, status: ${res.statusCode}, msg: ${
              res.headers['x-htunrejectmsg'] || ''
            }`
          )
        );
      }
    });
    req.end();
    return req.on('error', (e) => cb(e));
  }

  end() {
    this._ended = true;
    return super.end();
  }

  // stream overrides
  _read() {}

  // optimization: queue multiple consecutive writes into a single request
  _write(chunk, encoding, callback) {
    // if not @sendReq ... not supposed to happen
    if (this.sendReq._sealed) {
      // catch edge condition: _write called when a request is being ended, store _write context, resume after request
      // is sealed.  To reach here in test, set AutoSealDelayMs to 0
      this._chunk = chunk;
      this._chunkCb = callback;
      return;
    }
    this.sendReq.send(chunk);

    // @sendReq.end() when
    // 1. >= BlockSize bytes are written
    // 2. or AutoSealDelayMs ms elapsed since last _write
    this.sendReq._timer.cancel();
    if (this.sendReq._n < BlockSize) {
      this.sendReq._timer = future.once(AutoSealDelayMs, () => {
        // seal on timer
        return this.sendReq.seal(() => {});
      });
      return callback();
    } else {
      // seal on size
      return this.sendReq.seal(() => {
        return callback();
      }); // continue writing after seal (response received entirely)
    }
  }

  _recv() {
    const req = this.doHttp.request({
      hostname: this.url.hostname,
      port: this.url.port,
      path: this.url.path,
      method: 'GET',
      agent: this.recvAgent,
      headers: {
        Connection: 'keep-alive',
        'x-htunsess': this.sessionId,
        'x-htundir': 'recv',
      },
    });
    req.on('error', (e) =>
      this.emit('error', new Error(`http recv ${e.toString()}`))
    );
    req.on('socket', (sock) => sock.setNoDelay(true));
    req.setTimeout(ReqOpenIntervalMs * 2, () => req.abort()); // triggers error event
    req.on('response', (res) => {
      res.on('error', (e) => this.emit('error', e));
      if (res.statusCode !== 200) {
        this.emit(
          'error',
          new Error(`Http recv error, status: ${res.statusCode}`)
        );
      }
      let n = 0;
      res.on('data', (d) => {
        this.push(d);
        dlogSock(`Cli recving ${d.length}`, res.socket);
        n += d.length;
      });
      return res.on('end', () => {
        if (n > 0) {
          dlogSock(`Cli recv ${n}`, res.socket);
        }
        if (!this._ended) {
          return this._recv();
        }
      });
    }); // start next request

    return req.end();
  }

  _makeSendReq() {
    let req;
    this.sendReq = req = this.doHttp.request({
      hostname: this.url.hostname,
      port: this.url.port,
      path: this.url.path,
      method: 'POST',
      agent: this.sendAgent,
      headers: {
        Connection: 'keep-alive',
        'Transfer-Encoding': 'chunked',
        'x-htunsess': this.sessionId,
        'x-htundir': 'send',
      },
    });
    req.on('error', (e) =>
      this.emit('error', new Error(`http send ${e.toString()}`))
    );
    req.on('socket', (sock) => sock.setNoDelay(true));
    req.setTimeout(ReqOpenIntervalMs * 2, () => req.abort()); // triggers error event
    req._timer = future.once(ReqOpenIntervalMs, () => req.seal(() => {})); // auto end req
    req._n = 0;
    req.send = (chunk) => {
      req.write(chunk);
      dlogSock(`Cli sending ${chunk.length}`, req.socket);
      req._n += chunk.length;
    };
    req.seal = (cb) => {
      if (req._sealed) {
        return;
      }
      req._sealed = true;
      req.on('response', (res) => {
        res.on('error', (e) => this.emit('error', e));
        if (res.statusCode !== 200) {
          this.emit(
            'error',
            new Error(`Http send error, status: ${res.statusCode}`)
          );
        }
        res.on('data', (d) => {});
        return res.on('end', () => {
          dlogSock(`Cli sent ${req._n}`, res.socket);
          if (!this._ended) {
            this._makeSendReq();
            if (this._chunk) {
              // while sealing, another _write is called
              this._write(this._chunk, null, this._chunkCb);
              this._chunk = this._chunkCb = undefined;
            }
          }
          return cb();
        });
      });
      return req.end();
    };
  }
};

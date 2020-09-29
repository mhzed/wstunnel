let dlogSock;
const log = require('lawg');
const future = require('phuture');
const assert = require('assert');
const debug = require('../debug');

const {
  BlockSize,
  AutoSealDelayMs,
  ReqOpenIntervalMs,
} = require('./Constants');

if (debug.isDebug) {
  dlogSock = (msg, socket) =>
    log(`[${socket && socket.remotePort ? socket.remotePort : ''}]${msg}`);
} else {
  dlogSock = function () {};
}

module.exports = class ServerConn extends require('stream').Duplex {
  constructor(sessionId, chainedApps) {
    super({});
    this.sessionId = sessionId;
    this.chainedApps = chainedApps;
    this._sig = 'httpSvr';
    this._ts = Date.now();
    // if client fails to poll constantly, then client is likely dead, emit error to allow proper stream shutdown
    this.timeOutTimer = future.interval(ReqOpenIntervalMs, () => {
      if (Date.now() - this._ts > ReqOpenIntervalMs * 2) {
        return this.emit('error', 'Client poll timed out error');
      }
    });

    // install app that handles requests bound to this tunnel session
    this._app = (req, res, next) => {
      if (this.sessionId === req.headers['x-htunsess']) {
        req.on('error', (err) => this.emit('error', err));
        res.on('error', (err) => this.emit('error', err));
        const dir = req.headers['x-htundir'];
        res.writeHead(200, {});
        res.socket.setNoDelay(true);
        if (dir === 'send') {
          req.on('data', (d) => {
            this._ts = Date.now();
            this.push(d);
            return dlogSock(`Svr recving ${d.length}`, req.socket);
          });
          return req.on('end', () => res.end());
        } else {
          res._n = 0;
          res.send = (chunk) => {
            dlogSock(`Svr sending ${chunk.length}`, res.socket);
            res._n += chunk.length;
            if (!res._sealed) {
              res.write(chunk);
            } else {
              assert(false);
            }
            if (res._n >= BlockSize) {
              return res.seal();
            } else {
              if (res._timer) {
                res._timer.cancel();
              }
              res._timer = future.once(AutoSealDelayMs, () => res.seal());
            }
          };
          res.seal = () => {
            if (res._sealed) {
              return;
            }
            if (res._timer) {
              res._timer.cancel();
            }
            res._sealed = true;
            res.end();
            this.pushRes = undefined;
            this._ts = Date.now();
          };
          res._timer = future.once(ReqOpenIntervalMs, () => res.seal()); // by default seal after n seconds if no data sent
          this._ts = Date.now();
          this.pushRes = res;
          if (this._chunk) {
            this.pushRes.send(this._chunk);
            this._chunkCb();
            this._chunk = this._chunkCb = undefined;
          }
        }
      } else {
        return next();
      }
    };
    this.chainedApps.add(this._app);
  }

  end() {
    super.end();
    this.timeOutTimer.cancel();
    return this.chainedApps.remove(this._app);
  }

  // stream overrides
  _read() {}

  _write(chunk, encoding, callback) {
    if (this.pushRes) {
      this.pushRes.send(chunk);
      return callback();
    } else {
      this._chunk = chunk;
      this._chunkCb = callback;
    }
  }
};

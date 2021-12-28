const { spawn } = require('child_process');
const path = require('path');
const wst = require('../lib/wst');
const net = require('net');
const log = require('lawg');
const assert = require('assert');

const config = {
  s_port: 11001,
  t_port: 11002,
  ws_port: 11000,
};

const server = new wst.server();
const client = new wst.client();
let echo_server = null;

describe('wstunnel', () => {
  /*
  client -> wsClient:s_port -> wsServer:ws_port -> echo_server:t_port
*/
  it('etag header', function () {
    const s = { x: 1, y: 2 };
    const eheader = require('../lib/etagHeader');
    const d = eheader.fromEtag(eheader.toEtag(s));
    assert.equal(s.x, d.x);
    assert.equal(s.y, d.y);
  });

  it('setup ws tunnel', (done) =>
    // setup ws server
    server.start(config.ws_port, function (err) {
      if (err) done(err);
      return client.start(
        'localhost',
        config.s_port,
        `ws://localhost:${config.ws_port}`,
        `localhost:${config.t_port}`,
        {},
        function (err) {
          if (err) done(err);
          done();
        }
      );
    }));

  it('setup sock echo server', function (done) {
    const listener = (conn) => conn.on('data', (data) => conn.write(data));

    echo_server = net.createServer(listener);
    echo_server.listen(config.t_port, function () {
      done();
    });
  });

  it('test echo directly', function (done) {
    var conn = net.connect({ port: config.t_port }, () => conn.write('msg'));
    conn.on('data', function (data) {
      assert.equal(data, 'msg', 'echoed');
      done();
    });
  });

  it('test echo via wstunnel', function (done) {
    var conn = net.connect({ port: config.s_port }, () => conn.write('msg'));
    conn.on('data', function (data) {
      assert.equal(data, 'msg', 'echoed');
      done();
    });
  });

  const makeBuf = function (size) {
    const b = Buffer.alloc(size);
    for (
      let i = 0, end = size / 4, asc = end >= 0;
      asc ? i < end : i > end;
      asc ? i++ : i--
    ) {
      b.writeInt32LE(i + 1, i * 4);
    }
    return b;
  };

  const isSameBuf = function (b1, b2) {
    for (
      let i = 0, end = b1.length / 4, asc = end >= 0;
      asc ? i < end : i > end;
      asc ? i++ : i--
    ) {
      if (b1.readInt32LE(i * 4) !== b2.readInt32LE(i * 4)) {
        return false;
      }
    }
    return true;
  };

  const recvEcho = function (conn, size, doneCb) {
    const rb = Buffer.alloc(size);
    let rbi = 0;
    conn.on('data', function (data) {
      data.copy(rb, rbi);
      rbi += data.length;
      if (rbi >= size) {
        return conn.end();
      }
    });
    return conn.on('close', () => doneCb(rb));
  };

  // echo large data
  it('test echo stream', function (done) {
    const n = 1000000;
    const sb = makeBuf(n);
    var conn = net.connect({ port: config.s_port }, () => conn.write(sb));
    return recvEcho(conn, n, function (rb) {
      assert.equal(isSameBuf(sb, rb), true);
      return done();
    });
  });

  it('test echo stream via http tunnel', function (done) {
    const { authenticate } = server;
    server.authenticate = (httpRequest, authCb) =>
      authenticate.call(server, httpRequest, function (err, { host, port }) {
        if (!('x-htundir' in httpRequest.headers)) {
          return authCb('reject websocket intentionally');
        } else {
          return authCb(err, { host, port });
        }
      });

    const n = 10033000;
    const sb = makeBuf(n);
    var conn = net.connect({ port: config.s_port }, () => conn.write(sb));
    return recvEcho(conn, n, function (rb) {
      assert.ok(isSameBuf(sb, rb));
      return done();
    });
  });

  it('test end', function (done) {
    done();
    return setTimeout(() => process.exit(0), 100);
  });
});
/*
Some proxy strips "Upgrade: websocket" header, thus crippling websocket connection
*/

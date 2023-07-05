const { spawn } = require('child_process');
const path = require('path');
const wst = require('../lib/wst');
const net = require('net');
const dgram = require('dgram');
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
      return client.start({
          localHost: 'localhost',
          localPort: config.s_port,
          wsHostUrl: `ws://localhost:${config.ws_port}`,
          remoteAddr: `localhost:${config.t_port}`,
        },
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

  const makeBuf = function (size, seed) {
    seed = seed || 0;
    const b = Buffer.alloc(size);
    for (
      let i = 0, end = size / 4, asc = end >= 0;
      asc ? i < end : i > end;
      asc ? i++ : i--
    ) {
      b.writeInt32LE(i + 1 + seed, i * 4);
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
      authenticate.call(server, httpRequest, function (err, { host, port, proto }) {
        if (!('x-htundir' in httpRequest.headers)) {
          return authCb('reject websocket intentionally');
        } else {
          return authCb(err, { host, port, proto });
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

  it('setup udp echo server', function (done) {
    echo_server.close();
    echo_server = dgram.createSocket('udp4');
    echo_server.on('message', (data, rinfo) => {
      echo_server.send(data, rinfo.port, rinfo.address);
    });
    echo_server.bind(config.t_port, () => done());
  });

  it('setup udp tunnel', (done) => {
    const client = new wst.client();
    client.start({
      localHost: '127.0.0.1', // only ipv4
      localPort: config.s_port,
      wsHostUrl: `ws://localhost:${config.ws_port}`,
      remoteAddr: `127.0.0.1:${config.t_port}`,
      proto: 'udp',
    },
    {},
    function (err) {
      if (err) done(err);
      done();
    });
  });

  function recvUdpEcho(host, port, sendData, doneCb) {
    const size = sendData.length;
    const rb = Buffer.alloc(size);
    let rbi = 0;
    const chunk = 1024;
    const socket = dgram.createSocket('udp4');
    socket.on('message', (data, rinfo) => {
      assert.equal(host, rinfo.address);
      assert.equal(port, rinfo.port);
      data.copy(rb, rbi);
      rbi += data.length;
      if (rbi >= size) {
        assert.equal(isSameBuf(rb, sendData), true);
        doneCb();
      } else {
        socket.send(sendData, rbi, Math.min(chunk, size - rbi), port, host);
      }
    });
    socket.send(sendData, 0, Math.min(chunk, size), port, host);
  }

  it('test udp echo', (done) => {
    const data = makeBuf(987648);
    recvUdpEcho('127.0.0.1', config.t_port, data, done);
  });

  it('test udp tunnel', (done) => {
    const data = makeBuf(987648);
    recvUdpEcho('127.0.0.1', config.s_port, data, done);
  });

  it('test multiple udp tunnels', (done) => {
    Promise.all([
      new Promise((resolve) => {
        const data = makeBuf(987648, 1);
        recvUdpEcho('127.0.0.1', config.s_port, data, resolve);
      }),
      new Promise((resolve) => {
        const data = makeBuf(987648, 2);
        recvUdpEcho('127.0.0.1', config.s_port, data, resolve);
      }),
    ])
    .then(() => done())
    .catch(e => done(e));
  });

  it('test end', function (done) {
    done();
    return setTimeout(() => process.exit(0), 100);
  });
});
/*
Some proxy strips "Upgrade: websocket" header, thus crippling websocket connection
*/

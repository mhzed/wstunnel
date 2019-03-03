const { spawn } = require('child_process');
const path = require('path');
const wst = require("../lib/wst");
const net = require("net");
const _log = require("lawg");

const log = msg => _log(msg + "\n");

const config = {
  s_port: 11001,
  t_port: 11002,
  ws_port: 11000
};

const server = new wst.server();
const client = new wst.client();
let echo_server = null;

/*
  client -> wsClient:s_port -> wsServer:ws_port -> echo_server:t_port
*/
module.exports['etag header'] = function(test) {
  const s = {x: 1, y: 2};
  const eheader = require("../lib/etagHeader");
  const d = eheader.fromEtag(eheader.toEtag(s));
  test.equal(s.x, d.x);
  test.equal(s.y, d.y);
  return test.done();
};

module.exports["setup ws tunnel"] = test =>
  // setup ws server
  server.start(config.ws_port, function(err) {
    test.ifError(err);
    log('ws server is setup');
    return client.start("localhost", config.s_port, `ws://localhost:${config.ws_port}`, 
    `localhost:${config.t_port}`, {}, function(err) {
      test.ifError(err);
      log("tunnel is setup");
      return test.done();
    });
  })
;

module.exports["setup sock echo server"] = function(test) {
  const listener = conn =>
    conn.on('data', data => conn.write(data))
  ;

  echo_server = net.createServer(listener);
  return echo_server.listen(config.t_port, function() {
    log("echo sock server is setup");
    return test.done();
  });
};

module.exports["test echo"] = function(test) {
  var conn = net.connect({ port: config.s_port }, () => conn.write('msg'));
  return conn.on('data', function(data) {
    test.equal(data, 'msg', 'echoed');
    return test.done();
  });
};

const makeBuf = function(size) {
  const b = new Buffer(size);
  for (let i = 0, end = size / 4, asc = end >= 0; asc ? i < end : i > end; asc ? i++ : i--) { b.writeInt32LE(i + 1, i * 4); }
  return b;
};

const isSameBuf = function(b1, b2) {
  for (let i = 0, end = b1.length / 4, asc = end >= 0; asc ? i < end : i > end; asc ? i++ : i--) {
    if (b1.readInt32LE(i * 4) !== b2.readInt32LE(i * 4)) { return false; }
  }
  return true;
};

const recvEcho = function(conn, size, doneCb) {
  const rb = new Buffer(size);
  let rbi = 0;
  conn.on('data', function(data) {
    data.copy(rb, rbi);
    rbi += data.length;
    if (rbi >= size) { return conn.end(); }
  });
  return conn.on('close', () => doneCb(rb));
};

// echo large data
module.exports["test echo stream"] = function(test) {
  const n = 1000000;
  const sb = makeBuf(n);
  var conn = net.connect({ port: config.s_port }, () => conn.write(sb));
  return recvEcho(conn, n, function(rb) {
    test.ok(isSameBuf(sb, rb));
    return test.done();
  });
};

module.exports["test echo stream via http tunnel"] = function(test) {
  const { authenticate } = server;
  server.authenticate = (httpRequest, authCb) =>
    authenticate.call(server, httpRequest, function(err, {host, port}) {
      if (!('x-htundir' in httpRequest.headers)) {
        return authCb("reject websocket intentionally");
      } else {
        return authCb(err, {host, port});
      }
    })
  ;

  const n = 10033000;
  const sb = makeBuf(n);
  var conn = net.connect({ port: config.s_port }, () => conn.write(sb));
  return recvEcho(conn, n, function(rb) {
    test.ok(isSameBuf(sb, rb));
    return test.done();
  });
};

module.exports["test end"] = function(test) {
  test.done();
  return setTimeout(() => process.exit(0)
  , 100);
};

/*
Some proxy strips "Upgrade: websocket" header, thus crippling websocket connection
*/

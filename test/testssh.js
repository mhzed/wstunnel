(require("source-map-support")).install();
const { exec } = require('child_process');
const path = require('path');
const wst = require("../lib/wst");
const net = require("net");
const _log = require("lawg");
const future = require("phuture");
const log = msg => _log(msg + "\n");

const config = {
  s_port: 19001,
  t_port: 22,
  ws_port: 19000,
  host: '127.0.0.1'
};

const server = new wst.server();
const client = new wst.client();
client.setHttpOnly(true);

module.exports["setup ws tunnel"] = test =>
  server.start(`${config.host}:${config.ws_port}`, function(err) {
    test.ifError(err);
    log('ws server is setup');
    return client.start(`${config.host}:${config.s_port}`, `ws://${config.host}:${config.ws_port}`, `${config.host}:${config.t_port}`, function(err) {
      test.ifError(err);
      log("tunnel is setup");
      return test.done();
    });
  })
;

module.exports['ssh'] = function(test) {
  const cmdline = `ssh -oUserKnownHostsFile=/dev/null -oStrictHostKeyChecking=no -p ${config.s_port} ${config.host} \"echo 'echo'\"`;
  return exec(cmdline, function(err, stdout, stderr) {
    if (err) { log(err); }
    log(`ssh done ${stdout}`);
    test.ok(/echo/.test(stdout));
    test.done();
    return future.once(200, () => process.exit(0));
  });
};


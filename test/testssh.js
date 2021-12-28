const { exec } = require('child_process');
const path = require('path');
const wst = require('../lib/wst');
const net = require('net');
const _log = require('lawg');
const future = require('phuture');
const assert = require('assert');
const log = (msg) => _log(msg + '\n');

const config = {
  s_port: 19001,
  t_port: 22,
  ws_port: 19000,
  host: 'localhost',
};

const server = new wst.server();
const client = new wst.client();
client.setHttpOnly(true);

describe('ssh over wstunnel', () => {
  it('setup ws tunnel', (done) =>
    server.start(`${config.host}:${config.ws_port}`, function (err) {
      if (err) done(err);
      return client.start(
        config.host,
        config.s_port,
        `ws://${config.host}:${config.ws_port}`,
        `${config.host}:${config.t_port}`,
        {},
        function (err) {
          done(err);
        }
      );
    }));

  it('ssh', function (done) {
    const cmdline = `ssh -oUserKnownHostsFile=/dev/null -oStrictHostKeyChecking=no -p ${config.s_port} ${config.host} \"echo 'echo'\"`;
    return exec(cmdline, function (err, stdout, stderr) {
      if (err) {
        done(err);
      }
      //log(`ssh done ${stdout}`);
      assert.ok(/echo/.test(stdout));
      done();
      return future.once(200, () => process.exit(0));
    });
  });
});

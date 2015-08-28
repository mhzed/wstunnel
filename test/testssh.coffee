(require "source-map-support").install()
exec   = require('child_process').exec
path    = require 'path'
wst     = require "../lib/wst"
net     = require "net"
_log     = require "lawg"
future = require "phuture"
log = (msg)->
  _log msg + "\n"

config =
  s_port  : 19001
  t_port  : 22
  ws_port : 19000
  host    : '127.0.0.1'

server = new wst.server
client = new wst.client
client.setHttpOnly true

module.exports["setup ws tunnel"] = (test)->
  server.start "#{config.host}:#{config.ws_port}", (err)->
    test.ifError(err)
    log 'ws server is setup'
    client.start "#{config.host}:#{config.s_port}", "ws://#{config.host}:#{config.ws_port}", "#{config.host}:#{config.t_port}", (err)->
      test.ifError err
      log "tunnel is setup"
      test.done()

module.exports['ssh'] = (test)->
  cmdline="ssh -oUserKnownHostsFile=/dev/null -oStrictHostKeyChecking=no -p #{config.s_port} #{config.host} \"echo 'echo'\""
  exec cmdline, (err, stdout, stderr)->
    if err then log err
    log 'ssh done ' + stdout
    test.ok /echo/.test stdout
    test.done()
    future.once 200, ()->
      process.exit 0


(require "source-map-support").install()
spawn   = require('child_process').spawn
path    = require 'path'
wst     = require "../lib/wst"
net     = require "net"
_log     = require "lawg"

log = (msg)->
  _log msg + "\n"

config =
  s_port  : 11001
  t_port  : 11002
  ws_port : 11000

server = new wst.server
client = new wst.client
echo_server = null

###
  client -> wsClient:s_port -> wsServer:ws_port -> echo_server:t_port
###
module.exports['etag header'] = (test)->
  s = {x : 1, y: 2}
  eheader = require "../lib/etagHeader"
  d = eheader.fromEtag(eheader.toEtag(s))
  test.equal s.x, d.x
  test.equal s.y, d.y
  test.done()

module.exports["setup ws tunnel"] = (test)->
  # setup ws server
  server.start config.ws_port, (err)->
    test.ifError(err)
    log 'ws server is setup'
    client.start config.s_port, "ws://localhost:#{config.ws_port}", "localhost:#{config.t_port}", (err)->
      test.ifError err
      log "tunnel is setup"
      test.done()


module.exports["setup sock echo server"] = (test)->
  listener = (conn)->
    conn.on 'data', (data)->
      conn.write data

  echo_server = net.createServer listener
  echo_server.listen config.t_port, ()->
    log "echo sock server is setup"
    test.done();


module.exports["test echo"] = (test)->

  conn = net.connect { port: config.s_port }, ()->
    conn.write 'msg'
  conn.on 'data', (data)->
    test.equal(data, 'msg', 'echoed')
    test.done()


makeBuf = (size)->
  b = new Buffer(size)
  b.writeInt32LE(i+1, i*4) for i in [0...size/4]
  b

isSameBuf = (b1, b2)->
  for i in [0...b1.length/4]
    if b1.readInt32LE(i*4) != b2.readInt32LE(i*4) then return false
  return true

recvEcho = (conn, size, doneCb)->
  rb = new Buffer(size)
  rbi = 0
  conn.on 'data', (data)->
    data.copy(rb, rbi)
    rbi += data.length
    if rbi >= size then conn.end()
  conn.on 'close', ()->doneCb(rb)


# echo large data
module.exports["test echo stream"] = (test)->
  n = 1000000
  sb = makeBuf(n)
  conn = net.connect { port: config.s_port }, ()->
    conn.write sb
  recvEcho conn, n, (rb)->
    test.ok isSameBuf(sb, rb)
    test.done()

module.exports["test echo stream via http tunnel"] = (test)->
  authenticate = server.authenticate
  server.authenticate = (httpRequest, authCb)->
    authenticate.call server, httpRequest, (err, {host, port})->
      if 'x-htundir' not of httpRequest.headers
        authCb("reject websocket intentionally")
      else
        authCb(err, {host,port})

  n = 10033000
  sb = makeBuf(n)
  conn = net.connect { port: config.s_port }, ()->
    conn.write sb
  recvEcho conn, n, (rb)->
    test.ok isSameBuf(sb, rb)
    test.done()


module.exports["test end"] = (test)->
  test.done()
  setTimeout ()->
    process.exit 0
  , 100


if require.main == module
  # test code
  #require("../lib/http_override")('http://152.62.44.57:80', true)
  require("../lib/httpSetup").config('http://localhost:3000', true)

  https = require "https"
  http = require "http"

  req = http.request {
    hostname  : 'marginalrevolution.com',
    port      : 80,
    method    : 'GET',
    path      : '/',
    headers   : {
      Host : 'marginalrevolution.com'
    }
  }
  req.on('response', (response) ->
    body = ''
    response.on('data', (data)-> body += data)
    response.on('end', ()->
      console.log "http ok" # body
    )
  )
  req.end()

  req = https.request {
    hostname  : 'www1.royalbank.com',
    port      : 443,
    method    : 'GET',
    path      : 'https://www1.royalbank.com/english/netaction/sgne.html',
    headers   : {
    }
  }
  req.on('response', (response) ->
    body = ''
    response.on('data', (data)-> body += data)
    response.on('end', ()->
      console.log "https ok" # body
    )
  )
  req.end()

###
Some proxy strips "Upgrade: websocket" header, thus crippling websocket connection
###
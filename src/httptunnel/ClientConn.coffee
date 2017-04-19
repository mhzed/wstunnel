
https = require "https"
http  = require "http"
url   = require "url"
log   = require "lawg"
future = require "phuture"
httpSetup = require "../httpSetup"
debug = require "../debug"
assert = require "assert"

{ BlockSize, AutoSealDelayMs, ReqOpenIntervalMs } = require "./Constants"

###
Example:

  conn = new ClientConn("http://server")
  conn.connect (err)->
    if not err
      console.log 'connected'
      conn.pipe(socket).pipe(conn)

How it works:
  Client maintains two persistent outstanding http request:  persistent so that each request reuses the same socket.
  For send request: client is responsible to end request
  For recv request: sever is responsible to end request
###

if debug.isDebug
  dlogSock = (msg, socket)->
    log "[#{if socket and socket.address() then socket.address().port else ''}]#{msg}"
else
  dlogSock = ()->

module.exports = class ClientConn extends require("stream").Duplex

  constructor : (@urlEndPoint)->
    super({})
    @_sig = "httpCli"
    @url = url.parse(@urlEndPoint)
    if @url.protocol=='https:'
      @doHttp = https
      @url.port ||= 443
      @sendAgent = httpSetup.createHttpsAgent({maxSockets: 1, keepAlive : true, keepAliveMsecs : 10000})
      @recvAgent = httpSetup.createHttpsAgent({maxSockets: 1, keepAlive : true, keepAliveMsecs : 10000})
    else
      @doHttp = http
      @url.port ||= 80
      @sendAgent = new http.Agent({maxSockets: 1, keepAlive : true, keepAliveMsecs : 10000})
      @recvAgent = new http.Agent({maxSockets: 1, keepAlive : true, keepAliveMsecs : 10000})

  # headers is optional
  connect : (args..., cb)->
    [headers] = args
    headers ?= {}
    headers['x-htundir']  = 'conn'
    headers['Connection'] = 'keep-alive'
    req = @doHttp.request {
      hostname: @url.hostname,
      port    : @url.port,
      path    : @url.path,
      method: 'GET',
      agent : false,
      headers
    }
    req.on 'response', (res)=>
      dlogSock 'conn', res.socket
      if res.statusCode == 200
        @sessionId = res.headers['x-htunsess']
        @_recv()
        @_makeSendReq()
        cb()
      else
        cb(new Error("Http conn rejected, status: #{res.statusCode}, msg: #{res.headers['x-htunrejectmsg'] or ''}"))
    req.end()
    req.on 'error', (e)=>cb(e)

  end : ()->
    @_ended = true
    super()

  # stream overrides
  _read : ()->

  # optimization: queue multiple consecutive writes into a single request
  _write: (chunk, encoding, callback)->
    # if not @sendReq ... not supposed to happen
    if @sendReq._sealed
      # catch edge condition: _write called when a request is being ended, store _write context, resume after request
      # is sealed.  To reach here in test, set AutoSealDelayMs to 0
      @_chunk = chunk
      @_chunkCb = callback
      return
    @sendReq.send chunk

    # @sendReq.end() when
    # 1. >= BlockSize bytes are written
    # 2. or AutoSealDelayMs ms elapsed since last _write
    @sendReq._timer.cancel()
    if @sendReq._n < BlockSize
      @sendReq._timer = future.once AutoSealDelayMs, ()=>
        # seal on timer
        @sendReq.seal ()=>
      callback()
    else  # seal on size
      @sendReq.seal ()=>
        callback()  # continue writing after seal (response received entirely)

  _recv: ()->
    req = @doHttp.request {
      hostname: @url.hostname,
      port    : @url.port,
      path    : @url.path,
      method: 'GET',
      agent : @recvAgent,
      headers: {
        'Connection' : 'keep-alive',
        'x-htunsess' : @sessionId
        'x-htundir'  : 'recv'
      }
    }
    req.on 'error', (e)=>@emit 'error', new Error("http recv " + e.toString())
    req.on 'socket', (sock)=>sock.setNoDelay true
    req.setTimeout ReqOpenIntervalMs * 2, ()=>req.abort() # triggers error event
    req.on 'response', (res)=>
      res.on 'error', (e)=>@emit 'error', e
      if res.statusCode != 200
        @emit 'error', new Error("Http recv error, status: #{res.statusCode}")
      n = 0
      res.on 'data', (d)=>
        @push d;
        dlogSock 'Cli recving ' + d.length, res.socket
        n+=d.length;
      res.on 'end', ()=>
        if n>0 then dlogSock 'Cli recv ' + n, res.socket
        if not @_ended then @_recv()   # start next request

    req.end()

  _makeSendReq : ()->
    @sendReq = req = @doHttp.request {
      hostname: @url.hostname,
      port    : @url.port,
      path    : @url.path,
      method: 'POST',
      agent : @sendAgent,
      headers: {
        'Connection' : 'keep-alive',
        'Transfer-Encoding': 'chunked',
        'x-htunsess' : @sessionId,
        'x-htundir'  : 'send',
      }
    }
    req.on 'error', (e)=>@emit 'error', new Error("http send " + e.toString())
    req.on 'socket', (sock)=>sock.setNoDelay true
    req.setTimeout ReqOpenIntervalMs * 2, ()=>req.abort() # triggers error event
    req._timer = future.once ReqOpenIntervalMs, ()=>req.seal ()=>   # auto end req
    req._n = 0
    req.send = (chunk)=>
      req.write(chunk)
      dlogSock 'Cli sending ' + chunk.length, req.socket
      req._n += chunk.length
    req.seal = (cb)=>
      if req._sealed then return
      req._sealed = true
      req.on 'response', (res)=>
        res.on 'error', (e)=>@emit 'error', e
        if res.statusCode != 200
          @emit 'error', new Error("Http send error, status: #{res.statusCode}")
        res.on 'data', (d)=>
        res.on 'end', ()=>
          dlogSock 'Cli sent ' + req._n, res.socket
          if not @_ended
            @_makeSendReq()
            if @_chunk  # while sealing, another _write is called
              @_write(@_chunk, null, @_chunkCb)
              @_chunk = @_chunkCb = undefined
          cb()
      req.end()

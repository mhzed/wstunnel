
https = require "https"
http  = require "http"
log   = require "lawg"
future = require "phuture"
assert = require "assert"
debug = require "../debug"

{ BlockSize, AutoSealDelayMs, ReqOpenIntervalMs } = require "./Constants"

if debug.isDebug
  dlogSock = (msg, socket)->
    log "[#{if socket and socket.remotePort then socket.remotePort else ''}]#{msg}"
else
  dlogSock = ()->

module.exports = class ServerConn extends require("stream").Duplex

  constructor : (@sessionId, @chainedApps)->
    super({})
    @_sig = "httpSvr"
    @_ts = Date.now()
    # if client fails to poll constantly, then client is likely dead, emit error to allow proper stream shutdown
    @timeOutTimer = future.interval ReqOpenIntervalMs, ()=>
      if Date.now() - @_ts > ReqOpenIntervalMs * 2
        @emit 'error', 'Client poll timed out error'

    # install app that handles requests bound to this tunnel session
    @_app = (req, res, next)=>
      if @sessionId == req.headers['x-htunsess']
        req.on 'error', (err)=>@emit 'error', err
        res.on 'error', (err)=>@emit 'error', err
        dir = req.headers['x-htundir']
        res.writeHead(200, {});
        res.socket.setNoDelay true
        if dir == 'send'
          req.on 'data', (d)=>
            @_ts = Date.now();
            @push d
            dlogSock 'Svr recving ' + d.length, req.socket
          req.on 'end', ()=> res.end()
        else
          res._n = 0
          res.send = (chunk)=>
            dlogSock 'Svr sending ' + chunk.length , res.socket
            res._n += chunk.length
            if not res._sealed
              res.write chunk
            else
              assert false
            if res._n >= BlockSize
              res.seal()
            else
              if res._timer then res._timer.cancel()
              res._timer = future.once AutoSealDelayMs, ()=>res.seal()
          res.seal = ()=>
            if res._sealed then return
            if res._timer then res._timer.cancel()
            res._sealed = true
            res.end()
            @pushRes = undefined
            @_ts = Date.now()
          res._timer = future.once ReqOpenIntervalMs, ()=>res.seal() # by default seal after n seconds if no data sent
          @_ts = Date.now()
          @pushRes = res
          if @_chunk
            @pushRes.send @_chunk
            @_chunkCb()
            @_chunk = @_chunkCb = undefined
      else
        next()
    @chainedApps.add @_app

  end : ()->
    super()
    @timeOutTimer.cancel()
    @chainedApps.remove @_app

  # stream overrides
  _read : ()->

  _write: (chunk, encoding, callback)->
    if @pushRes
      @pushRes.send chunk
      callback()
    else
      @_chunk = chunk
      @_chunkCb = callback


stream = require "stream"
assert = require "assert"
log    = require "lawg"
util    = require "util"
future  = require "phuture"
domain = require "domain"

# Stream wrapper for http://github.com/Worlize/WebSocket-Node.git version 1.0.8
module.exports = class WsStream extends stream.Duplex

  # options.domain nodejs domain f
  constructor: (@ws)->
    super()
    @_sig = "ws"
    @_open = true
    @ws.on 'message', (message)=>
      if @_open then @push message.binaryData
    @ws.on 'close', ()=>
      @_open = false
      @emit 'close'
    @ws.on "error", (err)=> @emit 'error', err

  end : ()->
    super()
    @ws.close()

  # node stream overrides
  # @push is called when there is data, _read does nothing
  _read : ()->
  # if callback is not called, then stream write will be blocked
  _write: (chunk, encoding, callback)->
    if @_open then @ws.sendBytes(chunk, callback)


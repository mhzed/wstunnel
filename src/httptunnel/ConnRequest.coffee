
uuid = require "node-uuid"
ServerConn = require "./ServerConn"
module.exports = class ConnRequest

  constructor : (@httpRequest, @httpResponse, @chainedApps)->

  accept : ()->
    sessid = uuid.v1()
    @httpResponse.writeHead(200, {
      'x-htunsess' : sessid
    })
    @httpResponse.end()
    return new ServerConn(sessid, @chainedApps, @httpRequest)

  reject : (httpSatusCode, msg)->
    @httpResponse.writeHead(httpSatusCode, {
      'x-htunrejectmsg' : msg,
    })
    @httpResponse.end()



ConnRequest = require './ConnRequest'

module.exports = class Server extends  require('events').EventEmitter

  # @chainedApps is an instance of ChainedWebApps
  constructor : (@chainedApps)->
    @chainedApps.add (req, res, next)=>
      if 'conn' == req.headers['x-htundir']
        @emit 'request', new ConnRequest(req, res, @chainedApps)
      else
        next()

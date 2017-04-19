
###
  Very simple web server, where express is too much:

  app = new ChainedWebApps()
  server = http.createServer()
  app.bindToHttpServer(server)

  # now add aps
  # apps are called in the sequence added.  If req is handled, do not call next()
  app.add (req, res, next)->
    if 'key' of req.headers
      res.end()
    else next()
  app.add (req, res, next)->
    if /blah/.test req.url
      res.end()
    else next()

###
module.exports = class ChainedWebApps

  constructor : ()->
    defaultApp = (req, res)->
      res.writeHead(404)
      res.end();
    @apps = [defaultApp]

  bindToHttpServer : (server)->
    server.on 'request', (req,res)=>
      callApp = (i)=>
        if i< @apps.length
          @apps[i] req, res, ()=> callApp(i+1)
      callApp 0
    return @

  setDefaultApp : (app)->
    @apps[@apps.length-1] = app

  # return self, safe to add same app many times, auto de-duped
  add : (app)->
    if app not in @apps then @apps[-1...-1] = app  # insert before last
    return @
  # return self
  remove : (app)->
    apps = (a for a in @apps when a != app)
    if apps.length < @apps.length then @apps = apps
    return @
  exists : (app)->
    return app in @apps
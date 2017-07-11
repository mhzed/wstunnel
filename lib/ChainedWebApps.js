
/*
  Very simple web server, where express is too much:

  app = new ChainedWebApps()
  server = http.createServer()
  app.bindToHttpServer(server)

  * now add aps
  * apps are called in the sequence added.  If req is handled, do not call next()
  app.add (req, res, next)->
    if 'key' of req.headers
      res.end()
    else next()
  app.add (req, res, next)->
    if /blah/.test req.url
      res.end()
    else next()

*/

module.exports = class ChainedWebApps {

  constructor() {
    const defaultApp = function(req, res) {
      res.writeHead(404);
      return res.end();
    };
    this.apps = [defaultApp];
  }

  bindToHttpServer(server) {
    server.on('request', (req, res) => {
      var callApp = i => {
        if (i < this.apps.length) {
          return this.apps[i](req, res, () => callApp(i + 1));
        }
      };
      return callApp(0);
    });
    return this;
  }

  setDefaultApp(app) {
    this.apps[this.apps.length - 1] = app;
  }

  // return self, safe to add same app many times, auto de-duped
  add(app) {
    if (!Array.from(this.apps).includes(app)) { this.apps.splice(-1, -1 - -1, ...[].concat(app)); }  // insert before last
    return this;
  }
  // return self
  remove(app) {
    const apps = (Array.from(this.apps).filter((a) => a !== app).map((a) => a));
    if (apps.length < this.apps.length) { this.apps = apps; }
    return this;
  }
  exists(app) {
    return Array.from(this.apps).includes(app);
  }
};

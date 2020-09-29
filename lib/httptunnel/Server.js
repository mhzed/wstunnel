const ConnRequest = require('./ConnRequest');

module.exports = class Server extends require('events').EventEmitter {
  // @chainedApps is an instance of ChainedWebApps
  constructor(chainedApps) {
    super();
    this.chainedApps = chainedApps;
    this.chainedApps.add((req, res, next) => {
      if (req.headers['x-htundir'] === 'conn') {
        return this.emit(
          'request',
          new ConnRequest(req, res, this.chainedApps)
        );
      } else {
        return next();
      }
    });
  }
};

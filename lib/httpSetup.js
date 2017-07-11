// override nodejs http/https request methods, for proxies

const https = require("https");
const http = require("http");
const url = require("url");
const tunnel = require("./tunnelAgent");

const old_https_request = https.request;
const old_http_request = http.request;

var thisHttpSetup = null;
// proxyUrl is http[s]://user:pass@host:port/
// if anyCert is true, rejectUnauthorized is set to false, including for https proxy server
module.exports = (thisHttpSetup = {

  createHttpsAgent(options) {
    return new https.Agent(options);
  },

  config(proxyUrl, anyCert) {
    let proxy;
    if (proxyUrl) { proxy = url.parse(proxyUrl); }
    if (!proxy && !anyCert) { return; } // nothing to do

    if (anyCert && !proxy) {
      https.request = function() {
        let options = arguments[0];
        //      if typeof options.agent == 'object'
        //        options.agent.rejectUnauthorized = false
        if (typeof options === 'string') { options = url.parse(options); }
        options.rejectUnauthorized = false; // default to accept all ssl certificate
        return old_https_request.apply(undefined, Array.apply(null, arguments));
      };
      thisHttpSetup.createHttpsAgent = function(options) {
        options.rejectUnauthorized = false;
        return new https.Agent(options);
      };
      return;
    }

    // use tunnel agent for https requests
    const _m = {
      'https:': 'Https',
      'http:': 'Http'
    };
    const tunnelOptions = {
      proxy: {
        host: proxy.hostname,
        port: +proxy.port,
        proxyAuth: proxy.auth
      },
      rejectUnauthorized: (anyCert ? false : true)
    };
    const tunnelName = `httpsOver${_m[proxy.protocol]}`;

    thisHttpSetup.createHttpsAgent = function(options) {
      for (let k in tunnelOptions) {
        const v = tunnelOptions[k];
        options[k] = v;
      }
      const ret = tunnel[tunnelName](options);
      return ret;
    };

    const httpsAgent = tunnel[tunnelName](tunnelOptions);

    // must override default request() at the end, tunnel uses old impls
    https.request = function() {
      let options = arguments[0];
      if (typeof options === 'string') {
        options = url.parse(options);
        arguments[0] = options;
      }
      if (anyCert) { options.rejectUnauthorized = false; }
      if (options.agent == null) { options.agent = httpsAgent; }
      return old_https_request.apply(undefined, Array.apply(null, arguments));
    };

    // for http request, no tunnel agent is used
    return http.request = function() {
      let options = arguments[0];
      if (typeof options === 'string') {
        options = url.parse(options);
        arguments[0] = options;
      }
      // ensure Host header is set properly
      if (options.headers == null) { options.headers = {}; }
      if (!options.headers.Host) {
        options.headers.Host = `${options.hostname}`;
        if (options.port !== 80) { options.headers.Host += `:${options.port}`; }
      }
      // ensure path is full url path
      if (!/^http/.test(options.path)) {
        options.path = `http://${options.headers.Host}${options.path}`;
      }
      // override target to be proxy
      options.hostname = proxy.hostname;
      options.port = proxy.port;
      return old_http_request.apply(undefined, Array.apply(null, arguments));
    };
  }

});

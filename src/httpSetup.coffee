# override nodejs http/https request methods, for proxies

https = require("https")
http = require("http")
url = require("url")
tunnel = require("./tunnelAgent")
querystring = require("querystring")
log = require "lawg"

old_https_request = https.request
old_http_request = http.request

# proxyUrl is http[s]://user:pass@host:port/
# if anyCert is true, rejectUnauthorized is set to false, including for https proxy server
module.exports = httpSetup = {

  createHttpsAgent : (options)->
    return new https.Agent(options)

  config : (proxyUrl, anyCert) ->

    if proxyUrl then proxy = url.parse(proxyUrl)
    if not proxy and not anyCert then return # nothing to do

    if anyCert and not proxy
      https.request = () ->
        options = arguments[0]
        #      if typeof options.agent == 'object'
        #        options.agent.rejectUnauthorized = false
        if typeof options == 'string' then options = url.parse options
        options.rejectUnauthorized = false # default to accept all ssl certificate
        old_https_request.apply(undefined, Array.apply(null, arguments))
      httpSetup.createHttpsAgent = (options)->
        options.rejectUnauthorized = false
        return new https.Agent(options)
      return

    # use tunnel agent for https requests
    _m = {
      'https:': 'Https',
      'http:': 'Http'
    }
    tunnelOptions = {
      proxy: {
        host: proxy.hostname
        port: +proxy.port
        proxyAuth: proxy.auth
      }
      rejectUnauthorized: (if anyCert then false else true)
    }
    tunnelName = "httpsOver#{_m[proxy.protocol]}"

    httpSetup.createHttpsAgent = (options)->
      for k,v of tunnelOptions
        options[k] = v
      ret = tunnel[tunnelName](options)
      ret

    httpsAgent = tunnel[tunnelName](tunnelOptions)

    # must override default request() at the end, tunnel uses old impls
    https.request = () ->
      options = arguments[0]
      if typeof options == 'string'
        options = url.parse options
        arguments[0] = options
      if anyCert then options.rejectUnauthorized = false
      options.agent ?= httpsAgent
      old_https_request.apply(undefined, Array.apply(null, arguments))

    # for http request, no tunnel agent is used
    http.request = () ->
      options = arguments[0]
      if typeof options == 'string'
        options = url.parse options
        arguments[0] = options
      # ensure Host header is set properly
      options.headers ?= {}
      if not options.headers.Host
        options.headers.Host = "#{options.hostname}"
        if options.port != 80 then options.headers.Host += ":#{options.port}"
      # ensure path is full url path
      if not /^http/.test options.path
        options.path = "http://#{options.headers.Host}#{options.path}"
      # override target to be proxy
      options.hostname = proxy.hostname
      options.port = proxy.port
      return old_http_request.apply(undefined, Array.apply(null, arguments))

}
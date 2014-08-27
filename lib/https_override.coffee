# override nodejs https default request configuration, allow any certificates

https = require("https")

old_https_request = https.request

https.request = () ->
  options = arguments[0]
  options.rejectUnauthorized = false
  return old_https_request.apply(undefined, Array.apply(null, arguments))

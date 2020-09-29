module.exports = (httpRequest) =>
  httpRequest.headers['x-forwarded-for'] ||
  httpRequest.connection.remoteAddress ||
  httpRequest.socket.remoteAddress ||
  httpRequest.connection.socket.remoteAddress;

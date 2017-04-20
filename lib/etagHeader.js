module.exports = {

  toEtag(headers) {
    return `W/"${new Buffer(JSON.stringify(headers)).toString('base64')}"`;
  },

  fromEtag(etag) {
    etag = etag.slice(3, etag.length - 1);
    return JSON.parse(new Buffer(etag, "base64").toString('utf8'));
  }

};

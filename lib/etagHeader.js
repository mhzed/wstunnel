module.exports = {
  toEtag(headers) {
    return `W/"${Buffer.from(JSON.stringify(headers)).toString('base64')}"`;
  },

  fromEtag(etag) {
    etag = etag.slice(3, etag.length - 1);
    return JSON.parse(Buffer.from(etag, 'base64').toString('utf8'));
  },
};

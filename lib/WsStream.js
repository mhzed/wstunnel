const stream = require('stream');

// Stream wrapper for http://github.com/Worlize/WebSocket-Node.git version 1.0.8
module.exports = WsStream = class WsStream extends stream.Duplex {
  // options.domain nodejs domain f
  constructor(ws) {
    super();
    this.ws = ws;
    this._sig = 'ws';
    this._open = true;
    this.ws.on('message', (message) => {
      if (this._open) {
        return this.push(message.binaryData);
      }
    });
    this.ws.on('close', () => {
      this._open = false;
      return this.emit('close');
    });
    this.ws.on('error', (err) => this.emit('error', err));
  }

  end() {
    super.end();
    return this.ws.close();
  }

  // node stream overrides
  // @push is called when there is data, _read does nothing
  _read() {}
  // if callback is not called, then stream write will be blocked
  _write(chunk, encoding, callback) {
    if (this._open) {
      return this.ws.sendBytes(chunk, callback);
    }
  }
};

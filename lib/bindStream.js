const _ = require('underscore');
const log = require('lawg');
const future = require('phuture');
const debug = require('./debug');
let _n = 0;

const name = (stream) => stream._sig || 'tcp';

module.exports = function (s1, s2) {
  let dlog;
  const n = _n++;
  const llog = (stream, msg) => log(`${n} ${name(stream)} ${msg}`);

  // debug log if set in environment
  if (debug.isDebug) {
    dlog = llog;
  } else {
    dlog = function () {};
  }

  // add stop:  end() once wrapper
  const stop = function () {
    if (!this._stop) {
      dlog(this, 'stop');
      this._stop = true;
      return this.end();
    }
  };
  s1.stop = stop;
  s2.stop = stop;
  // bind error handlers
  s1.on('error', function (err) {
    llog(s1, err);
    s1.stop();
    return s2.stop();
  });
  s2.on('error', function (err) {
    llog(s2, err);
    s2.stop();
    return s1.stop();
  });

  const manualPipe = function () {
    s1.on('data', function (data) {
      if (!s2._stop) {
        return s2.write(data);
      }
    });
    s2.on('data', function (data) {
      if (!s1._stop) {
        return s1.write(data);
      }
    });

    s1.on('finish', function () {
      dlog(s1, 'finish');
      return s2.stop();
    });
    s1.on('end', function () {
      dlog(s1, 'end');
      return s2.stop();
    });
    s1.on('close', function () {
      dlog(s1, 'close');
      return s2.stop();
    });
    s2.on('finish', function () {
      dlog(s2, 'finish');
      return s1.stop();
    });
    s2.on('end', function () {
      dlog(s2, 'end');
      return s1.stop();
    });
    return s2.on('close', function () {
      dlog(s2, 'close');
      return s1.stop();
    });
  };

  const autoPipe = function () {
    s1.on('close', function () {
      dlog(s1, 'close');
      return s2.stop();
    });
    s2.on('close', function () {
      dlog(s2, 'close');
      return s1.stop();
    });
    const end = true;
    return s1.pipe(s2, { end }).pipe(s1, { end });
  };

  // manualPipe()
  autoPipe();

  class SpeedMeter {
    constructor(msg) {
      this.msg = msg;
      this.n = 0;
      this.timer = future.interval(1000, () => {
        if (this.n > 0) {
          log(`${this.msg} ${this.n / 1000}k/s`);
          return (this.n = 0);
        }
      });
    }
    attach(readStream) {
      readStream.on('data', (d) => {
        return (this.n += d.length);
      });
      return readStream.on('end', () => {
        return this.timer.cancel();
      });
    }
  }
  // must install after pipe
  if (debug.isDebug) {
    new SpeedMeter(name(s1)).attach(s1);
    return new SpeedMeter(name(s2)).attach(s2);
  }
};

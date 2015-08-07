_ = require "underscore"
log = require "lawg"
future = require "phuture"
debug = require "./debug"
_n = 0


name = (stream)-> stream._sig or "tcp"

module.exports = (s1, s2)->
  n = _n++
  llog = (stream, msg)-> log "#{n} #{name(stream)} #{msg}";

  # debug log if set in environment
  if debug.isDebug
    dlog = llog
  else
    dlog = ()->

  # add stop:  end() once wrapper
  stop = ()->
    if not @_stop
      dlog(@, 'stop')
      @_stop = true
      @end()
  s1.stop = stop
  s2.stop = stop
  # bind error handlers
  s1.on 'error', (err)->llog(s1, err); s1.stop();s2.stop()
  s2.on 'error', (err)->llog(s2, err); s2.stop();s1.stop()

  manualPipe = ()->
    s1.on 'data', (data)->if not s2._stop then s2.write data
    s2.on 'data', (data)->if not s1._stop then s1.write data

    s1.on 'finish', ()->dlog(s1, 'finish'); s2.stop();
    s1.on 'end',    ()->dlog(s1, 'end'); s2.stop()
    s1.on 'close',  ()->dlog(s1, 'close'); s2.stop()
    s2.on 'finish', ()->dlog(s2, 'finish'); s1.stop();
    s2.on 'end',    ()->dlog(s2, 'end'); s1.stop()
    s2.on 'close',  ()->dlog(s2, 'close'); s1.stop()

  autoPipe = ()->
    s1.on 'close', ()->
      dlog s1, 'close'
      s2.stop()
    s2.on 'close', ()->
      dlog s2, 'close'
      s1.stop()
    end = true
    s1.pipe(s2, {end}).pipe(s1, {end})

  #manualPipe()
  autoPipe()

  class SpeedMeter
    constructor : (@msg)->
      @n = 0
      @timer = future.interval 1000, ()=> if @n > 0
        log "#{@msg} #{@n/1000}k/s"
        @n = 0
    attach : (readStream)->
      readStream.on 'data', (d)=>
        @n += d.length
      readStream.on 'end', ()=>
        @timer.cancel()
  # must install after pipe
  if debug.isDebug
    (new SpeedMeter(name(s1))).attach(s1)
    (new SpeedMeter(name(s2))).attach(s2)


module.exports = bindSockets = (wsconn, tcpconn)->
  wsconn.__paused = false;
  wsconn.on('message', (message)->
      if (message.type == 'utf8')
        console.log('Error, Not supposed to received message ');
      else if (message.type == 'binary')
        if (false == tcpconn.write(message.binaryData))
          wsconn.socket.pause();
          wsconn.__paused = true;
          ""
        else
          # because of websocket wrapper processing, a message is delivered even if wsconn is paused
          # and the next tcpconn.write may return true because of timing, in such case, tcpconn's 'drain'
          # wont' be called, so we need to ensure wsconn is properly resumed here
          if (true == wsconn.__paused)
            wsconn.socket.resume()
            wsconn.__paused = false
  )
  tcpconn.on("drain", ()->
    wsconn.socket.resume()
    wsconn.__paused = false;
  )
  wsconn.on("overflow", ()->
    tcpconn.pause()
  )
  wsconn.socket.on("drain", ()->
    tcpconn.resume()
  )

  tcpconn.on("data", (buffer)->
    wsconn.sendBytes(buffer);
  )
  wsconn.on("error", (err)->
    console.log((new Date()) + 'ws Error ' + err);
  )
  tcpconn.on("error", (err)->
    console.log((new Date()) + 'tcp Error ' + err);
  )
  wsconn.on('close', (reasonCode, description)->
    console.log((new Date()) + 'ws Peer ' + wsconn.remoteAddress + ' disconnected.');
    #tcpconn.close()
    tcpconn.destroy()
  )
  tcpconn.on("close", ()->
    console.log((new Date()) + 'tunnel disconnected.');
    wsconn.close()
  )

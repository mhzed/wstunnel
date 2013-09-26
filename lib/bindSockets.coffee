
module.exports = bindSockets = (wsconn, tcpconn)->
  wsconn.on('message', (message)->
      if (message.type == 'utf8')
        console.log('Error, Not supposed to received message ');
      else if (message.type == 'binary')
        if (!tcpconn.write(message.binaryData))
          #wsconn.socket.pause();
          'aha'
  )
  # throttling based on drain does not seem to be necessary,
  #tcpconn.on("drain", ()->wsconn.socket.resume() )
  #wsconn.on("overflow", ()-> tcpconn.pause() )
  #wsconn.socket.on("drain", ()-> tcpconn.resume() )

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

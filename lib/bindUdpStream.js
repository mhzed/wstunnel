module.exports = function (ws, socket, host, port, onClose) {
  const onMessage = (data, rinfo) => {
    if (rinfo.address === host && rinfo.port === port) {
      ws.write(data);
    }
  };
  socket.on('message', onMessage);
  ws.on('data', (data) => {
    socket.send(data, port, host);
  });
  ws.on('close', () => {
    socket.off('message', onMessage);
    onClose();
  });
}

const SocksProxyAgent = require('socks-proxy-agent');
const HttpProxyAgent = require('http-proxy-agent');
const HttpsProxyAgent = require('https-proxy-agent');

const Help = `
Run websocket tunnel server or client.
 To run server: wstunnel -s 0.0.0.0:8080
 To run client: wstunnel -t localport:host:port ws[s]://wshost:wsport
 Client via http proxy: wstunnel -t localport:host:port -p http://[user:pass@]host:port ws[s]://wshost:wsport
 Client via socks proxy: wstunnel -t localport:host:port -p socks://[user:pass@]ip:port ws[s]://wshost:wsport

Connecting to localhost:localport is the same as connecting to host:port on wshost

For security, you can "lock" the tunnel destination on server side, for eample:
 wstunnel -s 0.0.0.0:8080 -t host:port
Server will tunnel incomming websocket connection to host:port only, so client can just run
 wstunnel -t localport ws://wshost:port
If client run:
 wstunnel -t localport:otherhost:otherport ws://wshost:port
 * otherhost:otherport is ignored, tunnel destination is still "host:port" as specified on server.

In client mode, you can bind stdio to the tunnel by running:
 wstunnel -t stdio:host:port ws[s]://wshost:wsport
This allows the command to be used as ssh proxy:
 ssh -o ProxyCommand="wstunnel -c -t stdio:%h:%p https://wstserver" user@sshdestination
Above command will ssh to "user@sshdestination" via the wstunnel server at "https://wstserver"

`;
module.exports = (Server, Client) => {
  const optimist = require('optimist');
  let argv = optimist
    .usage(Help)
    .string('s')
    .string('t')
    .string('p')
    .alias('p', 'proxy')
    .alias('t', 'tunnel')
    .boolean('c')
    .boolean('http')
    .string('uuid')
    .alias('c', 'anycert')
    .default('c', false)
    .describe('s', 'run as server, listen on [localip:]localport')
    .describe(
      'tunnel',
      'run as tunnel client, specify [localip:]localport:host:port'
    )
    .describe(
      'proxy',
      'connect via a http or socks proxy server in client mode '
    )
    .describe('c', 'accept any certificates')
    .describe('http', 'force to use http tunnel').argv;

  if (argv.s) {
    let server;
    if (argv.t) {
      let [host, port] = argv.t.split(':');
      server = new Server(host, port);
    } else {
      server = new Server();
    }
    server.start(argv.s, (err) =>
      err ? console.log(` Server is listening on ${argv.s}`) : null
    );
  } else if (argv.t || argv.uuid !== undefined) {
    // client mode
    const uuid = require('machine-uuid');
    uuid((machineId) => {
      if (argv.uuid === true) {
        // --uuid without param
        console.log(machineId);
        return;
      } else if (argv.uuid) {
        machineId = argv.uuid;
      }
      if (argv.c) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
      }
      let client = new Client();
      let wsHostUrl = argv._[0];

      if (argv.proxy) {
        const conf = new URL(argv.proxy);
        if (
          ['socks4:', 'socks4a:', 'socks5:', 'socks:', 'socks5h:'].includes(
            conf.protocol
          )
        ) {
          client.setAgentMaker(
            (c) => new SocksProxyAgent(Object.assign({}, c, conf))
          );
        } else if (conf.protocol === 'https:' || conf.protocol === 'http:') {
          const p = new URL(wsHostUrl).protocol;
          if ('wss:' === p || 'https:' === p)
            client.setAgentMaker(
              (c) => new HttpsProxyAgent(Object.assign({}, c, conf))
            );
          else if ('ws:' === p || 'http:' === p)
            client.setAgentMaker(
              (c) => new HttpProxyAgent(Object.assign({}, c, conf))
            );
          else {
            console.log('Invalid target ' + wsHostUrl);
            process.exit(1);
          }
        } else {
          console.log('Invalid proxy ' + argv.proxy);
          process.exit(1);
        }
      }
      if (argv.http) {
        client.setHttpOnly(true);
      }
      client.verbose();

      let localHost = 'localhost',
        localPort;
      let remoteAddr;
      let toks = argv.t.split(':');
      if (toks.length === 4) {
        [localHost, localPort] = toks;
        remoteAddr = `${toks[2]}:${toks[3]}`;
      } else if (toks.length === 3) {
        remoteAddr = `${toks[1]}:${toks[2]}`;
        if (toks[0] === 'stdio') {
          localHost = toks[0];
        } else {
          localPort = toks[0];
        }
      } else if (toks.length === 1) {
        remoteAddr = '';
        localPort = toks[0];
      } else {
        console.log('Invalid tunnel option ' + argv.t);
        console.log(optimist.help());
        process.exit(1);
      }
      localPort = parseInt(localPort);
      if (localHost === 'stdio') {
        client.startStdio(wsHostUrl, remoteAddr, { 'x-wstclient': machineId });
      } else {
        client.start(localHost, localPort, wsHostUrl, remoteAddr, {
          'x-wstclient': machineId,
        });
      }
    });
  } else {
    console.log(optimist.help());
  }
};

# wstunnel

Establish tcp tunnel over web socket connection.

## Installation

npm install wstunnel

## Usage

Run the websocket tunnel server at port 8080:

    wstunnel -s 8080

Run the websocket tunnel client:

    wstunnel -tunnel 33:2.2.2.2:33 ws://host:8080

Note in above example, client picks the final tunnel destination, similar to ssh tunnel.  Alternatively for security
reason, you can lock tunnel destination on server end, example:

    Server:
        wstunnel -s 8080 -t 2.2.2.2:33

    Client:
        wstunnel -t 33 ws://server:8080

In both examples, connect to localhost:33 on client will be tunneled to 2.2.2.2:33 on server, via the websocket
connection.

## Use case

For tunneling over strict firewall.

The tunnel server mode supports plain tcp socket only, for SSL support, use nginx.

Sample setup:

On server:
    wstunnel -s 8080

On server, run nginx (>=1.3.13) with sample configuration:

    server {
        listen   443;
        server_name  mydomain.com;

        ssl  on;
        ssl_certificate  /path/to/my.crt
        ssl_certificate_key  /path/to/my.key
        ssl_session_timeout  5m;
        ssl_protocols  SSLv2 SSLv3 TLSv1;
        ssl_ciphers  ALL:!ADH:!EXPORT56:RC4+RSA:+HIGH:+MEDIUM:+LOW:+SSLv2:+EXP;
        ssl_prefer_server_ciphers   on;

        location / {
            proxy_pass http://127.0.0.1:8080;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header        Host            $host;
            proxy_set_header        X-Real-IP       $remote_addr;
            proxy_set_header        X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header        X-Forwarded-Proto $scheme;
        }
    }

On client:
    wstunnel -t 99:targethost:targetport wss://mydomain.com

## Caveats

If you are using self signed certificate on server end for ssl connection, add following line:

    rejectUnauthorized : false

to ./node_modules/websocket/lib/WebSocketClient.js line 246


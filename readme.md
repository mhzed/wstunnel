# wstunnel

Establish a TCP socket tunnel over web socket connection, for circumventing strict firewalls.

## Installation

npm install wstunnel

## Usage

Run the websocket tunnel server at port 8080:

    wstunnel -s 8080

Run the websocket tunnel client:

    wstunnel -tunnel 33:2.2.2.2:33 ws://host:8080

In the above example, client picks the final tunnel destination, similar to ssh tunnel.  Alternatively for security
reason, you can lock tunnel destination on the server end, example:

    Server:
        wstunnel -s 8080 -t 2.2.2.2:33

    Client:
        wstunnel -t 33 ws://server:8080

In both examples, connection to localhost:33 on client will be tunneled to 2.2.2.2:33 on server via websocket
connection in between.

## Use case

For tunneling over strict firewalls: WebSocket is a part of the HTML5 standard, any reasonable firewall will unlikely
be so strict as to break HTML5. 

The tunnel server currently supports plain tcp socket only, for SSL support, use NGINX, shown below:

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

Then on client:

    wstunnel -t 99:targethost:targetport wss://mydomain.com


### OpenVPN use case

Suppose on the server you have OpenVpn installed on the default port 1194,  then run wstunnel as such:

    wstunnel -s 8888 -t 127.0.0.1:1194
    
Now on the server, you have a websocket server listening on 8888, any connection to 8888 will be forwarded to  
127.0.0.1:1194, the OpenVpn port.

Now on client, you run:

    wstunnel -t 1194 ws://server:8888
  
Then launch the OpenVpn client, connect to localhost:1194 will be same as connect to server's 1194 port.

Suppose the firewall allows http traffic on target port 80 only, then setup a NGINX reverse proxy to listen on port 80,
and proxy http traffic to localhost:8888 via host name.


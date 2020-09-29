# wstunnel

Establish a TCP socket tunnel over web socket connection, for circumventing strict firewalls.

## Installation

npm install -g wstunnel

## Usage

Run the websocket tunnel server at port 8080 on all interfaces:

    wstunnel -s 0.0.0.0:8080

Run the websocket tunnel client:

    wstunnel -t 33:2.2.2.2:33 ws://host:8080

In the above example, client picks the final tunnel destination, similar to ssh tunnel. Alternatively for security reason, you can lock tunnel destination on the server end, example:

    Server:
        wstunnel -s 0.0.0.0:8080 -t 2.2.2.2:33

    Client:
        wstunnel -t 33 ws://server:8080

In both examples, connection to localhost:33 on client will be tunneled to 2.2.2.2:33 on server via websocket connection in between.

To tell client to connect via http proxy, do:

    wstunnel -t 33:2.2.2.2:33 -p http://[user:pass@]proxyhost:proxyport wss://server:443

For dev/test purpose, client can set '-c' option to disable ssl certificate check.

This also makes you vulnerable to MITM attack, so use with caution.

To get help, just run

    wstunnel

## Docker

A public docker image "mhzed/wstunnel" is now available.

Example:

```
# run as client to connect to wss://server.com, tunnel localhost:2244 to target.ip:22
docker run --rm -d -p 2244:2244 mhzed/wstunnel -t 0.0.0.0:2244:target.ip:22 wss://server.com
```

Notice "-t 0.0.0.0:2244..." above. By default wstunnel binds to localhost which is unreachable inside a docker container, so make sure to specify "0.0.0.0" to bind to all local IPs.

## Use cases

For tunneling over strict firewalls: WebSocket is a part of the HTML5 standard, any reasonable firewall will unlikely be so strict as to break HTML5.

### SSL setup

Currently wstunnel in server mode supports plain tcp socket only. For SSL support (highly recommended), setup a NGINX reverse proxy.

On server, wstunnel listens on localhost:8080:

    wstunnel -s 8080

On server, run NGINX (>=1.3.13) with sample configuration:

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

### SSH Proxy

To use as a proxy for "ssh", run:

```
ssh -o ProxyCommand="wstunnel -t stdio:%h:%p https://server" user@sshDestination
```

Above command will ssh to "user@sshDestination" via wstunnel server at "https://server".

### RDP use case

Let's say you want to use a Remote Desktop connection to a machine with IP 2.2.2.2  
Run the wstunnel server on a different machine, tunneling to the destination on the RDP port 3389:

         wstunnel -s 0.0.0.0:8080 -t 2.2.2.2:3389

On the destination, you need to tweak some registry settings to relax the security policy for Remote Desktop.

        Open RegEdit, and navigate to the following key:
        HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp
        Change "SecurityLayer" to 0
        Change "SelectNetworkDetect" to 0
        Reboot

On the client, first start wstunnel:

        wstunnel -t 3389 ws://server:8080

Now you can just open Remote Desktop Connection and connect to `localhost`

## Proxy

When using socks proxy, ensure the host is IP address only, DNS name is not supported. For example:

```
# "localhost" won't work
wstunnel -t 2255:sshhost:22 --proxy socks://localhost:3111 http://wsserver
# instead, do:
wstunnel -t 2255:sshhost:22 --proxy socks://127.0.0.1:3111 https://wsserver
```

## Http tunnel

An http tunnel will be established if websocket connection fails. Two long live http connections are
established for sending and receiving data.

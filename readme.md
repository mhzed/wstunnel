# wstunnel

Establish a TCP socket tunnel over web socket connection, for circumventing strict firewalls.

## Installation

npm install -g wstunnel

## Usage

Run the websocket tunnel server at port 8080 on all interfaces:

    wstunnel -s 0.0.0.0:8080

Run the websocket tunnel client:

    wstunnel -t 33:2.2.2.2:33 ws://host:8080

In the above example, client picks the final tunnel destination, similar to ssh tunnel.  Alternatively for security
reason, you can lock tunnel destination on the server end, example:

    Server:
        wstunnel -s 0.0.0.0:8080 -t 2.2.2.2:33

    Client:
        wstunnel -t 33 ws://server:8080

In both examples, connection to localhost:33 on client will be tunneled to 2.2.2.2:33 on server via websocket
connection in between.

To tell client to connect via http proxy, do:

    wstunnel -t 33:2.2.2.2:33 -p http://[user:pass@]proxyhost:proxyport wss://server:443

When connecting to secure websocket server via "wss://", client might want to disable 'unauthorized' certificate 
rejection, via adding the '-c' option.

    wstunnel -t 33:2.2.2.2:33 -c -p http://[user:pass@]proxyhost:proxyport wss://server:443
    
This also makes you vulnerable to MITM attack, so use with caution.

To get help, just run

    wstunnel

## Use cases

For tunneling over strict firewalls: WebSocket is a part of the HTML5 standard, any reasonable firewall will unlikely
be so strict as to break HTML5. 

### SSL setup

The tunnel server currently supports plain tcp socket only, for SSL support, use NGINX, shown below:

On server, listen on localhost:8080:

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

### SSH Proxy

To use as a proxy for "ssh", run:

    ssh -o ProxyCommand="wstunnel -c -t stdio:%h:%p https://wstserver" user@sshdestination

Above command will ssh to "user@sshdestination" via wstunnel server at "https://wstserver".


### OpenVPN use case

Suppose on the server you have OpenVpn installed on the default port 1194,  then run wstunnel as such:

    wstunnel -s 8888 -t 127.0.0.1:1194
    
Now on the server, you have a websocket server listening on localhost:8888, any connection to 8888 will be forwarded to  
127.0.0.1:1194, the OpenVpn port.

Now on client, you run:

    wstunnel -t 1194 ws://server:8888
  
Then launch the OpenVpn client, connect to localhost:1194 will be same as connect to server's 1194 port.

This setup won't work if you are behind a strict firewall because:

1. Non 80/443 ports are usually blocked by firewall.
2. Stateful packet inspection will be ablet detect the content of your websocket tunnel 
   as OPENVPN traffic, then block it.

A more firewall proof setup would be to use wstunnel over SSL behind standard https port 443:

1. Run wstunnel server mode
        
        wstunnel -s 8888 -t 127.0.0.1:1194
        
2. Run NGINX on server, listen on 443 for https connection, forward to wstunnel server localhost:8888
3. On client, run wstunnel client mode using "wss://"

        wstunnel -t 1194 wss://server

4. Now on client, launch OPENVPN connection to localhost:1194.

### RDP use case

Let's say you want to use a Remote Desktop connection to a machine with IP 2.2.2.2    
Run the wstunnel server on a different machine, tunnelling to the destination on the RDP port 3389:

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

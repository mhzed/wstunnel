# wstunnel

Establish tcp tunnel over web socket connection.

## Installation

npm install wstunnel

## Usage

Run the websocket tunnel server at port 8080:

    wstunnel -s 8080

Run the websocket tunnel client:

    wstunnel -tunnel localport:host:port ws://host:port

## Use case

For tunneling over strict firewall.

For authentication, use nginx at the server end.



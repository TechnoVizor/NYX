# The per-run egress firewall. Only NET_ADMIN, nothing else: it installs iptables rules in the network namespace
# the plugin then joins, prints "ready", and sleeps until the runner removes it.
FROM alpine:3.20
RUN apk add --no-cache iptables ip6tables
COPY egress.sh /egress.sh
ENTRYPOINT ["/bin/sh", "/egress.sh"]

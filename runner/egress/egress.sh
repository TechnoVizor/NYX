#!/bin/sh
# Installs the plugin's outbound rules, then says "ready". Inputs: NYX_EGRESS_MODE, NYX_EGRESS_ALLOW (spec §2).
set -u

fail() { echo "egress: $*" >&2; exit 1; }
v4() { iptables "$@" || fail "iptables $*"; }
# No IPv6 filter table in the kernel means this container has no IPv6 at all: skip those rules.
if ip6tables -L >/dev/null 2>&1; then v6() { ip6tables "$@" || fail "ip6tables $*"; }; else v6() { :; }; fi

PRIVATE4="10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 100.64.0.0/10 169.254.0.0/16 127.0.0.0/8 0.0.0.0/8 224.0.0.0/4"
PRIVATE6="fc00::/7 fe80::/10 ff00::/8 ::/128"

# Never reachable, whatever a name resolves to: the host (this namespace's gateway), link-local (cloud metadata),
# and whatever the operator lists in NYX_EGRESS_DENY (e.g. the server's public IP).
GATEWAY=$(ip -4 route show default | awk '{print $3; exit}')
SUBNET=$(ip -4 route show scope link | awk '{print $1; exit}')

drop() {  # one address or network
  case "$1" in
    *:*) v6 -A OUTPUT -d "$1" -j DROP ;;
    *) v4 -A OUTPUT -d "$1" -j DROP ;;
  esac
}

deny_always() {
  drop 169.254.0.0/16
  drop fe80::/10
  [ -n "$GATEWAY" ] && drop "$GATEWAY"
  for d in ${NYX_EGRESS_DENY:-}; do drop "$d"; done
}

allow() {  # one address or network
  case "$1" in
    *:*) v6 -A OUTPUT -d "$1" -j ACCEPT ;;
    *) v4 -A OUTPUT -d "$1" -j ACCEPT ;;
  esac
}

is_address() { echo "$1" | grep -Eq '^[0-9.]+(/[0-9]+)?$|^[0-9a-fA-F:]+(/[0-9]+)?$'; }

case "${NYX_EGRESS_MODE:-}" in
  target_scope)
    for t in v4 v6; do
      $t -P OUTPUT DROP
      $t -A OUTPUT -o lo -j ACCEPT
      $t -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    done
    deny_always  # before any allow: a scoped name pointing at metadata or the host opens nothing
    for entry in ${NYX_EGRESS_ALLOW:-}; do
      if is_address "$entry"; then
        allow "$entry"
      else
        addrs=$(getent ahosts "$entry" | awk '{print $1}' | sort -u)
        [ -n "$addrs" ] || { echo "unresolved: $entry" >&2; continue; }
        for a in $addrs; do allow "$a"; done
      fi
    done
    ;;
  public)
    v4 -P OUTPUT ACCEPT
    v4 -A OUTPUT -o lo -j ACCEPT
    deny_always
    [ -n "$SUBNET" ] && drop "$SUBNET"  # the plugin network itself, even when Docker's pool is outside RFC1918
    for n in $PRIVATE4; do v4 -A OUTPUT -d "$n" -j DROP; done
    v6 -P OUTPUT ACCEPT
    v6 -A OUTPUT -o lo -j ACCEPT
    for n in $PRIVATE6; do v6 -A OUTPUT -d "$n" -j DROP; done
    ;;
  *) fail "unknown mode ${NYX_EGRESS_MODE:-}" ;;
esac

echo ready
exec sleep infinity

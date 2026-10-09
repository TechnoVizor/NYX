FROM busybox:1.37
# Tries each URL in NYX_PROBE and prints one JSON line per URL; NYX_IFDOWN=1 also tries to take the interface down.
CMD ["sh", "-c", "for u in $NYX_PROBE; do if wget -q -T 3 -O /dev/null \"$u\"; then r=true; else r=false; fi; echo \"{\\\"url\\\":\\\"$u\\\",\\\"reached\\\":$r}\"; done; if [ -n \"$NYX_IFDOWN\" ]; then if ip link set eth0 down 2>/dev/null; then d=true; else d=false; fi; echo \"{\\\"ifdown\\\":$d}\"; fi"]

FROM busybox:1.37
# Two event-ish lines, one to stderr, then either exit or hang (SLEEP env) for the timeout test.
CMD ["sh", "-c", "echo '{\"a\":1}'; echo '{\"b\":2}'; echo oops >&2; sleep ${SLEEP:-0}; exit ${CODE:-0}"]

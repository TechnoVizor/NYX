# syntax=docker/dockerfile:1
# Context: plugins/   (docker compose --profile plugins build)
FROM python:3.12-slim AS fetch
ARG TARGETARCH
ARG VERSION=2.6.1
ARG SHA256_amd64=018c4c9884dea971eda860435ede3021d1150732f34cfd245498c6726d8cab90
ARG SHA256_arm64=3adc2bb2395c3efff89623499b20eea66ef54924c485d3ae86762393a31736ea
ADD https://github.com/projectdiscovery/naabu/releases/download/v${VERSION}/naabu_${VERSION}_linux_${TARGETARCH}.zip /tmp/tool.zip
RUN eval "sum=\$SHA256_${TARGETARCH}" && echo "$sum  /tmp/tool.zip" | sha256sum -c - \
 && python -m zipfile -e /tmp/tool.zip /tmp/tool && chmod 0755 /tmp/tool/naabu

FROM python:3.12-slim
ENV HOME=/tmp PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=/plugin
# naabu links libpcap even for the connect scan it runs here.
RUN apt-get update && apt-get install -y --no-install-recommends libpcap0.8t64 && rm -rf /var/lib/apt/lists/*
COPY --from=fetch /tmp/tool/naabu /usr/local/bin/naabu
COPY sdk/nyx_plugin.py projectdiscovery.naabu/adapter.py /plugin/
USER 65534:65534
ENTRYPOINT ["python", "/plugin/adapter.py"]

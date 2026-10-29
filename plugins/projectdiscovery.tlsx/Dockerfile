# syntax=docker/dockerfile:1
# Context: plugins/   (docker compose --profile plugins build)
FROM python:3.12-slim AS fetch
ARG TARGETARCH
ARG VERSION=1.4.0
ARG SHA256_amd64=05628cec246e292e2f9afc6e7bc5de95aaa0fbe78fd556d5ad220b9f4702d364
ARG SHA256_arm64=b757125d94c7d0e1f1f109534f0ed88d2a4b1c3856e1fa35efc1ef9e36781b0e
ADD https://github.com/projectdiscovery/tlsx/releases/download/v${VERSION}/tlsx_${VERSION}_linux_${TARGETARCH}.zip /tmp/tool.zip
RUN eval "sum=\$SHA256_${TARGETARCH}" && echo "$sum  /tmp/tool.zip" | sha256sum -c - \
 && python -m zipfile -e /tmp/tool.zip /tmp/tool && chmod 0755 /tmp/tool/tlsx

FROM python:3.12-slim
ENV HOME=/tmp PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=/plugin
COPY --from=fetch /tmp/tool/tlsx /usr/local/bin/tlsx
COPY sdk/nyx_plugin.py projectdiscovery.tlsx/adapter.py /plugin/
USER 65534:65534
ENTRYPOINT ["python", "/plugin/adapter.py"]

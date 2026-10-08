# syntax=docker/dockerfile:1
# Context: plugins/   (docker compose --profile plugins build)
FROM python:3.12-slim AS fetch
ARG TARGETARCH
ARG VERSION=1.3.1
ARG SHA256_amd64=438b964653056dd51dcfe614b1a16f8bced3cc48a1d27bc07cc6fdf2ef2a9533
ARG SHA256_arm64=dd657dd1ccee5e137eca2dbad0e97dbd067555f744adb97efcda774f1b2fbde1
ADD https://github.com/projectdiscovery/dnsx/releases/download/v${VERSION}/dnsx_${VERSION}_linux_${TARGETARCH}.zip /tmp/tool.zip
RUN eval "sum=\$SHA256_${TARGETARCH}" && echo "$sum  /tmp/tool.zip" | sha256sum -c - \
 && python -m zipfile -e /tmp/tool.zip /tmp/tool && chmod 0755 /tmp/tool/dnsx

FROM python:3.12-slim
ENV HOME=/tmp PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=/plugin
COPY --from=fetch /tmp/tool/dnsx /usr/local/bin/dnsx
COPY sdk/nyx_plugin.py projectdiscovery.dnsx/adapter.py /plugin/
USER 65534:65534
ENTRYPOINT ["python", "/plugin/adapter.py"]

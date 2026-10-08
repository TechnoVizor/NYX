# syntax=docker/dockerfile:1
# Context: plugins/   (docker compose --profile plugins build)
FROM python:3.12-slim AS fetch
ARG TARGETARCH
ARG VERSION=2.16.0
ARG SHA256_amd64=1b7f9c608e9a5bd59e609a5e09710d63c5485e92d3d49dc2c16eb4fdbe10cb60
ARG SHA256_arm64=c81d49559c0f630177be9e347e502e7a3d474aacc6ff78291ffcb4964367d63d
ADD https://github.com/projectdiscovery/subfinder/releases/download/v${VERSION}/subfinder_${VERSION}_linux_${TARGETARCH}.zip /tmp/tool.zip
RUN eval "sum=\$SHA256_${TARGETARCH}" && echo "$sum  /tmp/tool.zip" | sha256sum -c - \
 && python -m zipfile -e /tmp/tool.zip /tmp/tool && chmod 0755 /tmp/tool/subfinder

FROM python:3.12-slim
ENV HOME=/tmp PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=/plugin
COPY --from=fetch /tmp/tool/subfinder /usr/local/bin/subfinder
COPY sdk/nyx_plugin.py projectdiscovery.subfinder/adapter.py /plugin/
USER 65534:65534
ENTRYPOINT ["python", "/plugin/adapter.py"]

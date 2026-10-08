# syntax=docker/dockerfile:1
# Context: plugins/   (docker compose --profile plugins build)
FROM python:3.12-slim AS fetch
ARG TARGETARCH
ARG VERSION=1.12.0
ARG SHA256_amd64=9d8439e8b6c9aa7d1e2314817a392e00d5178da3af5652f7475f88868f418f76
ARG SHA256_arm64=fd7b123c1dfbc3d69f19f524e4eebcd6ec06b9a6cbd56813c76f11645197331e
ADD https://github.com/projectdiscovery/httpx/releases/download/v${VERSION}/httpx_${VERSION}_linux_${TARGETARCH}.zip /tmp/tool.zip
RUN eval "sum=\$SHA256_${TARGETARCH}" && echo "$sum  /tmp/tool.zip" | sha256sum -c - \
 && python -m zipfile -e /tmp/tool.zip /tmp/tool && chmod 0755 /tmp/tool/httpx

FROM python:3.12-slim
ENV HOME=/tmp PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=/plugin
COPY --from=fetch /tmp/tool/httpx /usr/local/bin/httpx
COPY sdk/nyx_plugin.py projectdiscovery.httpx/adapter.py /plugin/
USER 65534:65534
ENTRYPOINT ["python", "/plugin/adapter.py"]

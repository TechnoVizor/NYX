# syntax=docker/dockerfile:1
# Context: plugins/   (docker compose --profile plugins build)
FROM python:3.12-slim AS fetch
ARG TARGETARCH
ARG VERSION=2.2.4
ARG SHA256_amd64=10e2e248c37cafb0be3f6d2931125296b95cd4186066d596d47fa417237529a9
ARG SHA256_arm64=c194992df360d3a24e021c6dc5a5a0576cfd769be1d19cccb29adc1d3759637d
ADD https://github.com/lc/gau/releases/download/v${VERSION}/gau_${VERSION}_linux_${TARGETARCH}.tar.gz /tmp/tool.tar.gz
RUN eval "sum=\$SHA256_${TARGETARCH}" && echo "$sum  /tmp/tool.tar.gz" | sha256sum -c - \
 && mkdir /tmp/tool && tar -xzf /tmp/tool.tar.gz -C /tmp/tool && chmod 0755 /tmp/tool/gau

FROM python:3.12-slim
ENV HOME=/tmp PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=/plugin
COPY --from=fetch /tmp/tool/gau /usr/local/bin/gau
COPY sdk/nyx_plugin.py lc.gau/adapter.py /plugin/
USER 65534:65534
ENTRYPOINT ["python", "/plugin/adapter.py"]

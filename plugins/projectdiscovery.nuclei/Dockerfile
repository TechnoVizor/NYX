# syntax=docker/dockerfile:1
# Context: plugins/   (docker compose --profile plugins build)
FROM python:3.12-slim AS fetch
ARG TARGETARCH
ARG VERSION=3.11.1
ARG SHA256_amd64=ea63d4ae232808cd7c6bc00d0142428e231fab59dae01042246097d195835ab6
ARG SHA256_arm64=8044e3d9768ba0a744b2872c1a87e813006f013da97ca9f50f7661a4203bec07
ARG TEMPLATES=10.5.0
ARG TEMPLATES_SHA256=80fbabceca095fac40afecc7f023748df22b9576b9ff10a4422bd2fbf81f9a41
ADD https://github.com/projectdiscovery/nuclei/releases/download/v${VERSION}/nuclei_${VERSION}_linux_${TARGETARCH}.zip /tmp/tool.zip
ADD https://github.com/projectdiscovery/nuclei-templates/archive/refs/tags/v${TEMPLATES}.tar.gz /tmp/templates.tar.gz
RUN eval "sum=\$SHA256_${TARGETARCH}" && echo "$sum  /tmp/tool.zip" | sha256sum -c - \
 && echo "$TEMPLATES_SHA256  /tmp/templates.tar.gz" | sha256sum -c - \
 && python -m zipfile -e /tmp/tool.zip /tmp/tool && chmod 0755 /tmp/tool/nuclei \
 && mkdir /templates && tar -xzf /tmp/templates.tar.gz -C /templates --strip-components=1

FROM python:3.12-slim
ENV HOME=/tmp PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=/plugin
COPY --from=fetch /tmp/tool/nuclei /usr/local/bin/nuclei
# Templates are pinned and read-only for the plugin user: nothing is fetched at run time.
COPY --from=fetch /templates /templates
COPY sdk/nyx_plugin.py projectdiscovery.nuclei/adapter.py /plugin/
USER 65534:65534
ENTRYPOINT ["python", "/plugin/adapter.py"]

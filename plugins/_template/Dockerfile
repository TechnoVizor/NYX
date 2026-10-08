# syntax=docker/dockerfile:1
# Build context is plugins/ so the SDK can be copied in:
#   docker build -f plugins/_template/Dockerfile plugins
FROM python:3.12-slim
ENV HOME=/tmp PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=/plugin
COPY sdk/nyx_plugin.py _template/adapter.py /plugin/
USER 65534:65534
ENTRYPOINT ["python", "/plugin/adapter.py"]

# Reproducible D_AI core test/CLI image. Native OpenCode stays on the host.
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /work
COPY pyproject.toml README.md /work/
COPY src /work/src
COPY adapters /work/adapters
COPY config /work/config
COPY tests /work/tests
COPY scripts /work/scripts
COPY systems /work/systems
COPY docs /work/docs
RUN python -m pip install --no-cache-dir -e '.[mcp]'
CMD ["python", "-m", "unittest", "discover", "-s", "tests", "-v"]

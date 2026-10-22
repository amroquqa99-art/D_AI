FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml README.md ./
COPY src ./src
COPY config ./config
COPY tests ./tests
RUN python -m pip install --no-cache-dir -e .
ENV PYTHONPATH=/app/src
CMD ["python", "-m", "unittest", "discover", "-s", "tests", "-p", "test_desktop_bridge.py", "-v"]

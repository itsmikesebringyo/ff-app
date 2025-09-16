# Use Python 3.11 slim image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip install --no-cache-dir \
    requests \
    boto3

# Copy application code
COPY infra/fargate/polling-service/polling_service.py .
# Install local ff-standings package
COPY packages/ff-standings /tmp/ff-standings
RUN pip install --no-cache-dir /tmp/ff-standings

# Make the script executable
RUN chmod +x polling_service.py

# Create non-root user for security
RUN useradd --create-home --shell /bin/bash app
USER app

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python3 -c "import requests; requests.get('http://localhost:8080/health', timeout=5)" || exit 1

# Expose health check port (optional, for monitoring)
EXPOSE 8080

# Run the polling service
CMD ["python3", "polling_service.py"]
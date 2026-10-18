
FROM python:3.13-slim

WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt /app/requirements.txt

RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy backend application
COPY backend /app/backend

# Create directory for SQLite audit records
RUN mkdir -p /app/backend/data

# Start FastAPI
EXPOSE 8000

CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]

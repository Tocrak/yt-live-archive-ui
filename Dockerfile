FROM python:3.12.3-alpine3.20
WORKDIR /app

# Install ffmpeg & stdbuf
RUN apk upgrade -U \ 
    && apk add ffmpeg \
    && apk add coreutils \
    && rm -rf /var/cache/*

# Install the application dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy in the source code
COPY ./ /app
ENV XDG_CACHE_HOME=/app/.cache
RUN chmod -R 777 /app
EXPOSE 8099

# Setup an app user so the container doesn't run as the root user
RUN adduser -S ytarchive
USER ytarchive

CMD ["sh", "/app/run.sh"]

#!/bin/sh

while true; do
    echo "Starting service..."
    gunicorn -b 0.0.0.0:8099 api:api
done

#!/bin/bash

# Build the test image
docker build -t hide-mail-tests -f Dockerfile.test .

# Run the tests
# If a specific test pattern is provided, use it
if [ -n "$1" ]; then
  docker run --rm hide-mail-tests npm test -- --watchAll=false --testPathPattern="$1"
else
  # Otherwise run all tests
  docker run --rm hide-mail-tests
fi 
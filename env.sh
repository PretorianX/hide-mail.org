#!/bin/sh

# Replace env vars in JavaScript files
echo "Replacing environment variables in JS"
for file in /usr/share/nginx/html/static/js/*.js
do
  echo "Processing $file..."
  sed -i 's|%REACT_APP_API_URL%|'${REACT_APP_API_URL}'|g' $file
done

echo "Environment variables replaced"

exit 0 
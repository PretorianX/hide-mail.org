#!/bin/sh

# List of files to remove (using space-separated format instead of arrays)
FILES_TO_REMOVE="src/utils/config.js config/domains.json backend/config.js src/config.js"

# Remove files if they exist
for file in $FILES_TO_REMOVE; do
  if [ -f "$file" ]; then
    echo "Removing $file"
    rm "$file"
  else
    echo "$file does not exist, skipping"
  fi
done

# Check for any other potential config files
echo "Checking for other potential config files..."
find . -name "*.js" -o -name "*.json" | grep -i config | grep -v "config/" | grep -v "configLoader.js" | grep -v "configValidator.js" | grep -v "package.json" | grep -v "tsconfig.json" | grep -v "jest.config.js" | grep -v "webpack.config.js"

echo "Cleanup complete. Please review any additional files listed above." 
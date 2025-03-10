#!/bin/bash

# This script adds .js extensions to all JavaScript imports in the codebase
# to make them compatible with ES modules (type: module in package.json)

# Find all JavaScript files
find src -name "*.js" | while read file; do
  # Replace imports without extensions with imports with .js extensions
  # This handles patterns like: import X from './path/to/file'
  sed -i "s/import \(.*\) from '\([\.\/][^']*\)';/import \1 from '\2.js';/g" "$file"
  
  # Fix double extensions (in case we accidentally added .js to something that already had it)
  sed -i "s/\.js\.js/.js/g" "$file"
  
  # Don't add extensions to CSS imports
  sed -i "s/\.css\.js/.css/g" "$file"
  
  # Don't add extensions to package imports (those that don't start with . or /)
  sed -i "s/from '\([^\.\/][^']*\)\.js'/from '\1'/g" "$file"
  
  echo "Fixed imports in $file"
done

echo "All imports have been fixed!" 
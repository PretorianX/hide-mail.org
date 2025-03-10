#!/bin/bash

# Create output directory if it doesn't exist
mkdir -p style-snapshot/styled-components

# Function to extract styled-components from a file
extract_styled_components() {
  local file=$1
  local basename=$(basename "$file" .js)
  local output_file="style-snapshot/styled-components/${basename}.styled.js"
  
  echo "// Styled components from $file" > "$output_file"
  echo "import styled from 'styled-components';" >> "$output_file"
  echo "import { Link } from 'react-router-dom';" >> "$output_file"
  echo "" >> "$output_file"
  
  # Extract styled component definitions
  grep -A 10 "const.*styled\." "$file" | grep -v "^--$" >> "$output_file"
}

# Process main App.js
extract_styled_components "src/App.js"

# Process components
for file in src/components/*.js; do
  if grep -q "styled" "$file"; then
    extract_styled_components "$file"
  fi
done

# Process pages
for file in src/pages/*.js; do
  if grep -q "styled" "$file"; then
    extract_styled_components "$file"
  fi
done

# Copy GlobalStyle.js
cp src/styles/GlobalStyle.js style-snapshot/styled-components/

echo "Styled components extraction complete!" 
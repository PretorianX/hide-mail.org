#!/bin/bash

# Define required environment variables
REQUIRED_VARS=(
  "VALID_DOMAINS"
  "CONFIG_EMAIL_EXPIRATIONTIME"
  "CONFIG_EMAIL_EXTENSIONTIME"
  "CONFIG_API_URL"
  "CONFIG_API_TIMEOUT"
)

# Check for missing variables
MISSING_VARS=()
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    MISSING_VARS+=("$var")
  fi
done

# If any variables are missing, exit with error
if [ ${#MISSING_VARS[@]} -ne 0 ]; then
  echo "ERROR: Missing required environment variables: ${MISSING_VARS[*]}"
  exit 1
fi

# Convert comma-separated domains to JSON array
DOMAINS_JSON="[$(echo $VALID_DOMAINS | sed 's/,/","/g' | sed 's/^/"/' | sed 's/$/"/' )]"

# Define the directory where your JS files are located
JS_DIR="/usr/share/nginx/html/static/js"

# Create a JavaScript file that will hold the runtime environment variables
ENV_FILE="/usr/share/nginx/html/runtime-env.js"

# Create or clear the file
echo "// Runtime environment variables" > $ENV_FILE
echo "window.__RUNTIME_CONFIG__ = {" >> $ENV_FILE

# Add email configuration
echo "  email: {" >> $ENV_FILE
echo "    domains: $DOMAINS_JSON," >> $ENV_FILE
echo "    expirationTime: $CONFIG_EMAIL_EXPIRATIONTIME," >> $ENV_FILE
echo "    extensionTime: $CONFIG_EMAIL_EXTENSIONTIME," >> $ENV_FILE
echo "  }," >> $ENV_FILE

# Add API configuration
echo "  api: {" >> $ENV_FILE
echo "    url: '$CONFIG_API_URL'," >> $ENV_FILE
echo "    timeout: $CONFIG_API_TIMEOUT," >> $ENV_FILE
echo "  }," >> $ENV_FILE

# Add AdSense configuration if available
if [ ! -z "$REACT_APP_ADSENSE_CLIENT" ]; then
  echo "  adsense: {" >> $ENV_FILE
  echo "    client: '$REACT_APP_ADSENSE_CLIENT'," >> $ENV_FILE
  
  # Add AdSense slot IDs if available
  if [ ! -z "$REACT_APP_ADSENSE_SLOT_TOP_BANNER" ] || \
     [ ! -z "$REACT_APP_ADSENSE_SLOT_TOP_PAGE_AD" ] || \
     [ ! -z "$REACT_APP_ADSENSE_SLOT_BOTTOM_PAGE_AD" ] || \
     [ ! -z "$REACT_APP_ADSENSE_SLOT_SIDEBAR_RECTANGLE" ] || \
     [ ! -z "$REACT_APP_ADSENSE_SLOT_MIDDLE_BANNER" ] || \
     [ ! -z "$REACT_APP_ADSENSE_SLOT_BEFORE_FOOTER" ] || \
     [ ! -z "$REACT_APP_ADSENSE_SLOT_FOOTER" ] || \
     [ ! -z "$REACT_APP_ADSENSE_SLOT_BLOG_TOP" ] || \
     [ ! -z "$REACT_APP_ADSENSE_SLOT_BLOG_BOTTOM" ] || \
     [ ! -z "$REACT_APP_ADSENSE_SLOT_BLOG_POST_TOP" ] || \
     [ ! -z "$REACT_APP_ADSENSE_SLOT_BLOG_POST_MIDDLE" ] || \
     [ ! -z "$REACT_APP_ADSENSE_SLOT_BLOG_POST_BOTTOM" ]; then
    echo "    slots: {" >> $ENV_FILE
    [ ! -z "$REACT_APP_ADSENSE_SLOT_TOP_BANNER" ] && echo "      topBanner: '$REACT_APP_ADSENSE_SLOT_TOP_BANNER'," >> $ENV_FILE
    [ ! -z "$REACT_APP_ADSENSE_SLOT_TOP_PAGE_AD" ] && echo "      topPageAd: '$REACT_APP_ADSENSE_SLOT_TOP_PAGE_AD'," >> $ENV_FILE
    [ ! -z "$REACT_APP_ADSENSE_SLOT_BOTTOM_PAGE_AD" ] && echo "      bottomPageAd: '$REACT_APP_ADSENSE_SLOT_BOTTOM_PAGE_AD'," >> $ENV_FILE
    [ ! -z "$REACT_APP_ADSENSE_SLOT_SIDEBAR_RECTANGLE" ] && echo "      sidebarRectangle: '$REACT_APP_ADSENSE_SLOT_SIDEBAR_RECTANGLE'," >> $ENV_FILE
    [ ! -z "$REACT_APP_ADSENSE_SLOT_MIDDLE_BANNER" ] && echo "      middleBanner: '$REACT_APP_ADSENSE_SLOT_MIDDLE_BANNER'," >> $ENV_FILE
    [ ! -z "$REACT_APP_ADSENSE_SLOT_BEFORE_FOOTER" ] && echo "      beforeFooter: '$REACT_APP_ADSENSE_SLOT_BEFORE_FOOTER'," >> $ENV_FILE
    [ ! -z "$REACT_APP_ADSENSE_SLOT_FOOTER" ] && echo "      footer: '$REACT_APP_ADSENSE_SLOT_FOOTER'," >> $ENV_FILE
    [ ! -z "$REACT_APP_ADSENSE_SLOT_BLOG_TOP" ] && echo "      blogTop: '$REACT_APP_ADSENSE_SLOT_BLOG_TOP'," >> $ENV_FILE
    [ ! -z "$REACT_APP_ADSENSE_SLOT_BLOG_BOTTOM" ] && echo "      blogBottom: '$REACT_APP_ADSENSE_SLOT_BLOG_BOTTOM'," >> $ENV_FILE
    [ ! -z "$REACT_APP_ADSENSE_SLOT_BLOG_POST_TOP" ] && echo "      blogPostTop: '$REACT_APP_ADSENSE_SLOT_BLOG_POST_TOP'," >> $ENV_FILE
    [ ! -z "$REACT_APP_ADSENSE_SLOT_BLOG_POST_MIDDLE" ] && echo "      blogPostMiddle: '$REACT_APP_ADSENSE_SLOT_BLOG_POST_MIDDLE'," >> $ENV_FILE
    [ ! -z "$REACT_APP_ADSENSE_SLOT_BLOG_POST_BOTTOM" ] && echo "      blogPostBottom: '$REACT_APP_ADSENSE_SLOT_BLOG_POST_BOTTOM'," >> $ENV_FILE
    echo "    }," >> $ENV_FILE
  fi
  
  echo "  }," >> $ENV_FILE
fi

# Close the config object
echo "};" >> $ENV_FILE

# Update the adsense-config.js file with the correct client ID if needed
if [ ! -z "$REACT_APP_ADSENSE_CLIENT" ]; then
  echo "Updating AdSense configuration..."
  
  # Update any hardcoded client IDs in JS files
  find $JS_DIR -type f -name "*.js" -exec sed -i "s|ca-pub-YOURPUBID|$REACT_APP_ADSENSE_CLIENT|g" {} \;
  find $JS_DIR -type f -name "*.js" -exec sed -i "s|\"ca-pub-YOURPUBID\"|\"$REACT_APP_ADSENSE_CLIENT\"|g" {} \;
  
  # Make sure the adsense-config.js file has the correct client ID
  if [ -f "/usr/share/nginx/html/adsense-config.js" ]; then
    sed -i "s|ca-pub-YOURPUBID|$REACT_APP_ADSENSE_CLIENT|g" /usr/share/nginx/html/adsense-config.js
  fi
fi

echo "Environment variables injected to $ENV_FILE" 
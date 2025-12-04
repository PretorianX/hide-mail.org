# AdSense Slot IDs Configuration Guide

## Overview

AdSense slot IDs are now managed through environment variables instead of being hardcoded in source files. This improves security by preventing account-specific configuration from being committed to version control.

## Environment Variables

Configure the following environment variables with your AdSense slot IDs:

### Homepage Slots
- `REACT_APP_ADSENSE_SLOT_TOP_BANNER` - Top banner after header (728x90)
- `REACT_APP_ADSENSE_SLOT_TOP_PAGE_AD` - Top page ad in main content (728x90)
- `REACT_APP_ADSENSE_SLOT_BOTTOM_PAGE_AD` - Bottom page ad (728x90)
- `REACT_APP_ADSENSE_SLOT_SIDEBAR_RECTANGLE` - Sidebar rectangle ad (300x250)
- `REACT_APP_ADSENSE_SLOT_MIDDLE_BANNER` - Middle banner between FAQ sections (728x90)
- `REACT_APP_ADSENSE_SLOT_BEFORE_FOOTER` - Before footer banner (728x90)
- `REACT_APP_ADSENSE_SLOT_FOOTER` - Footer banner (728x90)

### Blog Page Slots
- `REACT_APP_ADSENSE_SLOT_BLOG_TOP` - Top of blog listing page (728x90)
- `REACT_APP_ADSENSE_SLOT_BLOG_BOTTOM` - Bottom of blog listing page (728x90)

### Blog Post Slots
- `REACT_APP_ADSENSE_SLOT_BLOG_POST_TOP` - Top of blog post (728x90)
- `REACT_APP_ADSENSE_SLOT_BLOG_POST_MIDDLE` - Middle of blog post (728x90)
- `REACT_APP_ADSENSE_SLOT_BLOG_POST_BOTTOM` - Bottom of blog post (728x90)

## Configuration Methods

### Method 1: Environment Variables (Recommended for Docker/Production)

Set environment variables in your deployment configuration:

```bash
export REACT_APP_ADSENSE_SLOT_TOP_BANNER="2183915405"
export REACT_APP_ADSENSE_SLOT_TOP_PAGE_AD="6667576583"
export REACT_APP_ADSENSE_SLOT_BOTTOM_PAGE_AD="8004708986"
export REACT_APP_ADSENSE_SLOT_SIDEBAR_RECTANGLE="9977084442"
export REACT_APP_ADSENSE_SLOT_MIDDLE_BANNER="6037839432"
export REACT_APP_ADSENSE_SLOT_BEFORE_FOOTER="9103712827"
export REACT_APP_ADSENSE_SLOT_FOOTER="2536759880"
export REACT_APP_ADSENSE_SLOT_BLOG_TOP="9781643326"
export REACT_APP_ADSENSE_SLOT_BLOG_BOTTOM="3985572926"
export REACT_APP_ADSENSE_SLOT_BLOG_POST_TOP="8910596547"
export REACT_APP_ADSENSE_SLOT_BLOG_POST_MIDDLE="7597514877"
export REACT_APP_ADSENSE_SLOT_BLOG_POST_BOTTOM="7053098703"
```

The `env-config.sh` script will automatically include these in the runtime configuration.

### Method 2: Runtime Configuration (Docker)

When using Docker, the `env-config.sh` script reads these environment variables and injects them into `window.__RUNTIME_CONFIG__.adsense.slots` at runtime.

### Method 3: Local Development (.env file)

For local development, create a `.env` file in the project root:

```env
REACT_APP_ADSENSE_SLOT_TOP_BANNER=2183915405
REACT_APP_ADSENSE_SLOT_TOP_PAGE_AD=6667576583
REACT_APP_ADSENSE_SLOT_BOTTOM_PAGE_AD=8004708986
REACT_APP_ADSENSE_SLOT_SIDEBAR_RECTANGLE=9977084442
REACT_APP_ADSENSE_SLOT_MIDDLE_BANNER=6037839432
REACT_APP_ADSENSE_SLOT_BEFORE_FOOTER=9103712827
REACT_APP_ADSENSE_SLOT_FOOTER=2536759880
REACT_APP_ADSENSE_SLOT_BLOG_TOP=9781643326
REACT_APP_ADSENSE_SLOT_BLOG_BOTTOM=3985572926
REACT_APP_ADSENSE_SLOT_BLOG_POST_TOP=8910596547
REACT_APP_ADSENSE_SLOT_BLOG_POST_MIDDLE=7597514877
REACT_APP_ADSENSE_SLOT_BLOG_POST_BOTTOM=7053098703
```

**Important:** Add `.env` to `.gitignore` to prevent committing sensitive configuration.

## How It Works

1. The `getAdSenseSlot()` function in `src/utils/adsenseSlots.js` retrieves slot IDs from:
   - Runtime config (`window.__RUNTIME_CONFIG__.adsense.slots`)
   - Environment variables (`REACT_APP_ADSENSE_SLOT_*`)
   - Configuration files (fallback)

2. Components use the `AD_SLOTS` constants and `getAdSenseSlot()` function instead of hardcoded values.

3. If a slot ID is not configured, the function returns an empty string and logs a warning.

## Security Benefits

- ✅ No hardcoded slot IDs in source code
- ✅ Configuration excluded from version control
- ✅ Easy to manage different configurations per environment
- ✅ Prevents accidental exposure of account-specific IDs

## Troubleshooting

If ads are not displaying:

1. **Check browser console** for warnings about missing slot configuration
2. **Verify environment variables** are set correctly
3. **Check runtime config** by inspecting `window.__RUNTIME_CONFIG__.adsense.slots` in browser console
4. **Ensure `.env` file** is in the project root (for local development)
5. **Verify `env-config.sh`** is executed during Docker build/deployment

## Migration Notes

All hardcoded slot IDs have been replaced with configuration-based lookups. The old slot IDs are no longer in the source code and must be configured via environment variables.


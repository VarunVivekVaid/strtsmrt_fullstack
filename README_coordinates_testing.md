# GPS Coordinates Testing Guide

This guide explains how to test the GPS coordinate extraction functionality from Garmin dash cam videos.

## Prerequisites

1. **ExifTool**: Install ExifTool on your system
   - Windows: Download from https://exiftool.org/
   - Make sure `exiftool.exe` is in your PATH or in the same directory as the script

2. **Node.js**: Ensure Node.js is installed on your system

## Quick Test

1. **Update the video path** in `extract-coordinates.js`:
   ```javascript
   const videoPath = 'C:\\path\\to\\your\\video.MP4';
   ```

2. **Run the script**:
   ```bash
   node extract-coordinates.js
   ```

## Expected Output

The script will display:
- Raw GPS data extracted from the video
- Parsed coordinates with timestamps and speed
- First and last GPS coordinates
- Total number of coordinates found

## Sample Output
```
🔍 Extracting GPS coordinates from: C:\Users\...\GRMN0886.MP4
📄 Extracted GPS data:
==================================================
[Raw ExifTool output]
==================================================

🎯 Found GPS coordinates:
1. 41.759153, -87.585833 - 2024:01:15 10:30:15 (Speed: 25.5 mph)
2. 41.759200, -87.585900 - 2024:01:15 10:30:20 (Speed: 26.1 mph)

📍 First coordinate:
   Latitude: 41.759153
   Longitude: -87.585833
   Timestamp: 2024:01:15 10:30:15
   Speed: 25.5 mph

📍 Last coordinate:
   Latitude: 41.759200
   Longitude: -87.585900
   Timestamp: 2024:01:15 10:30:20
   Speed: 26.1 mph

📊 Total coordinates found: 2
```

## Troubleshooting

- **"No GPS coordinates found"**: The video may not contain GPS data or it's in a different format
- **ExifTool not found**: Ensure ExifTool is installed and accessible
- **Permission errors**: Make sure you have read access to the video file

## Supported Formats

- Garmin dash cam videos (.MP4)
- Videos with embedded GPS metadata
- DMS (Degrees/Minutes/Seconds) coordinate format 
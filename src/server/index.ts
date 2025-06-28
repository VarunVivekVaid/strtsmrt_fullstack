import express from 'express';
import cors from 'cors';
import path from 'path';
import multer from 'multer';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3001;

// Supabase configuration
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase configuration. Please set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Promisify exec for async/await usage
const execAsync = promisify(exec);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB limit
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the root directory
app.use(express.static(path.join(__dirname, '../../')));

// Basic health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Express server is running' });
});

// Debug endpoint to list all videos (for testing)
app.get('/api/debug/videos', async (req, res) => {
  try {
    const { data: videos, error } = await supabase
      .from('video_metadata')
      .select('id, file_name, processing_status, created_at')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (error) {
      throw error;
    }
    
    res.json({
      success: true,
      videos: videos || [],
      message: `Found ${videos?.length || 0} videos`
    });
  } catch (error) {
    console.error('Error fetching videos:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Debug endpoint to get detailed video information including GPS coordinates
app.get('/api/debug/video/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    
    const { data: video, error } = await supabase
      .from('video_metadata')
      .select('*')
      .eq('id', videoId)
      .single();
    
    if (error || !video) {
      throw new Error(`Video not found: ${error?.message || 'Unknown error'}`);
    }
    
    res.json({
      success: true,
      video: {
        ...video,
        // Format coordinates with full precision
        start_latitude: video.start_latitude ? Number(video.start_latitude).toFixed(10) : null,
        start_longitude: video.start_longitude ? Number(video.start_longitude).toFixed(10) : null,
        end_latitude: video.end_latitude ? Number(video.end_latitude).toFixed(10) : null,
        end_longitude: video.end_longitude ? Number(video.end_longitude).toFixed(10) : null
      }
    });
  } catch (error) {
    console.error('Error fetching video details:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Video processing endpoint
app.post('/api/process-video/:videoId', async (req, res) => {
  const { videoId } = req.params;
  
  try {
    console.log(`Starting video processing for video ID: ${videoId}`);
    
    // Step 1: Get video metadata from database
    const { data: videoMetadata, error: dbError } = await supabase
      .from('video_metadata')
      .select('*')
      .eq('id', videoId)
      .single();
    
    if (dbError || !videoMetadata) {
      throw new Error(`Video not found: ${dbError?.message || 'Unknown error'}`);
    }
    
    console.log(`Found video: ${videoMetadata.file_name}`);
    
    // Step 2: Update processing status to 'processing'
    await supabase
      .from('video_metadata')
      .update({ 
        processing_status: 'processing',
        updated_at: new Date().toISOString()
      })
      .eq('id', videoId);
    
    // Step 3: Download video from Supabase storage
    const tempDir = path.join(process.cwd(), 'temp');
    const tempVideoPath = path.join(tempDir, `${videoId}-${videoMetadata.file_name}`);
    
    // Ensure temp directory exists
    if (!fs.existsSync(tempDir)) {
      console.log(`Creating temp directory: ${tempDir}`);
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    console.log(`Downloading video from: ${videoMetadata.file_path}`);
    console.log(`Temp directory: ${tempDir}`);
    console.log(`Temp path: ${tempVideoPath}`);
    console.log(`Video metadata:`, JSON.stringify(videoMetadata, null, 2));
    
    // Try to download the video
    let videoData = null;
    let downloadError = null;
    
    // First try the path from database
    console.log('Attempting download with database path...');
    const downloadResult = await supabase.storage
      .from('videos')
      .download(videoMetadata.file_path);
    
    videoData = downloadResult.data;
    downloadError = downloadResult.error;
    
    // If that fails, try to find the actual file
    if (downloadError) {
      console.log('Database path failed, trying to find actual file...');
      
      // Get the directory path
      const dirPath = videoMetadata.file_path.split('/').slice(0, -1).join('/');
      console.log(`Looking in directory: ${dirPath}`);
      
      // List files in the directory
      const { data: files, error: listError } = await supabase.storage
        .from('videos')
        .list(dirPath);
      
      if (!listError && files && files.length > 0) {
        console.log('Available files in directory:');
        files.forEach(file => console.log(`  - ${file.name}`));
        
        // Try to download the first video file found
        const videoFile = files.find(file => 
          file.name.toLowerCase().endsWith('.mp4') || 
          file.name.toLowerCase().endsWith('.mov') ||
          file.name.toLowerCase().endsWith('.avi')
        );
        
        if (videoFile) {
          console.log(`Trying to download: ${videoFile.name}`);
          const actualPath = `${dirPath}/${videoFile.name}`;
          
          const fallbackResult = await supabase.storage
            .from('videos')
            .download(actualPath);
          
          if (!fallbackResult.error && fallbackResult.data) {
            console.log('✅ Successfully downloaded using fallback path');
            videoData = fallbackResult.data;
            downloadError = null;
          } else {
            console.log('Fallback download also failed:', fallbackResult.error?.message);
            downloadError = fallbackResult.error;
          }
        } else {
          console.log('No video files found in directory');
        }
      } else {
        console.log('Failed to list directory:', listError?.message);
      }
    }
    
    if (downloadError) {
      console.error('Download error details:', downloadError);
      throw new Error(`Failed to download video: ${downloadError.message}`);
    }
    
    if (!videoData) {
      throw new Error('No video data received from Supabase storage');
    }
    
    console.log(`Video data received, size: ${videoData.size} bytes`);
    
    // Write video to temp file
    const arrayBuffer = await videoData.arrayBuffer();
    console.log(`ArrayBuffer size: ${arrayBuffer.byteLength} bytes`);
    
    fs.writeFileSync(tempVideoPath, Buffer.from(arrayBuffer));
    console.log(`Video downloaded to: ${tempVideoPath}`);
    
    // Verify file exists
    if (!fs.existsSync(tempVideoPath)) {
      throw new Error(`Failed to write video file to: ${tempVideoPath}`);
    }
    
    const fileStats = fs.statSync(tempVideoPath);
    console.log(`File written successfully, size: ${fileStats.size} bytes`);
    
    // Step 4: Extract GPS data using FFmpeg and ExifTool
    const gpsData = await extractGpsData(tempVideoPath);
    
    // Step 5: Update database with GPS data
    const updateData: any = {
      processing_status: 'completed',
      updated_at: new Date().toISOString()
    };
    
    if (gpsData.hasGpsData && gpsData.gpsRecords.length > 0) {
      const firstRecord = gpsData.gpsRecords[0];
      const lastRecord = gpsData.gpsRecords[gpsData.gpsRecords.length - 1];
      
      // Store coordinates with full precision (10 decimal places)
      updateData.start_latitude = parseFloat(firstRecord.latitude.toFixed(10));
      updateData.start_longitude = parseFloat(firstRecord.longitude.toFixed(10));
      updateData.end_latitude = parseFloat(lastRecord.latitude.toFixed(10));
      updateData.end_longitude = parseFloat(lastRecord.longitude.toFixed(10));
      updateData.raw_metadata = {
        gpsFormat: gpsData.gpsFormat,
        extractionMethod: gpsData.extractionMethod,
        totalGpsRecords: gpsData.gpsRecords.length,
        gpsData: gpsData.gpsRecords.slice(0, 10).map(record => ({
          latitude: parseFloat(record.latitude.toFixed(10)),
          longitude: parseFloat(record.longitude.toFixed(10)),
          timestamp: record.timestamp
        })) // Store first 10 records as sample with full precision
      };
      
      console.log(`GPS data extracted: ${gpsData.gpsRecords.length} records`);
      console.log(`Start: ${firstRecord.latitude.toFixed(10)}, ${firstRecord.longitude.toFixed(10)}`);
      console.log(`End: ${lastRecord.latitude.toFixed(10)}, ${lastRecord.longitude.toFixed(10)}`);
    } else {
      updateData.processing_status = 'completed';
      updateData.raw_metadata = {
        gpsFormat: 'none',
        extractionMethod: 'none',
        error: gpsData.error || 'No GPS data found'
      };
      console.log('No GPS data found in video');
    }
    
    // Update database
    const { error: updateError } = await supabase
      .from('video_metadata')
      .update(updateData)
      .eq('id', videoId);
    
    if (updateError) {
      throw new Error(`Failed to update database: ${updateError.message}`);
    }
    
    // Step 6: Clean up temp file
    try {
      fs.unlinkSync(tempVideoPath);
      console.log(`Cleaned up temp file: ${tempVideoPath}`);
    } catch (cleanupError) {
      console.warn(`Failed to clean up temp file: ${cleanupError}`);
    }
    
    res.json({
      success: true,
      videoId,
      gpsDataFound: gpsData.hasGpsData,
      gpsRecordsCount: gpsData.gpsRecords.length,
      message: 'Video processing completed successfully'
    });
    
  } catch (error) {
    console.error('Video processing error:', error);
    
    // Update database with error status
    try {
      await supabase
        .from('video_metadata')
        .update({
          processing_status: 'failed',
          processing_error: error instanceof Error ? error.message : 'Unknown error',
          updated_at: new Date().toISOString()
        })
        .eq('id', videoId);
    } catch (updateError) {
      console.error('Failed to update error status:', updateError);
    }
    
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      videoId
    });
  }
});

// GPS data extraction function
async function extractGpsData(videoPath: string): Promise<{
  hasGpsData: boolean;
  gpsFormat: string;
  gpsRecords: Array<{latitude: number; longitude: number; timestamp: Date}>;
  extractionMethod: string;
  error?: string;
}> {
  console.log(`Extracting GPS data from: ${videoPath}`);
  
  try {
    // Method 1: Try ExifTool with -ExtractEmbedded (best for Garmin videos)
    console.log('Trying ExifTool with -ExtractEmbedded (prioritized for Garmin)...');
    const exifResult = await extractGpsWithExifTool(videoPath);
    if (exifResult.gpsRecords.length > 0) {
      console.log(`✅ ExifTool found ${exifResult.gpsRecords.length} GPS records`);
      return {
        hasGpsData: true,
        gpsFormat: 'garmin_embedded',
        gpsRecords: exifResult.gpsRecords,
        extractionMethod: 'ExifTool with -ExtractEmbedded'
      };
    }
    
    // Method 2: Try FFmpeg metadata extraction (fallback)
    console.log('Trying FFmpeg metadata extraction as fallback...');
    const ffmpegResult = await extractGpsWithFfmpeg(videoPath);
    if (ffmpegResult.gpsRecords.length > 0) {
      console.log(`✅ FFmpeg found ${ffmpegResult.gpsRecords.length} GPS records`);
      return {
        hasGpsData: true,
        gpsFormat: 'mp4_stream',
        gpsRecords: ffmpegResult.gpsRecords,
        extractionMethod: 'FFmpeg metadata stream extraction'
      };
    }
    
    // No GPS data found
    console.log('❌ No GPS data found using either method');
    return {
      hasGpsData: false,
      gpsFormat: 'none',
      gpsRecords: [],
      extractionMethod: 'none',
      error: 'No GPS data found using ExifTool or FFmpeg'
    };
    
  } catch (error) {
    console.error('GPS extraction error:', error);
    return {
      hasGpsData: false,
      gpsFormat: 'none',
      gpsRecords: [],
      extractionMethod: 'none',
      error: error instanceof Error ? error.message : 'Unknown extraction error'
    };
  }
}

// FFmpeg GPS extraction
async function extractGpsWithFfmpeg(videoPath: string): Promise<{
  gpsRecords: Array<{latitude: number; longitude: number; timestamp: Date}>;
}> {
  const gpsRecords: Array<{latitude: number; longitude: number; timestamp: Date}> = [];
  
  try {
    // Extract all metadata
    const { stdout } = await execAsync(`ffmpeg -i "${videoPath}" -f ffmetadata - 2>/dev/null`);
    
    // Parse metadata for GPS information
    const lines = stdout.split('\n');
    let currentTimestamp = new Date();
    
    for (const line of lines) {
      // Look for GPS-related metadata
      if (line.toLowerCase().includes('gps') || 
          line.toLowerCase().includes('latitude') || 
          line.toLowerCase().includes('longitude')) {
        
        // Try to extract coordinates from various formats
        const latMatch = line.match(/latitude[=:]\s*([-\d.]+)/i);
        const lonMatch = line.match(/longitude[=:]\s*([-\d.]+)/i);
        
        if (latMatch && lonMatch) {
          const latitude = parseFloat(latMatch[1]);
          const longitude = parseFloat(lonMatch[1]);
          
          if (isValidGpsCoordinate(latitude, longitude)) {
            gpsRecords.push({
              latitude,
              longitude,
              timestamp: new Date(currentTimestamp)
            });
          }
        }
        
        // Look for NMEA format data
        const nmeaMatch = line.match(/\$GPGGA,([^,]+),([^,]+),([NS]),([^,]+),([EW])/);
        if (nmeaMatch) {
          const latRaw = parseFloat(nmeaMatch[2]);
          const latDir = nmeaMatch[3];
          const lonRaw = parseFloat(nmeaMatch[4]);
          const lonDir = nmeaMatch[5];
          
          const latitude = nmeaToDecimal(latRaw, latDir);
          const longitude = nmeaToDecimal(lonRaw, lonDir);
          
          if (isValidGpsCoordinate(latitude, longitude)) {
            gpsRecords.push({
              latitude,
              longitude,
              timestamp: new Date(currentTimestamp)
            });
          }
        }
      }
    }
    
    console.log(`FFmpeg found ${gpsRecords.length} GPS records`);
    
  } catch (error) {
    console.error('FFmpeg extraction error:', error);
  }
  
  return { gpsRecords };
}

// ExifTool GPS extraction
async function extractGpsWithExifTool(videoPath: string): Promise<{
  gpsRecords: Array<{latitude: number; longitude: number; timestamp: Date}>;
}> {
  const gpsRecords: Array<{latitude: number; longitude: number; timestamp: Date}> = [];
  
  try {
    // Extract GPS coordinates using ExifTool with -ExtractEmbedded for Garmin data
    // Use the same approach as extract-coordinates.js - parse text output
    console.log('Running ExifTool with -ExtractEmbedded (text output)...');
    const { stdout } = await execAsync(`exiftool -ExtractEmbedded "${videoPath}"`);
    
    console.log('Raw ExifTool output (first 1000 chars):', stdout.substring(0, 1000));
    
    // Parse the output to find coordinates (same logic as extract-coordinates.js)
    const lines = stdout.split('\n');
    const coordinates = [];
    let currentEntry: any = {};
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Look for GPS Date/Time
      if (trimmedLine.startsWith('GPS Date/Time')) {
        // If we have a complete previous entry, save it
        if (currentEntry.latitude && currentEntry.longitude) {
          coordinates.push(currentEntry);
        }
        // Start new entry
        currentEntry = {};
        const timeMatch = trimmedLine.match(/GPS Date\/Time\s*:\s*(.+)/);
        if (timeMatch) {
          currentEntry.timestamp = timeMatch[1].trim();
        }
      }
      
      // Look for GPS Latitude
      if (trimmedLine.startsWith('GPS Latitude')) {
        const latMatch = trimmedLine.match(/GPS Latitude\s*:\s*(.+)/);
        if (latMatch) {
          const latitude = parseDmsCoordinate(latMatch[1].trim(), 'N');
          if (latitude !== null) {
            currentEntry.latitude = latitude;
          }
        }
      }
      
      // Look for GPS Longitude
      if (trimmedLine.startsWith('GPS Longitude')) {
        const lonMatch = trimmedLine.match(/GPS Longitude\s*:\s*(.+)/);
        if (lonMatch) {
          const longitude = parseDmsCoordinate(lonMatch[1].trim(), 'W');
          if (longitude !== null) {
            currentEntry.longitude = longitude;
          }
        }
      }
      
      // Look for GPS Speed
      if (trimmedLine.startsWith('GPS Speed')) {
        const speedMatch = trimmedLine.match(/GPS Speed\s*:\s*(.+)/);
        if (speedMatch) {
          currentEntry.speed = parseFloat(speedMatch[1].trim());
        }
      }
    }
    
    // Don't forget the last entry
    if (currentEntry.latitude && currentEntry.longitude) {
      coordinates.push(currentEntry);
    }
    
    // Convert to the expected format
    for (const coord of coordinates) {
      if (coord.latitude && coord.longitude && isValidGpsCoordinate(coord.latitude, coord.longitude)) {
        gpsRecords.push({
          latitude: parseFloat(coord.latitude.toFixed(10)),
          longitude: parseFloat(coord.longitude.toFixed(10)),
          timestamp: new Date()
        });
      }
    }
    
    console.log(`ExifTool found ${gpsRecords.length} GPS records using text parsing`);
    if (gpsRecords.length > 0) {
      console.log(`First coordinate: ${gpsRecords[0].latitude.toFixed(10)}, ${gpsRecords[0].longitude.toFixed(10)}`);
      if (gpsRecords.length > 1) {
        console.log(`Last coordinate: ${gpsRecords[gpsRecords.length - 1].latitude.toFixed(10)}, ${gpsRecords[gpsRecords.length - 1].longitude.toFixed(10)}`);
      }
    }
    
  } catch (error) {
    console.error('ExifTool extraction error:', error);
  }
  
  return { gpsRecords };
}

// Helper function to parse GPS coordinates in degrees/minutes/seconds format
function parseDmsCoordinate(dmsValue: any, direction: string): number | null {
  try {
    if (typeof dmsValue === 'string') {
      // Handle string format like "41 deg 45' 32.95\" N" (same as extract-coordinates.js)
      const match = dmsValue.match(/(\d+)\s*deg\s*(\d+)'\s*([\d.]+)"\s*([NSWE])/);
      if (match) {
        const degrees = parseFloat(match[1]);
        const minutes = parseFloat(match[2]);
        const seconds = parseFloat(match[3]);
        const dir = match[4];
        
        let decimal = degrees + (minutes / 60) + (seconds / 3600);
        
        if (dir === 'S' || dir === 'W') {
          decimal = -decimal;
        }
        
        return parseFloat(decimal.toFixed(10));
      }
    } else if (Array.isArray(dmsValue)) {
      // Handle array format [degrees, minutes, seconds]
      if (dmsValue.length >= 3) {
        const degrees = parseFloat(dmsValue[0]);
        const minutes = parseFloat(dmsValue[1]);
        const seconds = parseFloat(dmsValue[2]);
        
        let decimal = degrees + (minutes / 60) + (seconds / 3600);
        if (direction === 'S' || direction === 'W') {
          decimal = -decimal;
        }
        
        return parseFloat(decimal.toFixed(10));
      }
    }
  } catch (error) {
    console.error('Error parsing DMS coordinate:', error);
  }
  
  return null;
}

// Helper function to parse GPS coordinate (handles both decimal and DMS formats)
function parseGpsCoordinate(value: any): number | null {
  if (typeof value === 'number') {
    return value;
  } else if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

// Helper functions
function isValidGpsCoordinate(latitude: number, longitude: number): boolean {
  return !isNaN(latitude) && !isNaN(longitude) &&
         latitude >= -90 && latitude <= 90 &&
         longitude >= -180 && longitude <= 180 &&
         !(latitude === 0 && longitude === 0); // Avoid default coordinates
}

function nmeaToDecimal(nmeaValue: number, direction: string): number {
  const degrees = Math.floor(nmeaValue / 100);
  const minutes = nmeaValue - (degrees * 100);
  let decimal = degrees + (minutes / 60);
  
  if (direction === 'S' || direction === 'W') {
    decimal = -decimal;
  }
  
  return decimal;
}

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred'
  });
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Temp directory: ${path.join(process.cwd(), 'temp')}`);
  console.log('Video processing endpoint available at: POST /api/process-video/:videoId');
}); 
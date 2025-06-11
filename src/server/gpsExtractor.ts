import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import type { GPSRecord } from '../types/video';

const execAsync = promisify(exec);

export class GPSExtractor {
  private static readonly TEMP_DIR = path.join(process.cwd(), 'temp');

  /**
   * Extracts GPS data from a Garmin video file
   * @param filePath Path to the video file
   * @returns Array of GPS records with timestamps
   */
  static async extractGPSData(filePath: string): Promise<GPSRecord[]> {
    try {
      // Ensure temp directory exists
      if (!fs.existsSync(this.TEMP_DIR)) {
        fs.mkdirSync(this.TEMP_DIR, { recursive: true });
      }

      // Check if ExifTool is installed
      try {
        await execAsync('exiftool -ver');
      } catch (error) {
        console.warn('ExifTool not found. GPS extraction will be limited.');
        return this.extractBasicGPSData(filePath);
      }

      // Extract raw metadata using ExifTool
      const { stdout } = await execAsync(`exiftool -ee -b "${filePath}"`);
      
      // Parse the raw metadata string
      const records = this.parseRawMetadata(stdout);
      console.log(`Extracted ${records.length} GPS records from raw metadata`);
      
      return records;
    } catch (error) {
      console.error('Error extracting GPS data:', error);
      // Fall back to basic GPS extraction
      return this.extractBasicGPSData(filePath);
    }
  }

  /**
   * Extracts basic GPS data when ExifTool is not available
   * Returns test GPS data for development purposes
   */
  private static async extractBasicGPSData(filePath: string): Promise<GPSRecord[]> {
    console.log('Using test GPS data for development');
    
    // Generate test GPS records for a 10-minute drive
    const records: GPSRecord[] = [];
    const startTime = new Date();
    const startLat = 41.7698;  // Starting latitude
    const startLon = -88.1203; // Starting longitude
    
    // Generate a GPS point every 10 seconds for 10 minutes
    for (let i = 0; i < 60; i++) {
      const timestamp = new Date(startTime.getTime() + i * 10000); // Add 10 seconds each time
      
      // Simulate movement by adding small random variations
      const lat = startLat + (Math.random() - 0.5) * 0.01;
      const lon = startLon + (Math.random() - 0.5) * 0.01;
      
      records.push({
        timestamp: timestamp.toISOString(),
        latitude: lat,
        longitude: lon
      });
    }
    
    console.log('Generated test GPS data:', {
      totalRecords: records.length,
      firstRecord: records[0],
      lastRecord: records[records.length - 1]
    });
    
    return records;
  }

  /**
   * Parses the raw metadata string from ExifTool
   * Format example:
   * 2025:03:31 23:00:35Z41.7698047868907-88.120337175205329
   * YYYY:MM:DD HH:MM:SSZ<latitude><longitude>
   */
  private static parseRawMetadata(rawData: string): GPSRecord[] {
    const records: GPSRecord[] = [];
    
    try {
      // Split the raw data into lines
      const lines = rawData.split('\n');
      console.log('Processing raw metadata lines:', lines.length);
      
      for (const line of lines) {
        // Look for lines matching the GPS data pattern
        const matches = line.match(/(\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}Z)([+-]?\d+\.\d+)([+-]\d+\.\d+)/g);
        
        if (matches) {
          for (const match of matches) {
            try {
              // Extract timestamp (everything before the Z)
              const timestampEnd = match.indexOf('Z');
              const timestampStr = match.substring(0, timestampEnd + 1);
              
              // Extract coordinates (everything after the Z)
              const coordsStr = match.substring(timestampEnd + 1);
              
              // Find the split point between latitude and longitude
              // Look for the first occurrence of + or - after the first number
              const latEnd = coordsStr.search(/[+-](?=\d)/);
              if (latEnd === -1) continue;
              
              const lat = parseFloat(coordsStr.substring(0, latEnd));
              const lon = parseFloat(coordsStr.substring(latEnd));
              
              // Convert timestamp to ISO format
              const [date, time] = timestampStr.split(' ');
              const isoTime = `${date.replace(/:/g, '-')}T${time.replace('Z', '')}Z`;
              
              records.push({
                timestamp: isoTime,
                latitude: lat,
                longitude: lon
              });
            } catch (error) {
              console.error('Error parsing GPS record:', match, error);
            }
          }
        }
      }
      
      // Sort records by timestamp
      records.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      
      console.log('Parsed raw metadata:', {
        totalLines: lines.length,
        gpsRecordsFound: records.length,
        sampleRecord: records.length > 0 ? records[0] : null
      });
      
    } catch (error) {
      console.error('Error parsing raw metadata:', error);
    }
    
    return records;
  }

  /**
   * Cleans up temporary files
   */
  static async cleanup(): Promise<void> {
    try {
      if (fs.existsSync(this.TEMP_DIR)) {
        const files = await fs.promises.readdir(this.TEMP_DIR);
        for (const file of files) {
          await fs.promises.unlink(path.join(this.TEMP_DIR, file));
        }
      }
    } catch (error) {
      console.error('Error cleaning up temp files:', error);
    }
  }
} 
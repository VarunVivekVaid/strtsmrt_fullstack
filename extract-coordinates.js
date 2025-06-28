// Extract first and last GPS coordinates from Garmin video
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Convert degrees/minutes/seconds to decimal degrees
function dmsToDecimal(dmsString) {
  // Parse format like "41 deg 45' 32.95\" N"
  const match = dmsString.match(/(\d+)\s*deg\s*(\d+)'\s*([\d.]+)"\s*([NSWE])/);
  if (!match) return null;
  
  const degrees = parseFloat(match[1]);
  const minutes = parseFloat(match[2]);
  const seconds = parseFloat(match[3]);
  const direction = match[4];
  
  let decimal = degrees + (minutes / 60) + (seconds / 3600);
  
  if (direction === 'S' || direction === 'W') {
    decimal = -decimal;
  }
  
  return decimal;
}

async function extractFirstLastCoordinates(videoPath) {
  try {
    console.log(`🔍 Extracting GPS coordinates from: ${videoPath}`);
    
    // Extract embedded GPS data
    const { stdout } = await execAsync(`exiftool.exe -ExtractEmbedded "${videoPath}"`);
    
    console.log('📄 Extracted GPS data:');
    console.log('='.repeat(50));
    console.log(stdout);
    console.log('='.repeat(50));
    
    // Parse the output to find coordinates
    const lines = stdout.split('\n');
    const coordinates = [];
    let currentEntry = {};
    
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
          const latitude = dmsToDecimal(latMatch[1].trim());
          if (latitude !== null) {
            currentEntry.latitude = latitude;
          }
        }
      }
      
      // Look for GPS Longitude
      if (trimmedLine.startsWith('GPS Longitude')) {
        const lonMatch = trimmedLine.match(/GPS Longitude\s*:\s*(.+)/);
        if (lonMatch) {
          const longitude = dmsToDecimal(lonMatch[1].trim());
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
    
    if (coordinates.length > 0) {
      console.log('\n🎯 Found GPS coordinates:');
      coordinates.forEach((coord, index) => {
        console.log(`${index + 1}. ${coord.latitude.toFixed(6)}, ${coord.longitude.toFixed(6)} - ${coord.timestamp} (Speed: ${coord.speed} mph)`);
      });
      
      console.log('\n📍 First coordinate:');
      console.log(`   Latitude: ${coordinates[0].latitude.toFixed(6)}`);
      console.log(`   Longitude: ${coordinates[0].longitude.toFixed(6)}`);
      console.log(`   Timestamp: ${coordinates[0].timestamp}`);
      console.log(`   Speed: ${coordinates[0].speed} mph`);
      
      if (coordinates.length > 1) {
        console.log('\n📍 Last coordinate:');
        console.log(`   Latitude: ${coordinates[coordinates.length - 1].latitude.toFixed(6)}`);
        console.log(`   Longitude: ${coordinates[coordinates.length - 1].longitude.toFixed(6)}`);
        console.log(`   Timestamp: ${coordinates[coordinates.length - 1].timestamp}`);
        console.log(`   Speed: ${coordinates[coordinates.length - 1].speed} mph`);
      }
      
      console.log(`\n📊 Total coordinates found: ${coordinates.length}`);
    } else {
      console.log('\n❌ No GPS coordinates found');
      console.log('💡 The GPS data might be in a different format');
    }
    
  } catch (error) {
    console.error('❌ Error extracting coordinates:', error.message);
  }
}

// Test with your video
const videoPath = 'C:\\Users\\hbopp\\Downloads\\GRMN0886.MP4';
extractFirstLastCoordinates(videoPath); 
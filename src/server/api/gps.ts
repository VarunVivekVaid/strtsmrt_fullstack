import express from 'express';
import multer from 'multer';
import path from 'path';
import { GPSExtractor } from '../gpsExtractor';

const router = express.Router();

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const tempDir = path.join(process.cwd(), 'temp');
    cb(null, tempDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit
  }
});

router.post('/extract', upload.single('video'), async (req, res) => {
  console.log('Received GPS extraction request');
  
  try {
    if (!req.file) {
      console.error('No file received in request');
      return res.status(400).json({ 
        error: 'No video file provided',
        details: 'Please select a video file to upload'
      });
    }

    console.log('File received:', {
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
      path: req.file.path
    });

    // Verify file exists
    if (!req.file.path) {
      throw new Error('File path is undefined');
    }

    // Extract GPS data
    console.log('Extracting GPS data from:', req.file.path);
    const gpsRecords = await GPSExtractor.extractGPSData(req.file.path);
    console.log('GPS extraction complete. Records found:', gpsRecords.length);

    // Clean up the uploaded file
    await GPSExtractor.cleanup();
    
    // Send response
    res.json({ 
      success: true,
      gpsRecords,
      summary: {
        totalRecords: gpsRecords.length,
        firstRecord: gpsRecords[0] || null,
        lastRecord: gpsRecords[gpsRecords.length - 1] || null
      }
    });

  } catch (error) {
    console.error('Error in GPS extraction:', error);
    
    // Clean up on error
    try {
      await GPSExtractor.cleanup();
    } catch (cleanupError) {
      console.error('Error during cleanup:', cleanupError);
    }

    // Send error response
    res.status(500).json({ 
      error: 'Failed to extract GPS data',
      details: error instanceof Error ? error.message : 'Unknown error occurred',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

export default router; 
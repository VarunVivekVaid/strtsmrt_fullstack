import type { VideoMetadata, GPSRecord, ProcessedVideoData } from '../types/video'

export class VideoMetadataProcessor {
  /**
   * Processes a video file and extracts metadata
   * This is a browser-compatible version of the Python processor
   */
  static async processVideoFile(
    file: File, 
    cameraId: string, 
    userId: string
  ): Promise<ProcessedVideoData> {
    try {
      // Extract basic file metadata
      const basicMetadata = await this.extractBasicMetadata(file)
      
      // For Garmin cameras, try to extract GPS data
      let gpsRecords: GPSRecord[] = []
      if (cameraId === 'garmin_dashcam') {
        gpsRecords = await this.extractGarminGPSData(file)
      }
      
      // Get video duration and creation time
      const videoInfo = await this.getVideoInfo(file)
      
      // Determine start and end coordinates
      const startCoords = gpsRecords.length > 0 ? {
        start_latitude: gpsRecords[0].latitude,
        start_longitude: gpsRecords[0].longitude
      } : {}
      
      const endCoords = gpsRecords.length > 0 ? {
        end_latitude: gpsRecords[gpsRecords.length - 1].latitude,
        end_longitude: gpsRecords[gpsRecords.length - 1].longitude
      } : {}
      
      const metadata: VideoMetadata = {
        file_name: file.name,
        file_path: '', // Will be set after upload
        camera_id: cameraId,
        upload_user_id: userId,
        file_size: file.size,
        duration: videoInfo.duration,
        recorded_at: videoInfo.creationTime || new Date().toISOString(),
        raw_metadata: basicMetadata,
        ...startCoords,
        ...endCoords
      }
      
      return {
        metadata,
        gpsRecords,
        rawMetadata: basicMetadata
      }
    } catch (error) {
      console.error('Error processing video metadata:', error)
      throw new Error(`Failed to process video metadata: ${error}`)
    }
  }
  
  /**
   * Extracts basic metadata using File API
   */
  private static async extractBasicMetadata(file: File): Promise<any> {
    return {
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: new Date(file.lastModified).toISOString(),
      // Additional metadata would require server-side processing
    }
  }
  
  /**
   * Extracts GPS data from Garmin dash cam files
   * This is a simplified version - full implementation would require server-side processing
   */
  private static async extractGarminGPSData(file: File): Promise<GPSRecord[]> {
    // TODO: Implement real GPS data extraction from Garmin video files
    return [];
  }
  
  /**
   * Gets video duration and creation time using HTML5 video element
   */
  private static async getVideoInfo(file: File): Promise<{
    duration?: number
    creationTime?: string
  }> {
    return new Promise((resolve) => {
      const video = document.createElement('video')
      const url = URL.createObjectURL(file)
      
      video.onloadedmetadata = () => {
        const info = {
          duration: video.duration,
          creationTime: undefined as string | undefined
        }
        
        URL.revokeObjectURL(url)
        resolve(info)
      }
      
      video.onerror = () => {
        URL.revokeObjectURL(url)
        resolve({})
      }
      
      video.src = url
    })
  }
  
  /**
   * Validates that a file is a supported video format
   */
  static isVideoFile(file: File): boolean {
    return file.type.startsWith('video/') || 
           file.name.toLowerCase().endsWith('.mp4') ||
           file.name.toLowerCase().endsWith('.mov') ||
           file.name.toLowerCase().endsWith('.avi')
  }
  
  /**
   * Validates that a camera type is supported for the given file
   */
  static isCameraSupportedForFile(file: File, cameraId: string): boolean {
    if (cameraId === 'garmin_dashcam') {
      return file.name.toLowerCase().includes('grmn') || 
             file.name.toLowerCase().includes('garmin')
    }
    return true // Generic camera supports all files
  }
} 
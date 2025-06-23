export interface VideoMetadata {
  id?: string
  file_name: string
  file_path: string
  start_latitude?: number
  start_longitude?: number
  end_latitude?: number
  end_longitude?: number
  recorded_at?: string
  camera_id: string
  upload_user_id: string
  duration?: number
  file_size: number
  raw_metadata?: any
  processing_status?: 'processing' | 'completed' | 'failed'
  processing_error?: string
  created_at?: string
  updated_at?: string
}

export interface GPSRecord {
  timestamp: Date
  latitude: number
  longitude: number
}

export interface CameraType {
  id: string
  name: string
  brand: string
  supported: boolean
}

export const SUPPORTED_CAMERAS: CameraType[] = [
  {
    id: 'garmin_dashcam',
    name: 'Garmin Dash Cam',
    brand: 'Garmin',
    supported: true
  },
  {
    id: 'generic',
    name: 'Generic Camera',
    brand: 'Other',
    supported: false
  }
]

export interface ProcessedVideoData {
  metadata: VideoMetadata
  gpsRecords: GPSRecord[]
  rawMetadata: any
} 
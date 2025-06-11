import { useState } from 'react'
import { supabase } from '../config/supabaseClient'
import { 
  Box, 
  Button, 
  Progress, 
  Text, 
  VStack, 
  Select, 
  Alert, 
  AlertIcon,
  AlertTitle,
  AlertDescription,
  HStack,
  Badge,
  Divider
} from '@chakra-ui/react'
import { SUPPORTED_CAMERAS } from '../types/video'
import type { CameraType } from '../types/video'
import { VideoMetadataProcessor } from '../services/videoMetadataProcessor'
import { VideoDatabase } from '../services/videoDatabase'

export default function VideoUpload() {
  const [uploading, setUploading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [selectedCamera, setSelectedCamera] = useState<string>('garmin_dashcam')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [processingStatus, setProcessingStatus] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [success, setSuccess] = useState<string>('')

  /**
   * Compresses a video file using browser's MediaRecorder API
   */
  const compressVideo = async (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video')
      video.preload = 'metadata'
      
      video.onloadedmetadata = () => {
        // Set video quality parameters
        const targetWidth = 1280 // 720p width
        const targetHeight = 720 // 720p height
        const targetBitrate = 2000000 // 2Mbps target bitrate
        
        // Create canvas for resizing
        const canvas = document.createElement('canvas')
        canvas.width = targetWidth
        canvas.height = targetHeight
        const ctx = canvas.getContext('2d')
        
        if (!ctx) {
          reject(new Error('Failed to get canvas context'))
          return
        }

        // Check if MediaRecorder is supported
        if (!window.MediaRecorder) {
          reject(new Error('MediaRecorder not supported in this browser'))
          return
        }

        // Get supported mime types
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : MediaRecorder.isTypeSupported('video/webm')
            ? 'video/webm'
            : 'video/mp4'

        console.log('Using mime type:', mimeType)
        
        // Create MediaRecorder with compression settings
        const stream = canvas.captureStream(30) // 30fps
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: mimeType,
          videoBitsPerSecond: targetBitrate
        })
        
        const chunks: Blob[] = []
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunks.push(e.data)
          }
        }

        mediaRecorder.onstop = () => {
          if (chunks.length === 0) {
            reject(new Error('No video data was recorded'))
            return
          }

          const compressedBlob = new Blob(chunks, { type: mimeType })
          console.log('Compressed blob size:', compressedBlob.size / (1024 * 1024), 'MB')
          
          if (compressedBlob.size === 0) {
            reject(new Error('Compression resulted in empty file'))
            return
          }

          const compressedFile = new File([compressedBlob], file.name.replace(/\.[^/.]+$/, '.webm'), {
            type: mimeType
          })
          resolve(compressedFile)
        }

        mediaRecorder.onerror = (event) => {
          reject(new Error(`MediaRecorder error: ${event.error}`))
        }
        
        // Start recording
        mediaRecorder.start(1000) // Collect data every second
        
        // Process video frames
        video.currentTime = 0
        let frameCount = 0
        const totalFrames = Math.ceil(video.duration * 30) // 30fps
        
        const processFrame = () => {
          if (video.currentTime >= video.duration) {
            mediaRecorder.stop()
            return
          }
          
          ctx.drawImage(video, 0, 0, targetWidth, targetHeight)
          frameCount++
          
          // Update progress
          const progress = (frameCount / totalFrames) * 100
          setUploadProgress(progress)
          
          video.currentTime += 1/30 // Process at 30fps
          requestAnimationFrame(processFrame)
        }
        
        video.play()
        processFrame()
      }
      
      video.onerror = () => reject(new Error('Error loading video'))
      video.src = URL.createObjectURL(file)
    })
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    setError('')
    setSuccess('')
    
    if (!event.target.files || event.target.files.length === 0) {
      setSelectedFile(null)
      return
    }

    const file = event.target.files[0]
    
    // Validate file type
    if (!VideoMetadataProcessor.isVideoFile(file)) {
      setError('Please select a valid video file (MP4, MOV, AVI)')
      setSelectedFile(null)
      return
    }
    
    // Validate camera compatibility
    if (!VideoMetadataProcessor.isCameraSupportedForFile(file, selectedCamera)) {
      setError(`This file doesn't appear to be from a ${getCameraName(selectedCamera)}. Please check your camera selection.`)
      setSelectedFile(null)
      return
    }
    
    setSelectedFile(file)
  }

  const getCameraName = (cameraId: string): string => {
    const camera = SUPPORTED_CAMERAS.find(c => c.id === cameraId)
    return camera ? camera.name : 'Unknown Camera'
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Please select a file first')
      return
    }

    const camera = SUPPORTED_CAMERAS.find(c => c.id === selectedCamera)
    if (!camera?.supported) {
      setError('Selected camera type is not currently supported')
      return
    }

    try {
      setUploading(true)
      setProcessing(true)
      setError('')
      setSuccess('')
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        throw new Error('You must be logged in to upload videos')
      }

      // Step 1: Compress video
      setProcessingStatus('Compressing video...')
      let compressedFile: File
      try {
        compressedFile = await compressVideo(selectedFile)
        console.log('Original size:', selectedFile.size / (1024 * 1024), 'MB')
        console.log('Compressed size:', compressedFile.size / (1024 * 1024), 'MB')
        
        if (compressedFile.size === 0) {
          throw new Error('Compression failed - resulting file is empty')
        }
      } catch (compressionError) {
        console.error('Compression error:', compressionError)
        throw new Error(`Video compression failed: ${compressionError.message}`)
      }

      // Step 2: Process video metadata
      setProcessingStatus('Extracting video metadata...')
      const processedData = await VideoMetadataProcessor.processVideoFile(
        compressedFile, 
        selectedCamera, 
        user.id
      )

      // Step 3: Upload file to storage
      setProcessingStatus('Uploading video file...')
      const fileExt = 'webm' // Always use webm for compressed files
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
      const filePath = `videos/${user.id}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('videos')
        .upload(filePath, compressedFile, {
          onUploadProgress: (progress) => {
            const percent = (progress.loaded / progress.total) * 100
            setUploadProgress(percent)
          }
        })

      if (uploadError) {
        throw new Error(`Storage upload failed: ${uploadError.message}`)
      }

      // Step 4: Store metadata in database
      setProcessingStatus('Storing video metadata...')
      processedData.metadata.file_path = filePath
      
      const storedMetadata = await VideoDatabase.storeVideoMetadata(processedData.metadata)
      
      setSuccess(`Video uploaded successfully! 
        ${processedData.gpsRecords.length > 0 
          ? `Extracted ${processedData.gpsRecords.length} GPS points.` 
          : 'Note: GPS data extraction is not available. Please install ExifTool for GPS support.'
        }
        Original size: ${(selectedFile.size / (1024 * 1024)).toFixed(2)}MB
        Compressed size: ${(compressedFile.size / (1024 * 1024)).toFixed(2)}MB`)
      
      // Reset form
      setSelectedFile(null)
      const fileInput = document.getElementById('video-upload') as HTMLInputElement
      if (fileInput) fileInput.value = ''
      
    } catch (error) {
      console.error('Error uploading file:', error)
      setError(`Error uploading file: ${error instanceof Error ? error.message : 'Unknown error occurred'}`)
    } finally {
      setUploading(false)
      setProcessing(false)
      setUploadProgress(0)
      setProcessingStatus('')
    }
  }

  return (
    <Box p={6} maxW="600px" mx="auto">
      <VStack spacing={6} align="stretch">
        <Text fontSize="2xl" fontWeight="bold" textAlign="center">
          Upload Your Dash Cam Video
        </Text>
        
        {/* Camera Selection */}
        <Box>
          <Text fontSize="lg" fontWeight="medium" mb={2}>
            Select Your Camera Type
          </Text>
          <Select 
            value={selectedCamera} 
            onChange={(e) => setSelectedCamera(e.target.value)}
            disabled={uploading}
          >
            {SUPPORTED_CAMERAS.map((camera: CameraType) => (
              <option 
                key={camera.id} 
                value={camera.id}
                disabled={!camera.supported}
              >
                {camera.name} ({camera.brand}) {!camera.supported && '- Coming Soon'}
              </option>
            ))}
          </Select>
          
          {selectedCamera && (
            <HStack mt={2} spacing={2}>
              <Badge 
                colorScheme={SUPPORTED_CAMERAS.find(c => c.id === selectedCamera)?.supported ? 'green' : 'gray'}
                variant="outline"
              >
                {SUPPORTED_CAMERAS.find(c => c.id === selectedCamera)?.supported ? 'Supported' : 'Not Supported'}
              </Badge>
              {selectedCamera === 'garmin_dashcam' && (
                <Text fontSize="sm" color="gray.600">
                  Supports GPS extraction and metadata parsing
                </Text>
              )}
            </HStack>
          )}
        </Box>

        <Divider />

        {/* File Selection */}
        <Box>
          <Text fontSize="lg" fontWeight="medium" mb={2}>
            Select Video File
          </Text>
          <input
            type="file"
            accept="video/*"
            onChange={handleFileSelect}
            disabled={uploading}
            style={{ display: 'none' }}
            id="video-upload"
          />
          <Button
            as="label"
            htmlFor="video-upload"
            colorScheme="blue"
            variant="outline"
            width="100%"
            disabled={uploading}
          >
            {selectedFile ? selectedFile.name : 'Choose Video File'}
          </Button>
          
          {selectedFile && (
            <VStack mt={3} spacing={2} align="stretch">
              <HStack justify="space-between">
                <Text fontSize="sm" color="gray.600">Size:</Text>
                <Text fontSize="sm">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</Text>
              </HStack>
              <HStack justify="space-between">
                <Text fontSize="sm" color="gray.600">Type:</Text>
                <Text fontSize="sm">{selectedFile.type}</Text>
              </HStack>
            </VStack>
          )}
        </Box>

        {/* Upload Button */}
        <Button
          colorScheme="green"
          size="lg"
          onClick={handleUpload}
          isLoading={uploading}
          loadingText={processing ? processingStatus : "Uploading..."}
          disabled={!selectedFile || uploading}
        >
          Upload Video
        </Button>

        {/* Progress Bar */}
        {uploading && (
          <VStack spacing={2}>
            <Progress
              value={uploadProgress}
              size="lg"
              width="100%"
              colorScheme="green"
              borderRadius="md"
            />
            <Text fontSize="sm" color="gray.600">
              {processingStatus || `Upload Progress: ${uploadProgress.toFixed(1)}%`}
            </Text>
          </VStack>
        )}

        {/* Error Alert */}
        {error && (
          <Alert status="error" borderRadius="md">
            <AlertIcon />
            <Box>
              <AlertTitle>Upload Failed!</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Box>
          </Alert>
        )}

        {/* Success Alert */}
        {success && (
          <Alert status="success" borderRadius="md">
            <AlertIcon />
            <Box>
              <AlertTitle>Upload Successful!</AlertTitle>
              <AlertDescription>{success}</AlertDescription>
            </Box>
          </Alert>
        )}

        {/* Usage Instructions */}
        <Box p={4} bg="gray.50" borderRadius="md">
          <Text fontSize="sm" fontWeight="medium" mb={2}>Usage Tips:</Text>
          <VStack align="start" spacing={1}>
            <Text fontSize="xs" color="gray.600">
              • For Garmin cameras, ensure GPS was enabled during recording
            </Text>
            <Text fontSize="xs" color="gray.600">
              • Supported formats: MP4, MOV, AVI
            </Text>
            <Text fontSize="xs" color="gray.600">
              • Files with "GRMN" in the name are automatically detected as Garmin
            </Text>
            <Text fontSize="xs" color="gray.600">
              • Large files may take several minutes to process
            </Text>
          </VStack>
        </Box>
      </VStack>
    </Box>
  )
} 
import { useState } from 'react'
import { supabase } from '../config/supabaseClient'
import { VideoDatabase } from '../services/videoDatabase'
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
import type { CameraType, VideoMetadata } from '../types/video'

export default function VideoUpload() {
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [selectedCamera, setSelectedCamera] = useState<string>('garmin_dashcam')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [status, setStatus] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [success, setSuccess] = useState<string>('')

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    setError('')
    setSuccess('')
    
    if (!event.target.files || event.target.files.length === 0) {
      setSelectedFile(null)
      return
    }

    const file = event.target.files[0]
    
    // File size validation (5GB = 5 * 1024 * 1024 * 1024 bytes)
    const maxFileSize = 5 * 1024 * 1024 * 1024 // 5GB
    if (file.size > maxFileSize) {
      setError(`File size (${(file.size / (1024 * 1024 * 1024)).toFixed(2)}GB) exceeds the maximum allowed size of 5GB`)
      setSelectedFile(null)
      return
    }
    
    // Basic validation - just check if it's a video file
    if (!file.type.startsWith('video/') && 
        !file.name.toLowerCase().endsWith('.mp4') &&
        !file.name.toLowerCase().endsWith('.mov') &&
        !file.name.toLowerCase().endsWith('.avi')) {
      setError('Please select a valid video file (MP4, MOV, AVI)')
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
      setError('')
      setSuccess('')
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        throw new Error('You must be logged in to upload videos')
      }

      // Step 1: Upload raw video file to storage
      setStatus('Uploading raw video file...')
      const fileExt = selectedFile.name.split('.').pop() || 'mp4'
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
      const filePath = `raw-videos/${user.id}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('videos')
        .upload(filePath, selectedFile, {
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) {
        console.error('Supabase upload error:', uploadError)
        
        // Provide specific error messages for common issues
        if (uploadError.message.includes('maximum allowed size')) {
          throw new Error(`File size (${(selectedFile.size / (1024 * 1024)).toFixed(2)}MB) exceeds Supabase Storage limits. Please try a smaller file or contact support.`)
        } else if (uploadError.message.includes('bucket')) {
          throw new Error('Storage bucket not found or access denied. Please check your Supabase configuration.')
        } else if (uploadError.message.includes('unauthorized')) {
          throw new Error('Upload unauthorized. Please check your authentication and storage permissions.')
        } else {
          throw new Error(`Upload failed: ${uploadError.message}`)
        }
      }

      // Step 2: Create initial video metadata entry
      setStatus('Creating video metadata entry...')
      const videoMetadata: VideoMetadata = {
        file_name: selectedFile.name,
        file_path: filePath,
        camera_id: selectedCamera,
        upload_user_id: user.id,
        file_size: selectedFile.size,
        processing_status: 'unprocessed',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      let storedMetadata: VideoMetadata
      try {
        storedMetadata = await VideoDatabase.storeVideoMetadata(videoMetadata)
      } catch (metadataError) {
        console.error('Error creating video metadata:', metadataError)
        // If metadata creation fails, we should clean up the uploaded file
        const { error: deleteError } = await supabase.storage
          .from('videos')
          .remove([filePath])
        
        if (deleteError) {
          console.error('Error cleaning up uploaded file after metadata failure:', deleteError)
        }
        
        throw new Error(`Failed to create video metadata: ${metadataError instanceof Error ? metadataError.message : 'Unknown error'}`)
      }

      setStatus('Video uploaded! Processing will begin automatically...')
      setUploadProgress(100)

      setSuccess(`Video uploaded successfully! 
        Processing will begin automatically in the background and results will be available shortly.
        Original file size: ${(selectedFile.size / (1024 * 1024)).toFixed(2)}MB
        Video ID: ${storedMetadata.id}
        
        You can check the Video Management section to monitor processing status.`)
      
      // Reset form
      setSelectedFile(null)
      const fileInput = document.getElementById('video-upload') as HTMLInputElement
      if (fileInput) fileInput.value = ''
      
    } catch (error) {
      console.error('Error uploading file:', error)
      setError(`Error uploading file: ${error instanceof Error ? error.message : 'Unknown error occurred'}`)
    } finally {
      setUploading(false)
      setUploadProgress(0)
      setStatus('')
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
          loadingText={status || "Uploading..."}
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
              {status || `Upload Progress: ${uploadProgress.toFixed(1)}%`}
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
              • Raw videos are uploaded and processed on our servers
            </Text>
            <Text fontSize="xs" color="gray.600">
              • Processing includes GPS extraction, video segmentation, and metadata analysis
            </Text>
            <Text fontSize="xs" color="gray.600">
              • For Garmin cameras, ensure GPS was enabled during recording
            </Text>
            <Text fontSize="xs" color="gray.600">
              • Supported formats: MP4, MOV, AVI
            </Text>
            <Text fontSize="xs" color="gray.600">
              • Processing may take several minutes for large files
            </Text>
          </VStack>
        </Box>
      </VStack>
    </Box>
  )
} 
import { useState } from 'react'
import { supabase } from '../config/supabaseClient'
import { Box, Button, Progress, Text, VStack } from '@chakra-ui/react'

export default function VideoUpload() {
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true)
      
      if (!event.target.files || event.target.files.length === 0) {
        throw new Error('You must select a file to upload.')
      }

      const file = event.target.files[0]
      const fileExt = file.name.split('.').pop()
      const fileName = `${Math.random()}.${fileExt}`
      const filePath = `${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('videos')
        .upload(filePath, file, {
          onUploadProgress: (progress) => {
            const percent = (progress.loaded / progress.total) * 100
            setUploadProgress(percent)
          }
        })

      if (uploadError) {
        throw uploadError
      }

      alert('Video uploaded successfully!')
      
    } catch (error) {
      console.error('Error uploading file:', error)
      alert('Error uploading file!')
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  return (
    <Box p={4}>
      <VStack spacing={4}>
        <Text fontSize="xl">Upload Your Video</Text>
        <input
          type="file"
          accept="video/*"
          onChange={handleFileUpload}
          disabled={uploading}
          style={{ display: 'none' }}
          id="video-upload"
        />
        <Button
          as="label"
          htmlFor="video-upload"
          colorScheme="blue"
          isLoading={uploading}
          loadingText="Uploading..."
        >
          Select Video
        </Button>
        {uploading && (
          <Progress
            value={uploadProgress}
            size="sm"
            width="100%"
            colorScheme="blue"
          />
        )}
      </VStack>
    </Box>
  )
} 
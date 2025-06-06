import { useState, useEffect } from 'react'
import { supabase } from '../config/supabaseClient'
import { Box, VStack, Text, Heading, SimpleGrid, Button } from '@chakra-ui/react'

interface Video {
  name: string
  created_at: string
  id: string
  metadata: {
    size: number
    mimetype: string
  }
}

export default function VideoList() {
  const [videos, setVideos] = useState<Video[]>([])
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    checkAdminStatus()
    fetchVideos()
  }, [])

  const checkAdminStatus = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single()
      
      setIsAdmin(profile?.is_admin || false)
    }
  }

  const fetchVideos = async () => {
    const { data, error } = await supabase
      .storage
      .from('videos')
      .list()

    if (error) {
      console.error('Error fetching videos:', error)
      return
    }

    setVideos(data || [])
  }

  if (!isAdmin) {
    return (
      <Box p={4}>
        <Text>You don't have permission to view this page.</Text>
      </Box>
    )
  }

  return (
    <Box p={4}>
      <VStack spacing={4} align="stretch">
        <Heading size="lg">Video List (Admin View)</Heading>
        <SimpleGrid columns={[1, 2, 3]} spacing={4}>
          {videos.map((video) => (
            <Box
              key={video.id}
              p={4}
              borderWidth="1px"
              borderRadius="lg"
              overflow="hidden"
            >
              <Text fontWeight="bold">{video.name}</Text>
              <Text fontSize="sm" color="gray.500">
                Uploaded: {new Date(video.created_at).toLocaleDateString()}
              </Text>
              <Text fontSize="sm" color="gray.500">
                Size: {(video.metadata.size / (1024 * 1024)).toFixed(2)} MB
              </Text>
              <Button
                mt={2}
                size="sm"
                colorScheme="blue"
                onClick={() => {
                  const { data } = supabase.storage
                    .from('videos')
                    .getPublicUrl(video.name)
                  window.open(data.publicUrl, '_blank')
                }}
              >
                View Video
              </Button>
            </Box>
          ))}
        </SimpleGrid>
      </VStack>
    </Box>
  )
} 
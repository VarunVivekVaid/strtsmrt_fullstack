import { useState, useEffect } from 'react'
import { supabase } from '../config/supabaseClient'
import { 
  Box, 
  VStack, 
  Text, 
  Heading, 
  SimpleGrid, 
  Button, 
  Badge,
  HStack,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Divider,
  Alert,
  AlertIcon,
  Spinner,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer
} from '@chakra-ui/react'
import { VideoDatabase } from '../services/videoDatabase'
import type { VideoMetadata } from '../types/video'
import { SUPPORTED_CAMERAS } from '../types/video'

interface StorageVideo {
  name: string
  created_at: string
  id: string
  metadata: {
    size: number
    mimetype: string
  }
}

export default function VideoList() {
  const [videos, setVideos] = useState<StorageVideo[]>([])
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    checkAdminStatus()
    fetchData()
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

  const fetchData = async () => {
    try {
      setLoading(true)
      setError('')
      
      // Fetch storage videos
      const { data: storageData, error: storageError } = await supabase
        .storage
        .from('videos')
        .list()

      if (storageError) {
        throw storageError
      }

      setVideos(storageData || [])

      // Fetch video metadata from database
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const metadata = isAdmin 
          ? await VideoDatabase.getAllVideoMetadata()
          : await VideoDatabase.getUserVideoMetadata(user.id)
        
        setVideoMetadata(metadata)
      }
    } catch (err) {
      console.error('Error fetching data:', err)
      setError('Failed to load video data')
    } finally {
      setLoading(false)
    }
  }

  const getCameraName = (cameraId: string): string => {
    const camera = SUPPORTED_CAMERAS.find(c => c.id === cameraId)
    return camera ? camera.name : cameraId
  }

  const formatDuration = (duration?: number): string => {
    if (!duration) return 'Unknown'
    const minutes = Math.floor(duration / 60)
    const seconds = Math.floor(duration % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const formatFileSize = (bytes: number): string => {
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
  }

  const formatCoordinate = (coord?: number): string => {
    return coord ? coord.toFixed(6) : 'N/A'
  }

  const handleViewVideo = (videoPath: string) => {
    const { data } = supabase.storage
      .from('videos')
      .getPublicUrl(videoPath)
    window.open(data.publicUrl, '_blank')
  }

  if (!isAdmin) {
    return (
      <Box p={4}>
        <Alert status="warning">
          <AlertIcon />
          You don't have permission to view this page.
        </Alert>
      </Box>
    )
  }

  if (loading) {
    return (
      <Box p={4} textAlign="center">
        <Spinner size="xl" />
        <Text mt={4}>Loading video data...</Text>
      </Box>
    )
  }

  return (
    <Box p={6} maxW="1200px" mx="auto">
      <VStack spacing={6} align="stretch">
        <Heading size="lg">Video Management (Admin View)</Heading>
        
        {error && (
          <Alert status="error">
            <AlertIcon />
            {error}
          </Alert>
        )}

        {/* Summary Stats */}
        <HStack spacing={6} justify="center">
          <Stat>
            <StatLabel>Total Videos</StatLabel>
            <StatNumber>{videoMetadata.length}</StatNumber>
            <StatHelpText>In database</StatHelpText>
          </Stat>
          <Stat>
            <StatLabel>Storage Files</StatLabel>
            <StatNumber>{videos.length}</StatNumber>
            <StatHelpText>In storage bucket</StatHelpText>
          </Stat>
          <Stat>
            <StatLabel>With GPS Data</StatLabel>
            <StatNumber>
              {videoMetadata.filter(v => v.start_latitude && v.start_longitude).length}
            </StatNumber>
            <StatHelpText>Have coordinates</StatHelpText>
          </Stat>
        </HStack>

        <Divider />

        {/* Video Metadata Table */}
        <Box>
          <Heading size="md" mb={4}>Video Metadata</Heading>
          {videoMetadata.length === 0 ? (
            <Text color="gray.500" textAlign="center" py={8}>
              No video metadata found in database
            </Text>
          ) : (
            <TableContainer>
              <Table size="sm" variant="striped">
                <Thead>
                  <Tr>
                    <Th>File Name</Th>
                    <Th>Camera</Th>
                    <Th>Duration</Th>
                    <Th>Size</Th>
                    <Th>GPS Start</Th>
                    <Th>GPS End</Th>
                    <Th>Recorded</Th>
                    <Th>Actions</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {videoMetadata.map((video) => (
                    <Tr key={video.id}>
                      <Td>
                        <Text fontSize="sm" fontWeight="medium">
                          {video.file_name}
                        </Text>
                      </Td>
                      <Td>
                        <Badge colorScheme="blue" size="sm">
                          {getCameraName(video.camera_id)}
                        </Badge>
                      </Td>
                      <Td>{formatDuration(video.duration)}</Td>
                      <Td>{formatFileSize(video.file_size)}</Td>
                      <Td>
                        {video.start_latitude && video.start_longitude ? (
                          <VStack spacing={0} align="start">
                            <Text fontSize="xs">{formatCoordinate(video.start_latitude)}</Text>
                            <Text fontSize="xs">{formatCoordinate(video.start_longitude)}</Text>
                          </VStack>
                        ) : (
                          <Text fontSize="xs" color="gray.400">No GPS</Text>
                        )}
                      </Td>
                      <Td>
                        {video.end_latitude && video.end_longitude ? (
                          <VStack spacing={0} align="start">
                            <Text fontSize="xs">{formatCoordinate(video.end_latitude)}</Text>
                            <Text fontSize="xs">{formatCoordinate(video.end_longitude)}</Text>
                          </VStack>
                        ) : (
                          <Text fontSize="xs" color="gray.400">No GPS</Text>
                        )}
                      </Td>
                      <Td>
                        <Text fontSize="xs">
                          {video.recorded_at 
                            ? new Date(video.recorded_at).toLocaleString()
                            : 'Unknown'
                          }
                        </Text>
                      </Td>
                      <Td>
                        <Button
                          size="xs"
                          colorScheme="blue"
                          onClick={() => handleViewVideo(video.file_path)}
                        >
                          View
                        </Button>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableContainer>
          )}
        </Box>

        <Divider />

        {/* Storage Files (Legacy View) */}
        <Box>
          <Heading size="md" mb={4}>Storage Files (Raw)</Heading>
          {videos.length === 0 ? (
            <Text color="gray.500" textAlign="center" py={8}>
              No videos found in storage
            </Text>
          ) : (
            <SimpleGrid columns={[1, 2, 3]} spacing={4}>
              {videos.map((video) => (
                <Box
                  key={video.id}
                  p={4}
                  borderWidth="1px"
                  borderRadius="lg"
                  overflow="hidden"
                  bg="gray.50"
                >
                  <Text fontWeight="bold" fontSize="sm" noOfLines={2}>
                    {video.name}
                  </Text>
                  <Text fontSize="xs" color="gray.500" mt={1}>
                    Uploaded: {new Date(video.created_at).toLocaleDateString()}
                  </Text>
                  <Text fontSize="xs" color="gray.500">
                    Size: {(video.metadata.size / (1024 * 1024)).toFixed(2)} MB
                  </Text>
                  <Button
                    mt={2}
                    size="xs"
                    colorScheme="blue"
                    variant="outline"
                    onClick={() => {
                      const { data } = supabase.storage
                        .from('videos')
                        .getPublicUrl(video.name)
                      window.open(data.publicUrl, '_blank')
                    }}
                  >
                    View Raw File
                  </Button>
                </Box>
              ))}
            </SimpleGrid>
          )}
        </Box>

        {/* Refresh Button */}
        <Box textAlign="center">
          <Button onClick={fetchData} colorScheme="gray" variant="outline">
            Refresh Data
          </Button>
        </Box>
      </VStack>
    </Box>
  )
} 
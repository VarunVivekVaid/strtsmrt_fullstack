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
  TableContainer,
  Progress,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon
} from '@chakra-ui/react'
import { VideoDatabase } from '../services/videoDatabase'
import type { VideoMetadata } from '../types/video'
import { SUPPORTED_CAMERAS } from '../types/video'

interface VideoClip {
  id: string
  clip_file_path: string
  clip_index: number
  duration: number
  pothole_detected: boolean
  gps_records: any[]
  ml_analysis_status: string
}

interface EnhancedVideoMetadata extends VideoMetadata {
  clips_count?: number
  pothole_clips_count?: number
  clips?: VideoClip[]
}

interface UserStats {
  total_videos: number
  total_clips: number
  total_potholes: number
  processing_videos: number
  failed_videos: number
}

export default function VideoList() {
  const [videoMetadata, setVideoMetadata] = useState<EnhancedVideoMetadata[]>([])
  const [userStats, setUserStats] = useState<UserStats | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [expandedVideo, setExpandedVideo] = useState<string | null>(null)

  useEffect(() => {
    checkAdminStatus()
    fetchData()
    
    // Set up real-time updates for processing status
    const subscription = supabase
      .channel('video_updates')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'video_metadata' }, 
        () => fetchData()
      )
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'video_clips' }, 
        () => fetchData()
      )
      .subscribe()
    
    return () => subscription.unsubscribe()
  }, [])

  const checkAdminStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', user.id)
          .single()
        
        if (profileError) {
          console.warn('Failed to fetch admin status:', profileError)
          setIsAdmin(false)
        } else {
          setIsAdmin(profile?.is_admin || false)
        }
      }
    } catch (error) {
      console.error('Error checking admin status:', error)
      setIsAdmin(false)
    }
  }

  const fetchData = async () => {
    try {
      setLoading(true)
      setError('')
      
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Fetch video metadata with clips count
      const videosQuery = supabase
        .from('video_metadata_with_user')
        .select('*')
        .order('created_at', { ascending: false })

      const { data: videos, error: videosError } = isAdmin 
        ? await videosQuery
        : await videosQuery.eq('upload_user_id', user.id)
      
      if (videosError) throw videosError

      setVideoMetadata(videos || [])

      // Fetch user statistics
      const { data: stats, error: statsError } = await supabase
        .rpc('get_user_video_stats', { p_user_id: user.id })
        .single()
      
      if (statsError) {
        console.warn('Failed to fetch stats:', statsError)
      } else {
        setUserStats(stats)
      }

    } catch (err) {
      console.error('Error fetching data:', err)
      setError('Failed to load video data')
    } finally {
      setLoading(false)
    }
  }

  const fetchVideoClips = async (videoId: string) => {
    try {
      const { data: clips, error } = await supabase
        .from('video_clips')
        .select('*')
        .eq('video_id', videoId)
        .order('clip_index')
      
      if (error) throw error

      // Update the video in the state with clips data
      setVideoMetadata(prev => prev.map(video => 
        video.id === videoId 
          ? { ...video, clips: clips || [] }
          : video
      ))
    } catch (error) {
      console.error('Error fetching clips:', error)
    }
  }

  const handleToggleVideoDetails = (videoId: string) => {
    if (expandedVideo === videoId) {
      setExpandedVideo(null)
    } else {
      setExpandedVideo(videoId)
      const video = videoMetadata.find(v => v.id === videoId)
      if (video && !video.clips) {
        fetchVideoClips(videoId)
      }
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'green'
      case 'processing': return 'yellow' 
      case 'failed': return 'red'
      default: return 'gray'
    }
  }

  const getStatusDisplay = (status: string) => {
    switch (status) {
      case 'completed': return 'Completed'
      case 'processing': return 'Processing'
      case 'failed': return 'Failed'
      default: return status
    }
  }

  const handleViewVideo = (videoPath: string) => {
    const { data } = supabase.storage
      .from('videos')
      .getPublicUrl(videoPath)
    window.open(data.publicUrl, '_blank')
  }

  const handleViewClip = (clipPath: string) => {
    const { data } = supabase.storage
      .from('videos')
      .getPublicUrl(clipPath)
    window.open(data.publicUrl, '_blank')
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
        <Heading size="lg">
          {isAdmin ? 'Video Management (Admin View)' : 'My Videos'}
        </Heading>
        
        {error && (
          <Alert status="error">
            <AlertIcon />
            {error}
          </Alert>
        )}

        {/* Summary Stats */}
        {userStats && (
          <SimpleGrid columns={[2, 3, 5]} spacing={4}>
            <Stat>
              <StatLabel>Total Videos</StatLabel>
              <StatNumber>{userStats.total_videos}</StatNumber>
              <StatHelpText>Uploaded</StatHelpText>
            </Stat>
            <Stat>
              <StatLabel>Video Clips</StatLabel>
              <StatNumber>{userStats.total_clips}</StatNumber>
              <StatHelpText>Generated</StatHelpText>
            </Stat>
            <Stat>
              <StatLabel>Potholes</StatLabel>
              <StatNumber>{userStats.total_potholes}</StatNumber>
              <StatHelpText>Detected</StatHelpText>
            </Stat>
            <Stat>
              <StatLabel>Processing</StatLabel>
              <StatNumber>{userStats.processing_videos}</StatNumber>
              <StatHelpText>In progress</StatHelpText>
            </Stat>
            <Stat>
              <StatLabel>Failed</StatLabel>
              <StatNumber>{userStats.failed_videos}</StatNumber>
              <StatHelpText>Need retry</StatHelpText>
            </Stat>
          </SimpleGrid>
        )}

        <Divider />

        {/* Video List */}
        <Box>
          <Heading size="md" mb={4}>Videos</Heading>
          {videoMetadata.length === 0 ? (
            <Text color="gray.500" textAlign="center" py={8}>
              No videos found. Upload your first video to get started!
            </Text>
          ) : (
            <Accordion allowToggle index={expandedVideo ? videoMetadata.findIndex(v => v.id === expandedVideo) : -1}>
              {videoMetadata.map((video) => (
                <AccordionItem key={video.id}>
                  <AccordionButton onClick={() => handleToggleVideoDetails(video.id || '')}>
                    <Box flex="1" textAlign="left">
                      <HStack spacing={4} justify="space-between" w="100%">
                        <VStack align="start" spacing={1}>
                          <Text fontWeight="bold" fontSize="md">
                            {video.file_name}
                          </Text>
                          <HStack spacing={2}>
                            <Badge colorScheme="blue" size="sm">
                              {getCameraName(video.camera_id)}
                            </Badge>
                            <Badge colorScheme={getStatusColor(video.processing_status || 'unknown')} size="sm">
                              {getStatusDisplay(video.processing_status || 'unknown')}
                            </Badge>
                            {video.clips_count && (
                              <Badge colorScheme="green" size="sm">
                                {video.clips_count} clips
                              </Badge>
                            )}
                            {video.pothole_clips_count && video.pothole_clips_count > 0 && (
                              <Badge colorScheme="orange" size="sm">
                                {video.pothole_clips_count} potholes
                              </Badge>
                            )}
                          </HStack>
                        </VStack>
                        <VStack align="end" spacing={1}>
                          <Text fontSize="sm">
                            {formatDuration(video.duration)} • {formatFileSize(video.file_size)}
                          </Text>
                          <Text fontSize="xs" color="gray.500">
                            {video.recorded_at ? new Date(video.recorded_at).toLocaleDateString() : 'Unknown date'}
                          </Text>
                        </VStack>
                      </HStack>
                    </Box>
                    <AccordionIcon />
                  </AccordionButton>
                  <AccordionPanel>
                    <VStack spacing={4} align="stretch">
                      {/* Processing Status */}
                      {video.processing_status === 'processing' && (
                        <Box>
                          <Text fontSize="sm" mb={2}>Processing video...</Text>
                          <Progress size="sm" isIndeterminate colorScheme="blue" />
                        </Box>
                      )}
                      
                      {video.processing_status === 'processing' && (
                        <Alert status="info" size="sm">
                          <AlertIcon />
                          <Text fontSize="sm">Video uploaded successfully. Ready for processing.</Text>
                        </Alert>
                      )}
                      
                      {video.processing_status === 'failed' && video.processing_error && (
                        <Alert status="error" size="sm">
                          <AlertIcon />
                          <Text fontSize="sm">Processing failed: {video.processing_error}</Text>
                        </Alert>
                      )}

                      {/* Video Details */}
                      <SimpleGrid columns={[1, 2]} spacing={4}>
                        <Box>
                          <Text fontSize="sm" fontWeight="semibold">GPS Coordinates</Text>
                          {video.start_latitude && video.start_longitude ? (
                            <VStack align="start" spacing={1}>
                              <Text fontSize="xs">
                                Start: {formatCoordinate(video.start_latitude)}, {formatCoordinate(video.start_longitude)}
                              </Text>
                              {video.end_latitude && video.end_longitude && (
                                <Text fontSize="xs">
                                  End: {formatCoordinate(video.end_latitude)}, {formatCoordinate(video.end_longitude)}
                                </Text>
                              )}
                            </VStack>
                          ) : (
                            <Text fontSize="xs" color="gray.400">No GPS data available</Text>
                          )}
                        </Box>
                        <Box>
                          <Button
                            size="sm"
                            colorScheme="blue"
                            onClick={() => handleViewVideo(video.file_path)}
                          >
                            View Original Video
                          </Button>
                        </Box>
                      </SimpleGrid>

                      {/* Video Clips */}
                      {video.clips && video.clips.length > 0 && (
                        <Box>
                          <Text fontSize="sm" fontWeight="semibold" mb={2}>
                            Video Clips ({video.clips.length})
                          </Text>
                          <SimpleGrid columns={[2, 3, 4]} spacing={2}>
                            {video.clips.map((clip) => (
                              <Box
                                key={clip.id}
                                p={3}
                                borderWidth="1px"
                                borderRadius="md"
                                bg={clip.pothole_detected ? "orange.50" : "gray.50"}
                                borderColor={clip.pothole_detected ? "orange.200" : "gray.200"}
                              >
                                <VStack spacing={1} align="start">
                                  <HStack justify="space-between" w="100%">
                                    <Text fontSize="xs" fontWeight="semibold">
                                      Clip {clip.clip_index + 1}
                                    </Text>
                                    {clip.pothole_detected && (
                                      <Badge colorScheme="orange" size="xs">
                                        Pothole
                                      </Badge>
                                    )}
                                  </HStack>
                                  <Text fontSize="xs" color="gray.600">
                                    {formatDuration(clip.duration)}
                                  </Text>
                                  {clip.gps_records && clip.gps_records.length > 0 && (
                                    <Text fontSize="xs" color="gray.600">
                                      {clip.gps_records.length} GPS points
                                    </Text>
                                  )}
                                  <Button
                                    size="xs"
                                    colorScheme="blue"
                                    variant="outline"
                                    onClick={() => handleViewClip(clip.clip_file_path)}
                                  >
                                    View
                                  </Button>
                                </VStack>
                              </Box>
                            ))}
                          </SimpleGrid>
                        </Box>
                      )}
                      
                      {/* Show loading for clips if video is expanded but clips not loaded */}
                      {expandedVideo === video.id && !video.clips && video.processing_status === 'completed' && (
                        <Box textAlign="center" py={4}>
                          <Spinner size="sm" />
                          <Text fontSize="sm" color="gray.500" mt={2}>Loading clips...</Text>
                        </Box>
                      )}
                    </VStack>
                  </AccordionPanel>
                </AccordionItem>
              ))}
            </Accordion>
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
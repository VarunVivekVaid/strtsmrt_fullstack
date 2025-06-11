import { useState, useEffect } from 'react'
import { ChakraProvider, Box, Container, VStack, Button, HStack, Text, Divider } from '@chakra-ui/react'
import { supabase } from './config/supabaseClient'
import type { Session } from '@supabase/supabase-js'
import AuthComponent from './components/Auth'
import VideoUpload from './components/VideoUpload'
import VideoList from './components/VideoList'

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [currentView, setCurrentView] = useState<'upload' | 'admin'>('upload')
  const [isAdmin, setIsAdmin] = useState(false)
  const [userProfile, setUserProfile] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) {
        checkUserProfile(session.user.id)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) {
        checkUserProfile(session.user.id)
      } else {
        setIsAdmin(false)
        setUserProfile(null)
        setCurrentView('upload')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const checkUserProfile = async (userId: string) => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      
      setUserProfile(profile)
      setIsAdmin(profile?.is_admin || false)
    } catch (error) {
      console.error('Error fetching user profile:', error)
      setIsAdmin(false)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  if (!session) {
  return (
    <ChakraProvider>
      <Box minH="100vh" bg="gray.50" py={8}>
        <Container maxW="container.md">
            <AuthComponent />
          </Container>
        </Box>
      </ChakraProvider>
    )
  }

  return (
    <ChakraProvider>
      <Box minH="100vh" bg="gray.50">
        {/* Header */}
        <Box bg="white" shadow="sm" borderBottom="1px" borderColor="gray.200">
          <Container maxW="container.xl" py={4}>
            <VStack spacing={4}>
              <HStack justify="space-between" width="100%">
                <Text fontSize="xl" fontWeight="bold">
                  StreetSmart CV - Dash Cam Analysis
                </Text>
                <HStack spacing={4}>
                  <Text fontSize="sm" color="gray.600">
                    Welcome, {session.user.email}
                  </Text>
                  {isAdmin && (
                    <Text fontSize="xs" color="green.600" bg="green.50" px={2} py={1} borderRadius="md">
                      Admin
                    </Text>
                  )}
                  <Button size="sm" variant="outline" onClick={handleSignOut}>
                    Sign Out
                  </Button>
                </HStack>
              </HStack>
              
              {/* Navigation */}
              <HStack spacing={4} width="100%">
                <Button
                  colorScheme={currentView === 'upload' ? 'blue' : 'gray'}
                  variant={currentView === 'upload' ? 'solid' : 'outline'}
                  onClick={() => setCurrentView('upload')}
                >
                  Upload Video
                </Button>
                {isAdmin && (
                  <Button
                    colorScheme={currentView === 'admin' ? 'blue' : 'gray'}
                    variant={currentView === 'admin' ? 'solid' : 'outline'}
                    onClick={() => setCurrentView('admin')}
                  >
                    Video Management
                  </Button>
                )}
              </HStack>
            </VStack>
          </Container>
        </Box>

        {/* Main Content */}
        <Container maxW="container.xl" py={8}>
          {currentView === 'upload' && <VideoUpload />}
          {currentView === 'admin' && isAdmin && <VideoList />}
        </Container>

        {/* Footer */}
        <Box bg="gray.100" py={4} mt={12}>
          <Container maxW="container.xl">
            <VStack spacing={2}>
              <Divider />
              <Text fontSize="sm" color="gray.600" textAlign="center">
                StreetSmart CV - Automated pothole detection from dash cam footage
              </Text>
              <Text fontSize="xs" color="gray.500" textAlign="center">
                Currently supporting Garmin dash cameras with GPS tracking
              </Text>
            </VStack>
          </Container>
        </Box>
      </Box>
    </ChakraProvider>
  )
}

export default App

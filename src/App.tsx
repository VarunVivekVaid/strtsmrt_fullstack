import { useState, useEffect } from 'react'
import { ChakraProvider, Box, Container } from '@chakra-ui/react'
import { supabase } from './config/supabaseClient'
import type { Session } from '@supabase/supabase-js'
import AuthComponent from './components/Auth'
import VideoUpload from './components/VideoUpload'

function App() {
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <ChakraProvider>
      <Box minH="100vh" bg="gray.50" py={8}>
        <Container maxW="container.md">
          {!session ? <AuthComponent /> : <VideoUpload />}
        </Container>
      </Box>
    </ChakraProvider>
  )
}

export default App

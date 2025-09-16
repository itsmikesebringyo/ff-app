import { useState, useEffect } from 'react'

/**
 * PWA-optimized network connectivity status hook
 * Enhanced for PWA context with service worker awareness
 */
export const useNetworkStatus = () => {
  const [isOnline, setIsOnline] = useState(() => {
    if (typeof window !== 'undefined' && 'navigator' in window) {
      return navigator.onLine
    }
    return true // Default to online if we can't detect
  })

  const [connectionType, setConnectionType] = useState('unknown')

  useEffect(() => {
    if (typeof window === 'undefined' || !('navigator' in window)) {
      return
    }

    // Enhanced connection detection for PWA
    const updateConnectionInfo = () => {
      if ('connection' in navigator) {
        const connection = navigator.connection
        setConnectionType(connection.effectiveType || connection.type || 'unknown')
        console.log('Connection type:', connection.effectiveType, 'Speed:', connection.downlink)
      }
    }

    const handleOnline = () => {
      setIsOnline(true)
      updateConnectionInfo()
      console.log('Network: Online')
    }

    const handleOffline = () => {
      setIsOnline(false)
      setConnectionType('offline')
      console.log('Network: Offline')
    }

    // Listen for online/offline events
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Listen for connection changes (PWA-specific)
    if ('connection' in navigator) {
      navigator.connection.addEventListener('change', updateConnectionInfo)
      updateConnectionInfo() // Initial check
    }

    // Cleanup
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      if ('connection' in navigator) {
        navigator.connection.removeEventListener('change', updateConnectionInfo)
      }
    }
  }, [])

  return { 
    isOnline, 
    connectionType,
    isSlowConnection: connectionType === 'slow-2g' || connectionType === '2g'
  }
}

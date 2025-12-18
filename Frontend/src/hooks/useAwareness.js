// ==========================================
// FILE: Frontend/src/hooks/useAwareness.js - FIXED STALE STATES
// ==========================================
import { useState, useEffect } from 'react'

/**
 * Hook to track awareness states (cursors, selections, etc.)
 * 🔥 FIX: Filter out stale/disconnected clients
 */
export function useAwareness(awareness) {
  const [states, setStates] = useState([])

  useEffect(() => {
    if (!awareness) return

    const updateStates = () => {
      const allStates = []
      const now = Date.now()
      
      console.log('🔍 Awareness Update:')
      console.log('   My Client ID:', awareness.clientID)
      console.log('   Total States:', awareness.getStates().size)
      
      awareness.getStates().forEach((state, clientId) => {
        console.log(`   Client ${clientId}:`, {
          isMe: clientId === awareness.clientID,
          user: state.user?.name || state.user?.email || 'No user',
          lastUpdated: state.lastUpdated ? `${now - state.lastUpdated}ms ago` : 'Never'
        })
        
        // Skip current client
        if (clientId === awareness.clientID) return
        
        // Skip states without user data
        if (!state.user) {
          console.log(`   ⚠️ Skip ${clientId}: No user data`)
          return
        }
        
        // 🔥 FIX: Reduce stale timeout to 10 seconds (was 30)
        const lastUpdate = state.lastUpdated || 0
        if (lastUpdate > 0 && now - lastUpdate > 10000) {
          console.log(`   ⚠️ Skip ${clientId}: Stale (${now - lastUpdate}ms old)`)
          return
        }
        
        allStates.push({ clientId, ...state })
      })
      
      console.log('   ✅ Active users:', allStates.length)
      setStates(allStates)
    }

    // Update immediately
    updateStates()

    // Listen for awareness changes
    awareness.on('change', updateStates)
    
    // 🔥 FIX: Check more frequently (every 2 seconds)
    const cleanupInterval = setInterval(() => {
      updateStates()
    }, 2000)

    return () => {
      awareness.off('change', updateStates)
      clearInterval(cleanupInterval)
    }
  }, [awareness])

  return states
}
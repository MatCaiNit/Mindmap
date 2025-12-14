// ==========================================
// FILE: Frontend/src/hooks/useAwareness.js
// ==========================================
import { useState, useEffect } from 'react'

/**
 * Hook to track awareness states (cursors, selections, etc.)
 */
export function useAwareness(awareness) {
  const [states, setStates] = useState([])

  useEffect(() => {
    if (!awareness) return

    const updateStates = () => {
      const allStates = []
      awareness.getStates().forEach((state, clientId) => {
        if (clientId !== awareness.clientID) {
          allStates.push({ clientId, ...state })
        }
      })
      setStates(allStates)
    }

    awareness.on('change', updateStates)
    updateStates()

    return () => {
      awareness.off('change', updateStates)
    }
  }, [awareness])

  return states
}
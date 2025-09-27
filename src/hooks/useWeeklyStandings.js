import { useQuery } from '@tanstack/react-query'
import { apiConfig } from '../config/api'

// Hook to discover available weeks
export function useAvailableWeeks() {
  return useQuery({
    queryKey: ['availableWeeks'],
    queryFn: async () => {
      try {
        // Get current NFL state
        const nflStateResponse = await fetch(apiConfig.endpoints.nflState, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        })
        
        if (!nflStateResponse.ok) {
          throw new Error(`NFL state request failed: ${nflStateResponse.status}`)
        }
        
        const nflState = await nflStateResponse.json()
        const currentWeek = nflState.week || 1
        
        // Check which weeks actually have data by testing a few weeks
        const potentialWeeks = Array.from({ length: Math.min(currentWeek, 5) }, (_, i) => i + 1)
        const availableWeeks = []
        
        // Test each week to see if it has data
        for (const week of potentialWeeks) {
          try {
            const weekResponse = await fetch(`${apiConfig.endpoints.weekly}?week=${week}&season=2025`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
              },
            })
            
            if (weekResponse.ok) {
              const weekData = await weekResponse.json()
              if (weekData.standings && weekData.standings.length > 0) {
                availableWeeks.push(week)
              }
            }
          } catch (err) {
            // Week doesn't have data, skip it
            console.log(`Week ${week} not available:`, err.message)
          }
        }
        
        // If no weeks found, return at least week 1 as fallback
        return availableWeeks.length > 0 ? availableWeeks : [1]
        
      } catch (error) {
        console.error('Error getting NFL state:', error)
        // Fallback to just week 1 if NFL state fails
        return [1]
      }
    },
    staleTime: 1000 * 60 * 10, // 10 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes
  })
}

// Hook to fetch weekly standings for a specific week
export function useWeeklyStandings(week) {
  return useQuery({
    queryKey: ['weeklyStandings', week],
    queryFn: async () => {
      if (!week) return []
      
      try {
        const response = await fetch(`${apiConfig.endpoints.weekly}?week=${week}&season=2025`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        })
        
        if (!response.ok) {
          throw new Error(`Weekly standings request failed: ${response.status}`)
        }
        
        const data = await response.json()
        
        // Check if response has standings data
        if (!data.standings || !Array.isArray(data.standings)) {
          console.warn(`No standings data for week ${week}`)
          return []
        }
        
        // Transform API data to match expected format
        return data.standings.map(team => ({
          id: team.team_id,
          rank: team.rank,
          teamName: team.team_name,
          points: parseFloat(team.points || 0).toFixed(2),
          record: `${team.wins ?? team.weekly_wins ?? 0}-${team.losses ?? team.weekly_losses ?? 0}`,
          roster: team.roster || []
        }))
      } catch (error) {
        console.error(`Error fetching weekly standings for week ${week}:`, error)
        // Return empty array instead of throwing error
        return []
      }
    },
    enabled: !!week,
    staleTime: 1000 * 60 * 2, // 2 minutes - shorter for live data
    gcTime: 1000 * 60 * 10, // 10 minutes
  })
}

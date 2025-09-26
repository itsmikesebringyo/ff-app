import { useQuery } from '@tanstack/react-query'
import { apiCall, apiConfig } from '../config/api'

// Hook to discover available weeks
export function useAvailableWeeks() {
  return useQuery({
    queryKey: ['availableWeeks'],
    queryFn: async () => {
      try {
        // Get current NFL state
        const nflState = await apiCall(apiConfig.endpoints.nflState, {
          timeout: 5000,
          maxRetries: 2,
          useCache: true
        })
        
        const currentWeek = nflState.week || 1
        
        // Check which weeks actually have data by testing a few weeks
        const potentialWeeks = Array.from({ length: Math.min(currentWeek, 5) }, (_, i) => i + 1)
        const availableWeeks = []
        
        // Test each week to see if it has data
        for (const week of potentialWeeks) {
          try {
            const response = await apiCall(`${apiConfig.endpoints.weekly}?week=${week}&season=2025`, {
              timeout: 3000,
              maxRetries: 1,
              useCache: true
            })
            if (response.standings && response.standings.length > 0) {
              availableWeeks.push(week)
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
        const response = await apiCall(`${apiConfig.endpoints.weekly}?week=${week}&season=2025`, {
          timeout: 15000,
          maxRetries: 3,
          useCache: true
        })
        
        // Check if response has standings data
        if (!response.standings || !Array.isArray(response.standings)) {
          console.warn(`No standings data for week ${week}`)
          return []
        }
        
        // Transform API data to match expected format
        return response.standings.map(team => ({
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
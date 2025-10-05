import { useQuery } from '@tanstack/react-query'
import { apiConfig } from '../config/api'
import { useSleeperProjections, useSleeperRosters, useSleeperUsers, useSleeperPlayers, useSleeperMatchups, useSleeperNFLState } from './useSleeper'

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

// Hook to get weekly standings for a specific week using Sleeper API
export function useWeeklyStandings(week, pollingInterval = null) {
  const { data: matchups } = useSleeperMatchups(week, { pollingInterval })
  const { data: rosters } = useSleeperRosters({ pollingInterval })
  const { data: users } = useSleeperUsers()
  const { data: players } = useSleeperPlayers()
  const { data: projectionsData } = useSleeperProjections({ week, pollingInterval })

  return useQuery({
    queryKey: ['weeklyStandings', week],
    queryFn: async () => {
      if (!week || !rosters || !users || !players) return []
      
      // Extract projections
      const projections = projectionsData?.projections || {}
      
      // Create user map for team names
      const userMap = {}
      users.forEach(user => {
        userMap[user.user_id] = user.metadata?.team_name || user.display_name || user.username
      })

      // Process rosters and build standings
      const standings = rosters.map(roster => {
        const teamName = userMap[roster.owner_id] || `Team ${roster.roster_id}`
        
        // Find matchup data for this roster to get actual points
        const matchup = matchups?.find(m => m.roster_id === roster.roster_id)

        // Build complete roster data with all players (starters and bench)
        const allPlayers = (roster.players || []).map(playerId => {
          const playerData = players.players[playerId]
          const projectedPoints = projections[playerId] || 0
          const actualPoints = matchup?.players_points?.[playerId] || 0
          const isStarter = roster.starters?.includes(playerId) || false

          return {
            player_id: playerId,
            player: `${playerData?.first_name || ''} ${playerData?.last_name || ''}`.trim() || playerData?.full_name || 'Unknown Player',
            position: playerData?.position || 'FLEX',
            points: actualPoints,
            projected_points: projectedPoints,
            is_starter: isStarter
          }
        })

        // Separate starters and bench players
        const starters = allPlayers.filter(p => p.is_starter)
        const benchPlayers = allPlayers.filter(p => !p.is_starter)

        // Sort starters by their position in the starters array to maintain lineup order
        const startersInOrder = (roster.starters || []).map((playerId, index) => {
          const starter = starters.find(p => p.player_id === playerId)
          if (starter) {
            // Determine lineup position based on starter index (8 starters, no kickers)
            let lineupPosition = starter.position
            if (index === 0) lineupPosition = 'QB'
            else if (index === 1 || index === 2) lineupPosition = 'RB'
            else if (index === 3 || index === 4) lineupPosition = 'WR'
            else if (index === 5) lineupPosition = 'TE'
            else if (index === 6) lineupPosition = 'FLEX'
            else if (index === 7) lineupPosition = 'DST'

            return {
              ...starter,
              lineup_position: lineupPosition
            }
          }
          return null
        }).filter(Boolean)

        // Calculate adjusted projected total (actual points if played, otherwise projection)
        const adjustedProjectedTotal = startersInOrder.reduce((total, player) => {
          const actualPoints = parseFloat(player.points || 0)
          const projectedPoints = parseFloat(player.projected_points || 0)
          return total + (actualPoints > 0 ? actualPoints : projectedPoints)
        }, 0)

        // Calculate total actual points for the team
        const totalActualPoints = matchup?.points || 0

        return {
          id: roster.roster_id.toString(),
          roster_id: roster.roster_id,
          teamName: teamName,
          points: totalActualPoints.toFixed(2),
          adjustedProjectedTotal: adjustedProjectedTotal.toFixed(1),
          starters: startersInOrder,
          benchPlayers: benchPlayers
        }
      })

      // Sort by points descending and add rankings + vs everyone records
      standings.sort((a, b) => parseFloat(b.points) - parseFloat(a.points))
      
      standings.forEach((team, index) => {
        team.rank = index + 1
        team.wins = standings.length - index - 1
        team.losses = index
        team.record = `${team.wins}-${team.losses}`
      })

      return standings
    },
    enabled: !!week && !!rosters && !!users && !!players && !!matchups,
    staleTime: pollingInterval ? pollingInterval : 1000 * 60 * 2, // Match polling interval when active, 2 minutes otherwise
    gcTime: 1000 * 60 * 10, // 10 minutes
    refetchInterval: pollingInterval
  })

}

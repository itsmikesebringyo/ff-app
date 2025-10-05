import { useQuery } from '@tanstack/react-query'

// Sleeper API base URL
const SLEEPER_API_BASE = 'https://api.sleeper.app/v1'
const SLEEPER_PROJECTIONS_BASE = 'https://api.sleeper.app/v1'

// Your league ID from the Lambda function
const LEAGUE_ID = '1251986365806034944'

/**
 * Hook to fetch rosters directly from Sleeper API
 * @returns {Object} TanStack Query result with roster data
 */
export const useSleeperRosters = () => {
  return useQuery({
    queryKey: ['sleeper-rosters', LEAGUE_ID],
    queryFn: async () => {
      const response = await fetch(`${SLEEPER_API_BASE}/league/${LEAGUE_ID}/rosters`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000)
      })

      if (!response.ok) {
        throw new Error(`Sleeper API error: ${response.status} ${response.statusText}`)
      }

      return response.json()
    },
    staleTime: 5 * 60 * 1000, // 5 minutes for roster data
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false
  })
}

/**
 * Hook to fetch users directly from Sleeper API
 * @returns {Object} TanStack Query result with user data
 */
export const useSleeperUsers = () => {
  return useQuery({
    queryKey: ['sleeper-users', LEAGUE_ID],
    queryFn: async () => {
      const response = await fetch(`${SLEEPER_API_BASE}/league/${LEAGUE_ID}/users`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000)
      })

      if (!response.ok) {
        throw new Error(`Sleeper API error: ${response.status} ${response.statusText}`)
      }

      return response.json()
    },
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false
  })
}


/**
 * Hook to fetch matchups for a specific week directly from Sleeper API
 * @param {number} week - Week number to fetch matchups for
 * @returns {Object} TanStack Query result with matchup data
 */
export const useSleeperMatchups = (week) => {
  return useQuery({
    queryKey: ['sleeper-matchups', LEAGUE_ID, week],
    queryFn: async () => {
      if (!week) {
        throw new Error('Week is required to fetch matchups')
      }

      const response = await fetch(`${SLEEPER_API_BASE}/league/${LEAGUE_ID}/matchups/${week}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000)
      })

      if (!response.ok) {
        throw new Error(`Sleeper API error: ${response.status} ${response.statusText}`)
      }

      return response.json()
    },
    enabled: !!week,
    staleTime: 5 * 60 * 1000, // 5 minutes for matchup data
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false
  })
}

/**
 * Hook to fetch projections directly from Sleeper API
 * @param {number} week - Week number to fetch projections for
 * @param {string} season - Season year (defaults to '2025')
 * @param {string} seasonType - Season type (defaults to 'regular')
 * @returns {Object} TanStack Query result with projection data
 */
export const useSleeperProjections = ({
  week, season = '2025', seasonType = 'regular' } = {}) => {
  return useQuery({
    enabled: !!week,
    queryKey: ['sleeper-projections', week, season, seasonType],
    queryFn: async () => {
      if (!week) {
        throw new Error('Week is required to fetch projections')
      }

      const url = `${SLEEPER_PROJECTIONS_BASE}/projections/nfl/${seasonType}/${season}/${week}`
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(15000)
      })

      if (!response.ok) {
        throw new Error(`Sleeper API error: ${response.status} ${response.statusText}`)
      }

      const projections = await response.json()

      // filter only objects with pts_ppr
      const filteredProjections = Object.entries(projections).reduce((acc, [playerId, data]) => {
        if (data.pts_ppr !== undefined) {
          acc[playerId] = data.pts_ppr
        }
        return acc
      }, {})
      
      
      return {
        season,
        week: parseInt(week),
        seasonType,
        projections: filteredProjections
      }
    },
    retry: 3,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  })
}

/**
 * Hook to fetch all NFL players directly from Sleeper API
 * Note: This is a large dataset, use sparingly
 * @returns {Object} TanStack Query result with all NFL players
 */
export const useSleeperPlayers = () => {
  return useQuery({
    queryKey: ['sleeper-players'],
    queryFn: async () => {
      const response = await fetch(`${SLEEPER_API_BASE}/players/nfl`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(30000) // Longer timeout for large dataset
      })

      if (!response.ok) {
        throw new Error(`Sleeper API error: ${response.status} ${response.statusText}`)
      }

      const players = await response.json()
      
      // Convert to array and add some stats
      const playerArray = Object.entries(players).map(([id, data]) => ({
        player_id: id,
        ...data
      }))

      return {
        totalPlayers: playerArray.length,
        activePlayers: playerArray.filter(p => p.team).length,
        players: players // Original object format
      }
    },
    staleTime: 24 * 60 * 60 * 1000, // 24 hours for player data
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false
  })
}

/**
 * Enhanced roster hook that includes player projections
 * @param {number} week - Week number for projections
 * @returns {Object} Roster data with player projections
 */
export const useSleeperRostersWithProjections = (week) => {
  const { data: rosters } = useSleeperRosters()
  const { data: users } = useSleeperUsers()
  const { data: players } = useSleeperPlayers()
  const { data: projections } = useSleeperProjections({ week })

  return useQuery({
    queryKey: ['sleeper-rosters-with-projections', week],
    queryFn: async () => {
      if (!rosters || !users || !players) {
        throw new Error('Missing required data')
      }

      // Create user map for team names
      const userMap = {}
      users.forEach(user => {
        userMap[user.user_id] = user.metadata?.team_name || user.display_name || user.username
      })

      // Build player data for each roster
      const enhancedRosters = rosters.map(roster => {
        const teamName = userMap[roster.owner_id] || `Team ${roster.roster_id}`
        
        // Get all players on this roster with projections
        const rosterPlayers = (roster.players || []).map(playerId => {
          const playerData = players.players[playerId]
          const projectedPoints = projections?.projections?.[playerId] || 0
          
          if (playerData) {
            return {
              player_id: playerId,
              player: `${playerData.first_name || ''} ${playerData.last_name || ''}`.trim() || playerData.full_name || 'Unknown Player',
              position: playerData.position || '',
              projected_points: projectedPoints,
              nfl_team: playerData.team || '',
              status: playerData.status || 'active'
            }
          }
          return null
        }).filter(Boolean)

        // Calculate total projected points for starters
        let totalProjectedPoints = 0
        if (roster.starters) {
          roster.starters.forEach(starterId => {
            const starterProjection = projections?.projections?.[starterId] || 0
            totalProjectedPoints += starterProjection
          })
        }
        
        return {
          ...roster,
          team_name: teamName,
          players: rosterPlayers,
          total_projected_points: totalProjectedPoints
        }
      })

      return {
        week: parseInt(week),
        rosters: enhancedRosters,
        totalTeams: enhancedRosters.length
      }
    },
    enabled: !!week && !!rosters && !!users && !!players && !!projections,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false
  })
}

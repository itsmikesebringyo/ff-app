import { useQuery } from '@tanstack/react-query'

// Sleeper API base URL
const SLEEPER_API_BASE = 'https://api.sleeper.app/v1'
const SLEEPER_PROJECTIONS_BASE = 'https://api.sleeper.app/v1'

// Your league ID from the Lambda function
const LEAGUE_ID = '1251986365806034944'

/**
 * Test hook to fetch NFL state directly from Sleeper API
 * @returns {Object} TanStack Query result with NFL state
 */
export const useSleeperNFLState = () => {
  return useQuery({
    queryKey: ['sleeper-test-nfl-state'],
    queryFn: async () => {
      const response = await fetch(`${SLEEPER_API_BASE}/state/nfl`, {
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
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false
  })
}

/**
 * Test hook to fetch league info directly from Sleeper API
 * @returns {Object} TanStack Query result with league data
 */
export const useSleeperLeague = () => {
  return useQuery({
    queryKey: ['sleeper-test-league', LEAGUE_ID],
    queryFn: async () => {
      const response = await fetch(`${SLEEPER_API_BASE}/league/${LEAGUE_ID}`, {
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
 * Test hook to fetch rosters directly from Sleeper API
 * @returns {Object} TanStack Query result with roster data
 */
export const useSleeperRosters = () => {
  return useQuery({
    queryKey: ['sleeper-test-rosters', LEAGUE_ID],
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
 * Test hook to fetch users directly from Sleeper API
 * @returns {Object} TanStack Query result with user data
 */
export const useSleeperUsers = () => {
  return useQuery({
    queryKey: ['sleeper-test-users', LEAGUE_ID],
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
 * Test hook to fetch matchups for a specific week directly from Sleeper API
 * @param {number} week - Week number to fetch matchups for
 * @returns {Object} TanStack Query result with matchup data
 */
export const useSleeperMatchups = (week) => {
  return useQuery({
    queryKey: ['sleeper-test-matchups', LEAGUE_ID, week],
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
 * Test hook to fetch projections directly from Sleeper API
 * @param {number} week - Week number to fetch projections for
 * @param {string} season - Season year (defaults to '2025')
 * @param {string} seasonType - Season type (defaults to 'regular')
 * @returns {Object} TanStack Query result with projection data
 */
export const useSleeperProjections = (week, season = '2025', seasonType = 'regular') => {
  return useQuery({
    queryKey: ['sleeper-test-projections', week, season, seasonType],
    queryFn: async () => {
      if (!week) {
        throw new Error('Week is required to fetch projections')
      }

      // Positions we care about (no kickers per league rules)
      const positions = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'DST']
      const positionParams = positions.map(pos => `position=${pos}`).join('&')
      
      const url = `${SLEEPER_PROJECTIONS_BASE}/projections/nfl/${season}/${week}?season_type=${seasonType}&${positionParams}&order_by=ppr`
      
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
      
      return {
        season,
        week: parseInt(week),
        seasonType,
        count: projections.length,
        projections
      }
    },
    enabled: !!week,
    staleTime: 60 * 60 * 1000, // 1 hour for projections
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false
  })
}

/**
 * Test hook to fetch all NFL players directly from Sleeper API
 * Note: This is a large dataset, use sparingly
 * @returns {Object} TanStack Query result with all NFL players
 */
export const useSleeperPlayers = () => {
  return useQuery({
    queryKey: ['sleeper-test-players'],
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
 * Test hook to fetch player data with actual points and projections for a given week
 * @param {number} week - Week number
 * @returns {Object} Player data with actual and projected points, organized by team roster
 */
export const useSleeperPlayerData = (week) => {
  const { data: matchups } = useSleeperMatchups(week)
  const { data: players } = useSleeperPlayers()
  const { data: projections } = useSleeperProjections(week)
  const { data: rosters } = useSleeperRosters()
  const { data: users } = useSleeperUsers()

  return useQuery({
    queryKey: ['sleeper-test-player-data', week, matchups, players, projections, rosters, users],
    queryFn: async () => {
      if (!matchups || !players || !rosters || !users) {
        throw new Error('Missing required data')
      }

      // Create user map for team names
      const userMap = {}
      users.forEach(user => {
        userMap[user.user_id] = user.display_name || user.username
      })

      // Build comprehensive data with team organization
      const playerDataMap = {}
      const teamRosters = {}

      // Process all matchups to get actual points
      matchups.forEach(matchup => {
        const roster = rosters.find(r => r.roster_id === matchup.roster_id)
        const teamName = roster ? userMap[roster.owner_id] || `Team ${roster.roster_id}` : `Team ${matchup.roster_id}`
        const teamId = matchup.roster_id.toString()
        
        const starters = matchup.starters || []
        const starterPoints = matchup.starters_points || []
        
        // Initialize team roster if not exists
        if (!teamRosters[teamId]) {
          teamRosters[teamId] = {
            team_id: teamId,
            team_name: teamName,
            roster_id: matchup.roster_id,
            players: []
          }
        }
        
        starters.forEach((playerId, index) => {
          const playerData = players.players[playerId]
          const actualPoints = starterPoints[index] || 0
          const projection = projections?.projections ? projections.projections[playerId] : null
          const projectedPoints = projection?.pts_ppr || projection?.pts_std || 0

          console.log(playerId, projectedPoints)
          
          if (playerData) {
            // Determine roster position
            let position = playerData.position || 'FLEX'
            if (index === 0) position = 'QB'
            else if (index === 1 || index === 2) position = 'RB'
            else if (index === 3 || index === 4) position = 'WR'
            else if (index === 5) position = 'TE'
            else if (index === 6) position = 'FLEX'
            else if (index === 7) position = 'DST'

            const playerInfo = {
              player_id: playerId,
              player: `${playerData.first_name || ''} ${playerData.last_name || ''}`.trim() || playerData.full_name || 'Unknown Player',
              position: position,
              points: actualPoints,
              projected_points: projectedPoints,
              nfl_team: playerData.team || '',
              actual_points: actualPoints
            }

            // Add to global player map
            playerDataMap[playerId] = playerInfo
            
            // Add to team roster
            teamRosters[teamId].players.push(playerInfo)
          }
        })
      })

      return {
        week: parseInt(week),
        players: playerDataMap,
        teams: teamRosters,
        playerCount: Object.keys(playerDataMap).length,
        teamCount: Object.keys(teamRosters).length
      }
    },
    enabled: !!week && !!matchups && !!players && !!rosters && !!users,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false
  })
}

/**
 * Combined test hook to fetch and process weekly standings data
 * Similar to what the Lambda does but client-side
 * @param {number} week - Week number
 * @returns {Object} Processed standings data
 */
export const useSleeperWeeklyStandings = (week) => {
  const { data: nflState } = useSleeperNFLState()
  const { data: rosters } = useSleeperRosters()
  const { data: users } = useSleeperUsers()
  const { data: matchups } = useSleeperMatchups(week)

  return useQuery({
    queryKey: ['sleeper-test-weekly-standings', week, rosters, users, matchups],
    queryFn: async () => {
      if (!rosters || !users || !matchups) {
        throw new Error('Missing required data')
      }

      // Create a map of user_id to display_name
      const userMap = {}
      users.forEach(user => {
        userMap[user.user_id] = user.display_name || user.username
      })

      // Process matchups and combine with roster/user data
      const standings = matchups.map(matchup => {
        const roster = rosters.find(r => r.roster_id === matchup.roster_id)
        const teamName = roster ? userMap[roster.owner_id] || `Team ${roster.roster_id}` : `Team ${matchup.roster_id}`

        return {
          roster_id: matchup.roster_id,
          team_name: teamName,
          points: matchup.points || 0,
          players: matchup.starters_points || {},
          starters: matchup.starters || [],
          matchup_id: matchup.matchup_id
        }
      })

      // Sort by points descending
      standings.sort((a, b) => b.points - a.points)

      // Add rankings and vs everyone records
      standings.forEach((team, index) => {
        team.rank = index + 1
        team.wins = standings.length - index - 1
        team.losses = index
        team.record = `${team.wins}-${team.losses}`
      })

      return {
        week: parseInt(week),
        season: nflState?.season || '2025',
        standings
      }
    },
    enabled: !!week && !!rosters && !!users && !!matchups,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false
  })
}

/**
 * Test component to display Sleeper API test results
 * Usage: <SleeperTestPanel />
 */
// export const SleeperTestPanel = () => {
//   const { data: nflState, isLoading: nflStateLoading } = useSleeperNFLState()
//   const { data: league, isLoading: leagueLoading } = useSleeperLeague()
//   const { data: rosters, isLoading: rostersLoading } = useSleeperRosters()
//   const { data: users, isLoading: usersLoading } = useSleeperUsers()
  
//   const currentWeek = nflState?.week || 1
//   const { data: matchups, isLoading: matchupsLoading } = useSleeperMatchups(currentWeek)
//   const { data: projections, isLoading: projectionsLoading } = useSleeperProjections(currentWeek)

//   if (nflStateLoading || leagueLoading) {
//     return <div>Loading Sleeper API test data...</div>
//   }

//   return (
//     <div className="p-4 space-y-4 bg-gray-100 dark:bg-gray-900 rounded-lg">
//       <h2 className="text-xl font-bold">Sleeper API Test Results</h2>
      
//       <div className="space-y-2">
//         <div className="p-2 bg-white dark:bg-gray-800 rounded">
//           <h3 className="font-semibold">NFL State</h3>
//           <pre className="text-xs">{JSON.stringify(nflState, null, 2)}</pre>
//         </div>
        
//         <div className="p-2 bg-white dark:bg-gray-800 rounded">
//           <h3 className="font-semibold">League Info</h3>
//           <pre className="text-xs">{JSON.stringify(league, null, 2)}</pre>
//         </div>
        
//         <div className="p-2 bg-white dark:bg-gray-800 rounded">
//           <h3 className="font-semibold">Rosters ({rostersLoading ? 'Loading...' : rosters?.length || 0})</h3>
//           {!rostersLoading && <pre className="text-xs overflow-auto max-h-40">{JSON.stringify(rosters, null, 2)}</pre>}
//         </div>
        
//         <div className="p-2 bg-white dark:bg-gray-800 rounded">
//           <h3 className="font-semibold">Users ({usersLoading ? 'Loading...' : users?.length || 0})</h3>
//           {!usersLoading && <pre className="text-xs overflow-auto max-h-40">{JSON.stringify(users, null, 2)}</pre>}
//         </div>
        
//         <div className="p-2 bg-white dark:bg-gray-800 rounded">
//           <h3 className="font-semibold">Week {currentWeek} Matchups ({matchupsLoading ? 'Loading...' : matchups?.length || 0})</h3>
//           {!matchupsLoading && <pre className="text-xs overflow-auto max-h-40">{JSON.stringify(matchups, null, 2)}</pre>}
//         </div>
        
//         <div className="p-2 bg-white dark:bg-gray-800 rounded">
//           <h3 className="font-semibold">Week {currentWeek} Projections ({projectionsLoading ? 'Loading...' : projections?.count || 0})</h3>
//           {!projectionsLoading && <pre className="text-xs overflow-auto max-h-40">{JSON.stringify(projections?.projections?.slice(0, 10), null, 2)}</pre>}
//         </div>
//       </div>
//     </div>
//   )
// }

import { useQuery } from '@tanstack/react-query'
import { apiConfig } from '../config/api'

/**
 * Hook to get projections for a specific team
 * @param {string} teamId - The team ID to fetch projections for
 * @param {string|number} week - The week number to fetch projections for
 * @param {string} season - The season (defaults to '2025')
 * @param {string} seasonType - The season type (defaults to 'regular')
 * @param {boolean} enabled - Whether the query should be enabled (defaults to true)
 * @returns {Object} TanStack Query result with team projections
 */
export const useTeamProjections = (teamId, week, season = '2025', seasonType = 'regular', enabled = true) => {
  return useQuery({
    queryKey: ['team-projections', teamId, week, season, seasonType],
    queryFn: async () => {
      if (!teamId || !week) {
        throw new Error('Team ID and week are required to fetch team projections')
      }

      const url = `${apiConfig.endpoints.teamProjections}?team_id=${teamId}&week=${week}&season=${season}&season_type=${seasonType}`
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(15000)
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch team projections: ${response.status} ${response.statusText}`)
      }

      return response.json()
    },
    enabled: enabled && !!teamId && !!week,
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 60 * 60 * 1000,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
    refetchOnWindowFocus: false,
    refetchOnMount: 'always'
  })
}

/**
 * Hook to get projections for all teams in the league
 * @param {string|number} week - The week number to fetch projections for
 * @param {string} season - The season (defaults to '2025')
 * @param {string} seasonType - The season type (defaults to 'regular')
 * @param {boolean} enabled - Whether the query should be enabled (defaults to true)
 * @returns {Object} TanStack Query result with all teams' projections
 */
export const useAllTeamsProjections = (week, season = '2025', seasonType = 'regular', enabled = true) => {
  // First get the list of all teams from weekly standings
  const weeklyStandingsQuery = useQuery({
    queryKey: ['weekly-standings', week, season],
    queryFn: async () => {
      const url = `${apiConfig.endpoints.weekly}?week=${week}&season=${season}`
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(15000)
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch weekly standings: ${response.status} ${response.statusText}`)
      }

      return response.json()
    },
    enabled: enabled && !!week,
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false
  })

  // Then fetch projections for each team
  const teamIds = weeklyStandingsQuery.data?.standings?.map(team => team.team_id) || []
  
  const teamProjectionQueries = useQuery({
    queryKey: ['all-teams-projections', week, season, seasonType, teamIds],
    queryFn: async () => {
      if (!teamIds.length) {
        return { teams: {}, totalTeams: 0 }
      }

      // Fetch projections for each team in parallel
      const promises = teamIds.map(teamId => 
        fetch(`${apiConfig.endpoints.teamProjections}?team_id=${teamId}&week=${week}&season=${season}&season_type=${seasonType}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(15000)
        })
        .then(res => res.ok ? res.json() : null)
        .catch(() => null)
      )

      const results = await Promise.all(promises)
      
      // Build teams object keyed by team name
      const teams = {}
      results.forEach(result => {
        if (result && result.team_name) {
          teams[result.team_name] = {
            teamId: result.team_id,
            teamName: result.team_name,
            week: result.week,
            season: result.season,
            playerCount: result.player_count,
            projectionsCount: result.projections_count,
            projections: result.projections || []
          }
        }
      })

      return {
        teams,
        totalTeams: Object.keys(teams).length,
        week: parseInt(week),
        season,
        seasonType
      }
    },
    enabled: enabled && !!week && !!weeklyStandingsQuery.data && teamIds.length > 0,
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false
  })

  return {
    ...teamProjectionQueries,
    isLoadingTeams: weeklyStandingsQuery.isLoading,
    teamsError: weeklyStandingsQuery.error
  }
}

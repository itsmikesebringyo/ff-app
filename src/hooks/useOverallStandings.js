import { useQuery } from '@tanstack/react-query'
import { apiCall, apiConfig } from '../config/api'

export function useOverallStandings() {
  return useQuery({
    queryKey: ['overallStandings', '2025'],
    queryFn: async () => {
      const response = await apiCall(`${apiConfig.endpoints.overall}?season=2025`, {
        timeout: 15000,
        maxRetries: 3,
        useCache: true
      })
      
      // Transform API data to match expected format
      return response.standings.map(team => ({
        id: team.team_id,
        rank: team.current_rank,
        teamName: team.team_name,
        overallRecord: `${team.total_wins || 0}-${team.total_losses || 0}`,
        earnings: team.earnings ? `$${team.earnings}` : '$0',
        totalPoints: parseFloat(team.total_points || 0).toFixed(2),
        playoffPct: team.playoff_percentage ? `${team.playoff_percentage}%` : '0.0%',
      }))
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes
  })
}
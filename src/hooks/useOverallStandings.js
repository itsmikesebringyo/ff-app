import { useQuery } from '@tanstack/react-query'
import { apiConfig } from '../config/api'

export function useOverallStandings() {
  return useQuery({
    queryKey: ['overallStandings', '2025'],
    queryFn: async () => {
      const response = await fetch(`${apiConfig.endpoints.overall}?season=2025`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      
      if (!response.ok) {
        throw new Error(`Overall standings request failed: ${response.status}`)
      }
      
      const data = await response.json()
      
      // Check if response has standings data
      if (!data.standings || !Array.isArray(data.standings)) {
        throw new Error('No overall standings data available')
      }
      
      // Transform API data to match expected format
      return data.standings.map(team => ({
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

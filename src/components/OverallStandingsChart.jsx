import { useCallback } from 'react'
import BaseChart from './charts/BaseChart'
import { apiCall, apiConfig } from '../config/api'

export default function OverallStandingsChart({ selectedTeam, onTeamSelect }) {
  const fetchOverallChartData = useCallback(async () => {
    // Fetch data for weeks 1-18 (current NFL season)
    const weeks = Array.from({ length: 18 }, (_, i) => i + 1)
    const weeklyDataPromises = weeks.map(week => 
      apiCall(`${apiConfig.endpoints.weekly}?week=${week}&season=2025`)
        .catch(() => ({ standings: [] })) // Return empty if week has no data yet
    )

    const weeklyDataResults = await Promise.all(weeklyDataPromises)
    
    // Extract unique team names and initialize cumulative data
    const allTeamNames = new Set()
    const teamWins = {}
    const teamLosses = {}
    
    weeklyDataResults.forEach(result => {
      result.standings.forEach(team => {
        if (team.team_name) {
          allTeamNames.add(team.team_name)
          if (!teamWins[team.team_name]) {
            teamWins[team.team_name] = 0
            teamLosses[team.team_name] = 0
          }
        }
      })
    })
    
    const teamNamesArray = Array.from(allTeamNames)

    // Calculate cumulative overall standings after each week
    const transformedData = []
    
    for (let weekIndex = 0; weekIndex < weeks.length; weekIndex++) {
      const week = weeks[weekIndex]
      const weekData = weeklyDataResults[weekIndex]
      
      if (weekData.standings && weekData.standings.length > 0) {
        // For each week, we get the WEEKLY wins/losses, so we add them to cumulative totals
        weekData.standings.forEach(team => {
          if (team.team_name && team.wins !== undefined && team.losses !== undefined) {
            // These are weekly wins/losses for this specific week, so we accumulate them
            teamWins[team.team_name] = (teamWins[team.team_name] || 0) + parseFloat(team.wins || 0)
            teamLosses[team.team_name] = (teamLosses[team.team_name] || 0) + parseFloat(team.losses || 0)
          }
        })
        
        // Calculate rankings based on cumulative wins (and total points as tiebreaker)
        const teamStats = []
        weekData.standings.forEach(team => {
          if (team.team_name) {
            teamStats.push({
              name: team.team_name,
              wins: teamWins[team.team_name] || 0,
              losses: teamLosses[team.team_name] || 0,
              winPct: (teamWins[team.team_name] || 0) / Math.max(1, (teamWins[team.team_name] || 0) + (teamLosses[team.team_name] || 0)),
              totalPoints: parseFloat(team.points || 0) // Use current week points as proxy for total
            })
          }
        })
        
        // Sort by win percentage, then by total points
        teamStats.sort((a, b) => {
          if (Math.abs(a.winPct - b.winPct) < 0.001) {
            return b.totalPoints - a.totalPoints
          }
          return b.winPct - a.winPct
        })
        
        // Create week entry with rankings
        const weekEntry = { week }
        teamStats.forEach((team, index) => {
          weekEntry[team.name] = index + 1
        })
        
        transformedData.push(weekEntry)
      }
    }

    return { chartData: transformedData, teamNames: teamNamesArray }
  }, [])

  return (
    <BaseChart
      title="Season-Long Trends"
      fetchDataFn={fetchOverallChartData}
      selectedTeam={selectedTeam}
      onTeamSelect={onTeamSelect}
    />
  )
}
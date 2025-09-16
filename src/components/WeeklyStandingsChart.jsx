import { useCallback } from 'react'
import BaseChart from './charts/BaseChart'
import { apiCall, apiConfig } from '../config/api'

export default function WeeklyStandingsChart({ selectedTeam }) {
  const fetchWeeklyChartData = useCallback(async () => {
    // Fetch data for weeks 1-18 (current NFL season)
    const weeks = Array.from({ length: 18 }, (_, i) => i + 1)
    const weeklyDataPromises = weeks.map(week => 
      apiCall(`${apiConfig.endpoints.weekly}?week=${week}&season=2025`)
        .catch(() => ({ standings: [] })) // Return empty if week has no data yet
    )

    const weeklyDataResults = await Promise.all(weeklyDataPromises)
    
    // Extract unique team names from first available week
    const allTeamNames = new Set()
    weeklyDataResults.forEach(result => {
      result.standings.forEach(team => {
        if (team.team_name) {
          allTeamNames.add(team.team_name)
        }
      })
    })
    
    const teamNamesArray = Array.from(allTeamNames)

    // Transform data into chart format
    const transformedData = []
    
    for (let weekIndex = 0; weekIndex < weeks.length; weekIndex++) {
      const week = weeks[weekIndex]
      const weekData = weeklyDataResults[weekIndex]
      
      if (weekData.standings && weekData.standings.length > 0) {
        const weekEntry = { week }
        
        // Add each team's rank for this week
        weekData.standings.forEach(team => {
          if (team.team_name && team.rank) {
            weekEntry[team.team_name] = team.rank
          }
        })
        
        transformedData.push(weekEntry)
      }
    }

    return { chartData: transformedData, teamNames: teamNamesArray }
  }, [])

  return (
    <BaseChart
      title="Weekly Performance Trends"
      fetchDataFn={fetchWeeklyChartData}
      selectedTeam={selectedTeam}
    />
  )
}
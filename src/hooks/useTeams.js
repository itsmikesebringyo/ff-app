import { useState, useEffect } from 'react'
import { apiCall, apiConfig } from '../config/api'

/**
 * Custom hook to fetch and manage team names from the API
 * @returns {Object} { teams, loading, error }
 */
export const useTeams = () => {
  const [teams, setTeams] = useState(['All Teams'])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchTeams = async () => {
      try {
        setLoading(true)
        setError(null)
        
        // Try to fetch from overall standings first (more reliable than weekly)
        const response = await apiCall(`${apiConfig.endpoints.overall}?season=2025`, {
          useCache: true  // Use PWA caching for team data
        })
        
        if (response.standings && response.standings.length > 0) {
          // Extract unique team names and sort alphabetically
          const teamNames = response.standings
            .filter(team => team.team_name && team.team_name.trim()) // Filter out any teams without names or empty names
            .map(team => team.team_name.trim())
            .filter((name, index, array) => array.indexOf(name) === index) // Remove duplicates
            .sort()
          
          if (teamNames.length > 0) {
            // Add "All Teams" option at the beginning
            setTeams(['All Teams', ...teamNames])
            console.log(`Loaded ${teamNames.length} teams from overall standings:`, teamNames)
          } else {
            throw new Error('No valid team names found in overall standings')
          }
        } else {
          // Fallback: try to get teams from weekly data if overall is empty
          console.log('No overall standings found, trying weekly data...')
          await fetchTeamsFromWeekly()
        }
      } catch (err) {
        console.error('Error fetching teams from overall standings:', err)
        // Fallback: try weekly data
        await fetchTeamsFromWeekly()
      } finally {
        setLoading(false)
      }
    }

    const fetchTeamsFromWeekly = async () => {
      try {
        // Mobile-optimized: Try fewer weeks with better error handling
        const weeks = [1, 2, 3] // Only try first 3 weeks to reduce load
        
        for (const week of weeks) {
          try {
            const response = await apiCall(`${apiConfig.endpoints.weekly}?week=${week}&season=2025`, {
              timeout: 8000,  // Shorter timeout for team discovery
              maxRetries: 2,  // Fewer retries for team discovery
              useCache: true  // Use PWA caching for team discovery
            })
            
            if (response.standings && response.standings.length > 0) {
              const teamNames = response.standings
                .filter(team => team.team_name && team.team_name.trim())
                .map(team => team.team_name.trim())
                .filter((name, index, array) => array.indexOf(name) === index) // Remove duplicates
                .sort()
              
              if (teamNames.length > 0) {
                setTeams(['All Teams', ...teamNames])
                console.log(`Loaded ${teamNames.length} teams from week ${week}:`, teamNames)
                return // Success! Exit the loop
              }
            }
          } catch (err) {
            console.log(`No data for week ${week}:`, err.message)
            continue
          }
        }
        
        // If we get here, no team data was found
        console.warn('No team data found in any weekly standings')
        
        // Fallback to a minimal set if nothing works
        console.log('Using fallback team list')
        setTeams(['All Teams', 'Team 1', 'Team 2', 'Team 3', 'Team 4', 'Team 5', 
                  'Team 6', 'Team 7', 'Team 8', 'Team 9', 'Team 10'])
        setError('Using default teams - API data unavailable')
        
      } catch (err) {
        console.error('Error fetching teams from weekly data:', err)
        setError('Failed to load teams')
      }
    }

    fetchTeams()
  }, [])

  return { teams, loading, error }
}
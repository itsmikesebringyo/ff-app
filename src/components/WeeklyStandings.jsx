import { useState, useEffect } from 'react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ChevronDown } from "lucide-react"
import WeeklyStandingsChart from './WeeklyStandingsChart'
import { apiCall, apiConfig } from '../config/api'

export default function WeeklyStandings({ selectedTeam, onTeamSelect }) {
  const [openItems, setOpenItems] = useState([])
  const [selectedWeek, setSelectedWeek] = useState("")
  const [weeklyStandings, setWeeklyStandings] = useState([])
  const [availableWeeks, setAvailableWeeks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Discover available weeks and fetch standings
  useEffect(() => {
    const discoverAvailableWeeks = async () => {
      try {
        setLoading(true)
        setError(null)
        
        // PWA-optimized: Check weeks sequentially with intelligent caching
        // Start from most recent weeks and work backwards for better UX
        const availableWeekNumbers = []
        const weeksToCheck = Array.from({ length: 18 }, (_, i) => 18 - i) // Check 18 down to 1
        
        for (const week of weeksToCheck) {
          try {
            const response = await apiCall(`${apiConfig.endpoints.weekly}?week=${week}&season=2025`, {
              timeout: 5000, // Shorter timeout for discovery
              maxRetries: 1,  // Fewer retries for discovery
              useCache: true  // Use PWA caching for discovery
            })
            if (response.standings && response.standings.length > 0) {
              availableWeekNumbers.unshift(week) // Add to beginning to maintain order
            }
          } catch (err) {
            console.log(`Week ${week} not available:`, err.message)
            // Continue checking other weeks
          }
        }
        
        // If no weeks found, try a few more with different approach
        if (availableWeekNumbers.length === 0) {
          console.log('No weeks found in reverse order, trying forward order...')
          for (let week = 1; week <= 5; week++) { // Only check first 5 weeks as fallback
            try {
              const response = await apiCall(`${apiConfig.endpoints.weekly}?week=${week}&season=2025`, {
                timeout: 8000,
                maxRetries: 2,
                useCache: true  // Use PWA caching for fallback
              })
              if (response.standings && response.standings.length > 0) {
                availableWeekNumbers.push(week)
                break // Found at least one week, that's enough
              }
            } catch (err) {
              console.log(`Fallback week ${week} not available:`, err.message)
            }
          }
        }
        
        setAvailableWeeks(availableWeekNumbers)
        
        // Set default to most recent week if not already selected
        if (!selectedWeek && availableWeekNumbers.length > 0) {
          const mostRecentWeek = Math.max(...availableWeekNumbers).toString()
          setSelectedWeek(mostRecentWeek)
        }
        
      } catch (err) {
        console.error('Error discovering available weeks:', err)
        setError('Failed to load available weeks')
      } finally {
        setLoading(false)
      }
    }

    discoverAvailableWeeks()
  }, [])

  // Fetch weekly standings data when week is selected
  useEffect(() => {
    if (!selectedWeek) return
    
    const fetchWeeklyStandings = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await apiCall(`${apiConfig.endpoints.weekly}?week=${selectedWeek}&season=2025`, {
          timeout: 15000, // Longer timeout for actual data fetch
          maxRetries: 3,  // More retries for important data
          useCache: true  // Use PWA caching for data
        })
        
        // Transform API data to match expected format
        const transformedData = response.standings.map(team => ({
          id: team.team_id,
          rank: team.rank,
          teamName: team.team_name,
          points: parseFloat(team.points || 0).toFixed(2),
          record: `${team.wins ?? team.weekly_wins ?? 0}-${team.losses ?? team.weekly_losses ?? 0}`,
          roster: team.roster || [] // API should provide roster data
        }))
        
        setWeeklyStandings(transformedData)
      } catch (err) {
        console.error('Error fetching weekly standings:', err)
        setError('Failed to load weekly standings')
      } finally {
        setLoading(false)
      }
    }

    fetchWeeklyStandings()
  }, [selectedWeek])

  // Highlight selected team with background
  const getHighlightStyle = (teamName) => {
    if (selectedTeam === 'All Teams' || selectedTeam !== teamName) {
      return {}
    }
    
    return {
      className: "bg-accent/100"
    }
  }

  // Use only available weeks for dropdown
  const weeks = availableWeeks.map(week => week.toString())

  return (
    <div>
      <Card>
        <CardContent className="pt-6">
          {/* Week Selector */}
          <div className="flex justify-center mb-6">
            <Select value={selectedWeek} onValueChange={setSelectedWeek} disabled={loading || weeks.length === 0}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder={loading ? "Loading..." : weeks.length === 0 ? "No weeks" : "Select week"} />
              </SelectTrigger>
              <SelectContent>
                {weeks.map((week) => (
                  <SelectItem key={week} value={week}>
                    Week {week}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Column Headers */}
          <div className="flex justify-between items-center py-2 border-b font-medium text-sm text-muted-foreground">
            <div className="flex items-center gap-2 pl-10">
              <span>Team</span>
            </div>
            <div className="pr-4">
              <span>Points</span>
            </div>
          </div>

          {loading && (
            <div className="text-center py-8 text-muted-foreground">
              <div className="flex flex-col items-center gap-2">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                <span>Loading weekly standings...</span>
              </div>
            </div>
          )}
          
          {error && (
            <div className="text-center py-8 text-red-500">
              <div className="flex flex-col items-center gap-2">
                <span className="font-medium">{error}</span>
                <button 
                  onClick={() => window.location.reload()} 
                  className="text-sm text-blue-500 hover:text-blue-700 underline"
                >
                  Tap to retry
                </button>
              </div>
            </div>
          )}
          
          {!loading && !error && (
            <Accordion 
              type="multiple" 
              className="w-full" 
              value={openItems} 
              onValueChange={setOpenItems}
            >
              {weeklyStandings.map((team) => {
                const highlight = getHighlightStyle(team.teamName)
                return (
                <AccordionItem key={team.id} value={team.id} className={highlight.className || ""}>
                  <AccordionTrigger className="px-4 hover:no-underline [&>svg]:hidden">
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-2">
                        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${openItems.includes(team.id) ? 'rotate-180' : ''}`} />
                        <div>
                          <div className="font-medium">
                            {team.rank} - {team.teamName}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {team.record}
                          </div>
                        </div>
                      </div>
                      <div className="font-medium">
                        <span className="text-primary">{team.points}</span>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="px-4 pb-4">
                      <div className="bg-muted rounded-lg p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {team.roster && team.roster.length > 0 ? (
                            team.roster.map((player, index) => (
                              <div key={index} className="flex justify-between items-center py-1">
                                <span className="text-xs">
                                  <span className="font-medium text-muted-foreground w-8 inline-block">
                                    {player.position}
                                  </span>
                                  {player.player}
                                </span>
                                <span className="text-xs font-medium">{parseFloat(player.points || 0).toFixed(2)}</span>
                              </div>
                            ))
                          ) : (
                            <div className="text-center text-muted-foreground text-sm py-4">
                              Roster data not available
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
                )
              })}
            </Accordion>
          )}
        </CardContent>
      </Card>
      
      <WeeklyStandingsChart selectedTeam={selectedTeam} onTeamSelect={onTeamSelect} />
    </div>
  )
}
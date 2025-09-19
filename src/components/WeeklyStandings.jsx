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
import { useSleeperPlayerData, useSleeperNFLState } from '../hooks/useSleeperTest'
import { useMemo } from 'react'

export default function WeeklyStandings({ selectedTeam, onTeamSelect }) {
  const [openItems, setOpenItems] = useState([])
  const [weeklyStandings, setWeeklyStandings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Get current NFL week
  const { data: nflState } = useSleeperNFLState()
  const currentWeek = nflState?.week || 1
  const availableWeeks = useMemo(() => Array.from({ length: currentWeek }).map((_, i) => i+1 ).reverse(), [currentWeek])
  const [selectedWeek, setSelectedWeek] = useState(`${currentWeek}`)
  
  // Fetch player data with actual and projected points using test hook
  const { data: playerData } = useSleeperPlayerData(selectedWeek || currentWeek)

  // Update weekly standings when Sleeper data changes
  useEffect(() => {
    if (playerData?.teams) {
      // Create standings from Sleeper test hook data
      const teams = Object.values(playerData.teams)
      
      // Calculate total points for each team
      teams.forEach(team => {
        team.totalPoints = team.players.reduce((sum, player) => sum + (player.points || 0), 0)
      })
      
      // Sort by points descending
      teams.sort((a, b) => b.totalPoints - a.totalPoints)
      
      // Add rankings and vs everyone records
      teams.forEach((team, index) => {
        team.rank = index + 1
        team.wins = teams.length - index - 1
        team.losses = index
        team.record = `${team.wins}-${team.losses}`
      })
      
      // Transform to expected format
      const transformedData = teams.map(team => ({
        id: team.team_id,
        rank: team.rank,
        teamName: team.team_name,
        points: team.totalPoints.toFixed(2),
        record: team.record,
        roster: team.players // Use Sleeper roster data
      }))
      
      setWeeklyStandings(transformedData)
      setLoading(false)
      setError(null)
    } else if (selectedWeek && !playerData) {
      setLoading(true)
      setError(null)
    }
  }, [playerData, selectedWeek])

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
                            team.roster.map((player, index) => {
                              return (
                                <div key={index} className="flex justify-between items-center py-1">
                                  <span className="text-xs">
                                    <span className="font-medium text-muted-foreground w-8 inline-block">
                                      {player.position}
                                    </span>
                                    {player.player}
                                  </span>
                                  <div className="text-xs font-medium">
                                    {parseFloat(player.points || 0).toFixed(2)}
                                    <span className="text-gray-400">/{player.projected_points.toFixed(1)}</span>
                                  </div>
                                </div>
                              )
                            })
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

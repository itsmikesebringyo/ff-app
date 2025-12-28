import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Trophy, Medal } from "lucide-react"
import { useWeeklyStandings } from '../hooks/useWeeklyStandings'
import { useOverallStandings } from '../hooks/useOverallStandings'

import { useActiveGameTime } from '../hooks/useActiveGameTime'

export default function PlayoffBracket({ week, selectedTeam }) {
  const isSemiFinals = week === "16"
  const isFinals = week === "17"
  
  // Check if games are still active
  const hasActiveGames = useActiveGameTime(week)
  
  // Check if Week 17 is complete (Tuesday or later, or no active games)
  const isWeek17Complete = () => {
    if (!isFinals) return false
    
    const now = new Date()
    const day = now.getDay() // 0 = Sunday, 1 = Monday, 2 = Tuesday
    
    // If it's Tuesday or later, Week 17 is complete
    if (day >= 2) return true
    
    // If it's Monday after 11:59 PM EST (games are over)
    if (day === 1) {
      const hour = now.getHours()
      return hour >= 24 // This would never be true, but Monday games end before midnight
    }
    
    // Otherwise, Week 17 is not complete
    return false
  }
  
  const week17Complete = isWeek17Complete()
  
  // Get overall standings to determine playoff seeds
  const { data: overallStandings = [] } = useOverallStandings()
  
  // Get weekly results for the playoff week
  const { data: weeklyResults = [], isLoading, error } = useWeeklyStandings(week)
  
  // Get week 16 results for finals bracket (always fetch, even if not finals week)
  const { data: week16Results = [] } = useWeeklyStandings("16")
  
  // Get top 4 teams for playoffs
  const playoffTeams = overallStandings.slice(0, 4).map((team, index) => ({
    ...team,
    seed: index + 1
  }))
  
  // Helper to get team by seed
  const getTeamBySeed = (seed) => playoffTeams.find(t => t.seed === seed)
  
  // Helper to get match result
  const getMatchResult = (team1Name, team2Name) => {
    const team1Result = weeklyResults.find(r => r.teamName === team1Name)
    const team2Result = weeklyResults.find(r => r.teamName === team2Name)
    
    if (!team1Result || !team2Result) return null
    
    return {
      team1: {
        name: team1Name,
        points: parseFloat(team1Result.points),
        projectedPoints: parseFloat(team1Result.projectedTotal),
        starters: team1Result.starters || []
      },
      team2: {
        name: team2Name,
        points: parseFloat(team2Result.points),
        projectedPoints: parseFloat(team2Result.projectedTotal),
        starters: team2Result.starters || []
      },
      winner: parseFloat(team1Result.points) > parseFloat(team2Result.points) ? team1Name : team2Name
    }
  }
  
  // Get highlight style
  const getHighlightStyle = (teamName) => {
    if (selectedTeam === 'All Teams' || selectedTeam !== teamName) {
      return ""
    }
    return "ring-2 ring-primary bg-accent/50"
  }
  
  if (isLoading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
        <p className="mt-2 text-muted-foreground">Loading playoff bracket...</p>
      </div>
    )
  }
  
  if (error) {
    return (
      <div className="text-center py-8 text-red-500">
        Failed to load playoff data
      </div>
    )
  }
  
  // Semi-finals bracket (Week 16)
  if (isSemiFinals) {
    const team1 = getTeamBySeed(1)
    const team4 = getTeamBySeed(4)
    const team2 = getTeamBySeed(2)
    const team3 = getTeamBySeed(3)
    
    const match1 = team1 && team4 ? getMatchResult(team1.teamName, team4.teamName) : null
    const match2 = team2 && team3 ? getMatchResult(team2.teamName, team3.teamName) : null
    
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h3 className="text-xl font-semibold mb-2">Playoff Semi-Finals</h3>
          <p className="text-muted-foreground">Week 16</p>
        </div>
        
        <div className="grid gap-8">
          {/* Match 1: 1 vs 4 */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-sm text-center">Match 1</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-4">
                <TeamCard 
                  team={team1} 
                  seed={1} 
                  score={match1?.team1.points}
                  projectedScore={match1?.team1.projectedPoints}
                  isWinner={match1?.winner === team1?.teamName}
                  highlight={getHighlightStyle(team1?.teamName)}
                />
                <div className="text-xl font-bold text-muted-foreground">VS</div>
                <TeamCard 
                  team={team4} 
                  seed={4} 
                  score={match1?.team2.points}
                  projectedScore={match1?.team2.projectedPoints}
                  isWinner={match1?.winner === team4?.teamName}
                  highlight={getHighlightStyle(team4?.teamName)}
                />
              </div>
            </CardContent>
          </Card>
          
          {/* Match 2: 2 vs 3 */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-sm text-center">Match 2</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-4">
                <TeamCard 
                  team={team2} 
                  seed={2} 
                  score={match2?.team1.points}
                  projectedScore={match2?.team1.projectedPoints}
                  isWinner={match2?.winner === team2?.teamName}
                  highlight={getHighlightStyle(team2?.teamName)}
                />
                <div className="text-xl font-bold text-muted-foreground">VS</div>
                <TeamCard 
                  team={team3} 
                  seed={3} 
                  score={match2?.team2.points}
                  projectedScore={match2?.team2.projectedPoints}
                  isWinner={match2?.winner === team3?.teamName}
                  highlight={getHighlightStyle(team3?.teamName)}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }
  
  // Finals bracket (Week 17)
  if (isFinals) {
    if (week16Results.length === 0) {
      return (
        <div className="text-center py-8">
          <p className="text-muted-foreground">Waiting for semi-final results...</p>
        </div>
      )
    }
    
    // Determine semi-final winners by checking week 15 results
    const team1 = getTeamBySeed(1)
    const team4 = getTeamBySeed(4)
    const team2 = getTeamBySeed(2)
    const team3 = getTeamBySeed(3)
    
    // Helper to get match result from week 16
    const getWeek16MatchResult = (team1Name, team2Name) => {
      const team1Result = week16Results.find(r => r.teamName === team1Name)
      const team2Result = week16Results.find(r => r.teamName === team2Name)
      
      if (!team1Result || !team2Result) return null
      
      return {
        team1: {
          name: team1Name,
          points: parseFloat(team1Result.points),
          projectedPoints: parseFloat(team1Result.projectedTotal),
          starters: team1Result.starters || []
        },
        team2: {
          name: team2Name,
          points: parseFloat(team2Result.points),
          projectedPoints: parseFloat(team2Result.projectedTotal),
          starters: team2Result.starters || []
        },
        winner: parseFloat(team1Result.points) > parseFloat(team2Result.points) ? team1Name : team2Name
      }
    }
    
    const match1Result = team1 && team4 ? getWeek16MatchResult(team1.teamName, team4.teamName) : null
    const match2Result = team2 && team3 ? getWeek16MatchResult(team2.teamName, team3.teamName) : null
    
    const finalist1 = match1Result?.winner
    const finalist2 = match2Result?.winner
    
    const loser1 = match1Result ? (match1Result.winner === team1?.teamName ? team4?.teamName : team1?.teamName) : null
    const loser2 = match2Result ? (match2Result.winner === team2?.teamName ? team3?.teamName : team2?.teamName) : null
    
    // Get finals results
    const finalsMatch = finalist1 && finalist2 ? getMatchResult(finalist1, finalist2) : null
    const thirdPlaceMatch = loser1 && loser2 ? getMatchResult(loser1, loser2) : null
    
    return (
      <div className="space-y-6">
        <div className="grid gap-8">
          {/* Championship Match */}
          <FinalsMatch
            match={finalsMatch}
            title="Championship Game"
            icon={<Trophy className="h-5 w-5" />}
            highlight1={getHighlightStyle(finalist1)}
            highlight2={getHighlightStyle(finalist2)}
            borderClass="border-2 border-yellow-500 dark:border-yellow-600"
            week17Complete={week17Complete}
            hasActiveGames={hasActiveGames}
          />
          
          {/* 3rd Place Match */}
          <FinalsMatch
            match={thirdPlaceMatch}
            title="3rd Place Game"
            icon={<Medal className="h-4 w-4 text-orange-600 dark:text-orange-500" />}
            highlight1={getHighlightStyle(loser1)}
            highlight2={getHighlightStyle(loser2)}
            week17Complete={week17Complete}
            hasActiveGames={hasActiveGames}
          />
        </div>
      </div>
    )
  }
  
  return null
}

// Finals match component with rosters
function FinalsMatch({ match, title, icon, highlight1, highlight2, borderClass = "", week17Complete, hasActiveGames }) {
  if (!match || !match.team1 || !match.team2) return null
  
  const isChampionshipMatch = title.includes("Championship")
  const showChampion = isChampionshipMatch && week17Complete
  
  return (
    <Card className={borderClass}>
      <CardHeader className={`pb-4 ${isChampionshipMatch ? 'bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20' : ''}`}>
        <CardTitle className="text-center flex items-center justify-center gap-2">
          {icon && <span className="text-yellow-600 dark:text-yellow-500">{icon}</span>}
          {title}
          {icon && <span className="text-yellow-600 dark:text-yellow-500">{icon}</span>}
        </CardTitle>
        {isChampionshipMatch && !week17Complete && !hasActiveGames && (
          <p className="text-xs text-center text-muted-foreground mt-1">Champion will be crowned after Monday Night Football</p>
        )}
      </CardHeader>
      <CardContent className="pt-2 sm:pt-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Team 1 */}
          <div className={`p-1 sm:p-4 rounded-lg border ${highlight1} ${week17Complete && match.winner === match.team1.name ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : ''}`}>
            <div className="text-center mb-4">
              <div className={`font-semibold ${showChampion && match.winner === match.team1.name ? 'text-yellow-600 dark:text-yellow-500' : ''}`}>
                {match.team1.name}
              </div>
              <div className="text-2xl font-bold mt-1">
                {match.team1.points.toFixed(2)}
                <span className="text-sm text-muted-foreground ml-1">/{match.team1.projectedPoints.toFixed(1)}</span>
              </div>
              {showChampion && match.winner === match.team1.name && (
                <div className="flex items-center justify-center gap-1 text-xs text-yellow-600 dark:text-yellow-500 font-semibold mt-1">
                  <Trophy className="h-3 w-3" />
                  CHAMPION
                </div>
              )}
            </div>
            
            {/* Roster */}
            <div className="space-y-1 text-xs">
              {match.team1.starters.map((player, idx) => (
                <div key={idx} className="flex justify-between items-center py-0.5">
                  <span>
                    <span className="font-medium text-muted-foreground w-8 inline-block">{player.lineup_position}</span>
                    {player.player}
                  </span>
                  <span className="font-medium">
                    {parseFloat(player.points || 0).toFixed(1)}
                    <span className="text-gray-400">/{parseFloat(player.projected_points || 0).toFixed(1)}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
          
          {/* Team 2 */}
          <div className={`p-1 sm:p-4 rounded-lg border ${highlight2} ${week17Complete && match.winner === match.team2.name ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : ''}`}>
            <div className="text-center mb-4">
              <div className={`font-semibold ${showChampion && match.winner === match.team2.name ? 'text-yellow-600 dark:text-yellow-500' : ''}`}>
                {match.team2.name}
              </div>
              <div className="text-2xl font-bold mt-1">
                {match.team2.points.toFixed(2)}
                <span className="text-sm text-muted-foreground ml-1">/{match.team2.projectedPoints.toFixed(1)}</span>
              </div>
              {showChampion && match.winner === match.team2.name && (
                <div className="flex items-center justify-center gap-1 text-xs text-yellow-600 dark:text-yellow-500 font-semibold mt-1">
                  <Trophy className="h-3 w-3" />
                  CHAMPION
                </div>
              )}
            </div>
            
            {/* Roster */}
            <div className="space-y-1 text-xs">
              {match.team2.starters.map((player, idx) => (
                <div key={idx} className="flex justify-between items-center py-0.5">
                  <span>
                    <span className="font-medium text-muted-foreground w-8 inline-block">{player.lineup_position}</span>
                    {player.player}
                  </span>
                  <span className="font-medium">
                    {parseFloat(player.points || 0).toFixed(1)}
                    <span className="text-gray-400">/{parseFloat(player.projected_points || 0).toFixed(1)}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Team card component for bracket display
function TeamCard({ team, seed, score, projectedScore, isWinner, highlight, isChampion }) {
  if (!team) return <div className="flex-1" />
  
  return (
    <div className={`flex-1 p-2 sm:p-4 rounded-lg border ${highlight} ${isWinner ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : ''} ${isChampion ? 'ring-2 ring-yellow-500' : ''}`}>
      <div className="text-center space-y-1">
        {seed && (
          <div className="text-xs text-muted-foreground">Seed #{seed}</div>
        )}
        <div className={`font-semibold ${isChampion ? 'text-yellow-600 dark:text-yellow-500' : ''}`}>
          {team.teamName}
        </div>
        {score !== undefined && (
          <div className="text-2xl font-bold">
            {score.toFixed(2)}
            {projectedScore && (
              <span className="text-sm text-muted-foreground ml-1">/{projectedScore.toFixed(1)}</span>
            )}
          </div>
        )}
        {isChampion && (
          <div className="flex items-center justify-center gap-1 text-xs text-yellow-600 dark:text-yellow-500 font-semibold">
            <Trophy className="h-3 w-3" />
            CHAMPION
          </div>
        )}
      </div>
    </div>
  )
}


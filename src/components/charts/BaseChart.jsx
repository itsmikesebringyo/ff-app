import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Text } from "recharts"

const buildChartConfig = (teamNames) => {
  const config = {}
  teamNames.forEach((teamName) => {
    config[teamName] = {
      label: teamName,
    }
  })
  return config
}

// Helper function to get shortened team name (first word only)
const getShortTeamName = (fullName) => {
  if (!fullName) return ''
  return fullName.split(' ')[0]
}

// Custom tick component for left side labels
const LeftAxisTick = ({ x, y, payload, firstWeekRankMap, selectedTeam, onTeamClick }) => {
  const teamName = firstWeekRankMap[payload.value]
  
  if (!teamName) return null
  
  const shortName = getShortTeamName(teamName)
  const isSelected = selectedTeam === teamName
  const isAllTeams = selectedTeam === 'All Teams'
  
  return (
    <Text
      x={x - 8}
      y={y}
      fill={isSelected ? "var(--primary)" : (isAllTeams ? "var(--muted-foreground)" : "var(--muted)")}
      textAnchor="end"
      dominantBaseline="middle"
      fontSize={12}
      fontWeight={isSelected ? 600 : 400}
      className="cursor-pointer"
      onClick={() => onTeamClick(teamName)}
    >
      {shortName}
    </Text>
  )
}

// Custom tick component for right side labels
const RightAxisTick = ({ x, y, payload, lastWeekRankMap, selectedTeam, onTeamClick }) => {
  const teamName = lastWeekRankMap[payload.value]
  
  if (!teamName) return null
  
  const shortName = getShortTeamName(teamName)
  const isSelected = selectedTeam === teamName
  const isAllTeams = selectedTeam === 'All Teams'
  
  return (
    <Text
      x={x + 8}
      y={y}
      fill={isSelected ? "var(--primary)" : (isAllTeams ? "var(--muted-foreground)" : "var(--muted)")}
      textAnchor="start"
      dominantBaseline="middle"
      fontSize={12}
      fontWeight={isSelected ? 600 : 400}
      className="cursor-pointer"
      onClick={() => onTeamClick(teamName)}
    >
      {shortName}
    </Text>
  )
}

export default function BaseChart({ 
  title, 
  fetchDataFn, 
  selectedTeam, 
  onTeamSelect,
  maxTeams = 11 
}) {
  const [chartData, setChartData] = useState([])
  const [teamNames, setTeamNames] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const loadChartData = async () => {
      try {
        setLoading(true)
        setError(null)
        
        const { chartData: data, teamNames: names } = await fetchDataFn()
        
        setChartData(data)
        setTeamNames(names)
      } catch (err) {
        console.error('Error fetching chart data:', err)
        setError('Failed to load chart data')
      } finally {
        setLoading(false)
      }
    }

    loadChartData()
  }, [fetchDataFn])

  const getStrokeColor = (teamName) => {
    if (selectedTeam === 'All Teams') {
      return "var(--muted-foreground)"
    }
    if (selectedTeam === teamName) {
      return "var(--primary)"
    }
    return "var(--muted)"
  }

  if (loading) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            Loading chart data...
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-red-500">
            {error}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!chartData.length) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            No chart data available yet
          </div>
        </CardContent>
      </Card>
    )
  }

  // Create separate rank maps for first and last weeks
  const createRankMaps = () => {
    const firstWeekRankMap = {}
    const lastWeekRankMap = {}
    
    if (chartData.length > 0) {
      // Get first week data for left side
      const firstWeek = chartData[0]
      Object.entries(firstWeek).forEach(([key, value]) => {
        if (key !== 'week' && typeof value === 'number') {
          firstWeekRankMap[value] = key
        }
      })
      
      // Get last week data for right side
      const lastWeek = chartData[chartData.length - 1]
      Object.entries(lastWeek).forEach(([key, value]) => {
        if (key !== 'week' && typeof value === 'number') {
          lastWeekRankMap[value] = key
        }
      })
    }
    
    return { firstWeekRankMap, lastWeekRankMap }
  }
  
  const { firstWeekRankMap, lastWeekRankMap } = createRankMaps()

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={buildChartConfig(teamNames)}>
          <LineChart
            data={chartData}
            margin={{
              left: 80,
              right: 80,
              top: 12,
              bottom: 12,
            }}
          >
            <CartesianGrid vertical={false} />
            <XAxis 
              dataKey="week" 
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis 
              domain={[0.5, Math.max(teamNames.length + 0.5, maxTeams)]}
              reversed={true}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tick={(props) => <LeftAxisTick {...props} firstWeekRankMap={firstWeekRankMap} selectedTeam={selectedTeam} onTeamClick={onTeamSelect} />}
              ticks={Array.from({length: Math.max(teamNames.length, maxTeams - 1)}, (_, i) => i + 1)}
            />
            <YAxis 
              yAxisId="right"
              orientation="right"
              domain={[0.5, Math.max(teamNames.length + 0.5, maxTeams)]}
              reversed={true}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tick={(props) => <RightAxisTick {...props} lastWeekRankMap={lastWeekRankMap} selectedTeam={selectedTeam} onTeamClick={onTeamSelect} />}
              ticks={Array.from({length: Math.max(teamNames.length, maxTeams - 1)}, (_, i) => i + 1)}
            />
            <ChartTooltip 
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            {/* Render non-selected teams first */}
            {teamNames
              .filter(teamName => teamName !== selectedTeam)
              .map((teamName) => (
                <Line
                  key={teamName}
                  type="monotone"
                  dataKey={teamName}
                  stroke={getStrokeColor(teamName)}
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                />
              ))}
            {/* Render selected team last so it appears on top */}
            {selectedTeam && selectedTeam !== 'All Teams' && teamNames.includes(selectedTeam) && (
              <Line
                key={selectedTeam}
                type="monotone"
                dataKey={selectedTeam}
                stroke={getStrokeColor(selectedTeam)}
                strokeWidth={3}
                dot={false}
                connectNulls={false}
              />
            )}
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

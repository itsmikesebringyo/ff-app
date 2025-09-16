import { useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Moon, Sun, Menu } from "lucide-react"
import WeeklyStandings from './components/WeeklyStandings'
import OverallStandings from './components/OverallStandings'
import { apiConfig, adminApiCall } from './config/api'
import { useTeams } from './hooks/useTeams'
import { useNetworkStatus } from './hooks/useNetworkStatus'

function App() {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || 
             (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)
    }
    return false
  })

  const [selectedTeam, setSelectedTeam] = useState('All Teams')
  const [isPolling, setIsPolling] = useState(false)
  const [isAdmin, setIsAdmin] = useState(() => {
    return localStorage.getItem('isAdmin') === 'true'
  })
  const [_adminApiKey, setAdminApiKey] = useState(() => {
    return localStorage.getItem('adminApiKey') || ''
  })

  // Fetch team names dynamically from API
  const { teams, loading: teamsLoading, error: teamsError } = useTeams()
  
  // Network status for mobile connectivity awareness
  const { isOnline, connectionType, isSlowConnection } = useNetworkStatus()
  
  // PWA update handling
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [swRegistration, setSwRegistration] = useState(null)

  // Ensure selectedTeam is valid when teams are loaded
  useEffect(() => {
    if (!teamsLoading && !teamsError && teams.length > 0) {
      // If current selectedTeam is not in the loaded teams, reset to 'All Teams'
      if (!teams.includes(selectedTeam)) {
        setSelectedTeam('All Teams')
      }
    }
  }, [teams, teamsLoading, teamsError, selectedTeam])

  // Check for admin URL parameter on app load
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const isAdminRequest = urlParams.get('admin') === 'true'
    
    if (isAdminRequest && !isAdmin) {
      handleAdminAuthentication()
    }
  }, [])

  // Handle dark mode
  useEffect(() => {
    const root = window.document.documentElement
    if (isDarkMode) {
      root.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      root.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }, [isDarkMode])

  // PWA update handling
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        setSwRegistration(registration)
        
        // Listen for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setUpdateAvailable(true)
              }
            })
          }
        })
      })
    }
  }, [])

  const handleUpdate = () => {
    if (swRegistration && swRegistration.waiting) {
      swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' })
      window.location.reload()
    }
  }

  const handleAdminAuthentication = async () => {
    const apiKey = prompt('Enter admin API key:')
    if (!apiKey) return

    try {
      console.log('Attempting admin validation with URL:', apiConfig.endpoints.adminValidate)
      
      // Validate API key against backend
      const response = await fetch(apiConfig.endpoints.adminValidate, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': apiKey
        },
        body: JSON.stringify({ action: 'validate' })
      })

      console.log('Response status:', response.status)
      console.log('Response headers:', response.headers)

      if (response.status === 200) {
        setIsAdmin(true)
        setAdminApiKey(apiKey)
        localStorage.setItem('isAdmin', 'true')
        localStorage.setItem('adminApiKey', apiKey)
        alert('Admin access granted!')
        
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname)
      } else {
        const errorText = await response.text()
        console.error('API response error:', errorText)
        alert(`Invalid API key (Status: ${response.status})`)
      }
    } catch (error) {
      console.error('Admin validation error:', error)
      alert(`Unable to validate admin access: ${error.message}`)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Menu button in absolute top-right corner */}
      <div className="absolute top-8 right-8">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon">
              <Menu className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Settings</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="flex items-center justify-between px-2 py-1.5 text-sm cursor-default">
              <div className="flex items-center">
                {isDarkMode ? (
                  <>
                    <Moon className="mr-2 h-4 w-4" />
                    <span>Dark mode</span>
                  </>
                ) : (
                  <>
                    <Sun className="mr-2 h-4 w-4" />
                    <span>Light mode</span>
                  </>
                )}
              </div>
              <Switch
                checked={isDarkMode}
                onCheckedChange={setIsDarkMode}
                className="ml-2"
              />
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <span>View as</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {teamsLoading ? (
                  <DropdownMenuItem disabled className="text-muted-foreground">
                    Loading teams...
                  </DropdownMenuItem>
                ) : teamsError ? (
                  <DropdownMenuItem disabled className="text-muted-foreground">
                    Error loading teams
                  </DropdownMenuItem>
                ) : (
                  teams.map((team) => (
                    <DropdownMenuItem
                      key={team}
                      onClick={() => setSelectedTeam(team)}
                      className={selectedTeam === team ? "bg-accent" : ""}
                    >
                      {team}
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <span>Admin</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem 
                  onClick={async (e) => {
                    e.preventDefault()
                    if (isAdmin) {
                      try {
                        const response = await adminApiCall(apiConfig.endpoints.pollingToggle, {
                          method: 'POST'
                        })
                        setIsPolling(response.enabled)
                        console.log('Polling toggled:', response.message)
                      } catch (error) {
                        console.error('Failed to toggle polling:', error)
                        alert('Failed to toggle polling')
                      }
                    } else {
                      console.log('Admin access required')
                    }
                  }}
                  className={
                    isPolling 
                      ? `transition-all duration-300 bg-green-500/20 text-green-700 animate-pulse ${isAdmin ? 'cursor-pointer' : 'cursor-default'}`
                      : isAdmin 
                      ? 'transition-all duration-300 cursor-pointer'
                      : 'transition-all duration-300 cursor-default text-muted-foreground'
                  }
                >
                  <div className="flex items-center justify-between w-full">
                    <span>Live Updates</span>
                    <div className={`
                      w-4 h-4 rounded-full border-2 transition-all duration-300
                      ${isPolling 
                        ? 'bg-green-500 border-green-500' 
                        : 'bg-transparent border-gray-400'
                      }
                    `}>
                      {isPolling && (
                        <div className="w-full h-full bg-green-500 rounded-full animate-pulse"></div>
                      )}
                    </div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={async (e) => {
                    e.preventDefault()
                    if (isAdmin) {
                      try {
                        const response = await adminApiCall(apiConfig.endpoints.syncHistorical, {
                          method: 'POST'
                        })
                        console.log('Historical sync started:', response.message)
                        alert('Historical data sync started!')
                      } catch (error) {
                        console.error('Failed to sync historical data:', error)
                        alert('Failed to start historical sync')
                      }
                    } else {
                      console.log('Admin access required')
                    }
                  }}
                  className={isAdmin ? 'cursor-pointer' : 'text-muted-foreground cursor-default'}
                >
                  Sync Historical Data
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={async (e) => {
                    e.preventDefault()
                    if (isAdmin) {
                      try {
                        const response = await adminApiCall(apiConfig.endpoints.calculatePlayoffs, {
                          method: 'POST'
                        })
                        console.log('Playoff simulation started:', response.message)
                        alert('Playoff simulation started!')
                      } catch (error) {
                        console.error('Failed to calculate playoffs:', error)
                        alert('Failed to start playoff simulation')
                      }
                    } else {
                      console.log('Admin access required')
                    }
                  }}
                  className={isAdmin ? 'cursor-pointer' : 'text-muted-foreground cursor-default'}
                >
                  Calculate Playoffs
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={async (e) => {
                    e.preventDefault()
                    if (isAdmin) {
                      try {
                        const response = await adminApiCall(apiConfig.endpoints.fetchPlayers, {
                          method: 'GET'
                        })
                        console.log('Players data fetched:', response)
                        alert('Players data fetched successfully!')
                      } catch (error) {
                        console.error('Failed to fetch players:', error)
                        alert('Failed to fetch players data')
                      }
                    } else {
                      console.log('Admin access required')
                    }
                  }}
                  className={isAdmin ? 'cursor-pointer' : 'text-muted-foreground cursor-default'}
                >
                  Fetch Players Data
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="max-w-4xl mx-auto pt-16 pb-8 px-4 sm:pt-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold tracking-tight">Madtown's Finest Standings</h1>
          {!isOnline && (
            <div className="mt-2 text-sm text-orange-600 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400 px-3 py-1 rounded-full inline-block">
              ⚠️ Offline - Some features may be limited
            </div>
          )}
          {isOnline && isSlowConnection && (
            <div className="mt-2 text-sm text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 dark:text-yellow-400 px-3 py-1 rounded-full inline-block">
              🐌 Slow connection detected - Using cached data when possible
            </div>
          )}
          {updateAvailable && (
            <div className="mt-2 text-sm text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400 px-3 py-1 rounded-full inline-block">
              <button 
                onClick={handleUpdate}
                className="underline hover:no-underline"
              >
                🔄 Update Available - Tap to refresh
              </button>
            </div>
          )}
        </div>
        
        {/* Tabs same width as accordion */}
          <Tabs defaultValue="weekly" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="weekly">Weekly Standings</TabsTrigger>
            <TabsTrigger value="overall">Overall Standings</TabsTrigger>
          </TabsList>
          
          <TabsContent value="weekly" className="mt-6">
            <WeeklyStandings selectedTeam={selectedTeam} />
          </TabsContent>
          
          <TabsContent value="overall" className="mt-6">
            <OverallStandings selectedTeam={selectedTeam} />
          </TabsContent>
          </Tabs>
      </div>
    </div>
  )
}

export default App
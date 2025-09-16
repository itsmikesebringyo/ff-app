# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fantasy Football "vs Everyone" PWA - A custom scoring tracker for fantasy football leagues using a unique scoring format where each team plays against every other team each week.

**Tech Stack:**
- Frontend: React + Vite PWA + Tailwind CSS v4 + shadcn/ui
- Package Manager: pnpm
- Backend: AWS Lambda (Python 3.11) + DynamoDB + EventBridge
- Infrastructure: AWS CDK (TypeScript)
- API: Sleeper API integration
- Deployment: Vercel (frontend), AWS (backend)
- CI/CD: GitHub Actions (planned)

## Development Commands

```bash
# Frontend Development
pnpm install                   # Install dependencies
pnpm run dev                   # Start dev server at localhost:5173
pnpm run build                 # Build for production
pnpm run preview               # Preview production build

# shadcn/ui Component Management
pnpm dlx shadcn@latest add [component]  # Add shadcn components

# Infrastructure (CDK)
cd infrastructure
npm install
npm run build                  # Compile TypeScript
npx cdk synth                  # Generate CloudFormation
npx cdk diff                   # Compare with deployed stack
npx cdk deploy                 # Deploy to AWS (requires AWS credentials)
```

## Architecture

### Frontend Structure
- `src/App.jsx` - Main app with Tabs navigation and hamburger menu with settings
- `src/components/WeeklyStandings.jsx` - Expandable accordion with team rosters and week selector
- `src/components/OverallStandings.jsx` - Static standings showing accumulated records and playoff percentages
- `src/components/WeeklyStandingsChart.jsx` - Line chart showing weekly team finishes over time
- `src/components/OverallStandingsChart.jsx` - Line chart showing cumulative ranking progression
- `src/components/ui/` - shadcn/ui components (accordion, tabs, select, switch, dropdown-menu, card, button)
- PWA configuration in `vite.config.js` with service worker support

### UI Components & Features
- **Hamburger Menu**: DropdownMenu with dark/light mode Switch and "View as" team selection
- **Dark/Light Mode**: Switch component with localStorage persistence and system preference detection
- **Tabs Navigation**: Weekly vs Overall standings with clean shadcn/ui tabs
- **Week Selector**: Dropdown to choose weeks 1-18 using shadcn/ui Select component
- **Expandable Standings**: Accordion component showing team rankings with collapsible rosters
- **Team Highlighting**: Background highlighting for selected teams across standings and charts
- **Chart Visualization**: Line charts showing weekly performance trends and season-long progression
- **"View as" Feature**: Team selection that highlights chosen team in standings and charts with primary color
- **Mobile-First Design**: PWA optimized for phone usage with responsive layout
- **Team Roster Display**: Expandable view showing all 8 starting positions (QB, RB, RB, WR, WR, TE, FLEX, DST)
- **"vs Everyone" Format**: Rankings show combined rank/team name, points, and record

### Chart Highlighting Behavior
- **"All Teams" selected**: All chart lines use `var(--muted-foreground)` color
- **Specific team selected**: 
  - Selected team's line uses `var(--primary)` color (bright highlight)
  - All other teams use `var(--muted)` color (very faded background)
- **Persistent highlighting**: Team selection persists when switching between Weekly/Overall tabs
- **Integrated experience**: Same team highlighted in both standings tables and charts

### Backend Structure (CDK)
- `infra/lib/infrastructure-stack.ts` - Main CDK stack with ECS Fargate + Lambda architecture
- `infra/lambda/api-handler/` - Enhanced API handler with ECS management (Python)
- `infra/lambda/calculate-standings/` - Core "vs everyone" algorithm implementation (Python)  
- `infra/lambda/historical-backfill/` - Backfills completed weeks from Sleeper API (Python)
- `infra/lambda/monte-carlo/` - Vectorized playoff simulation Lambda (Python + NumPy)
- `infra/fargate/polling-service/` - Live polling Fargate container (Python + Docker)

### Scoring Logic ("vs Everyone")
**Madtown's Finest League** (10-person league):
- 1st place in week: 9-0 record
- 2nd place in week: 8-1 record  
- 10th place in week: 0-9 record
- Overall standings accumulate weekly wins/losses
- **No kickers** in roster (8 starting positions total)
- **Expandable rosters** show individual player performances

### Backend Architecture
- **ECS Fargate Services**: Clean polling containers for live updates (no hacky self-invoking Lambdas)
- **Live Polling**: Fargate container polls Sleeper API every 10 seconds when enabled
- **Monte Carlo Simulations**: Vectorized Lambda function runs 10,000 playoff simulations with shrinkage-based sampling
- **Vectorized Performance**: NumPy-powered simulations complete in ~2-5 seconds (10-30x faster than sequential)
- **Shrinkage Algorithm**: Early season regresses toward league average, late season uses team-specific data
- **Manual Admin Control**: All services start/stop via hamburger menu buttons
- **State Management**: DynamoDB tracks polling status and stores all data

### API Integration
- **Sleeper League ID**: `1251986365806034944` (2025 season)
- **Sleeper Endpoints**: `/leagues`, `/rosters`, `/users`, `/matchups/{week}`, `/players/nfl`, `/state/nfl`
- **Frontend API**: API Gateway endpoints:
  - `GET /weekly` - Weekly standings data
  - `GET /overall` - Overall standings with playoff percentages
  - `GET /nfl-state` - Current NFL week info
  - `GET /polling/status` - Live polling status
  - `POST /polling/toggle` - Start/stop live polling
  - `POST /calculate-playoffs` - Invoke Monte Carlo Lambda simulation
  - `POST /sync-historical` - Backfill historical data

### Data Flow

**Initial Setup:**
1. Admin clicks "Sync Historical Data" → triggers historical-backfill Lambda
2. Lambda fetches completed weeks from Sleeper API and triggers calculate-standings
3. All past weeks populated in DynamoDB

**Live Updates:**
1. Admin clicks "Updates ON/OFF" → API handler starts/stops Fargate polling service  
2. Fargate container polls Sleeper API every 10 seconds during games
3. When scores change → triggers calculate-standings Lambda
4. Frontend displays live results via API calls

**Playoff Calculations:**
1. Admin clicks "Calculate Playoffs" → API handler invokes Monte Carlo Lambda function
2. Lambda runs 10,000 vectorized simulations using shrinkage-based sampling (~2-5 seconds)
3. Updates playoff percentages in overall standings table

### DynamoDB Tables
- `ff-weekly-standings` - Weekly "vs everyone" results (season_week, team_id)
- `ff-overall-standings` - Cumulative season standings (season, team_id)  
- `ff-league-data` - Cached Sleeper API data (data_type, id)
- `ff-polling-state` - Polling control state (id: 'polling_status')

### Current Status

**Frontend (Complete):**
- ✅ **Complete shadcn/ui Frontend**: Modern React app with Accordion, Tabs, Select, Switch, DropdownMenu components
- ✅ **Mobile-First PWA**: Optimized for phone usage with responsive design
- ✅ **Admin Controls**: Hamburger menu with 4 admin functions + URL-based authentication (?admin=true)
- ✅ **Live Updates UI**: Green pulsing button when polling active, visible to all users
- ✅ **Admin Authentication**: Secure API key validation, localStorage persistence
- ✅ **Dark/Light Mode**: Switch component with localStorage persistence and system preference support
- ✅ **Weekly Standings UI**: Expandable accordion with team rosters and week selector (1-18)
- ✅ **Overall Standings UI**: Static standings with accumulated records, earnings, and playoff percentages
- ✅ **Chart Visualization**: Line charts for both weekly performance trends and season-long progression
- ✅ **Team Highlighting System**: Background highlighting in standings and dynamic stroke colors in charts
- ✅ **"View as" Feature**: Team selection that highlights chosen team across all UI components

**Backend (Complete):**
- ✅ **Hybrid Architecture**: ECS Fargate for polling + Lambda for compute-intensive tasks
- ✅ **Complete CDK Infrastructure**: VPC, ECS Cluster, Lambda functions, DynamoDB tables, IAM roles
- ✅ **API Handler Lambda**: Enhanced with ECS management and admin authentication, all 8 endpoints
- ✅ **Historical Backfill Lambda**: Sleeper API integration, triggers calculate-standings
- ✅ **Calculate Standings Lambda**: Complete "vs everyone" algorithm with earnings tracking
- ✅ **Live Polling Service**: Fargate container with 10-second polling, change detection
- ✅ **Monte Carlo Lambda**: Vectorized NumPy simulations with shrinkage algorithm (10-30x faster)
- ✅ **Admin Authentication**: API key-based security for admin functions
- ✅ **DynamoDB Schema**: Optimized for "vs everyone" scoring and playoff percentages
- ✅ **API Gateway**: CORS support, all endpoints configured

**Deployment (Complete):**
- ✅ **AWS Infrastructure Deployed**: CDK stack deployed with all Lambda functions, DynamoDB tables, API Gateway, VPC, ECS cluster
- ✅ **Container Images**: Docker images built and pushed to ECR for Fargate polling service
- ✅ **Frontend Deployed**: React PWA built and deployed to production with real API endpoints
- ✅ **API Integration**: Production API Gateway endpoints configured and working (us-west-2 region)
- ✅ **PWA Features**: Service worker, offline caching, mobile-optimized experience active
- ✅ **Data Pipeline**: Historical backfill, live polling, and Monte Carlo simulations operational

**Production Ready:**
- ✅ **Live Fantasy Football App**: Fully deployed and operational for 2025 season
- ✅ **Real-time Updates**: Live scoring during NFL games via Fargate polling service
- ✅ **Admin Controls**: Secure admin authentication with API key validation
- ✅ **Mobile PWA**: Installable progressive web app optimized for mobile usage
- ✅ **Performance Optimized**: Vectorized Monte Carlo simulations, smart caching, offline support
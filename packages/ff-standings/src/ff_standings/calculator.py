"""
Core "vs everyone" standings calculation logic
"""

import logging
from operator import itemgetter
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)


class StandingsCalculator:
    def __init__(self):
        self.position_labels = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'DST']
    
    def build_team_roster(self, matchup: Dict[str, Any], players_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        roster = []
        starters = matchup.get('starters', [])
        players_points = matchup.get('players_points', {})
        
        logger.debug(f"Building roster for {len(starters)} starters, players_data available: {bool(players_data)}")
        
        for i, player_id in enumerate(starters):
            position = self.position_labels[i] if i < len(self.position_labels) else 'FLEX'
            points = players_points.get(player_id, 0.0)
            
            if players_data and player_id in players_data:
                player_info = players_data[player_id]
                first_name = player_info.get('first_name', '')
                last_name = player_info.get('last_name', '')
                player_name = f"{first_name} {last_name}".strip()
                
                # Debug logging for player name resolution
                if not player_name or player_name == player_id:
                    logger.debug(f"Player {player_id}: first_name='{first_name}', last_name='{last_name}', resolved='{player_name}'")
                
                if not player_name:
                    player_name = player_id
            else:
                logger.debug(f"Player {player_id} not found in players_data")
                player_name = player_id
            
            roster.append({'position': position, 'player': player_name, 'points': float(points)})
        
        logger.debug(f"Built roster with {len(roster)} players")
        return roster
    
    def calculate_weekly_vs_everyone(self, matchups: List[Dict[str, Any]], team_names: Dict[str, str], players_data: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        team_scores = {}
        for matchup in matchups:
            roster_id = str(matchup['roster_id'])
            points = float(matchup.get('points', 0))
            roster = self.build_team_roster(matchup, players_data) if players_data else []
            team_scores[roster_id] = {
                'roster_id': roster_id,
                'team_name': team_names.get(roster_id, f'Team {roster_id}'),
                'points': points,
                'roster': roster
            }
        sorted_teams = sorted(team_scores.values(), key=itemgetter('points'), reverse=True)
        total_teams = len(sorted_teams)
        weekly_results = []
        
        # Process teams in groups to handle ties with fractional wins/losses
        i = 0
        while i < len(sorted_teams):
            # Find all teams tied at this score
            current_points = sorted_teams[i]['points']
            tied_teams = []
            j = i
            while j < len(sorted_teams) and sorted_teams[j]['points'] == current_points:
                tied_teams.append(sorted_teams[j])
                j += 1
            
            # Calculate fractional wins/losses for tied teams
            if len(tied_teams) == 1:
                # No tie - use normal scoring
                rank = i + 1
                wins = total_teams - rank
                losses = rank - 1
                tied_teams[0]['calculated_rank'] = rank
                tied_teams[0]['wins'] = wins
                tied_teams[0]['losses'] = losses
            else:
                # Tie - calculate average wins/losses
                ranks_in_tie = list(range(i + 1, i + len(tied_teams) + 1))
                avg_rank = sum(ranks_in_tie) / len(ranks_in_tie)
                avg_wins = sum(total_teams - rank for rank in ranks_in_tie) / len(ranks_in_tie)
                avg_losses = sum(rank - 1 for rank in ranks_in_tie) / len(ranks_in_tie)
                
                # Assign fractional record to all tied teams
                for team in tied_teams:
                    team['calculated_rank'] = avg_rank
                    team['wins'] = avg_wins
                    team['losses'] = avg_losses
            
            # Add teams to results
            for team in tied_teams:
                weekly_results.append({
                    'roster_id': team['roster_id'],
                    'team_name': team['team_name'],
                    'rank': team['calculated_rank'],
                    'points': team['points'],
                    'wins': team['wins'],
                    'losses': team['losses'],
                    'roster': team['roster']
                })
            
            i = j
        logger.info(f"Calculated vs everyone standings for {len(weekly_results)} teams")
        return weekly_results



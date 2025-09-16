"""
DynamoDB storage operations for standings data
"""

import logging
import boto3
from decimal import Decimal
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


class StandingsStorage:
    """Handles DynamoDB operations for storing standings data"""
    
    def __init__(self, weekly_standings_table, overall_standings_table):
        """
        Initialize storage with DynamoDB tables
        
        Args:
            weekly_standings_table: DynamoDB table for weekly standings
            overall_standings_table: DynamoDB table for overall standings
        """
        self.weekly_standings_table = weekly_standings_table
        self.overall_standings_table = overall_standings_table
    
    def convert_floats_to_decimal(self, obj):
        """Recursively convert all float values to Decimal for DynamoDB compatibility"""
        if isinstance(obj, float):
            return Decimal(str(obj))
        elif isinstance(obj, dict):
            return {key: self.convert_floats_to_decimal(value) for key, value in obj.items()}
        elif isinstance(obj, list):
            return [self.convert_floats_to_decimal(item) for item in obj]
        else:
            return obj
    
    def store_weekly_standings(self, weekly_results: List[Dict[str, Any]], season: str, week: int) -> None:
        """Store weekly standings in DynamoDB"""
        
        season_week = f"{season}_{week}"
        
        for result in weekly_results:
            try:
                self.weekly_standings_table.put_item(Item=self.convert_floats_to_decimal({
                    'season_week': season_week,
                    'team_id': result['roster_id'],
                    'rank': result['rank'],
                    'team_name': result['team_name'],
                    'points': result['points'],
                    'wins': result['wins'],
                    'losses': result['losses'],
                    'roster': result['roster']
                }))
            except Exception as e:
                logger.error(f"Error storing weekly result for {result['team_name']}: {e}")
        
        logger.info(f"Stored weekly standings for week {week}")
    
    def update_overall_standings(self, season: str) -> None:
        """Update overall season standings by aggregating all weekly results"""
        
        try:
            # Get all weekly results for the season
            all_weeks = self.weekly_standings_table.scan(
                FilterExpression=boto3.dynamodb.conditions.Attr('season_week').begins_with(f'{season}_')
            )
            
            # Aggregate by team
            team_totals = {}
            
            for item in all_weeks['Items']:
                team_id = item['team_id']
                team_name = item['team_name']
                wins = int(item['wins'])
                losses = int(item['losses'])
                points = float(item['points'])
                rank = int(item['rank'])
                
                if team_id not in team_totals:
                    team_totals[team_id] = {
                        'team_name': team_name,
                        'total_wins': 0,
                        'total_losses': 0,
                        'total_points': 0.0,
                        'top_finishes': 0  # For $25 tracking
                    }
                
                team_totals[team_id]['total_wins'] += wins
                team_totals[team_id]['total_losses'] += losses
                team_totals[team_id]['total_points'] += points
                
                # Track first place finishes for earnings
                if rank == 1:
                    team_totals[team_id]['top_finishes'] += 1
            
            # Store aggregated results
            for team_id, totals in team_totals.items():
                total_games = totals['total_wins'] + totals['total_losses']
                win_percentage = totals['total_wins'] / total_games if total_games > 0 else 0
                
                # Calculate earnings based on top finishes ($25 per first place)
                earnings = f"${totals['top_finishes'] * 25}"
                
                self.overall_standings_table.put_item(Item=self.convert_floats_to_decimal({
                    'season': season,
                    'team_id': team_id,
                    'team_name': totals['team_name'],
                    'total_wins': totals['total_wins'],
                    'total_losses': totals['total_losses'],
                    'total_points': Decimal(str(totals['total_points'])),
                    'win_percentage': Decimal(str(round(win_percentage, 4))),
                    'earnings': earnings,
                    'playoff_percentage': Decimal('0')  # Will be updated by Monte Carlo
                }))
            
            logger.info(f"Updated overall standings for {len(team_totals)} teams")
            
        except Exception as e:
            logger.error(f"Error updating overall standings: {e}")
            raise
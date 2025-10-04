import json
import boto3
import os
import requests
import logging

# Import shared utilities
from ff_utils.dynamodb import convert_floats_to_decimal, DecimalEncoder, get_cors_headers
from ff_utils.auth import validate_admin_key

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
ecs = boto3.client('ecs')
lambda_client = boto3.client('lambda')

def lambda_handler(event, context):
    """
    Enhanced API handler for Fantasy Football vs Everyone:
    - GET /weekly - Get weekly standings
    - GET /overall - Get overall standings  
    - GET /nfl-state - Get current NFL week info
    - GET /polling/status - Get polling status
    - POST /polling/toggle - Start/stop polling service
    - POST /calculate-playoffs - Run Monte Carlo simulation
    - POST /sync-historical - Backfill historical data
    - GET /projections - Get player projections for a given week
    - GET /team-projections - Get projections for a specific team's players
    """
    
    path = event.get('path', '')
    http_method = event.get('httpMethod', 'GET')
    query_params = event.get('queryStringParameters') or {}
    
    # Initialize DynamoDB tables
    weekly_standings_table = dynamodb.Table(os.environ['WEEKLY_STANDINGS_TABLE'])
    overall_standings_table = dynamodb.Table(os.environ['OVERALL_STANDINGS_TABLE'])
    league_data_table = dynamodb.Table(os.environ['LEAGUE_DATA_TABLE'])
    polling_state_table = dynamodb.Table(os.environ['POLLING_STATE_TABLE'])
    
    try:
        # Weekly standings endpoint
        if 'weekly' in path and http_method == 'GET':
            return handle_weekly_standings(weekly_standings_table, query_params)
        
        # Overall standings endpoint
        elif 'overall' in path and http_method == 'GET':
            return handle_overall_standings(overall_standings_table, query_params)
        
        # NFL state endpoint
        elif 'nfl-state' in path and http_method == 'GET':
            return handle_nfl_state()
        
        # Polling status endpoint
        elif 'polling/status' in path and http_method == 'GET':
            return handle_polling_status(polling_state_table)
        
        # Polling toggle endpoint (admin only)
        elif 'polling/toggle' in path and http_method == 'POST':
            if not validate_admin_key(event):
                return {
                    'statusCode': 401,
                    'headers': get_cors_headers(),
                    'body': json.dumps({'error': 'Admin access required'})
                }
            return handle_polling_toggle(polling_state_table, context)
        
        # Calculate playoffs endpoint (admin only)
        elif 'calculate-playoffs' in path and http_method == 'POST':
            if not validate_admin_key(event):
                return {
                    'statusCode': 401,
                    'headers': get_cors_headers(),
                    'body': json.dumps({'error': 'Admin access required'})
                }
            return handle_calculate_playoffs(context)
        
        # Sync historical data endpoint (admin only)
        elif 'sync-historical' in path and http_method == 'POST':
            if not validate_admin_key(event):
                return {
                    'statusCode': 401,
                    'headers': get_cors_headers(),
                    'body': json.dumps({'error': 'Admin access required'})
                }
            return handle_sync_historical(context)
        
        # Fetch players endpoint (admin only)
        elif 'players' in path and http_method == 'GET':
            if not validate_admin_key(event):
                return {
                    'statusCode': 401,
                    'headers': get_cors_headers(),
                    'body': json.dumps({'error': 'Admin access required'})
                }
            return handle_fetch_players()
        
        # Team projections endpoint
        elif 'team-projections' in path and http_method == 'GET':
            return handle_team_projections(weekly_standings_table, query_params)
        
        # Projections endpoint
        elif 'projections' in path and http_method == 'GET':
            return handle_projections(league_data_table, query_params)
        
        # Admin validation endpoint
        elif 'admin/validate' in path and http_method == 'POST':
            return handle_admin_validate(event)
        
        else:
            return {
                'statusCode': 404,
                'headers': get_cors_headers(),
                'body': json.dumps({'error': 'Not found'})
            }
    
    except Exception as e:
        logger.error(f"API Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': get_cors_headers(),
            'body': json.dumps({'error': 'Internal server error'})
        }

def handle_weekly_standings(table, query_params):
    """Get weekly standings for specified week"""
    week = query_params.get('week', '1')
    season = query_params.get('season', '2025')
    
    response = table.query(
        KeyConditionExpression=boto3.dynamodb.conditions.Key('season_week').eq(f"{season}_{week}"),
        ScanIndexForward=True
    )
    
    # Sort by rank
    standings = sorted(response['Items'], key=lambda x: x.get('rank', 999))
    
    return {
        'statusCode': 200,
        'headers': get_cors_headers(),
        'body': json.dumps({
            'week': int(week),
            'season': season,
            'standings': standings
        }, cls=DecimalEncoder)
    }

def handle_overall_standings(table, query_params):
    """Get overall standings for season"""
    season = query_params.get('season', '2025')
    
    response = table.query(
        KeyConditionExpression=boto3.dynamodb.conditions.Key('season').eq(season)
    )
    
    # Sort by win percentage (descending), then by total points (descending)
    standings = sorted(
        response['Items'], 
        key=lambda x: (float(x.get('win_percentage', 0)), float(x.get('total_points', 0))),
        reverse=True
    )
    
    # Add rank based on sorted order
    for i, team in enumerate(standings, 1):
        team['current_rank'] = i
    
    return {
        'statusCode': 200,
        'headers': get_cors_headers(),
        'body': json.dumps({
            'season': season,
            'standings': standings
        }, cls=DecimalEncoder)
    }

def handle_nfl_state():
    """Get current NFL state from Sleeper API"""
    try:
        response = requests.get('https://api.sleeper.app/v1/state/nfl', timeout=10)
        response.raise_for_status()
        nfl_state = response.json()
        
        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'season': nfl_state.get('season'),
                'week': nfl_state.get('week'),
                'season_type': nfl_state.get('season_type'),
                'display_week': nfl_state.get('display_week')
            })
        }
    except requests.RequestException as e:
        logger.error(f"Failed to fetch NFL state: {e}")
        return {
            'statusCode': 500,
            'headers': get_cors_headers(),
            'body': json.dumps({'error': 'Failed to fetch NFL state'})
        }

def handle_polling_status(table):
    """Get current polling status from DynamoDB"""
    try:
        response = table.get_item(Key={'id': 'polling_status'})
        item = response.get('Item', {})

        # Return the enabled status from DynamoDB
        # The polling service checks this value to know whether to continue polling
        enabled = item.get('enabled', False)

        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'enabled': enabled,
                'last_updated': item.get('last_updated', '')
            })
        }
    except Exception as e:
        logger.error(f"Failed to get polling status: {e}")
        return {
            'statusCode': 500,
            'headers': get_cors_headers(),
            'body': json.dumps({'error': f'Failed to get polling status: {str(e)}'})
        }

def handle_polling_toggle(table, context=None):
    """Start or stop the polling Fargate service with rollback on failure"""
    try:
        # Get current status
        response = table.get_item(Key={'id': 'polling_status'})
        current_item = response.get('Item', {})
        current_enabled = current_item.get('enabled', False)
        
        # Toggle the status
        new_enabled = not current_enabled
        cluster_arn = os.environ['ECS_CLUSTER_ARN']
        
        if new_enabled:
            # Starting polling service - try ECS operation first, then update DynamoDB
            subnet_ids = os.environ['SUBNET_IDS'].split(',')
            security_group_id = os.environ['SECURITY_GROUP_ID']
            task_definition_arn = os.environ['POLLING_TASK_DEFINITION_ARN']
            
            try:
                ecs_response = ecs.run_task(
                    cluster=cluster_arn,
                    taskDefinition=task_definition_arn,
                    launchType='FARGATE',
                    networkConfiguration={
                        'awsvpcConfiguration': {
                            'subnets': subnet_ids,
                            'securityGroups': [security_group_id],
                            'assignPublicIp': 'ENABLED'
                        }
                    },
                    tags=[
                        {'key': 'Service', 'value': 'ff-polling'},
                        {'key': 'ManagedBy', 'value': 'api-handler'}
                    ]
                )
                
                # Check if task actually started successfully
                if ecs_response.get('failures'):
                    failure_reasons = [f['reason'] for f in ecs_response['failures']]
                    raise Exception(f"ECS task failed to start: {', '.join(failure_reasons)}")
                
                # Success - update DynamoDB state
                table.put_item(Item={
                    'id': 'polling_status',
                    'enabled': new_enabled,
                    'last_updated': getattr(context, 'aws_request_id', 'manual') if context else 'manual',
                    'task_arn': ecs_response['tasks'][0]['taskArn'] if ecs_response.get('tasks') else None
                })
                
                message = 'Polling service started successfully'
                
            except Exception as ecs_error:
                # ECS failed - don't update DynamoDB, re-raise error
                logger.error(f"ECS run_task failed: {ecs_error}")
                raise Exception(f"Failed to start polling service: {str(ecs_error)}")
                
        else:
            # Stopping polling service - update DynamoDB first, then try to stop tasks
            table.put_item(Item={
                'id': 'polling_status',
                'enabled': new_enabled,
                'last_updated': getattr(context, 'aws_request_id', 'manual') if context else 'manual'
            })
            
            try:
                tasks = ecs.list_tasks(
                    cluster=cluster_arn,
                    family='ff-polling-service',
                    desiredStatus='RUNNING'
                )
                
                if len(tasks['taskArns']) == 0:
                    message = 'No polling tasks were running'
                else:
                    for task_arn in tasks['taskArns']:
                        ecs.stop_task(
                            cluster=cluster_arn,
                            task=task_arn,
                            reason='Manual stop via API'
                        )
                    message = f'Stopped {len(tasks["taskArns"])} polling task(s)'
                    
            except Exception as stop_error:
                # Stop failed, but DynamoDB is already updated (which is okay for stopping)
                logger.warning(f"Failed to stop some tasks: {stop_error}")
                message = 'Polling disabled (some tasks may still be running)'
        
        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'enabled': new_enabled,
                'message': message
            })
        }
        
    except Exception as e:
        logger.error(f"Failed to toggle polling: {e}")
        return {
            'statusCode': 500,
            'headers': get_cors_headers(),
            'body': json.dumps({'error': 'Failed to toggle polling'})
        }

def handle_calculate_playoffs(context=None):
    """Invoke Monte Carlo Lambda function for playoff simulation"""
    try:
        function_name = os.environ['MONTE_CARLO_FUNCTION']
        
        # Invoke Monte Carlo Lambda function asynchronously
        lambda_client.invoke(
            FunctionName=function_name,
            InvocationType='Event',  # Async
            Payload=json.dumps({
                'source': 'api-manual-trigger',
                'trigger_time': getattr(context, 'aws_request_id', 'manual') if context else 'manual'
            })
        )
        
        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'message': 'Monte Carlo simulation started'
            })
        }
        
    except Exception as e:
        logger.error(f"Failed to start Monte Carlo simulation: {e}")
        return {
            'statusCode': 500,
            'headers': get_cors_headers(),
            'body': json.dumps({'error': 'Failed to start Monte Carlo simulation'})
        }

def handle_sync_historical(context=None):
    """Trigger historical data backfill"""
    try:
        function_name = os.environ['HISTORICAL_BACKFILL_FUNCTION']
        
        # Invoke historical backfill Lambda asynchronously
        lambda_client.invoke(
            FunctionName=function_name,
            InvocationType='Event',  # Async
            Payload=json.dumps({
                'source': 'api-manual-trigger',
                'trigger_time': getattr(context, 'aws_request_id', 'manual') if context else 'manual'
            })
        )
        
        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'message': 'Historical data sync started'
            })
        }
        
    except Exception as e:
        logger.error(f"Failed to start historical sync: {e}")
        return {
            'statusCode': 500,
            'headers': get_cors_headers(),
            'body': json.dumps({'error': 'Failed to start historical sync'})
        }

def handle_admin_validate(event):
    """Validate admin API key"""
    if validate_admin_key(event):
        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({'message': 'Valid admin key'})
        }
    else:
        return {
            'statusCode': 401,
            'headers': get_cors_headers(),
            'body': json.dumps({'error': 'Invalid admin key'})
        }

def handle_team_projections(weekly_standings_table, query_params):
    """Get projections for a specific team's players"""
    try:
        # Extract parameters
        team_id = query_params.get('team_id')
        season = query_params.get('season', '2025')
        week = query_params.get('week')
        season_type = query_params.get('season_type', 'regular')
        
        if not team_id or not week:
            return {
                'statusCode': 400,
                'headers': get_cors_headers(),
                'body': json.dumps({'error': 'Missing required parameters: team_id and week'})
            }
        
        # First, get the team's roster from weekly standings
        logger.info(f"Fetching roster for team {team_id} in week {week}")
        
        response = weekly_standings_table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key('season_week').eq(f"{season}_{week}")
        )
        
        # Find the specific team
        team_data = None
        for item in response.get('Items', []):
            if item.get('team_id') == team_id:
                team_data = item
                break
        
        if not team_data:
            return {
                'statusCode': 404,
                'headers': get_cors_headers(),
                'body': json.dumps({'error': f'Team {team_id} not found in week {week}'})
            }
        
        # Extract player IDs from the roster
        roster = team_data.get('roster', [])
        player_ids = [player.get('player_id') for player in roster if player.get('player_id')]
        
        if not player_ids:
            return {
                'statusCode': 200,
                'headers': get_cors_headers(),
                'body': json.dumps({
                    'team_id': team_id,
                    'team_name': team_data.get('team_name', ''),
                    'week': int(week),
                    'season': season,
                    'projections': []
                })
            }
        
        # Now fetch all projections for the week
        logger.info(f"Fetching projections from Sleeper API for season {season}, week {week}")
        
        positions = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'DST']
        position_params = '&'.join([f'position[]={pos}' for pos in positions])
        url = f"https://api.sleeper.app/v1/projections/nfl/{season}/{week}?season_type={season_type}&{position_params}&order_by=ppr"
        
        response = requests.get(url, timeout=15)
        response.raise_for_status()
        all_projections = response.json()
        
        # Filter projections to only include players on this team
        team_projections = [proj for proj in all_projections if proj.get('player_id') in player_ids]
        
        # Combine roster info with projections
        enriched_projections = []
        for player in roster:
            player_id = player.get('player_id')
            if player_id:
                # Find the projection for this player
                projection = next((proj for proj in team_projections if proj.get('player_id') == player_id), None)
                
                if projection:
                    # Merge roster info with projection
                    enriched_projection = {
                        **projection,
                        'roster_position': player.get('position'),
                        'player_name': player.get('player'),
                        'actual_points': player.get('points', 0)
                    }
                    enriched_projections.append(enriched_projection)
        
        logger.info(f"Found {len(enriched_projections)} projections for team {team_id}")
        
        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'team_id': team_id,
                'team_name': team_data.get('team_name', ''),
                'week': int(week),
                'season': season,
                'season_type': season_type,
                'player_count': len(roster),
                'projections_count': len(enriched_projections),
                'projections': enriched_projections
            })
        }
        
    except requests.RequestException as e:
        logger.error(f"Failed to fetch projections from Sleeper API: {e}")
        return {
            'statusCode': 500,
            'headers': get_cors_headers(),
            'body': json.dumps({'error': f'Failed to fetch projections: {str(e)}'})
        }
    except Exception as e:
        logger.error(f"Error handling team projections request: {e}")
        return {
            'statusCode': 500,
            'headers': get_cors_headers(),
            'body': json.dumps({'error': 'Internal server error'})
        }

def handle_projections(league_data_table, query_params):
    """Get player projections for a given season and week"""
    try:
        # Extract parameters
        season = query_params.get('season', '2025')
        week = query_params.get('week')
        season_type = query_params.get('season_type', 'regular')
        
        if not week:
            return {
                'statusCode': 400,
                'headers': get_cors_headers(),
                'body': json.dumps({'error': 'Missing required parameter: week'})
            }
        
        # Fetch data from Sleeper API
        logger.info(f"Fetching projections from Sleeper API for season {season}, week {week}")
        
        # Positions we care about (no kickers per league rules)
        positions = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'DST']
        position_params = '&'.join([f'position[]={pos}' for pos in positions])
        
        url = f"https://api.sleeper.app/v1/projections/nfl/{season}/{week}?season_type={season_type}&{position_params}&order_by=ppr"
        
        response = requests.get(url, timeout=15)
        response.raise_for_status()
        projections = response.json()
        
        logger.info(f"Fetched {len(projections)} player projections")
        
        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'season': season,
                'week': int(week),
                'season_type': season_type,
                'count': len(projections),
                'projections': projections
            })
        }
        
    except requests.RequestException as e:
        logger.error(f"Failed to fetch projections from Sleeper API: {e}")
        return {
            'statusCode': 500,
            'headers': get_cors_headers(),
            'body': json.dumps({'error': f'Failed to fetch projections: {str(e)}'})
        }
    except Exception as e:
        logger.error(f"Error handling projections request: {e}")
        return {
            'statusCode': 500,
            'headers': get_cors_headers(),
            'body': json.dumps({'error': 'Internal server error'})
        }

def handle_fetch_players():
    """Fetch all NFL players data from Sleeper API and store in DynamoDB using chunked storage"""
    try:
        # Get current season from NFL state
        logger.info("Fetching NFL state...")
        nfl_state_response = requests.get('https://api.sleeper.app/v1/state/nfl', timeout=30)
        nfl_state_response.raise_for_status()
        season = nfl_state_response.json().get('season', '2025')
        
        # Fetch players data from Sleeper API
        logger.info("Fetching players data from Sleeper API...")
        response = requests.get('https://api.sleeper.app/v1/players/nfl', timeout=30)
        response.raise_for_status()
        players_data = response.json()
        
        # Store in DynamoDB league data table using chunked approach
        league_data_table = dynamodb.Table(os.environ['LEAGUE_DATA_TABLE'])
        
        logger.info(f"Filtering and storing {len(players_data)} players in DynamoDB using chunked storage...")
        
        # Filter to only essential fields and only players on teams
        essential_fields = ['first_name', 'last_name', 'position', 'team']
        
        # Convert players dict to filtered list for chunking
        players_list = []
        filtered_count = 0
        for pid, data in players_data.items():
            # Only include players that are on a team (team is not None/null)
            if data.get('team') is not None:
                filtered_player = {'player_id': pid}
                
                # Add only essential fields if they exist
                for field in essential_fields:
                    if field in data:
                        filtered_player[field] = data[field]
                
                players_list.append(filtered_player)
                filtered_count += 1
        
        logger.info(f"Filtered {len(players_data)} total players down to {filtered_count} active players on teams")
        
        # Convert filtered list back to dict format for storage
        filtered_players_dict = {player['player_id']: {k: v for k, v in player.items() if k != 'player_id'} 
                                for player in players_list}
        
        # Store filtered players in single DynamoDB item (fits easily under 400KB limit)
        logger.info(f"Storing {len(filtered_players_dict)} filtered players in single DynamoDB item...")
        league_data_table.put_item(Item=convert_floats_to_decimal({
            'data_type': 'players',
            'id': 'nfl_players',
            'season': season,
            'data': filtered_players_dict,
            'player_count': len(filtered_players_dict),
            'storage_strategy': 'filtered_v1',
            'filtering_info': {
                'original_count': len(players_data),
                'filtered_count': len(filtered_players_dict),
                'fields_kept': essential_fields,
                'filter_criteria': 'active_players_on_teams_only'
            }
        }))
        
        success_message = f"Successfully stored {len(filtered_players_dict)} active players (filtered from {len(players_data)} total)"
        logger.info(success_message)
        
        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'message': success_message,
                'players_count': len(filtered_players_dict),
                'original_count': len(players_data),
                'reduction_percent': round((1 - len(filtered_players_dict)/len(players_data)) * 100, 1),
                'season': season
            })
        }
        
    except requests.RequestException as e:
        logger.error(f"Failed to fetch data from Sleeper API: {e}")
        return {
            'statusCode': 500,
            'headers': get_cors_headers(),
            'body': json.dumps({'error': f'Failed to fetch data from Sleeper API: {str(e)}'})
        }
    except Exception as e:
        logger.error(f"Failed to store players data in DynamoDB: {e}")
        return {
            'statusCode': 500,
            'headers': get_cors_headers(),
            'body': json.dumps({'error': f'Failed to store players data: {str(e)}'})
        }
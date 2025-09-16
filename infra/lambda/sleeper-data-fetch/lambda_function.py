import json
import boto3
import requests
import os
import time
import logging
from datetime import datetime

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
lambda_client = boto3.client('lambda')

def lambda_handler(event, context):
    """
    Fetch data from Sleeper API and store in DynamoDB.
    Self-invoke if polling is still enabled.
    """
    
    league_id = os.environ['SLEEPER_LEAGUE_ID']
    polling_table = dynamodb.Table(os.environ['POLLING_STATE_TABLE'])
    league_data_table = dynamodb.Table(os.environ['LEAGUE_DATA_TABLE'])
    
    try:
        # Check if polling is still enabled
        polling_status = polling_table.get_item(Key={'id': 'polling_status'})
        if not polling_status.get('Item', {}).get('enabled', False):
            logger.info("Polling is disabled, stopping chain")
            return {
                'statusCode': 200,
                'body': json.dumps({'message': 'Polling stopped'})
            }
        
        logger.info(f"Fetching data for league {league_id}")
        
        # Fetch league data from Sleeper API
        base_url = "https://api.sleeper.app/v1"
        
        # Get current week (simplified - in production we'd get this from league info)
        current_week = 1  # TODO: Get from league data or calculate
        
        # Fetch league info
        league_response = requests.get(f"{base_url}/league/{league_id}")
        league_data = league_response.json()
        
        # Fetch users
        users_response = requests.get(f"{base_url}/league/{league_id}/users")
        users_data = users_response.json()
        
        # Fetch rosters
        rosters_response = requests.get(f"{base_url}/league/{league_id}/rosters")
        rosters_data = rosters_response.json()
        
        # Fetch matchups for current week
        matchups_response = requests.get(f"{base_url}/league/{league_id}/matchups/{current_week}")
        matchups_data = matchups_response.json()
        
        # Store data in DynamoDB
        current_time = datetime.utcnow().isoformat()
        
        # Store league info
        league_data_table.put_item(Item={
            'data_type': 'league_info',
            'id': league_id,
            'data': league_data,
            'updated_at': current_time
        })
        
        # Store users
        for user in users_data:
            league_data_table.put_item(Item={
                'data_type': 'users',
                'id': user['user_id'],
                'data': user,
                'updated_at': current_time
            })
        
        # Store rosters
        for roster in rosters_data:
            league_data_table.put_item(Item={
                'data_type': 'rosters',
                'id': str(roster['roster_id']),
                'data': roster,
                'updated_at': current_time
            })
        
        # Store matchups
        for matchup in matchups_data:
            league_data_table.put_item(Item={
                'data_type': f'matchups_week_{current_week}',
                'id': str(matchup['roster_id']),
                'data': matchup,
                'week': current_week,
                'updated_at': current_time
            })
        
        # Update polling status with last poll time
        polling_table.update_item(
            Key={'id': 'polling_status'},
            UpdateExpression='SET last_poll = :time',
            ExpressionAttributeValues={':time': current_time}
        )
        
        logger.info(f"Successfully stored data for {len(users_data)} users, {len(rosters_data)} rosters, {len(matchups_data)} matchups")
        
        # Trigger standings calculation
        lambda_client.invoke(
            FunctionName=os.environ['CALCULATE_STANDINGS_FUNCTION'],
            InvocationType='Event'
        )
        
        # Wait 10 seconds then self-invoke if still polling
        time.sleep(10)
        
        # Check polling status again
        polling_status = polling_table.get_item(Key={'id': 'polling_status'})
        if polling_status.get('Item', {}).get('enabled', False):
            lambda_client.invoke(
                FunctionName=context.function_name,
                InvocationType='Event'
            )
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Data fetched successfully',
                'users_count': len(users_data),
                'rosters_count': len(rosters_data),
                'matchups_count': len(matchups_data)
            })
        }
    
    except Exception as e:
        logger.error(f"Error fetching Sleeper data: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }
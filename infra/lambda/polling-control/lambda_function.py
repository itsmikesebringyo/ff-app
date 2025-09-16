import json
import boto3
import os
import logging
from datetime import datetime

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
lambda_client = boto3.client('lambda')

def lambda_handler(event, context):
    """
    Handle polling control operations:
    - GET /polling/status - Get current polling status
    - POST /polling/toggle - Toggle polling on/off
    - POST /polling/start - Start polling chain
    """
    
    http_method = event.get('httpMethod', 'GET')
    path = event.get('path', '/polling/status')
    
    polling_table = dynamodb.Table(os.environ['POLLING_STATE_TABLE'])
    
    try:
        if http_method == 'GET':
            # Get current polling status
            response = polling_table.get_item(Key={'id': 'polling_status'})
            
            if 'Item' in response:
                return {
                    'statusCode': 200,
                    'headers': {'Content-Type': 'application/json'},
                    'body': json.dumps(response['Item'])
                }
            else:
                # Initialize polling state
                initial_state = {
                    'id': 'polling_status',
                    'enabled': False,
                    'last_updated': datetime.utcnow().isoformat(),
                    'last_poll': None
                }
                polling_table.put_item(Item=initial_state)
                return {
                    'statusCode': 200,
                    'headers': {'Content-Type': 'application/json'},
                    'body': json.dumps(initial_state)
                }
        
        elif http_method == 'POST' and 'toggle' in path:
            # Toggle polling state
            response = polling_table.get_item(Key={'id': 'polling_status'})
            current_state = response.get('Item', {'enabled': False})
            
            new_enabled = not current_state.get('enabled', False)
            updated_state = {
                'id': 'polling_status',
                'enabled': new_enabled,
                'last_updated': datetime.utcnow().isoformat(),
                'last_poll': current_state.get('last_poll')
            }
            
            polling_table.put_item(Item=updated_state)
            
            # If enabling, start the polling chain
            if new_enabled:
                lambda_client.invoke(
                    FunctionName=os.environ['SLEEPER_DATA_FETCH_FUNCTION'],
                    InvocationType='Event'
                )
            
            return {
                'statusCode': 200,
                'headers': {'Content-Type': 'application/json'},
                'body': json.dumps(updated_state)
            }
        
        else:
            return {
                'statusCode': 405,
                'headers': {'Content-Type': 'application/json'},
                'body': json.dumps({'error': 'Method not allowed'})
            }
    
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'error': 'Internal server error'})
        }
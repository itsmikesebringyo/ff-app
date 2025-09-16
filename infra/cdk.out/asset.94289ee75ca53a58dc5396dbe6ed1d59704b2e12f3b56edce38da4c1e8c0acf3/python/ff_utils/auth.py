"""
Authentication utilities for Fantasy Football API.
Shared functions for admin key validation and security.
"""

import os


def validate_admin_key(event):
    """
    Validate admin API key from request headers.
    
    Checks the X-Admin-Key header against the configured admin key
    from environment variables. Handles case-insensitive header names.
    
    Args:
        event: AWS Lambda event object containing headers
        
    Returns:
        bool: True if admin key is valid, False otherwise
    """
    admin_key = os.environ.get('ADMIN_API_KEY')
    if not admin_key:
        return False
    
    # Check both possible header name formats (AWS Gateway normalizes differently)
    request_key = (
        event.get('headers', {}).get('x-admin-key') or 
        event.get('headers', {}).get('X-Admin-Key')
    )
    
    return request_key == admin_key
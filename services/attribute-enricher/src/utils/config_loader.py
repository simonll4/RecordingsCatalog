"""Configuration loader with environment variable support."""

import os
import yaml
import re
from typing import Any, Dict


def _expand_env_vars(value: Any) -> Any:
    """Recursively expand environment variables in config values.
    
    Supports format: ${VAR_NAME:default_value}
    """
    if isinstance(value, str):
        # Pattern: ${VAR_NAME:default}
        pattern = r'\$\{([^:}]+)(?::([^}]*))?\}'
        
        def replacer(match):
            var_name = match.group(1)
            default = match.group(2) if match.group(2) is not None else ""
            return os.environ.get(var_name, default)
        
        return re.sub(pattern, replacer, value)
    elif isinstance(value, dict):
        return {k: _expand_env_vars(v) for k, v in value.items()}
    elif isinstance(value, list):
        return [_expand_env_vars(item) for item in value]
    else:
        return value


def load_config(config_path: str = "config.yaml") -> Dict[str, Any]:
    """Load configuration from YAML file with environment variable expansion.
    
    Parameters
    ----------
    config_path : str
        Path to the YAML configuration file
        
    Returns
    -------
    dict
        Configuration dictionary with expanded environment variables
    """
    with open(config_path, 'r', encoding='utf-8') as f:
        config = yaml.safe_load(f)
    
    # Expand environment variables
    config = _expand_env_vars(config)
    
    # Convert string numbers to appropriate types
    def convert_types(obj):
        if isinstance(obj, dict):
            return {k: convert_types(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [convert_types(item) for item in obj]
        elif isinstance(obj, str):
            # Try to convert to int or float
            try:
                if '.' in obj:
                    return float(obj)
                else:
                    return int(obj)
            except ValueError:
                # Check for boolean
                if obj.lower() in ('true', 'yes', 'on'):
                    return True
                elif obj.lower() in ('false', 'no', 'off'):
                    return False
                return obj
        else:
            return obj
    
    return convert_types(config)


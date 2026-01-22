"""
V0.6 Workers System - Engineer Compatibility Layer

DEPRECATED: Engineers are now unified with Workers in worker.py
Use Worker model with worker_type='engineer' instead.

This file provides backwards compatibility for existing imports.
"""

# Re-export Worker as Engineer for backwards compatibility
from app.models.worker import Worker

# Engineer is now just a Worker with worker_type='engineer'
# Keep this alias for any code that still imports Engineer
Engineer = Worker

__all__ = ['Engineer']

import re

with open('server.ts', 'r') as f:
    content = f.read()

# Let's write functions for syncing just the delta.

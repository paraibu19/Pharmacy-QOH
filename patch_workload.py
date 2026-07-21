import sys

with open('server.ts', 'r') as f:
    content = f.read()

target = """    const allDocData: any[] = [];
    let iterations = 0;
    
    while (hasMore && iterations < 20) { // Max 20 * 50 = 1000 chunks (1 million records)"""

replacement = """    const allDocData: any[] = [];
    let iterations = 0;
    
    while (hasMore && iterations < 5) { // Limit to 5 iterations initially for stability"""

if target in content:
    with open('server.ts', 'w') as f:
        f.write(content.replace(target, replacement))
    print("PATCH1_SUCCESS")
else:
    print("TARGET1_NOT_FOUND")


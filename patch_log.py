with open('server.ts', 'r') as f:
    content = f.read()

import_fs = "import fs from 'fs';"
if import_fs in content:
    inject = """const logFile = fs.createWriteStream('server_debug.log', { flags: 'a' });
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
console.log = function (...args) {
  logFile.write(args.join(' ') + '\\n');
  originalConsoleLog.apply(console, args);
};
console.error = function (...args) {
  logFile.write('ERROR: ' + args.join(' ') + '\\n');
  originalConsoleError.apply(console, args);
};
"""
    content = content.replace(import_fs, import_fs + "\n" + inject)
    with open('server.ts', 'w') as f:
        f.write(content)

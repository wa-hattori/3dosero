#!/usr/bin/env node
'use strict';

/**
 * PostToolUse hook (matcher: Edit|Write).
 *
 * Non-blocking check: warns when a *.js file just written/edited still
 * contains console.log(...) or a debugger statement (see
 * .claude/rules/javascript/style-guide.md). The tool has already run, so
 * this never blocks anything — it only surfaces a warning to the user
 * (systemMessage) and back to the model (hookSpecificOutput.additionalContext).
 */

const fs = require('fs');

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
  });
}

(async () => {
  let payload;
  try {
    payload = JSON.parse(await readStdin());
  } catch {
    process.exit(0);
    return;
  }

  const filePath = payload && payload.tool_input && payload.tool_input.file_path;
  if (typeof filePath !== 'string' || !filePath.endsWith('.js')) {
    process.exit(0);
    return;
  }

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    process.exit(0);
    return;
  }

  const hits = [];
  if (/console\.log\s*\(/.test(content)) hits.push('console.log(...)');
  if (/\bdebugger\b/.test(content)) hits.push('debugger');

  if (hits.length === 0) {
    process.exit(0);
    return;
  }

  const message = `⚠️ ${filePath} に ${hits.join(' / ')} が残っています（本番コードには残さない方針）。`;
  process.stdout.write(JSON.stringify({
    systemMessage: message,
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: message,
    },
  }));
  process.exit(0);
})();

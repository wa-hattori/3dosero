#!/usr/bin/env node
'use strict';

/**
 * PreToolUse hook (matcher: Bash).
 *
 * Validates `git commit` messages against the Angular commit message
 * convention (see .claude/rules/common/git-workflow.md) and blocks
 * non-conforming commits before they run.
 *
 * Contract: reads the hook payload (JSON) from stdin. To block the tool
 * call, writes {"hookSpecificOutput": {"hookEventName": "PreToolUse",
 * "permissionDecision": "deny", "permissionDecisionReason": "..."}} to
 * stdout and exits 0. To allow, exits 0 with no output (falls through to
 * normal permission handling).
 */

const COMMIT_TYPES = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'chore'];
const HEADER_RE = new RegExp(`^(${COMMIT_TYPES.join('|')})(\\([\\w.-]+\\))?: (.+)$`);

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
  });
}

function allow() {
  process.exit(0);
}

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
}

/**
 * Extracts the first quoted -m/--message argument's first line from a shell
 * command string. Handles combined short flags ending in "m" (e.g. "-am").
 * Returns null when no quoted message can be found (editor-based commit, or
 * a quoting style this regex can't parse) so the caller allows the command
 * through rather than risk a false block.
 */
function extractHeader(command) {
  const match = command.match(/-{1,2}(?:[a-zA-Z]*m|message)(?:[ =]+)(["'])([\s\S]*?)\1/);
  if (!match) return null;
  return match[2].split('\n')[0];
}

(async () => {
  let payload;
  try {
    payload = JSON.parse(await readStdin());
  } catch {
    return allow(); // can't parse our own input; don't block on that
  }

  const command = payload && payload.tool_input && payload.tool_input.command;
  if (typeof command !== 'string' || !/\bgit\b[^|;&\n]*\bcommit\b/.test(command)) {
    return allow();
  }

  const header = extractHeader(command);
  if (header === null) return allow();

  if (header.length > 100) {
    return deny(
      `コミットメッセージのヘッダーが100文字を超えています（${header.length}文字）。` +
      'Angular commit規約（.claude/rules/common/git-workflow.md）に従い100文字以内にしてください。'
    );
  }

  const match = header.match(HEADER_RE);
  if (!match) {
    return deny(
      `コミットメッセージ "${header}" が Angular commit規約に従っていません。\n` +
      '形式: <type>(<scope>): <subject>\n' +
      `type は次のいずれか: ${COMMIT_TYPES.join(', ')}\n` +
      '詳細: .claude/rules/common/git-workflow.md'
    );
  }

  const subject = match[3];
  if (/\.$/.test(subject)) {
    return deny(`コミットメッセージのsubjectの末尾にピリオドを付けないでください: "${subject}"`);
  }
  if (/^[A-Z]/.test(subject)) {
    return deny(`コミットメッセージのsubjectは先頭を大文字にしないでください: "${subject}"`);
  }

  return allow();
})();

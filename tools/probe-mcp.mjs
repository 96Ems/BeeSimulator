/**
 * Smoke-test a stdio MCP server: spawn it, run the handshake, list tools, then shut down.
 *
 *   node tools/probe-mcp.mjs npx @browsermcp/mcp@latest
 *
 * Exists because "the package resolves on npm" is not the same as "the server starts and
 * speaks MCP". Cheap to run, and it reports the server's own stderr when it fails.
 */

import { spawn } from "node:child_process";

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("usage: node tools/probe-mcp.mjs <command> [args...]");
  process.exit(2);
}

const child = spawn(command, args, {
  stdio: ["pipe", "pipe", "pipe"],
  shell: process.platform === "win32", // npx is a .cmd shim on Windows
});

let stdout = "";
let stderr = "";
let settled = false;

child.stdout.on("data", (chunk) => {
  stdout += chunk.toString();
  if (stdout.includes('"id":2') && !settled) {
    settled = true;
    finish();
  }
});
child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});

child.on("error", (error) => {
  if (!settled) {
    settled = true;
    console.log(`SPAWN FAILED: ${error.message}`);
    process.exit(1);
  }
});

/** Minimal JSON-RPC over stdio, newline-delimited. */
function send(message) {
  child.stdin.write(JSON.stringify(message) + "\n");
}

send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "kn9t-probe", version: "1.0" },
  },
});

// The server may or may not require `notifications/initialized`; sending it is harmless.
setTimeout(() => {
  send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
  send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
}, 400);

function finish() {
  const lines = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    if (parsed.id === 1 && parsed.result?.serverInfo) {
      const info = parsed.result.serverInfo;
      console.log(`\nSERVERS OK   ${info.name} v${info.version}`);
      console.log(`protocol     ${parsed.result.protocolVersion}`);
    }

    if (parsed.id === 2) {
      if (parsed.error) {
        console.log(`TOOLS FAILED ${JSON.stringify(parsed.error)}`);
        break;
      }
      const tools = parsed.result?.tools ?? [];
      console.log(`\nTOOLS (${tools.length}):`);
      for (const tool of tools) {
        console.log(`  ${tool.name.padEnd(22)} ${(tool.description ?? "").slice(0, 72)}`);
      }
    }
  }

  if (stderr.trim()) {
    console.log(`\nSTDERR:\n${stderr.trim().slice(0, 1500)}`);
  }

  child.kill();
  setTimeout(() => process.exit(0), 250);
}

// A server that never answers must not hang the shell.
setTimeout(() => {
  if (!settled) {
    settled = true;
    console.log("TIMEOUT: no tools/list response after 20s");
    console.log(`stdout so far:\n${stdout.slice(0, 800)}`);
    console.log(`stderr so far:\n${stderr.slice(0, 1500)}`);
    child.kill();
    process.exit(1);
  }
}, 20_000);

/**
 * Encoding hygiene check.
 *
 * Guards against the corruption that a Windows PowerShell `Get-Content` / `Set-Content`
 * round-trip introduces. PowerShell reads and writes with the system ANSI code page (CP1252 on
 * a typical Windows install), so a UTF-8 file passed through it becomes double-encoded, gains
 * a BOM, and loses every character that is not representable in CP1252.
 *
 * The failure is nasty because it is invisible in the editor: the source still parses and the
 * tests still pass. It only shows up as garbled text in documentation, or as a lost em dash
 * that nobody notices until they read the comment.
 *
 *   node tools/check-encoding.mjs
 *
 * Exits non-zero if any tracked text file is unhealthy.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** A double-encoded section sign: UTF-8 bytes reinterpreted as CP1252 and re-encoded. */
const DOUBLE_ENCODED = Buffer.from([0xc3, 0x82, 0xc2, 0xa7]);
/** U+FFFD. Its presence means a lossy conversion already happened, so data is gone. */
const REPLACEMENT_CHAR = Buffer.from([0xef, 0xbf, 0xbd]);
/** UTF-8 BOM. Never wanted in a source file. */
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

const TEXT_EXTENSIONS = [".ts", ".json", ".md", ".mjs", ".js", ".html", ".css"];
const SKIP_DIRECTORIES = new Set(["node_modules", ".git", "dist"]);

function collectTextFiles(directory, found = []) {
  for (const entry of readdirSync(directory)) {
    if (SKIP_DIRECTORIES.has(entry)) continue;

    const path = join(directory, entry);
    if (statSync(path).isDirectory()) collectTextFiles(path, found);
    else if (TEXT_EXTENSIONS.some((extension) => entry.endsWith(extension))) found.push(path);
  }
  return found;
}

const problems = [];

for (const file of collectTextFiles(".")) {
  const bytes = readFileSync(file);
  const normalized = file.replace(/\\/g, "/");

  if (bytes.includes(DOUBLE_ENCODED)) {
    problems.push(`${normalized}: double-encoded UTF-8 (a CP1252 round-trip has been applied)`);
  }
  if (bytes.includes(REPLACEMENT_CHAR)) {
    problems.push(`${normalized}: contains U+FFFD, so data was already lost`);
  }
  if (bytes[0] === BOM[0] && bytes[1] === BOM[1] && bytes[2] === BOM[2]) {
    problems.push(`${normalized}: has a UTF-8 BOM`);
  }
}

if (problems.length > 0) {
  console.error("Encoding problems found:\n");
  for (const problem of problems) console.error("  " + problem);
  console.error(
    "\nDo not edit these files with PowerShell Get-Content / Set-Content.\n" +
      "Use the editor tools, or Node's fs.readFileSync / writeFileSync, which are UTF-8 safe.",
  );
  process.exit(1);
}

console.log("Encoding ok: no double-encoding, no lost characters, no BOMs.");

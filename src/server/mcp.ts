import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { AuditService } from './service.ts';
import { ALL_AUDITS } from '../engine/types.ts';

/**
 * The MCP surface.
 *
 * Three tools and one prompt. The prompt matters as much as the tools: a user
 * who only adds the connector has no skill installed, so the audit procedure
 * has to reach them some other way. An MCP prompt surfaces as a slash command,
 * and it serves the same text the plugin ships as `SKILL.md`, read from the
 * same file at startup — one source, two delivery mechanisms, no chance of the
 * connector path and the plugin path giving different instructions.
 */

const here = dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = resolve(here, '../../plugin/skills/pulse-audit/SKILL.md');

const skillFile = z.object({
  file: z.string().describe('Path relative to the skill folder, e.g. references/rubric.md'),
  content: z.string(),
});

const skillInput = z.object({
  name: z.string(),
  path: z.string().default(''),
  description: z.string().default(''),
  body: z.string().describe('SKILL.md with the frontmatter removed'),
  allowedTools: z.array(z.string()).optional(),
  frontmatter: z.record(z.string(), z.any()).optional(),
  owners: z.array(z.string()).optional(),
  lastCommitAt: z.string().nullable().optional(),
  files: z.array(skillFile).optional().describe('Every other file in the skill folder, dot-directories included'),
  invocations: z.number().nullable().optional(),
});

const reviewerFinding = z.object({
  check: z.string().describe('A check name from the rubric returned by start_audit'),
  skillName: z.string(),
  relatedSkillName: z.string().optional(),
  severity: z.enum(['info', 'low', 'medium', 'high']).optional(),
  headline: z.string().describe('One factual line'),
  evidenceQuote: z.string().describe('The line from the file that convinced you, copied exactly'),
  detail: z.string().optional(),
});

export async function buildMcpServer(
  service: AuditService,
  accountId: string,
): Promise<McpServer> {
  const server = new McpServer({ name: 'atlan-pulse', version: '0.1.0' });

  server.registerTool(
    'start_audit',
    {
      title: 'Start a skill audit',
      description:
        'Measure a set of skills and open an audit run. Returns the deterministic findings, the ' +
        'Pulse Score (fixed from this moment), and a rubric of the questions only a reader can answer. ' +
        'Skill text is not retained.',
      inputSchema: {
        skills: z.array(skillInput).min(1),
        audits: z.array(z.enum(ALL_AUDITS as [string, ...string[]])).optional(),
        turnsPerDay: z.number().positive().optional(),
      },
    },
    async ({ skills, audits, turnsPerDay }) => {
      const result = await service.start({
        accountId,
        skills: skills as never,
        audits: audits as never,
        turnsPerDay,
      });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'submit_audit_findings',
    {
      title: 'Submit reviewer findings',
      description:
        'Add the judgment the measurements could not make. Every finding needs a check name from the ' +
        'rubric and a quote from the file. Findings are excluded from the score by design.',
      inputSchema: {
        runId: z.string(),
        findings: z.array(reviewerFinding).min(1),
      },
    },
    async ({ runId, findings }) => {
      const result = await service.submit(runId, findings as never);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'finish_audit',
    {
      title: 'Finish the audit',
      description:
        'Close the run and return the report URL, the PDF, and — when published — a public card URL ' +
        'carrying the score and no skill names.',
      inputSchema: {
        runId: z.string(),
        publish: z.boolean().optional().describe('Mint a public card URL. Numbers only, never names.'),
      },
    },
    async ({ runId, publish }) => {
      const result = await service.finish(runId, { publish: publish ?? false });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  // The zero-install path: the same procedure the plugin ships, for people who
  // only connected the server.
  const procedure = await readFile(SKILL_PATH, 'utf8').catch(
    () => 'Call start_audit with the user\'s skills, answer the rubric it returns, submit findings with a quote each, then finish_audit.',
  );

  server.registerPrompt(
    'audit',
    {
      title: 'Audit my skills',
      description: 'Run a full Pulse audit over the skills on this machine.',
    },
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Audit my Claude skills with Atlan Pulse, following this procedure exactly:\n\n${procedure}`,
          },
        },
      ],
    }),
  );

  return server;
}

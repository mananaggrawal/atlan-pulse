import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { AuditService } from './service.ts';
import { buildMcpServer } from './mcp.ts';
import { renderReport } from '../report/render.ts';
import { htmlToPdf, htmlToPng } from '../report/pdf.ts';
import { toPublicCard, type RunStore } from '../store/runs.ts';
import type { AccountStore } from '../store/accounts.ts';
import { landingPage, connectPage } from '../report/pages.ts';
import { renderCardHtml, CARD_SIZE } from '../report/card.ts';
import { fontFaceCss } from '../report/fonts.ts';
import { SCORE_WEIGHTS, LISTING_BUDGET_TOKENS, ENGINE_VERSION } from '../engine/constants.ts';

/**
 * The HTTP surface: an MCP endpoint, a report, a PDF, a card, and `/method`.
 *
 * `/method` is public and unauthenticated on purpose. Publishing the weights
 * and thresholds is what separates a benchmark from a vanity metric — anyone
 * can check what a score was computed from, including someone who does not
 * trust us.
 */
export interface AppOptions {
  baseUrl: string;
  /** Local development only: accept MCP calls with no token. */
  allowAnonymous?: boolean;
}

export function createApp(
  service: AuditService,
  store: RunStore,
  accounts: AccountStore,
  options: AppOptions,
) {
  const app = express();
  app.use(express.json({ limit: '12mb' }));

  app.get('/health', (_req, res) => res.json({ ok: true, engine: ENGINE_VERSION }));

  app.get('/', (_req, res) => {
    res.type('html').send(landingPage(options.baseUrl));
  });

  app.get('/fonts.css', (_req, res) => {
    res.type('css').setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(fontFaceCss());
  });

  app.get('/connect', (_req, res) => {
    res.type('html').send(connectPage(options.baseUrl));
  });

  app.post('/api/connect', async (_req, res) => {
    const { account, token } = await accounts.create();
    res.json({
      token,
      accountId: account.accountId,
      mcpUrl: `${options.baseUrl}/api/mcp`,
      note: 'Stored as a hash. It is not shown again.',
    });
  });

  // MCP. A fresh transport per request keeps sessions from leaking between
  // accounts; the SDK supports long-lived sessions and this deliberately
  // does not use them yet.
  app.all('/api/mcp', async (req, res) => {
    const bearer = /^Bearer (.+)$/i.exec(req.get('authorization') ?? '')?.[1];
    const account = accounts.verify(bearer);
    if (!account && !options.allowAnonymous) {
      return res
        .status(401)
        .json({ error: 'Connect first at /connect, then send the token as a bearer header.' });
    }

    const server = await buildMcpServer(service, account?.accountId ?? 'anonymous');
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    return transport.handleRequest(req, res, req.body);
  });

  // Express 5 treats a dot in a path pattern literally and will not split the
  // param at it, so the extension is matched inside the param and stripped here.
  app.get('/r/:file', async (req, res, next) => {
    if (!req.params.file.endsWith('.pdf')) return next();
    const run = await store.get(req.params.file.slice(0, -4));
    if (!run) return res.status(404).send('No such run.');
    const pdf = await htmlToPdf(renderReport(run), {
      footer: `Atlan Pulse · skill health · ${run.deterministic.score.total}/100 · engine ${run.engineVersion}`,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="skill-health-${run.runId.slice(0, 8)}.pdf"`);
    return res.send(pdf);
  });

  app.get('/r/:runId', async (req, res) => {
    const run = await store.get(req.params.runId);
    if (!run) return res.status(404).send('No such run.');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(renderReport(run));
  });

  // A card is three representations of the same numbers: a page to open, an
  // image to unfurl, and JSON for anyone who wants the values.
  app.get('/c/:slug', async (req, res) => {
    const slug = req.params.slug;
    const bare = slug.replace(/\.(png|json)$/, '');
    const run = await store.bySlug(bare);
    const card = run ? toPublicCard(run) : null;
    if (!card) return res.status(404).send('No such card.');

    if (slug.endsWith('.json')) return res.json(card);

    if (slug.endsWith('.png')) {
      const png = await htmlToPng(renderCardHtml(card), CARD_SIZE);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(png);
    }

    const image = `${options.baseUrl}/c/${bare}.png`;
    return res.type('html').send(`<!doctype html><html><head><meta charset="utf-8">
<title>Pulse ${card.total}/100 &mdash; skill health</title>
<meta property="og:title" content="Skill health ${card.total}/100">
<meta property="og:description" content="${card.skillCount} skills &middot; ${card.listingTokens.toLocaleString('en-US')} tokens on every prompt &middot; engine ${card.engineVersion}">
<meta property="og:image" content="${image}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${image}">
<style>body{margin:0;background:#141517;display:flex;align-items:center;justify-content:center;min-height:100vh}
img{max-width:min(1200px,94vw);height:auto;border-radius:12px}</style>
</head><body><a href="${options.baseUrl}"><img src="${image}" alt="Pulse score ${card.total} out of 100"></a></body></html>`);
  });

  app.get('/method', (_req, res) => {
    res.json({
      engineVersion: ENGINE_VERSION,
      listingBudgetTokens: LISTING_BUDGET_TOKENS,
      weights: SCORE_WEIGHTS,
      rules: [
        'Only deterministic checks contribute to the score.',
        'Reviewer findings arrive after the score is written and are shown separately.',
        'Percentiles are suppressed below 30 published runs.',
        'Skill text is not retained; findings, counts and a hash per skill are.',
        'A public card carries numbers and never a skill name.',
      ],
    });
  });

  return app;
}

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import { TimelineEventSchema, MapPointSchema, MapLineSchema } from '../src/lib/schemas.js';

// ─── Configuration ───

type Provider = 'anthropic' | 'openai';

const PROVIDER: Provider = (process.env.AI_PROVIDER as Provider) || 'anthropic';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

const DATA_DIR = join(process.cwd(), 'src', 'data');
const EVENTS_DIR = join(DATA_DIR, 'events');
const now = new Date().toISOString();

// ─── Provider Clients ───

let anthropicClient: Anthropic | null = null;
let openaiClient: OpenAI | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY required');
    anthropicClient = new Anthropic();
  }
  return anthropicClient;
}

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY required');
    openaiClient = new OpenAI();
  }
  return openaiClient;
}

// ─── Utilities ───

function extractJSON(text: string): string {
  let json = text.trim();

  const codeBlock = json.match(/```\w*\s*\n([\s\S]*?)\n\s*```/);
  if (codeBlock) {
    json = codeBlock[1].trim();
  } else if (json.includes('```')) {
    json = json.replace(/^```\w*\s*\n?/, '').replace(/\n?\s*```\s*$/, '').trim();
  }

  const start = json.search(/[\[{]/);
  if (start === -1) throw new Error('No JSON array or object found in response');

  const openChar = json[start];
  const closeChar = openChar === '[' ? ']' : '}';
  let depth = 0;
  let inString = false;
  let escape = false;
  let end = -1;

  for (let i = start; i < json.length; i++) {
    const ch = json[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === openChar) depth++;
    if (ch === closeChar) depth--;
    if (depth === 0) { end = i; break; }
  }

  if (end !== -1) {
    json = json.substring(start, end + 1);
  } else {
    json = repairTruncatedJSON(json.substring(start));
  }

  json = removeTrailingCommas(json);
  return json;
}

function repairTruncatedJSON(json: string): string {
  const stack: string[] = [];
  let inString = false;
  let escape = false;
  let lastCloseBracket = -1;
  let lastComma = -1;

  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '[' || ch === '{') stack.push(ch === '[' ? ']' : '}');
    if (ch === ']' || ch === '}') { stack.pop(); lastCloseBracket = i; }
    if (ch === ',') lastComma = i;
  }

  if (stack.length === 0) return json;

  let truncateAt = json.length;
  if (lastCloseBracket > lastComma && lastCloseBracket > 0) {
    truncateAt = lastCloseBracket + 1;
  } else if (lastComma > 0) {
    truncateAt = lastComma;
  }

  let repaired = json.substring(0, truncateAt);

  const stack2: string[] = [];
  let inStr = false;
  let esc = false;
  for (let i = 0; i < repaired.length; i++) {
    const ch = repaired[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '[' || ch === '{') stack2.push(ch === '[' ? ']' : '}');
    if (ch === ']' || ch === '}') stack2.pop();
  }

  repaired += stack2.reverse().join('');
  return repaired;
}

function removeTrailingCommas(json: string): string {
  let result = '';
  let inStr = false;
  let esc = false;
  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (esc) { esc = false; result += ch; continue; }
    if (ch === '\\' && inStr) { esc = true; result += ch; continue; }
    if (ch === '"') { inStr = !inStr; result += ch; continue; }
    if (inStr) { result += ch; continue; }
    if (ch === ',') {
      const rest = json.substring(i + 1).match(/^\s*([\]}])/);
      if (rest) continue;
    }
    result += ch;
  }
  return result;
}

function describeType(type: z.ZodType): string {
  if (type instanceof z.ZodString) return 'string';
  if (type instanceof z.ZodNumber) return 'number';
  if (type instanceof z.ZodBoolean) return 'boolean';
  if (type instanceof z.ZodEnum) return (type as z.ZodEnum<[string, ...string[]]>).options.map((o: string) => `"${o}"`).join(' | ');
  if (type instanceof z.ZodOptional) return describeType((type as z.ZodOptional<z.ZodType>).unwrap()) + ' (optional)';
  if (type instanceof z.ZodArray) return describeType((type as z.ZodArray<z.ZodType>).element) + '[]';
  if (type instanceof z.ZodUnion) return (type as z.ZodUnion<[z.ZodType, ...z.ZodType[]]>).options.map((o: z.ZodType) => describeType(o)).join(' | ');
  if (type instanceof z.ZodLiteral) return JSON.stringify((type as z.ZodLiteral<unknown>).value);
  if (type instanceof z.ZodTuple) {
    const items = (type as z.ZodTuple<[z.ZodType, ...z.ZodType[]]>).items.map((i: z.ZodType) => describeType(i));
    return `[${items.join(', ')}]`;
  }
  if (type instanceof z.ZodObject) {
    const shape = (type as z.ZodObject<z.ZodRawShape>).shape;
    const fields = Object.entries(shape).map(([k, v]) => `"${k}": ${describeType(v as z.ZodType)}`);
    return `{ ${fields.join(', ')} }`;
  }
  return 'any';
}

function describeFields(schema: z.ZodObject<z.ZodRawShape>): string {
  const lines: string[] = [];
  for (const [key, type] of Object.entries(schema.shape)) {
    if (key === 'lastUpdated') continue;
    lines.push(`  "${key}": ${describeType(type as z.ZodType)}`);
  }
  return `{\n${lines.join(',\n')}\n}`;
}

/** Normalize parsed items — coerce dates, tiers, lat/lon */
function normalizeItems(items: unknown[]): unknown[] {
  const today = new Date().toISOString().split('T')[0];
  return items.map(item => {
    if (typeof item !== 'object' || item === null) return item;
    const obj = item as Record<string, unknown>;

    if ('date' in obj) {
      const d = obj.date;
      if (d === null || d === undefined) obj.date = today;
      else if (typeof d === 'number') obj.date = String(d);
      else if (typeof d === 'string') {
        const parsed = new Date(d);
        if (!isNaN(parsed.getTime())) obj.date = parsed.toISOString().split('T')[0];
      }
    }

    if ('tier' in obj && typeof obj.tier === 'string') {
      const n = parseInt(obj.tier, 10);
      if (!isNaN(n)) obj.tier = n;
    }

    for (const key of ['lat', 'lon']) {
      if (key in obj && typeof obj[key] === 'string') {
        const n = parseFloat(obj[key] as string);
        if (!isNaN(n)) obj[key] = n;
      }
    }

    if ('base' in obj && typeof obj.base !== 'boolean') {
      obj.base = obj.base === 'true' || obj.base === true;
    }

    return obj;
  });
}

/** Validate items individually, keeping valid ones */
function validateItemwise<T>(items: unknown[], schema: z.ZodType<T>, label: string): T[] {
  const valid: T[] = [];
  let rejected = 0;
  for (let i = 0; i < items.length; i++) {
    const result = schema.safeParse(items[i]);
    if (result.success) {
      valid.push(result.data);
    } else {
      rejected++;
      console.warn(`  [${label}] Item ${i} rejected:`, JSON.stringify(result.error.format()));
    }
  }
  if (rejected > 0) {
    console.warn(`  [${label}] ${rejected}/${items.length} items failed, kept ${valid.length}`);
  }
  return valid;
}

// ─── AI Callers ───

async function callAnthropic(systemPrompt: string, userPrompt: string): Promise<string> {
  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 16384,
    system: systemPrompt,
    tools: [{ type: 'web_search_20250305' as const, name: 'web_search', max_uses: 10 }],
    messages: [{ role: 'user', content: userPrompt }],
  });
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');
}

async function callOpenAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const client = getOpenAIClient();
  const response = await client.responses.create({
    model: OPENAI_MODEL,
    instructions: systemPrompt,
    tools: [{ type: 'web_search_preview' as const }],
    input: userPrompt,
  });
  return response.output
    .filter((item): item is OpenAI.Responses.ResponseOutputMessage => item.type === 'message')
    .flatMap(item => item.content)
    .filter((c): c is OpenAI.Responses.ResponseOutputText => c.type === 'output_text')
    .map(c => c.text)
    .join('');
}

async function callAI(systemPrompt: string, userPrompt: string): Promise<string> {
  if (PROVIDER === 'openai') return callOpenAI(systemPrompt, userPrompt);
  return callAnthropic(systemPrompt, userPrompt);
}

// ─── Date Utilities ───

function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const current = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

function formatDateHuman(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

// ─── Merge by ID ───

function mergeById<T extends { id: string }>(
  existing: T[],
  incoming: T[],
): T[] {
  const map = new Map(existing.map(item => [item.id, { ...item }]));

  for (const item of incoming) {
    if (!item.id) continue;
    if (map.has(item.id)) {
      map.set(item.id, { ...map.get(item.id)!, ...item, lastUpdated: now } as T);
    } else {
      map.set(item.id, { ...item, lastUpdated: now } as T);
    }
  }

  const result: T[] = [];
  const seen = new Set<string>();
  for (const item of existing) {
    result.push(map.get(item.id)!);
    seen.add(item.id);
  }
  for (const [id, item] of map) {
    if (!seen.has(id)) result.push(item);
  }
  return result;
}

// ─── Unified Backfill Logic ───

const SYSTEM_PROMPT = `You are a historian and intelligence analyst. You research events from specific dates.
You have access to web search to verify historical events.
You must respond with ONLY valid JSON matching the exact schema provided.
Do not include any commentary, markdown fences, or explanation outside the JSON.

MULTI-POLE SOURCING — gather information from all four media poles:
1. WESTERN: White House, CENTCOM, IDF, State Dept, Pentagon, Reuters, AP, BBC, CNN, NYT, WaPo
2. MIDDLE EASTERN: Al Jazeera, IRNA, Press TV, Tehran Times, Al Arabiya, Al Mayadeen, Fars News
3. EASTERN: Xinhua, CGTN, Global Times, TASS, Kyodo News, Yonhap
4. INTERNATIONAL: UN, IAEA, ICRC, HRW, Amnesty, WHO, OPCW, CSIS, ICG

Tag each source with a "pole" field: "western", "middle_eastern", "eastern", or "international".

Source tier classification:
- Tier 1: Official/primary statements
- Tier 2: Major news outlets
- Tier 3: Institutional analysis / NGO reports
- Tier 4: Unverified / social media`;

interface BackfillResult {
  events: number;
  points: number;
  lines: number;
  skipped: boolean;
}

async function backfillDate(date: string, existingPointIds: Set<string>, existingLineIds: Set<string>): Promise<BackfillResult> {
  const eventFile = join(EVENTS_DIR, `${date}.json`);
  const hasEvents = existsSync(eventFile);

  // Read current map data to check if this date already has coverage
  const currentPoints: z.infer<typeof MapPointSchema>[] = JSON.parse(readFileSync(join(DATA_DIR, 'map-points.json'), 'utf8'));
  const currentLines: z.infer<typeof MapLineSchema>[] = JSON.parse(readFileSync(join(DATA_DIR, 'map-lines.json'), 'utf8'));
  const hasPoints = currentPoints.some(p => p.date === date);
  const hasLines = currentLines.some(l => l.date === date);

  if (hasEvents && hasPoints && hasLines) {
    console.log(`  [skip] ${date} — already has events, points, and lines`);
    return { events: 0, points: 0, lines: 0, skipped: true };
  }

  const humanDate = formatDateHuman(date);
  const eventFields = describeFields(TimelineEventSchema);
  const pointFields = describeFields(MapPointSchema);
  const lineFields = describeFields(MapLineSchema);

  const needEvents = !hasEvents;
  const needPoints = !hasPoints;
  const needLines = !hasLines;

  const sections = [];
  if (needEvents) sections.push('events');
  if (needPoints) sections.push('points');
  if (needLines) sections.push('lines');
  console.log(`  [fetch] ${date} — need: ${sections.join(', ')}`);

  const prompt = `Search for significant events related to the Iran-US/Israel conflict that occurred on or around ${humanDate} (${date}).
This includes: the 2026 Iran crisis, US-Iran tensions, Israeli involvement, Gulf state reactions, UN responses, military operations, economic impacts.

Search across ALL media poles for contrasting perspectives.

Return a JSON object with the following structure:
{
  ${needEvents ? `"events": [ ... ],  // timeline events for this date` : ''}
  ${needPoints ? `"points": [ ... ],  // map locations (strikes, bases, deployments) active on this date` : ''}
  ${needLines ? `"lines":  [ ... ]   // arc lines (strike routes, retaliation vectors) for this date` : ''}
}

${needEvents ? `EVENT SCHEMA — each event in the "events" array:
${eventFields}
- "year" should be a short label like "Feb 28" or "Mar 1"
- "id" must be lowercase_snake_case, e.g. "un_ceasefire_vote_mar1"
- "sources" must include sources from MULTIPLE poles
- If nothing significant happened, use an empty array []
` : ''}
${needPoints ? `MAP POINT SCHEMA — each point in the "points" array:
${pointFields}
- "date" MUST be "${date}"
- "lon" must be 25-65, "lat" must be 20-42 (Middle East theater)
- "tier" must be a number (1, 2, 3, or 4)
- Include: strike targets, retaliation sites, military bases, naval assets, front-line positions
- If no map-worthy locations, use an empty array []
` : ''}
${needLines ? `MAP LINE SCHEMA — each line in the "lines" array:
${lineFields}
- "date" MUST be "${date}"
- "from" and "to" are [longitude, latitude] tuples
- Include: strike routes, retaliation vectors, front lines, asset movement paths
- If no routes/vectors, use an empty array []
` : ''}
Return ONLY the JSON object with the requested arrays. No explanation or markdown.`;

  try {
    const text = await callAI(SYSTEM_PROMPT, prompt);
    const raw = JSON.parse(extractJSON(text));

    let eventCount = 0;
    let pointCount = 0;
    let lineCount = 0;

    // Process events
    if (needEvents && Array.isArray(raw.events)) {
      const EventLoose = TimelineEventSchema.omit({ lastUpdated: true }).extend({ lastUpdated: z.string().optional() });
      const validEvents = validateItemwise(raw.events, EventLoose, `${date}/events`);
      if (validEvents.length > 0) {
        const stamped = validEvents.map(e => ({ ...e, lastUpdated: now }));
        writeFileSync(eventFile, JSON.stringify(stamped, null, 2) + '\n');
        eventCount = stamped.length;
      }
    }

    // Process points
    if (needPoints && Array.isArray(raw.points)) {
      const normalized = normalizeItems(raw.points);
      const PointLoose = MapPointSchema.omit({ lastUpdated: true }).extend({ lastUpdated: z.string().optional() });
      const validPoints = validateItemwise(normalized, PointLoose, `${date}/points`)
        .filter(p => p.lon >= 25 && p.lon <= 65 && p.lat >= 20 && p.lat <= 42)
        .filter(p => !existingPointIds.has(p.id)); // avoid ID conflicts
      if (validPoints.length > 0) {
        const allPoints = mergeById(currentPoints, validPoints);
        writeFileSync(join(DATA_DIR, 'map-points.json'), JSON.stringify(allPoints, null, 2) + '\n');
        pointCount = validPoints.length;
        validPoints.forEach(p => existingPointIds.add(p.id));
      }
    }

    // Process lines
    if (needLines && Array.isArray(raw.lines)) {
      const normalized = normalizeItems(raw.lines);
      const LineLoose = MapLineSchema.omit({ lastUpdated: true }).extend({ lastUpdated: z.string().optional() });
      const validLines = validateItemwise(normalized, LineLoose, `${date}/lines`)
        .filter(l => !existingLineIds.has(l.id)); // avoid ID conflicts
      if (validLines.length > 0) {
        // Re-read in case a previous date already wrote
        const freshLines: z.infer<typeof MapLineSchema>[] = JSON.parse(readFileSync(join(DATA_DIR, 'map-lines.json'), 'utf8'));
        const allLines = mergeById(freshLines, validLines);
        writeFileSync(join(DATA_DIR, 'map-lines.json'), JSON.stringify(allLines, null, 2) + '\n');
        lineCount = validLines.length;
        validLines.forEach(l => existingLineIds.add(l.id));
      }
    }

    const parts = [];
    if (eventCount) parts.push(`${eventCount} events`);
    if (pointCount) parts.push(`${pointCount} points`);
    if (lineCount) parts.push(`${lineCount} lines`);
    console.log(`  [done] ${date} — ${parts.length > 0 ? parts.join(', ') : 'no data found'}`);

    return { events: eventCount, points: pointCount, lines: lineCount, skipped: false };
  } catch (err) {
    console.error(`  [error] ${date} — ${err}`);
    return { events: 0, points: 0, lines: 0, skipped: false };
  }
}

// ─── CLI ───

function parseArgs(): { from: string; to: string; dryRun: boolean } {
  const args = process.argv.slice(2);
  let from = '';
  let to = '';
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from' && args[i + 1]) { from = args[++i]; }
    else if (args[i] === '--to' && args[i + 1]) { to = args[++i]; }
    else if (args[i] === '--dry-run') { dryRun = true; }
  }

  if (!from || !to) {
    console.error('Usage: npm run backfill -- --from YYYY-MM-DD --to YYYY-MM-DD [--dry-run]');
    console.error('Example: npm run backfill -- --from 2025-12-01 --to 2026-02-27');
    process.exit(1);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    console.error('Dates must be in YYYY-MM-DD format');
    process.exit(1);
  }

  if (from > to) {
    console.error('--from must be before or equal to --to');
    process.exit(1);
  }

  return { from, to, dryRun };
}

async function main() {
  const { from, to, dryRun } = parseArgs();
  const dates = dateRange(from, to);

  if (!existsSync(EVENTS_DIR)) mkdirSync(EVENTS_DIR, { recursive: true });

  console.log(`[backfill] Range: ${from} to ${to} (${dates.length} days)`);
  console.log(`[backfill] Provider: ${PROVIDER} (${PROVIDER === 'openai' ? OPENAI_MODEL : ANTHROPIC_MODEL})`);

  // Load existing IDs to prevent conflicts
  const existingPoints: z.infer<typeof MapPointSchema>[] = JSON.parse(readFileSync(join(DATA_DIR, 'map-points.json'), 'utf8'));
  const existingLines: z.infer<typeof MapLineSchema>[] = JSON.parse(readFileSync(join(DATA_DIR, 'map-lines.json'), 'utf8'));
  const existingPointIds = new Set(existingPoints.map(p => p.id));
  const existingLineIds = new Set(existingLines.map(l => l.id));

  if (dryRun) {
    let gaps = 0;
    for (const d of dates) {
      const hasEvents = existsSync(join(EVENTS_DIR, `${d}.json`));
      const hasPoints = existingPoints.some(p => p.date === d);
      const hasLines = existingLines.some(l => l.date === d);
      const missing = [];
      if (!hasEvents) missing.push('events');
      if (!hasPoints) missing.push('points');
      if (!hasLines) missing.push('lines');
      if (missing.length > 0) {
        console.log(`  ${d}: missing ${missing.join(', ')}`);
        gaps++;
      }
    }
    console.log(`\n[backfill] ${gaps} dates need backfill out of ${dates.length}`);
    return;
  }

  let totalEvents = 0;
  let totalPoints = 0;
  let totalLines = 0;
  let processed = 0;
  let skipped = 0;

  for (const date of dates) {
    const result = await backfillDate(date, existingPointIds, existingLineIds);
    totalEvents += result.events;
    totalPoints += result.points;
    totalLines += result.lines;
    if (result.skipped) skipped++;
    else processed++;

    // Brief pause between API calls to avoid rate limits
    if (!result.skipped) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log(`\n[backfill] Complete:`);
  console.log(`  Processed: ${processed} dates`);
  console.log(`  Skipped (existing): ${skipped} dates`);
  console.log(`  New events: ${totalEvents}`);
  console.log(`  New points: ${totalPoints}`);
  console.log(`  New lines:  ${totalLines}`);
}

main();

/**
 * LLM prompt templates for transcript ingestion.
 *
 * Each template tailors the extraction instructions to the input format
 * (Slack/Teams thread, email chain, meeting transcript, raw text).
 */

import type { InputFormat } from './types.js';

const NODE_TYPE_HELP = `
Node types you can extract:
- **claim**: An assertion or opinion stated by a participant.
- **question**: An unresolved inquiry that needs an answer.
- **decision**: A concluded choice, often with rationale.
- **evidence**: Data, links, references, or external facts cited.
- **fact**: A verifiable statement with a concrete value.
- **assumption**: A belief taken for granted without proof.

Edge types you can create:
- **supports**: The source node strengthens the target.
- **challenges**: The source contradicts or questions the target.
- **diverges**: The source branches into a different direction.
- **depends_on**: The source relies on the target.
- **refines**: The source clarifies or narrows the target.
- **references**: The source mentions or links to the target.
`;

const JSON_OUTPUT_SCHEMA = `
Respond with a JSON object only — no markdown, no extra text:
{
  "nodes": [
    {
      "id": "n1",
      "type": "claim|question|decision|evidence|fact|assumption",
      "title": "Short title",
      "content": "Full content of what was said",
      "author": "speaker name or AI",
      "dependsOn": ["n2"],
      "factKey": "stable_snake_case_key"
    }
  ],
  "edges": [
    {
      "type": "supports|challenges|diverges|depends_on|refines|references",
      "source": "n1",
      "target": "n2",
      "label": "optional edge label"
    }
  ],
  "canvasName": "Inferred topic from the conversation",
  "summary": "One-paragraph summary of the entire discussion"
}

Use short ids like "n1", "n2", etc. Reference them in dependsOn and edges.
If a node depends on another, add both a dependsOn entry AND an edge.
`;

const FORMAT_INSTRUCTIONS: Record<InputFormat, string> = {
  slack: `You are analyzing a Slack/Teams thread. The text includes message timestamps, usernames, and possibly emoji reactions.
- Identify speakers from the message headers.
- Treat each distinct message as a potential node.
- Emoji reactions (👍, ✅, ❌) can indicate support/challenge — factor that into edge types.
- Thread replies often depend_on or challenge the parent message.`,

  email: `You are analyzing an email chain. The text includes headers (From, To, Date, Subject), quoted replies, and signatures.
- Strip quoted reply blocks and signatures — extract only the original content per sender.
- Later emails often refine or challenge earlier ones.
- The subject line is a good hint for the canvas name.
- Attachments or links mentioned are evidence nodes.`,

  meeting: `You are analyzing a meeting transcript. The text includes speaker labels and possibly timestamps and agenda items.
- Use speaker labels to attribute nodes.
- Agenda items can become decision or question nodes.
- Action items are claims or decisions.
- Timestamps help order nodes temporally.`,

  raw: `You are analyzing free-form discussion text. There may be no speaker labels or structure.
- Infer speakers from context (e.g., "I think...", "Sarah said...").
- If no speakers can be identified, use "Unknown" as the author.
- Try to identify the logical flow: claims → challenges → decisions.
`,

  auto: `You are analyzing text that could be any format — Slack, email, meeting transcript, or raw discussion.
- Detect the format from the structure (headers, speaker labels, timestamps).
- Apply the appropriate extraction strategy.
- Infer speakers from context if none are explicit.
`,
};

export function buildExtractionPrompt(
  format: InputFormat,
  text: string,
  topicHint?: string,
  config?: { extractFacts?: boolean; extractAssumptions?: boolean; extractDecisions?: boolean }
): string {
  const formatInstr = FORMAT_INSTRUCTIONS[format] ?? FORMAT_INSTRUCTIONS.raw;

  const configHints: string[] = [];
  if (config?.extractFacts === false) {
    configHints.push('Do NOT extract fact nodes — only claims, questions, decisions, evidence, and assumptions.');
  }
  if (config?.extractAssumptions === false) {
    configHints.push('Do NOT extract assumption nodes.');
  }
  if (config?.extractDecisions === false) {
    configHints.push('Do NOT extract decision nodes.');
  }

  const topicLine = topicHint
    ? `\nThe user suggested the topic: "${topicHint}". Use this as the canvasName if it fits.`
    : '\nInfer the canvasName from the content.';

  return [
    'You are an expert reasoning-graph extractor.',
    'Your job is to read a conversation and extract the key reasoning elements into a structured graph.',
    '',
    formatInstr,
    '',
    NODE_TYPE_HELP.trim(),
    '',
    configHints.length > 0 ? configHints.join('\n') : '',
    '',
    'Here is the conversation text:',
    '---',
    text,
    '---',
    topicLine,
    '',
    JSON_OUTPUT_SCHEMA.trim(),
  ].join('\n');
}

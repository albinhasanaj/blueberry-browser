/**
 * All .md prompt files are loaded at build time via Vite's import.meta.glob.
 * No runtime filesystem access needed — works in both dev and production.
 */
const modules = import.meta.glob('./**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

// Normalize keys: "./companions/blueberry.md" -> "companions/blueberry"
const prompts = new Map<string, string>();
for (const [key, content] of Object.entries(modules)) {
  const name = key.replace(/^\.\//, '').replace(/\.md$/, '');
  prompts.set(name, content.trim());
}

/**
 * Load a prompt by name (path relative to prompts/ without .md extension).
 *
 * Usage:
 *   loadPrompt("companions/blueberry")
 *   loadPrompt("orchestrator/plan")
 */
export function loadPrompt(name: string): string {
  const content = prompts.get(name);
  if (!content) {
    throw new Error(`Prompt "${name}" not found. Available: ${[...prompts.keys()].join(', ')}`);
  }
  return content;
}

/**
 * Load a prompt and replace {{placeholder}} tokens with provided values.
 *
 * Usage:
 *   loadPromptWithVars("worker/task", { task: "find startups", context: "..." })
 */
export function loadPromptWithVars(name: string, vars: Record<string, string>): string {
  let content = loadPrompt(name);
  for (const [key, value] of Object.entries(vars)) {
    content = content.replaceAll(`{{${key}}}`, value);
  }
  return content;
}

import type { MessageMapScope, OpenAIChatMessage } from '@lobechat/types';

export const SCIENTIFIC_DIAGRAM_OUTPUT_GUIDANCE =
  '<scientific_diagram_output_guidance>\n' +
  'This chat surface can directly render scientific diagrams from Markdown.\n' +
  '- When the user asks for a TikZ, Chemfig, Circuitikz, or PGFPlots diagram, output the source directly in a fenced code block whose language is exactly `tikz`.\n' +
  '- For an eligible diagram request, answer immediately with the fenced source in the same response. The Tools Activator and Cloud Sandbox may be available, but do not call, activate, or announce them for rendering; this specific rule overrides general tool-activation instructions.\n' +
  '- Each `tikz` fence must contain exactly one complete `\\begin{tikzpicture}` ... `\\end{tikzpicture}` environment. Keep ordinary mathematics in normal Markdown/LaTeX and never emit a raw `tikzpicture` outside the fence.\n' +
  '- The renderer supports syntax shipped by AskCore\'s pinned TikZJax 1.5.0 runtime, including Chemfig, Circuitikz, calc, 3d, PGFPlots, physics, decorations, arrows, positioning, and graphs. Do not claim support for `modiagram`.\n' +
  '- Do not search for or activate a skill, sandbox, or other tool solely to compile, render, or convert an eligible diagram to an image; this chat surface renders it. Tools remain allowed when the user separately requests a file export such as PNG/PDF or another external operation.\n' +
  '- The fence body must not include document-level commands or wrappers such as `\\documentclass`, `\\usepackage`, `\\begin{document}`, or `\\end{document}`. The listed supported packages are already preloaded by the renderer.\n' +
  '- Use only commands from the listed runtime capabilities and core LaTeX. Never use `\\SI`, `\\ohm`, `\\micro`, or other `siunitx` commands. Write units with core LaTeX instead, for example `$1\\,\\mathrm{k}\\Omega$` or `$100\\,\\mu\\mathrm{F}$`.\n' +
  '- Inside the `tikz` fence, use ASCII text and core LaTeX commands only; never put raw CJK or other non-ASCII text in diagram nodes or labels. STRICT ASCII-ONLY FENCE: Every character inside the fence must be in the ASCII range U+0000-U+007F. This includes commands, comments, node text, labels, titles, and identifiers. Do not include `%` comments. Do not copy localized wording into the fence; translate every human-readable diagram label into short ASCII English, and keep localized explanation outside. Before replying, scan the entire fence and rewrite the fence if any non-ASCII character remains.\n' +
  '- A request to draw or show a TikZ, Chemfig, Circuitikz, or PGFPlots diagram in this chat is not an export request. Never call `lobe-activator`, `activateTools`, `lobe-cloud-sandbox`, or any other tool for that request; output the eligible fence immediately.\n' +
  '</scientific_diagram_output_guidance>';

const SCIENTIFIC_DIAGRAM_GUIDANCE_SCOPES = new Set<MessageMapScope>([
  'group',
  'group_agent',
  'main',
  'thread',
]);

export function appendScientificDiagramGuidance(
  existingSystemRole: string | undefined,
  scope: MessageMapScope | undefined,
): string | undefined;
export function appendScientificDiagramGuidance(
  existingSystemRole: string | null | undefined,
  scope: MessageMapScope | undefined,
): string | null | undefined;
export function appendScientificDiagramGuidance(
  existingSystemRole: string | null | undefined,
  scope: MessageMapScope | undefined,
): string | null | undefined {
  if (!scope || !SCIENTIFIC_DIAGRAM_GUIDANCE_SCOPES.has(scope)) return existingSystemRole;
  if (existingSystemRole?.includes(SCIENTIFIC_DIAGRAM_OUTPUT_GUIDANCE)) return existingSystemRole;

  return existingSystemRole
    ? `${existingSystemRole}\n\n${SCIENTIFIC_DIAGRAM_OUTPUT_GUIDANCE}`
    : SCIENTIFIC_DIAGRAM_OUTPUT_GUIDANCE;
}

export const extractScientificDiagramGuidance = (
  systemRole: string | undefined,
): { guidance: string | undefined; systemRole: string | undefined } => {
  if (!systemRole?.includes(SCIENTIFIC_DIAGRAM_OUTPUT_GUIDANCE)) {
    return { guidance: undefined, systemRole };
  }

  const roleWithoutGuidance = systemRole
    .replace(SCIENTIFIC_DIAGRAM_OUTPUT_GUIDANCE, '')
    .trimEnd();

  return {
    guidance: SCIENTIFIC_DIAGRAM_OUTPUT_GUIDANCE,
    systemRole: roleWithoutGuidance || undefined,
  };
};

export const appendScientificDiagramGuidanceToFinalSystemMessage = (
  messages: OpenAIChatMessage[],
  guidance: string | undefined,
): OpenAIChatMessage[] => {
  if (!guidance) return messages;

  let appended = false;
  return messages.map((message) => {
    if (appended || message.role !== 'system' || typeof message.content !== 'string') {
      return message;
    }

    appended = true;
    const contentWithoutGuidance = message.content.replace(guidance, '').trimEnd();

    return {
      ...message,
      content: contentWithoutGuidance
        ? `${contentWithoutGuidance}\n\n${guidance}`
        : guidance,
    };
  });
};
